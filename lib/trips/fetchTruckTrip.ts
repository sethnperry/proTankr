// lib/trips/fetchTruckTrip.ts
//
// The load a truck is on right now (or the next one dispatched to it), with
// what summarizeTruckTrip needs. Reads straight from the company's trips, so
// anyone in the company can look. Returns null when the truck has no load.

import { supabase } from "@/lib/supabase/client";
import type { Place } from "./fleetProgress";
import type { LatLon } from "./deliveryLocations";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripPickupRow, TripRow } from "./types";

export type TruckTripData = {
  trip: TripRow;
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  compLoads: TripCompartmentLoadRow[];
  locations: Map<string, Place>;
  terminalLL: (id: string) => LatLon | null;
  locationLL: (id: string) => LatLon | null;
};

const LIVE = ["draft", "loading", "in_transit", "delivering", "parked"];
const ll = (r: { lat?: unknown; lon?: unknown } | undefined): LatLon | null =>
  r && r.lat != null && r.lon != null && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) ? { lat: Number(r.lat), lon: Number(r.lon) } : null;

export async function fetchTruckTrip(truckId: string): Promise<TruckTripData | null> {
  try {
    let trip: TripRow | null = null;
    const live = await supabase.from("trips").select("*").eq("truck_id", truckId).in("status", LIVE).order("started_at", { ascending: false }).limit(1);
    trip = ((live.data ?? []) as TripRow[])[0] ?? null;
    if (!trip) {
      const d = await supabase.from("trips").select("*").eq("planned_truck_id", truckId).eq("status", "dispatched").order("planned_start_at", { ascending: true }).limit(1);
      trip = ((d.data ?? []) as TripRow[])[0] ?? null;
    }
    if (!trip) return null;
    const id = trip.trip_id;
    const [pk, dl, cl] = await Promise.all([
      supabase.from("trip_pickups").select("*").eq("trip_id", id),
      supabase.from("trip_deliveries").select("*").eq("trip_id", id),
      supabase.from("trip_compartment_loads").select("*").eq("trip_id", id),
    ]);
    const pickups = (pk.data ?? []) as TripPickupRow[];
    const deliveries = (dl.data ?? []) as TripDeliveryRow[];
    const locIds = [...new Set(deliveries.map((d) => d.location_id).filter((x): x is string => !!x))];
    const termIds = [...new Set(pickups.map((p) => p.terminal_id).filter((x): x is string => !!x).map(String))];
    const [lr, tr] = await Promise.all([
      locIds.length ? supabase.from("delivery_locations").select("location_id, name, city, state, lat, lon").in("location_id", locIds) : Promise.resolve({ data: [] as any[] }),
      termIds.length ? supabase.from("terminals").select("terminal_id, lat, lon").in("terminal_id", termIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const locRows = (lr.data ?? []) as any[];
    const locations = new Map<string, Place>(locRows.map((l) => [l.location_id, { name: l.name, city: l.city, state: l.state }]));
    const locLL = new Map(locRows.map((l) => [l.location_id as string, ll(l)]));
    const termLL = new Map(((tr.data ?? []) as any[]).map((t) => [String(t.terminal_id), ll(t)]));
    return {
      trip, pickups, deliveries, compLoads: (cl.data ?? []) as TripCompartmentLoadRow[], locations,
      terminalLL: (tid) => termLL.get(tid) ?? null, locationLL: (lid) => locLL.get(lid) ?? null,
    };
  } catch {
    return null;
  }
}
