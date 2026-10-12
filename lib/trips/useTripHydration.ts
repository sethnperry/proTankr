"use client";
// lib/trips/useTripHydration.ts
//
// Pulls the trip rows the dashboard needs from the server into the offline
// store, so a second phone (or a cleared browser) sees the same open trip and
// prefills. Never queues anything; a local edit still waiting to sync always
// wins over the server copy (store.hydrate).
//
// Fails open: any error just leaves the phone's own copy in place.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { OPEN_STATUSES } from "./tripLogic";
import type { TripStore } from "./tripStore";
import type {
  CompartmentReadinessRow,
  TripCompartmentLoadRow,
  TripDeliveryRow,
  TripDeliveryTankRow,
  TripOrderRow,
  TripPickupRow,
  TripRow,
} from "./types";

export function useTripHydration(
  store: TripStore | null,
  userId: string | null,
  truckId: string | null,
  trailerId: string | null = null,
) {
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!store || !userId) return;
    setLoading(true);
    try {
      // Parked trips count here too: the trailer still carries their load.
      const open = [...OPEN_STATUSES, "parked" as const];
      const empty = Promise.resolve({ data: [] as unknown[], error: null });
      const [openRes, recentRes, truckRes, trailerRes, readinessRes] = await Promise.all([
        supabase.from("trips").select("*").eq("driver_id", userId).in("status", open),
        supabase.from("trips").select("*").eq("driver_id", userId).order("created_at", { ascending: false }).limit(10),
        truckId
          ? supabase.from("trips").select("*").eq("truck_id", truckId).not("end_miles", "is", null)
              .order("completed_at", { ascending: false }).limit(1)
          : empty,
        // Another driver's open trip on this trailer (handoff, §10).
        trailerId ? supabase.from("trips").select("*").eq("trailer_id", trailerId).in("status", open) : empty,
        trailerId ? supabase.from("compartment_readiness").select("*").eq("trailer_id", trailerId) : empty,
      ]);
      const trips = new Map<string, TripRow>();
      for (const res of [openRes, recentRes, truckRes, trailerRes]) {
        for (const t of ((res.data ?? []) as TripRow[])) trips.set(t.trip_id, t);
      }
      store.hydrate("trips", [...trips.values()]);
      store.hydrate("compartment_readiness", (readinessRes.data ?? []) as CompartmentReadinessRow[]);

      const openIds = [...trips.values()].filter((t) => OPEN_STATUSES.has(t.status) || t.status === "parked").map((t) => t.trip_id);
      if (openIds.length) {
        const [o, p, d, c] = await Promise.all([
          supabase.from("trip_orders").select("*").in("trip_id", openIds),
          supabase.from("trip_pickups").select("*").in("trip_id", openIds),
          supabase.from("trip_deliveries").select("*").in("trip_id", openIds),
          supabase.from("trip_compartment_loads").select("*").in("trip_id", openIds),
        ]);
        store.hydrate("trip_orders", (o.data ?? []) as TripOrderRow[]);
        store.hydrate("trip_pickups", (p.data ?? []) as TripPickupRow[]);
        const deliveries = (d.data ?? []) as TripDeliveryRow[];
        store.hydrate("trip_deliveries", deliveries);
        store.hydrate("trip_compartment_loads", (c.data ?? []) as TripCompartmentLoadRow[]);
        const deliveryIds = deliveries.map((x) => x.delivery_id);
        if (deliveryIds.length) {
          const t = await supabase.from("trip_delivery_tanks").select("*").in("delivery_id", deliveryIds);
          store.hydrate("trip_delivery_tanks", (t.data ?? []) as TripDeliveryTankRow[]);
        }
      }
    } catch (e) {
      console.warn("[trips] hydrate failed:", e);
    } finally {
      setLoading(false);
    }
  }, [store, userId, truckId, trailerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, refresh };
}
