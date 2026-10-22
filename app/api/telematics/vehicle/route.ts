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
  // A vehicle that isn't a ProTankr truck can be looked up by its provider id, with the company.
  const rawVehicleId = req.nextUrl.searchParams.get("vehicleId");
  if (!truckId && !(rawVehicleId && req.nextUrl.searchParams.get("companyId"))) return NextResponse.json({ error: "truckId is required." }, { status: 400 });
  try {
    const admin = getServiceSupabase();
    let companyId: string | undefined;
    if (truckId) {
      const { data: t } = await admin.from("trucks").select("company_id").eq("truck_id", truckId).maybeSingle();
      companyId = (t as { company_id?: string } | null)?.company_id;
    } else companyId = req.nextUrl.searchParams.get("companyId") ?? undefined;
    if (!companyId) return none();
    const r = await companyRole(uid, companyId);
    if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
    let vid: string | undefined;
    if (truckId) {
      const { data: m } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id").eq("company_id", companyId).eq("truck_id", truckId).maybeSingle();
      vid = (m as { provider_vehicle_id?: string } | null)?.provider_vehicle_id;
    } else vid = rawVehicleId ?? undefined;
    if (!vid) return none();
    const p = await providerFor(companyId);
    if (!p) return none();
    const reading = await p.reading(vid);
    // Every trailer Geotab says is attached. Some are ProTankr trailers; others are just names in Geotab
    // (for example a BOL number kept as a trailer record), so those are listed as they appear there.
    let trailerId: string | null = null, trailerName: string | null = null, trailerKnown = false;
    const geotabTrailers: { name: string; comment: string | null; ours: boolean }[] = [];
    try {
      const attached = await p.attachedAll();
      trailerKnown = attached.size > 0;
      const ids = attached.get(vid) ?? [];
      if (ids.length) {
        const [ours, all] = await Promise.all([trailerNames(companyId), p.listTrailers().catch(() => [])]);
        const info = new Map(all.map((t) => [t.id, t]));
        for (const id of ids) {
          const mapped = ours.get(id);
          const t = info.get(id);
          if (mapped && !trailerId) { trailerId = mapped.trailerId; trailerName = mapped.name; }
          geotabTrailers.push({ name: mapped?.name ?? t?.name ?? "Trailer", comment: t?.comment?.trim() || null, ours: !!mapped });
        }
      }
    } catch { /* trailer tracking is optional */ }
    let city: string | null = null, state: string | null = null;
    const key = process.env.OPENWEATHER_API_KEY;
    if (key && reading.lat != null && reading.lon != null) {
      const g = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${reading.lat}&lon=${reading.lon}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const it = Array.isArray(g) ? g[0] : null;
      city = typeof it?.name === "string" ? it.name : null;
      state = stateCode(typeof it?.state === "string" ? it.state : null);
    }
    // Who is in the truck: the driver signed in to Geotab (or the last one who was), matched to a ProTankr
    // member when possible, plus who holds the truck in ProTankr, and the driver's hours.
    let driverName: string | null = null, heldByName: string | null = null;
    let lastDriver: { name: string; at: string } | null = null;
    let hos: Awaited<ReturnType<typeof p.hos>> = null;
    try {
      const nameOf = async (userId: string) => {
        const { data: pr } = await admin.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
        return (pr as { display_name?: string | null } | null)?.display_name ?? null;
      };
      const providerDriverName = async (driverId: string): Promise<string | null> => {
        const { data: dm } = await admin.from("telematics_driver_map").select("user_id, driver_name").eq("company_id", companyId).eq("provider_user_id", driverId).maybeSingle();
        const row = dm as { user_id?: string; driver_name?: string | null } | null;
        const n = (row?.user_id ? await nameOf(row.user_id) : null) ?? row?.driver_name ?? null;
        if (n) return n;
        const d = (await p.listDrivers().catch(() => [])).find((x) => x.id === driverId);
        return d ? ([d.firstName, d.lastName].filter(Boolean).join(" ") || d.name) : null;
      };
      let hosDriverId: string | null = reading.driverId ?? null;
      if (reading.driverId) driverName = await providerDriverName(reading.driverId);
      else {
        const last = reading.lastDriverId
          ? { driverId: reading.lastDriverId, at: reading.at ?? new Date().toISOString() }
          : await p.lastDriverOf(vid).catch(() => null);
        if (last) {
          const n = await providerDriverName(last.driverId);
          if (n) { lastDriver = { name: n, at: last.at }; hosDriverId = last.driverId; }
        }
      }
      if (hosDriverId) hos = await p.hos(hosDriverId).catch(() => null);
      if (truckId) {
        const { data: combo } = await admin.from("equipment_combos").select("claimed_by").eq("truck_id", truckId).eq("active", true).not("claimed_by", "is", null).order("claimed_at", { ascending: false }).limit(1).maybeSingle();
        const by = (combo as { claimed_by?: string | null } | null)?.claimed_by;
        heldByName = by ? await nameOf(by) : null;
      }
    } catch { /* the position is still useful without a name */ }
    // Shipping documents (BOL numbers) on the truck's Drive app, if the company uses them.
    const shipments = await p.activeShipments(vid).catch(() => []);
    await admin.from("telematics_connections").update({ last_ok_at: new Date().toISOString(), last_error: null }).eq("company_id", companyId);
    return NextResponse.json({ connected: true, ...reading, city, state, trailerId, trailerName, trailerKnown, geotabTrailers, shipments, driverName, lastDriver, heldByName, hos });
  } catch (e) {
    console.warn("[telematics] reading failed:", (e as Error).message);
    return none();
  }
}
