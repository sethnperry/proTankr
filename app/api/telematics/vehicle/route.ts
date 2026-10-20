// app/api/telematics/vehicle/route.ts
//
// GET ?truckId= -> { connected, odometerMi, lat, lon, city, state, at }
// Any member of the truck's company. Fails soft: no connection, unmatched
// truck or a provider outage all return { connected: false } so the app just
// falls back to typing.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { stateCode } from "@/lib/geo/usStates";
import { callerId, companyRole, providerFor } from "@/lib/telematics/server";

export const runtime = "nodejs";

const none = () => NextResponse.json({ connected: false });

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const truckId = req.nextUrl.searchParams.get("truckId");
  if (!truckId) return NextResponse.json({ error: "truckId is required." }, { status: 400 });
  try {
    const admin = getServiceSupabase();
    const { data: t } = await admin.from("trucks").select("company_id").eq("truck_id", truckId).maybeSingle();
    const companyId = (t as { company_id?: string } | null)?.company_id;
    if (!companyId) return none();
    const r = await companyRole(uid, companyId);
    if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
    const { data: m } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id").eq("company_id", companyId).eq("truck_id", truckId).maybeSingle();
    const vid = (m as { provider_vehicle_id?: string } | null)?.provider_vehicle_id;
    if (!vid) return none();
    const p = await providerFor(companyId);
    if (!p) return none();
    const reading = await p.reading(vid);
    let city: string | null = null, state: string | null = null;
    const key = process.env.OPENWEATHER_API_KEY;
    if (key && reading.lat != null && reading.lon != null) {
      const g = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${reading.lat}&lon=${reading.lon}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const it = Array.isArray(g) ? g[0] : null;
      city = typeof it?.name === "string" ? it.name : null;
      state = stateCode(typeof it?.state === "string" ? it.state : null);
    }
    await admin.from("telematics_connections").update({ last_ok_at: new Date().toISOString(), last_error: null }).eq("company_id", companyId);
    return NextResponse.json({ connected: true, ...reading, city, state });
  } catch (e) {
    console.warn("[telematics] reading failed:", (e as Error).message);
    return none();
  }
}
