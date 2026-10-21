// app/api/telematics/vehicle/route.ts
//
// GET ?truckId= -> { connected, odometerMi, lat, lon, city, state, at }
// Any member of the truck's company. Fails soft: no connection, unmatched
// truck or a provider outage all return { connected: false } so the app just
// falls back to typing.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { stateCode } from "@/lib/geo/usStates";
import { callerId, companyRole, providerFor, trailerNames } from "@/lib/telematics/server";

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
    // The trailer Geotab says is hooked up (null = nothing hooked or not tracked / not linked).
    let trailerId: string | null = null, trailerName: string | null = null, trailerKnown = false;
    try {
      const attached = await p.attachedTrailers();
      trailerKnown = attached.size > 0;
      const prov = attached.get(vid);
      const mapped = prov ? (await trailerNames(companyId)).get(prov) : null;
      trailerId = mapped?.trailerId ?? null; trailerName = mapped?.name ?? null;
    } catch { /* trailer tracking is optional */ }
    let city: string | null = null, state: string | null = null;
    const key = process.env.OPENWEATHER_API_KEY;
    if (key && reading.lat != null && reading.lon != null) {
      const g = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${reading.lat}&lon=${reading.lon}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const it = Array.isArray(g) ? g[0] : null;
      city = typeof it?.name === "string" ? it.name : null;
      state = stateCode(typeof it?.state === "string" ? it.state : null);
    }
    // Who is in the truck: the driver signed in to Geotab, matched to a ProTankr member, and who holds it in ProTankr.
    let driverName: string | null = null, heldByName: string | null = null;
    try {
      const nameOf = async (userId: string) => {
        const { data: pr } = await admin.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
        return (pr as { display_name?: string | null } | null)?.display_name ?? null;
      };
      if (reading.driverId) {
        const { data: dm } = await admin.from("telematics_driver_map").select("user_id, driver_name").eq("company_id", companyId).eq("provider_user_id", reading.driverId).maybeSingle();
        const row = dm as { user_id?: string; driver_name?: string | null } | null;
        driverName = (row?.user_id ? await nameOf(row.user_id) : null) ?? row?.driver_name ?? null;
        if (!driverName) {
          const ds = await p.listDrivers().catch(() => []);
          const d = ds.find((x) => x.id === reading.driverId);
          driverName = d ? ([d.firstName, d.lastName].filter(Boolean).join(" ") || d.name) : null;
        }
      }
      const { data: combo } = await admin.from("equipment_combos").select("claimed_by").eq("truck_id", truckId).eq("active", true).not("claimed_by", "is", null).order("claimed_at", { ascending: false }).limit(1).maybeSingle();
      const by = (combo as { claimed_by?: string | null } | null)?.claimed_by;
      heldByName = by ? await nameOf(by) : null;
    } catch { /* the position is still useful without a name */ }
    await admin.from("telematics_connections").update({ last_ok_at: new Date().toISOString(), last_error: null }).eq("company_id", companyId);
    return NextResponse.json({ connected: true, ...reading, city, state, trailerId, trailerName, trailerKnown, driverName, heldByName });
  } catch (e) {
    console.warn("[telematics] reading failed:", (e as Error).message);
    return none();
  }
}
