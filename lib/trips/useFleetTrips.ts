"use client";
// lib/trips/useFleetTrips.ts
//
// Every open and parked trip in the company, for the Dispatch Dashboard.
// Reads straight from the server (not the driver's offline store): trips and
// their children are readable by any company member under the phase 1 RLS.
// Refreshes every minute and when the tab comes back into view.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Place } from "./fleetProgress";
import { truckStartPlace } from "./fleetProgress";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripOrderRow, TripPickupRow, TripRow } from "./types";

export type FleetTrip = {
  trip: TripRow;
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  compLoads: TripCompartmentLoadRow[];
  orderNumbers: string[];
  driverName: string | null;
  parkedByName: string | null;
  truckName: string | null;
  trailerName: string | null;
  start: Place | null;
};

const LIVE = ["draft", "loading", "in_transit", "delivering", "parked"];
const POLL_MS = 60_000;

export function useFleetTrips(companyId: string | null) {
  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [locations, setLocations] = useState<Map<string, Place>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const tr = await supabase.from("trips").select("*").eq("company_id", companyId).in("status", LIVE)
        .order("started_at", { ascending: false });
      if (tr.error) throw tr.error;
      const rows = (tr.data ?? []) as TripRow[];
      if (rows.length === 0) {
        setTrips([]);
        setError(null);
        return;
      }
      const ids = rows.map((t) => t.trip_id);
      const truckIds = [...new Set(rows.map((t) => t.truck_id).filter((x): x is string => !!x))];
      const trailerIds = [...new Set(rows.map((t) => t.trailer_id).filter((x): x is string => !!x))];
      const userIds = [...new Set(rows.flatMap((t) => [t.driver_id, t.parked_by]).filter((x): x is string => !!x))];
      const none = Promise.resolve({ data: [] as any[], error: null });

      const [pk, dl, cl, od, tk, tl, names, prevTrips] = await Promise.all([
        supabase.from("trip_pickups").select("*").in("trip_id", ids),
        supabase.from("trip_deliveries").select("*").in("trip_id", ids),
        supabase.from("trip_compartment_loads").select("*").in("trip_id", ids),
        supabase.from("trip_orders").select("*").in("trip_id", ids),
        truckIds.length ? supabase.from("trucks").select("truck_id, truck_name").in("truck_id", truckIds) : none,
        trailerIds.length ? supabase.from("trailers").select("trailer_id, trailer_name").in("trailer_id", trailerIds) : none,
        userIds.length ? supabase.rpc("get_display_names_full", { p_user_ids: userIds }) : none,
        // Each truck's recent finished trips, for where this trip started.
        truckIds.length
          ? supabase.from("trips").select("trip_id, truck_id").in("truck_id", truckIds).eq("status", "complete")
              .order("completed_at", { ascending: false }).limit(60)
          : none,
      ]);
      const prev = (prevTrips.data ?? []) as { trip_id: string; truck_id: string }[];
      const prevDel = prev.length
        ? await supabase.from("trip_deliveries").select("trip_id, location_id, one_off_name, left_at, status")
            .in("trip_id", prev.map((t) => t.trip_id)).eq("status", "complete")
        : { data: [] as any[] };

      const deliveries = (dl.data ?? []) as TripDeliveryRow[];
      const locIds = [...new Set([...deliveries, ...((prevDel.data ?? []) as any[])].map((d) => d.location_id).filter(Boolean))];
      const lr = locIds.length
        ? await supabase.from("delivery_locations").select("location_id, name, city, state").in("location_id", locIds)
        : { data: [] as any[] };
      const locs = new Map<string, Place>(((lr.data ?? []) as any[]).map((l) => [l.location_id, { name: l.name, city: l.city, state: l.state }]));

      const truckName = new Map(((tk.data ?? []) as any[]).map((t) => [t.truck_id, t.truck_name as string]));
      const trailerName = new Map(((tl.data ?? []) as any[]).map((t) => [t.trailer_id, t.trailer_name as string]));
      const nameOf = new Map(((names.data ?? []) as any[]).map((r) => [r.user_id, r.display_name as string]));
      const prevTruck = new Map(prev.map((t) => [t.trip_id, t.truck_id]));
      const doneByTruck = new Map<string, { left_at: string | null; place: Place }[]>();
      for (const d of (prevDel.data ?? []) as any[]) {
        const truck = prevTruck.get(d.trip_id);
        if (!truck) continue;
        const place = d.location_id ? locs.get(d.location_id) ?? null : { name: d.one_off_name, city: null, state: null };
        if (!place) continue;
        const list = doneByTruck.get(truck) ?? [];
        list.push({ left_at: d.left_at, place });
        doneByTruck.set(truck, list);
      }

      const by = <T extends { trip_id: string }>(list: T[], id: string) => list.filter((x) => x.trip_id === id);
      const pickups = (pk.data ?? []) as TripPickupRow[];
      const loads = (cl.data ?? []) as TripCompartmentLoadRow[];
      const orders = (od.data ?? []) as TripOrderRow[];
      setTrips(rows.map((t) => ({
        trip: t,
        pickups: by(pickups, t.trip_id),
        deliveries: by(deliveries, t.trip_id),
        compLoads: by(loads, t.trip_id),
        orderNumbers: by(orders, t.trip_id)
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
          .map((o) => o.order_number)
          .filter((n): n is string => !!n),
        driverName: nameOf.get(t.driver_id) ?? null,
        parkedByName: t.parked_by ? nameOf.get(t.parked_by) ?? null : null,
        truckName: t.truck_id ? truckName.get(t.truck_id) ?? null : null,
        trailerName: t.trailer_id ? trailerName.get(t.trailer_id) ?? null : null,
        // Recorded at Start Load; older trips fall back to the truck's last delivery.
        start: t.start_city
          ? { name: null, city: t.start_city, state: t.start_state ?? null }
          : t.truck_id ? truckStartPlace(doneByTruck.get(t.truck_id) ?? [], t.started_at) : null,
      })));
      setLocations(locs);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load trips.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return { trips, locations, loading, error, reload: load };
}
