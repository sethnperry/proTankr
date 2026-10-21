// app/api/telematics/trailer-events/route.ts
//
// GET ?truckId=&from=&to= -> { connected, events: [{ type: "hook"|"drop", at, trailerId, trailerName, lat, lon, city, state }] }
// Geotab's trailer hooks and drops for one truck inside a window (max 3 days),
// for the trip log. Only trailers linked to ours are returned. Any member of
// the truck's company. Soft fail.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { stateCode } from "@/lib/geo/usStates";
import { callerId, companyRole, providerFor, trailerNames } from "@/lib/telematics/server";

export const runtime = "nodejs";

const none = () => NextResponse.json({ connected: false, events: [] });

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const truckId = sp.get("truckId");
  const from = Date.parse(sp.get("from") ?? ""), to = Date.parse(sp.get("to") ?? "");
  if (!truckId || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return NextResponse.json({ error: "truckId, from and to are required." }, { status: 400 });
  const lo = Math.max(from, to - 3 * 86400000);
  try {
    const admin = getServiceSupabase();
    const { data: t } = await admin.from("trucks").select("company_id").eq("truck_id", truckId).maybeSingle();
    const companyId = (t as { company_id?: string } | null)?.company_id;
    if (!companyId) return none();
    const r = await companyRole(uid, companyId);
    if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
    const { data: m } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id").eq("company_id", companyId).eq("truck_id", truckId).maybeSingle();
    const vid = (m as { provider_vehicle_id?: string } | null)?.provider_vehicle_id;
    const p = vid ? await providerFor(companyId) : null;
    if (!vid || !p) return none();
    const [evs, names] = await Promise.all([p.trailerEvents(vid, new Date(lo).toISOString(), new Date(to).toISOString()), trailerNames(companyId)]);
    const key = process.env.OPENWEATHER_API_KEY;
    const events = [];
    for (const e of evs) {
      const tr = names.get(e.trailerProviderId);
      if (!tr) continue; // a trailer that isn't one of ours
      let city: string | null = null, state: string | null = null;
      if (key && e.lat != null && e.lon != null) {
        const g = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${e.lat}&lon=${e.lon}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        const it = Array.isArray(g) ? g[0] : null;
        city = typeof it?.name === "string" ? it.name : null;
        state = stateCode(typeof it?.state === "string" ? it.state : null);
      }
      events.push({ type: e.type, at: e.at, trailerId: tr.trailerId, trailerName: tr.name, lat: e.lat, lon: e.lon, city, state });
    }
    return NextResponse.json({ connected: true, events });
  } catch (e) {
    console.warn("[telematics] trailer events failed:", (e as Error).message);
    return none();
  }
}
