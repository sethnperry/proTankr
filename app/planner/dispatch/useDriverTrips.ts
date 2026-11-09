"use client";
// app/planner/dispatch/useDriverTrips.ts
//
// One driver's trips for the Plan board's "whole day": finished, in progress
// and dispatched-not-begun, from the last 48 hours on. Polls once a minute.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripPickupRow, TripRow } from "@/lib/trips/types";

export type DriverTrip = {
  trip: TripRow;
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  compLoads: TripCompartmentLoadRow[];
  orderNumber: string | null;
};

const HISTORY_MS = 48 * 3600000;

export function useDriverTrips(driverId: string | null) {
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!driverId) { setTrips([]); return; }
    const since = new Date(Date.now() - HISTORY_MS).toISOString();
    const { data, error } = await supabase.from("trips")
      .select("*, trip_pickups(*), trip_deliveries(*), trip_compartment_loads(*), trip_orders(order_number, is_primary)")
      .eq("driver_id", driverId)
      .or(`status.in.(draft,loading,in_transit,delivering,dispatched),started_at.gte.${since},planned_start_at.gte.${since}`)
      .neq("status", "cancelled")
      .order("started_at", { ascending: true, nullsFirst: false });
    if (error) return;
    setTrips(((data ?? []) as any[]).map((t) => {
      const { trip_pickups, trip_deliveries, trip_compartment_loads, trip_orders, ...trip } = t;
      return {
        trip: trip as TripRow, pickups: trip_pickups ?? [], deliveries: trip_deliveries ?? [], compLoads: trip_compartment_loads ?? [],
        orderNumber: (trip_orders ?? []).find((o: any) => o.is_primary)?.order_number ?? null,
      };
    }));
  }, [driverId]);
  useEffect(() => {
    setLoading(!!driverId);
    let off = false;
    void load().finally(() => { if (!off) setLoading(false); });
    const t = window.setInterval(() => void load(), 60_000);
    return () => { off = true; window.clearInterval(t); };
  }, [load, driverId]);
  return { trips, loading, reload: load };
}
