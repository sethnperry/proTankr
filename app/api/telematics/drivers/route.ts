// app/api/telematics/drivers/route.ts
//
// GET ?companyId=&q= -> { connected, drivers: [...] }
// Search the telematics provider's drivers by name or employee number, whether or not they are
// ProTankr members. Each result says which truck they're signed in to right now (and where that
// truck is) or, when nobody is signed in, the truck they last used in the past 30 days.
// Any member of the company. Fails soft like the other telematics routes.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { importableVehicles } from "@/lib/telematics/dedupe";
import { callerId, companyRole, providerFor } from "@/lib/telematics/server";
import type { TelematicsProvider } from "@/lib/telematics/types";

export const runtime = "nodejs";

// Geotab limits how often the whole-fleet calls can run, and a search fires as you type, so the fleet's
// driver list and vehicle status are kept for a short while and shared between searches.
type Snap = { at: number; vehicles: { id: string; name: string; vin: string | null; activeTo?: string | null; activeFrom?: string | null; groupIds?: string[] }[]; drivers: Awaited<ReturnType<TelematicsProvider["listDrivers"]>>; current: Map<string, string>; historic: Map<string, string>; positions: Map<string, any> };
const SNAP_MS = 20_000;
const snaps = new Map<string, Snap>();
async function snapshot(companyId: string, p: TelematicsProvider): Promise<Snap> {
  const hit = snaps.get(companyId);
  if (hit && Date.now() - hit.at < SNAP_MS) return hit;
  const warm = !!hit && Date.now() - hit.at < 10 * 60_000;
  const [drivers, vehicles, st] = await Promise.all([
    warm && hit!.drivers.length ? Promise.resolve(hit!.drivers) : p.listDrivers(),
    warm && hit!.vehicles.length ? Promise.resolve(hit!.vehicles) : p.listVehicles().catch(() => []),
    p.fleetStatus().catch(() => ({ positions: new Map(), current: new Map<string, string>(), historic: new Map<string, string>() })),
  ]);
  const next: Snap = { at: Date.now(), drivers, vehicles, ...st };
  snaps.set(companyId, next);
  return next;
}

type Place = { vehicleId: string; truckId: string | null; vehicleName: string; lat: number | null; lon: number | null; at: string | null };

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
  if (q.length < 2) return NextResponse.json({ connected: true, drivers: [] });
  try {
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ connected: false });
    const admin = getServiceSupabase();
    const snap = await snapshot(companyId, p);
    const all = snap.drivers;
    const hits = all.filter((d) => `${d.name} ${d.firstName ?? ""} ${d.lastName ?? ""} ${d.employeeNo ?? ""}`.toLowerCase().includes(q)).slice(0, 8);
    // Vehicles in Geotab whose name matches (a truck that was never added to ProTankr still shows).
    const vehicleHits = importableVehicles(snap.vehicles as any).filter((v) => v.name.toLowerCase().includes(q)).slice(0, 8);
    if (hits.length === 0 && vehicleHits.length === 0) return NextResponse.json({ connected: true, drivers: [], vehicles: [] });

    const { current, historic, positions } = snap;
    const [vmap, dmap] = await Promise.all([
      admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id, vehicle_name").eq("company_id", companyId),
      admin.from("telematics_driver_map").select("provider_user_id, user_id").eq("company_id", companyId),
    ]);
    const vrows = (vmap.data ?? []) as { provider_vehicle_id: string; truck_id: string; vehicle_name: string | null }[];
    const truckOf = new Map(vrows.map((v) => [v.provider_vehicle_id, v]));
    const truckIds = [...new Set(vrows.map((v) => v.truck_id))];
    const { data: trucks } = truckIds.length ? await admin.from("trucks").select("truck_id, truck_name").in("truck_id", truckIds) : { data: [] as any[] };
    const truckName = new Map(((trucks ?? []) as { truck_id: string; truck_name: string }[]).map((t) => [t.truck_id, t.truck_name]));
    const memberOf = new Map(((dmap.data ?? []) as { provider_user_id: string; user_id: string }[]).map((m) => [m.provider_user_id, m.user_id]));
    const userIds = [...new Set(hits.map((d) => memberOf.get(d.id)).filter((x): x is string => !!x))];
    const { data: profs } = userIds.length ? await admin.from("profiles").select("user_id, display_name").in("user_id", userIds) : { data: [] as any[] };
    const profName = new Map(((profs ?? []) as { user_id: string; display_name: string | null }[]).map((x) => [x.user_id, x.display_name]));

    // Provider vehicle names, only fetched if some vehicle isn't one of ours.
    let vehicleNames: Map<string, string> | null = null;
    const nameOfVehicle = async (vid: string): Promise<string> => {
      const ours = truckOf.get(vid);
      if (ours) return truckName.get(ours.truck_id) ?? ours.vehicle_name ?? "Truck";
      if (!vehicleNames) vehicleNames = new Map((await p.listVehicles().catch(() => [])).map((v) => [v.id, v.name]));
      return vehicleNames.get(vid) ?? "a vehicle";
    };
    const placeOf = async (vid: string, at: string | null): Promise<Place> => {
      const pos = positions.get(vid);
      return {
        vehicleId: vid, truckId: truckOf.get(vid)?.truck_id ?? null, vehicleName: await nameOfVehicle(vid),
        lat: pos?.lat ?? null, lon: pos?.lon ?? null, at: pos?.at ?? at,
      };
    };

    const vehicles = vehicleHits.map((v) => {
      const pos = positions.get(v.id);
      const dId = current.get(v.id) ?? historic.get(v.id) ?? null;
      return {
        vehicleId: v.id, name: v.name, truckId: truckOf.get(v.id)?.truck_id ?? null,
        lat: pos?.lat ?? null, lon: pos?.lon ?? null, at: pos?.at ?? null, speedMph: pos?.speedMph ?? null,
        driverName: dId ? (all.find((x) => x.id === dId)?.name ?? null) : null, signedIn: current.has(v.id),
      };
    });

    const drivers = [];
    for (const d of hits) {
      const vid = [...current.entries()].find(([, drv]) => drv === d.id)?.[0] ?? null;
      let now: Place | null = null, last: Place | null = null;
      if (vid) now = await placeOf(vid, null);
      else {
        // The status record's last driver first (instant), then the sign-in history and trips.
        const hv = [...historic.entries()].find(([, drv]) => drv === d.id)?.[0] ?? null;
        const l = hv ? { vehicleId: hv, at: positions.get(hv)?.at ?? new Date().toISOString() } : await p.lastVehicleOf(d.id).catch(() => null);
        if (l) last = { ...(await placeOf(l.vehicleId, l.at)), at: l.at };
      }
      const uidm = memberOf.get(d.id);
      drivers.push({
        providerId: d.id, name: [d.firstName, d.lastName].filter(Boolean).join(" ") || d.name, employeeNo: d.employeeNo,
        memberName: uidm ? profName.get(uidm) ?? null : null, now, last,
        hos: await p.hos(d.id).catch(() => null),
        // Why a driver isn't placed, for troubleshooting: what Geotab's vehicle status records say about them.
        debug: vid || last ? undefined : await p.driverDebug(d.id).catch(() => undefined),
        diag: `Geotab sees ${current.size} signed-in and ${historic.size} last-driver records. This driver: ${vid ? "signed in" : [...historic.values()].includes(d.id) ? "last driver on a vehicle" : "on no vehicle status record"}.`,
      });
    }
    return NextResponse.json({ connected: true, drivers, vehicles });
  } catch (e) {
    console.warn("[telematics] driver search failed:", (e as Error).message);
    // The provider is reachable but didn't answer (a busy or rate-limited Geotab); not the same as "not connected".
    return NextResponse.json({ connected: true, error: `Geotab didn't answer (${String((e as Error).message ?? e).slice(0, 140)}). Try again in a moment.`, drivers: [] });
  }
}
