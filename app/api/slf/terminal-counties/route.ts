// app/api/slf/terminal-counties/route.ts
//
// Fills in which county each terminal is in (a terminal row has coordinates but no county), so a pickup can be
// checked against the Spotted Lanternfly zone. The county comes from the terminal's coordinates (FCC area lookup),
// is cached in terminal_counties, and is looked up once per terminal. Signed-in callers only.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId } from "@/lib/telematics/server";
import { countyFor } from "@/lib/geo/county";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!(await callerId(req))) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { terminalIds?: unknown };
  const ids = (Array.isArray(body.terminalIds) ? body.terminalIds : []).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 40);
  if (!ids.length) return NextResponse.json({ counties: {} });
  const admin = getServiceSupabase();
  const { data: have } = await admin.from("terminal_counties").select("terminal_id, county, state").in("terminal_id", ids);
  const out: Record<string, { county: string | null; state: string | null }> = Object.fromEntries(((have ?? []) as { terminal_id: string; county: string | null; state: string | null }[]).map((r) => [r.terminal_id, { county: r.county, state: r.state }]));
  const missing = ids.filter((i) => !(i in out));
  if (missing.length) {
    const { data: terms } = await admin.from("terminals").select("terminal_id, lat, lon, state").in("terminal_id", missing);
    const started = Date.now();
    for (const t of (terms ?? []) as { terminal_id: string; lat: number | null; lon: number | null; state: string | null }[]) {
      if (Date.now() - started > 20_000) break;
      const county = t.lat != null && t.lon != null ? await countyFor(Number(t.lat), Number(t.lon)) : null;
      await admin.from("terminal_counties").upsert({ terminal_id: t.terminal_id, county, state: t.state, checked_at: new Date().toISOString() });
      out[t.terminal_id] = { county, state: t.state };
    }
  }
  return NextResponse.json({ counties: out }, { headers: { "Cache-Control": "no-store" } });
}
