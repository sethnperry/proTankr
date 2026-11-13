// app/api/telematics/shift-recap/route.ts
//
// GET ?truckId=&from=&to= -> { connected, stops, drives, events, odo }
// What the truck did inside a window (max 24 hours), for the end-of-shift catch-up: the stops it made, the drives
// between them, the trailer hooks and drops, and the odometer change. Any member of the truck's company. Soft fail.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole, providerFor, trailerNames } from "@/lib/telematics/server";
import { detectStops, drivesBetween } from "@/lib/shifts/trailStops";

export const runtime = "nodejs";
const none = () => NextResponse.json({ connected: false, stops: [], drives: [], events: [], odo: null });

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const truckId = sp.get("truckId");
  const from = Date.parse(sp.get("from") ?? ""), to = Date.parse(sp.get("to") ?? "");
  if (!truckId || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return NextResponse.json({ error: "truckId, from and to are required." }, { status: 400 });
  const lo = Math.max(from, to - 24 * 3600_000);
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
    const fromIso = new Date(lo).toISOString(), toIso = new Date(to).toISOString();
    const [trail, evs, names, odo] = await Promise.all([
      p.trail(vid, fromIso, toIso).catch(() => []),
      p.trailerEvents(vid, fromIso, toIso).catch(() => []),
      trailerNames(companyId),
      p.odometerSpan(vid, fromIso, toIso).catch(() => null),
    ]);
    const stops = detectStops(trail);
    const events = evs.flatMap((e) => {
      const tr = names.get(e.trailerProviderId);
      return tr ? [{ type: e.type, at: e.at, trailerId: tr.trailerId, trailerName: tr.name, lat: e.lat, lon: e.lon }] : [];
    });
    return NextResponse.json({ connected: true, stops, drives: drivesBetween(trail, stops), events, odo });
  } catch (e: any) {
    console.warn("[shift-recap]", e?.message);
    return none();
  }
}
