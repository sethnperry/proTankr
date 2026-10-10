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
  DeliveryType,
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
      const open = [...OPEN_STATUSES];
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

      const openIds = [...trips.values()].filter((t) => OPEN_STATUSES.has(t.status)).map((t) => t.trip_id);
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

export type DeliveryLocationLite = {
  location_id: string;
  name: string;
  location_number: string | null;
  city: string | null;
  state: string | null;
  delivery_type: DeliveryType;
  starred: boolean;
};

// The company's delivery locations (design §4), starred first. The list is
// built out in phase 5; until then it may be empty and Start Load falls back
// to a one-off name.
export function useDeliveryLocations(companyId: string | null, userId: string | null) {
  const [locations, setLocations] = useState<DeliveryLocationLite[]>([]);

  useEffect(() => {
    if (!companyId || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [l, s] = await Promise.all([
          supabase.from("delivery_locations")
            .select("location_id,name,location_number,city,state,delivery_type")
            .eq("company_id", companyId).eq("is_active", true).order("name"),
          supabase.from("delivery_location_stars").select("location_id").eq("user_id", userId),
        ]);
        if (cancelled) return;
        const starred = new Set(((s.data ?? []) as { location_id: string }[]).map((r) => r.location_id));
        const rows = ((l.data ?? []) as Omit<DeliveryLocationLite, "starred">[]).map((r) => ({ ...r, starred: starred.has(r.location_id) }));
        rows.sort((a, b) => Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name));
        setLocations(rows);
      } catch (e) {
        console.warn("[trips] delivery locations failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, userId]);

  return locations;
}

export function locationLabel(l: Pick<DeliveryLocationLite, "name" | "location_number" | "city" | "state">): string {
  const num = l.location_number ? `#${l.location_number} ` : "";
  const place = [l.city, l.state].filter(Boolean).join(", ");
  return `${num}${l.name}${place ? ` · ${place}` : ""}`;
}
