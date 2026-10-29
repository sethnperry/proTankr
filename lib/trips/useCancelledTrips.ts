"use client";
// lib/trips/useCancelledTrips.ts
//
// Cancelled loads for the Dispatch Dashboard: the last 30 days, company-wide,
// with reasons, the racks tried, and who cancelled. A driver hiding a
// cancelled load from their own Trips list doesn't hide it here.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripDeliveryRow, TripOrderRow, TripPickupRow, TripRow } from "./types";

export type CancelledTrip = {
  trip: TripRow;
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  orderNumbers: string[];
  driverName: string | null;
  truckName: string | null;
  trailerName: string | null;
};

export const CANCELLED_DAYS = 30;

export function useCancelledTrips(companyId: string | null) {
  const [trips, setTrips] = useState<CancelledTrip[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const since = new Date(Date.now() - CANCELLED_DAYS * 86_400_000).toISOString();
      const tr = await supabase.from("trips").select("*").eq("company_id", companyId).eq("status", "cancelled")
        .or(`cancelled_at.gte.${since},and(cancelled_at.is.null,started_at.gte.${since})`)
        .order("cancelled_at", { ascending: false, nullsFirst: false }).limit(100);
      if (tr.error) throw tr.error;
      let rows = (tr.data ?? []) as TripRow[];
      if (rows.length) {
        // A load that was reassigned stops showing as cancelled (the record stays).
        const re = await supabase.from("trip_events").select("trip_id").eq("event_type", "reassigned").in("trip_id", rows.map((t) => t.trip_id));
        const gone = new Set(((re.data ?? []) as any[]).map((r) => r.trip_id as string));
        rows = rows.filter((t) => !gone.has(t.trip_id));
      }
      if (rows.length === 0) {
        setTrips([]);
        setError(null);
        return;
      }
      const ids = rows.map((t) => t.trip_id);
      const truckIds = [...new Set(rows.map((t) => t.truck_id).filter((x): x is string => !!x))];
      const trailerIds = [...new Set(rows.map((t) => t.trailer_id).filter((x): x is string => !!x))];
      const userIds = [...new Set(rows.map((t) => t.driver_id).filter(Boolean))];
      const none = Promise.resolve({ data: [] as any[], error: null });
      const [pk, od, dl, tk, tl, names] = await Promise.all([
        supabase.from("trip_pickups").select("*").in("trip_id", ids),
        supabase.from("trip_orders").select("*").in("trip_id", ids),
        supabase.from("trip_deliveries").select("*").in("trip_id", ids),
        truckIds.length ? supabase.from("trucks").select("truck_id, truck_name").in("truck_id", truckIds) : none,
        trailerIds.length ? supabase.from("trailers").select("trailer_id, trailer_name").in("trailer_id", trailerIds) : none,
        userIds.length ? supabase.rpc("get_display_names_full", { p_user_ids: userIds }) : none,
      ]);
      const pickups = (pk.data ?? []) as TripPickupRow[];
      const orders = (od.data ?? []) as TripOrderRow[];
      const dels = (dl.data ?? []) as TripDeliveryRow[];
      const truckName = new Map(((tk.data ?? []) as any[]).map((t) => [t.truck_id, t.truck_name as string]));
      const trailerName = new Map(((tl.data ?? []) as any[]).map((t) => [t.trailer_id, t.trailer_name as string]));
      const nameOf = new Map(((names.data ?? []) as any[]).map((r) => [r.user_id, r.display_name as string]));
      setTrips(rows.map((t) => ({
        trip: t,
        pickups: pickups.filter((p) => p.trip_id === t.trip_id).sort((a, b) => a.seq - b.seq),
        deliveries: dels.filter((d) => d.trip_id === t.trip_id).sort((a, b) => a.seq - b.seq),
        orderNumbers: orders.filter((o) => o.trip_id === t.trip_id)
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
          .map((o) => o.order_number).filter((n): n is string => !!n),
        driverName: nameOf.get(t.driver_id) ?? null,
        truckName: t.truck_id ? truckName.get(t.truck_id) ?? null : null,
        trailerName: t.trailer_id ? trailerName.get(t.trailer_id) ?? null : null,
      })));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load cancelled trips.");
    }
  }, [companyId]);

  useEffect(() => {
    void load();
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  return { trips, error, reload: load };
}
