// app/api/telematics/hos/route.ts
//
// GET ?companyId= -> { connected, hos: { [userId]: { driveLeftMin, dutyLeftMin, cycleLeftMin, status, at } } }
// What every linked driver has left on the clock. Staff only; cached two
// minutes per company so a busy board doesn't hammer the provider. Soft fail.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { autoLinkAllDrivers, autoLinkDriver, callerId, companyRole, providerFor } from "@/lib/telematics/server";
import type { HosAvailability } from "@/lib/telematics/types";

export const runtime = "nodejs";

const STAFF = new Set(["admin", "owner", "dispatch", "lead"]);
const TTL_MS = 120_000;
const SELF_TTL_MS = 90_000;
const selfCache = new Map<string, { at: number; hos: HosAvailability | null }>();
const cache = new Map<string, { at: number; hos: Record<string, HosAvailability> }>();

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  // ?self=1: any member gets their own clocks (for the Driver Dashboard) and nobody else's.
  if (req.nextUrl.searchParams.get("self") === "1") {
    if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
    const tzRaw = req.nextUrl.searchParams.get("tz") || "";
    let tz = "America/New_York";
    try { if (tzRaw) { new Intl.DateTimeFormat("en-US", { timeZone: tzRaw }); tz = tzRaw; } } catch { /* keep default */ }
    const ck = `${companyId}:${uid}:${tz}`;
    const mine = selfCache.get(ck);
    if (mine && Date.now() - mine.at < SELF_TTL_MS) return NextResponse.json({ connected: true, hos: mine.hos });
    try {
      const p = await providerFor(companyId);
      if (!p) return NextResponse.json({ connected: false });
      const { data } = await getServiceSupabase().from("telematics_driver_map").select("provider_user_id").eq("company_id", companyId).eq("user_id", uid).maybeSingle();
      let pid = (data as { provider_user_id?: string } | null)?.provider_user_id;
      if (!pid) { try { pid = (await autoLinkDriver(companyId, uid)) ?? undefined; } catch { /* stays unlinked */ } }
      if (!pid) return NextResponse.json({ connected: true, hos: null });
      const hos = await p.hos(pid, tz);
      selfCache.set(ck, { at: Date.now(), hos });
      return NextResponse.json({ connected: true, hos });
    } catch (e) {
      console.warn("[telematics] self hos failed:", (e as Error).message);
      // Not "no telematics": Geotab is busy or hiccupped. The card keeps its last reading and asks again.
      return NextResponse.json({ connected: true, hos: null, failed: true });
    }
  }
  if (!r.superAdmin && !(r.role && STAFF.has(r.role))) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const hit = req.nextUrl.searchParams.get("fresh") === "1" ? undefined : cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ connected: true, hos: hit.hos });
  try {
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ connected: false });
    try { if (await autoLinkAllDrivers(companyId)) cache.delete(companyId); } catch { /* board still shows who is linked */ }
    const { data } = await getServiceSupabase().from("telematics_driver_map").select("provider_user_id, user_id").eq("company_id", companyId);
    const rows = (data ?? []) as { provider_user_id: string; user_id: string }[];
    const hos: Record<string, HosAvailability> = {};
    for (let i = 0; i < rows.length; i += 4) {
      await Promise.all(rows.slice(i, i + 4).map(async (m) => {
        try { const h = await p.hos(m.provider_user_id); if (h) hos[m.user_id] = h; } catch { /* that driver shows no hours */ }
      }));
    }
    cache.set(companyId, { at: Date.now(), hos });
    return NextResponse.json({ connected: true, hos });
  } catch (e) {
    console.warn("[telematics] hos failed:", (e as Error).message);
    return NextResponse.json({ connected: false });
  }
}
