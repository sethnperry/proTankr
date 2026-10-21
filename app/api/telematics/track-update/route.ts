// app/api/telematics/track-update/route.ts
//
// POST { companyId, truckId?, trailerId?, apply?, separate? }
// "Update from Geotab" for a truck (or a trailer, found through the truck it is hooked to).
// Without `apply` it only reports what would change. With `apply` it saves the truck's last
// known position on the truck (and the hooked trailer) and, if `separate`, frees the trailer
// ProTankr has paired with the truck when Geotab says it is pulling something else.
// Any member of the company.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { stateCode } from "@/lib/geo/usStates";
import { callerId, companyRole, providerFor, trailerNames } from "@/lib/telematics/server";
import { buildChanges } from "@/lib/telematics/trackChanges";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { companyId?: string; truckId?: string | null; trailerId?: string | null; apply?: boolean; separate?: boolean };
  const companyId = body.companyId;
  if (!companyId || (!body.truckId && !body.trailerId)) return NextResponse.json({ error: "companyId and a truck or trailer are required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
  const none = (why: string) => NextResponse.json({ connected: false, why });
  try {
    const admin = getServiceSupabase();
    const p = await providerFor(companyId);
    if (!p) return none("No telematics connection.");

    const [vm, tm] = await Promise.all([
      admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", companyId),
      admin.from("telematics_trailer_map").select("provider_trailer_id, trailer_id").eq("company_id", companyId),
    ]);
    const vrows = (vm.data ?? []) as { provider_vehicle_id: string; truck_id: string }[];
    const trows = (tm.data ?? []) as { provider_trailer_id: string; trailer_id: string }[];
    const attached = await p.attachedTrailers().catch(() => new Map<string, string>());
    const hookKnown = attached.size > 0;

    // Which truck: the one given, or the one the given trailer is hooked to.
    let truckId = body.truckId ?? null;
    if (!truckId && body.trailerId) {
      const prov = trows.find((t) => t.trailer_id === body.trailerId)?.provider_trailer_id;
      const vid = prov ? [...attached.entries()].find(([, tr]) => tr === prov)?.[0] : null;
      truckId = vid ? vrows.find((v) => v.provider_vehicle_id === vid)?.truck_id ?? null : null;
      if (!truckId) return none("That trailer isn't hooked to a tracked truck right now.");
    }
    const vid = vrows.find((v) => v.truck_id === truckId)?.provider_vehicle_id;
    if (!vid) return none("That truck isn't linked to a Geotab vehicle.");

    const reading = await p.reading(vid);
    const hasPosition = reading.lat != null && reading.lon != null;
    let city: string | null = null, state: string | null = null;
    const key = process.env.OPENWEATHER_API_KEY;
    if (key && hasPosition) {
      const g = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${reading.lat}&lon=${reading.lon}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const it = Array.isArray(g) ? g[0] : null;
      city = typeof it?.name === "string" ? it.name : null;
      state = stateCode(typeof it?.state === "string" ? it.state : null);
    }
    const place = city ? [city, state].filter(Boolean).join(", ") : null;

    const [truckRow, comboRes] = await Promise.all([
      admin.from("trucks").select("truck_name, status_location").eq("truck_id", truckId!).eq("company_id", companyId).maybeSingle(),
      admin.from("equipment_combos").select("combo_id, trailer_id, claimed_by").eq("company_id", companyId).eq("truck_id", truckId!).eq("active", true).limit(1).maybeSingle(),
    ]);
    const truck = truckRow.data as { truck_name: string; status_location: string | null } | null;
    if (!truck) return NextResponse.json({ error: "Truck not found." }, { status: 404 });
    const combo = comboRes.data as { combo_id: string; trailer_id: string | null; claimed_by: string | null } | null;

    const obsProv = attached.get(vid) ?? null;
    const names = hookKnown ? await trailerNames(companyId) : new Map<string, { trailerId: string; name: string }>();
    const obsTrailer = obsProv ? names.get(obsProv) ?? null : null;
    const ids = [combo?.trailer_id, obsTrailer?.trailerId].filter((x): x is string => !!x);
    const { data: trs } = ids.length ? await admin.from("trailers").select("trailer_id, trailer_name").in("trailer_id", ids) : { data: [] as any[] };
    const trName = new Map(((trs ?? []) as { trailer_id: string; trailer_name: string }[]).map((t) => [t.trailer_id, t.trailer_name]));
    const nameOf = async (userId: string | null | undefined) => {
      if (!userId) return null;
      const { data } = await admin.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
      return (data as { display_name?: string | null } | null)?.display_name ?? null;
    };
    let driverName: string | null = null;
    if (reading.driverId) {
      const { data: dm } = await admin.from("telematics_driver_map").select("user_id, driver_name").eq("company_id", companyId).eq("provider_user_id", reading.driverId).maybeSingle();
      const row = dm as { user_id?: string; driver_name?: string | null } | null;
      driverName = (row?.user_id ? await nameOf(row.user_id) : null) ?? row?.driver_name ?? null;
      if (!driverName) {
        const d = (await p.listDrivers().catch(() => [])).find((x) => x.id === reading.driverId);
        driverName = d ? ([d.firstName, d.lastName].filter(Boolean).join(" ") || d.name) : null;
      }
    }
    const claimedByName = await nameOf(combo?.claimed_by);

    const changes = buildChanges({
      truckName: truck.truck_name, place, storedPlace: truck.status_location, hasPosition, hookKnown,
      observedTrailerId: obsTrailer?.trailerId ?? null, observedTrailerName: obsTrailer ? trName.get(obsTrailer.trailerId) ?? obsTrailer.name : null,
      ourTrailerId: combo?.trailer_id ?? null, ourTrailerName: combo?.trailer_id ? trName.get(combo.trailer_id) ?? null : null,
      driverName, claimedByName,
    });
    const hookup = changes.find((c) => c.kind === "hookup");

    let applied = false;
    if (body.apply && hasPosition) {
      const stamp = {
        status_lat: reading.lat, status_lon: reading.lon, status_location: place ?? `${reading.lat!.toFixed(4)}, ${reading.lon!.toFixed(4)}`,
        status_updated_at: reading.at ?? new Date().toISOString(),
      };
      await admin.from("trucks").update(stamp).eq("truck_id", truckId!).eq("company_id", companyId);
      // A hooked trailer travels with the truck, so it is where the truck is.
      if (obsTrailer?.trailerId) await admin.from("trailers").update(stamp).eq("trailer_id", obsTrailer.trailerId).eq("company_id", companyId);
      if (body.separate && hookup?.separates && combo?.combo_id && combo.trailer_id) {
        // Frees the old trailer; whoever holds the truck keeps the truck.
        const { error } = await admin.rpc("_evict_combo_to_partial", { p_combo_id: combo.combo_id, p_claiming_truck: null, p_claiming_trailer: combo.trailer_id });
        if (error) return NextResponse.json({ error: `Saved the position, but couldn't separate the pair: ${error.message}` }, { status: 500 });
      }
      applied = true;
    }

    return NextResponse.json({
      connected: true, applied, truckId, truckName: truck.truck_name,
      changes, canSeparate: !!hookup?.separates,
      observed: { lat: reading.lat, lon: reading.lon, at: reading.at, city, state, speedMph: reading.speedMph ?? null, driverName,
        odometerMi: reading.odometerMi, fuelLevelPct: reading.fuelLevelPct ?? null, engineHours: reading.engineHours ?? null,
        trailerId: obsTrailer?.trailerId ?? null, trailerName: obsTrailer ? trName.get(obsTrailer.trailerId) ?? obsTrailer.name : null },
    });
  } catch (e) {
    console.warn("[telematics] track-update failed:", (e as Error).message);
    return NextResponse.json({ error: "Geotab didn't answer. Try again in a moment." }, { status: 502 });
  }
}
