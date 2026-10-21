// app/api/cron/ifta/route.ts
//
// Run daily by a database schedule with `Authorization: Bearer $CRON_SECRET`.
// For each linked truck, works out miles per state for each finished day it
// hasn't done yet (up to a few days per run) from the Geotab GPS trail scaled
// to the odometer, and stores them in ifta_daily_miles. `?backfillDays=N`
// (max 45) fills a new company's recent past on the first run.

import { NextRequest, NextResponse } from "next/server";
import topology from "us-atlas/states-10m.json";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { providerFor } from "@/lib/telematics/server";
import { makeStateOf, milesByState, scaleToOdometer } from "@/lib/ifta/milesByState";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY = 86400000;
const stateOf = makeStateOf(topology as unknown);
const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given !== secret) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const backfill = Math.min(45, Math.max(0, Number(req.nextUrl.searchParams.get("backfillDays") ?? 0) || 0));
  const started = Date.now();
  const admin = getServiceSupabase();
  const { data: conns } = await admin.from("telematics_connections").select("company_id").eq("status", "active");
  const out: Record<string, number | string> = {};
  const yesterday = Math.floor(Date.now() / DAY) * DAY - DAY; // start of yesterday (UTC)

  for (const c of (conns ?? []) as { company_id: string }[]) {
    let days = 0;
    try {
      const p = await providerFor(c.company_id);
      if (!p) continue;
      const { data: map } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", c.company_id);
      for (const m of (map ?? []) as { provider_vehicle_id: string; truck_id: string }[]) {
        if (Date.now() - started > 45_000) break; // finish what's left on the next run
        const { data: last } = await admin.from("ifta_daily_miles").select("day").eq("company_id", c.company_id).eq("truck_id", m.truck_id).order("day", { ascending: false }).limit(1).maybeSingle();
        const lastDay = (last as { day?: string } | null)?.day;
        let from = lastDay ? Date.parse(lastDay + "T00:00:00Z") + DAY : yesterday - Math.max(0, backfill - 1) * DAY;
        from = Math.max(from, yesterday - 44 * DAY);
        for (let d = from, n = 0; d <= yesterday && n < 5; d += DAY, n++) {
          if (Date.now() - started > 50_000) break;
          const fromIso = new Date(d).toISOString(), toIso = new Date(d + DAY - 1).toISOString();
          const [trail, span] = await Promise.all([p.trail(m.provider_vehicle_id, fromIso, toIso), p.odometerSpan(m.provider_vehicle_id, fromIso, toIso).catch(() => null)]);
          const split = scaleToOdometer(milesByState(trail, stateOf), span ? span.lastMi - span.firstMi : null);
          const rows = Object.entries(split).filter(([, mi]) => mi >= 0.05).map(([state, mi]) => ({ company_id: c.company_id, truck_id: m.truck_id, day: dayStr(d), state, miles: Math.round(mi * 100) / 100, source: "geotab" }));
          if (!rows.length) rows.push({ company_id: c.company_id, truck_id: m.truck_id, day: dayStr(d), state: "NONE", miles: 0, source: "geotab" });
          await admin.from("ifta_daily_miles").upsert(rows, { onConflict: "company_id,truck_id,day,state" });
          days++;
        }
      }
      out[c.company_id] = days;
    } catch (e) {
      out[c.company_id] = (e as Error).message;
    }
  }
  return NextResponse.json({ ok: true, days: out });
}
