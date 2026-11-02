"use client";
// app/planner/hooks/useFreight.ts
//
// The driver's freight loads through the offline store: begin, deliver (with LTS stops), end the empty stretch,
// cancel. Pulls the driver's recent loads and their stops from the server on open. Rules: lib/freight/freight.ts.

import { useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripStore, TripStoreState } from "@/lib/trips/tripStore";
import type { FreightLoadRow, FreightStopRow } from "@/lib/trips/types";
import { closeEmptyOnBegin, isEmptyNow, toNumber, type TrailerKind } from "@/lib/freight/freight";

export type BeginArgs = {
  preset: "standard" | "lts"; truckId: string; trailerId: string | null; trailerKind: TrailerKind | null; trailerLabel: string | null;
  reference: string; customer: string; origin: string; destination: string; routeNumber: string; odometer: string;
};
export type DeliverArgs = {
  freightId: string; endOdometer: string; stops: { name: string; casings: string; totes: string }[]; manifestPaths: string[]; signature: string | null; notes: string | null;
};

export function useFreight(o: { store: TripStore | null; state: TripStoreState; syncNow: () => unknown; userId: string | null; companyId: string | null }) {
  const { store, state, syncNow, userId, companyId } = o;

  useEffect(() => {
    if (!store || !userId) return;
    let alive = true;
    const since = new Date(Date.now() - 90 * 86400_000).toISOString();
    void (async () => {
      const { data: ls, error } = await supabase.from("freight_loads").select("*").eq("driver_id", userId).or(`status.eq.open,begun_at.gte.${since}`).limit(300);
      if (!alive || error) return;
      store.hydrate("freight_loads", (ls ?? []) as FreightLoadRow[]);
      const ids = ((ls ?? []) as FreightLoadRow[]).map((l) => l.freight_id);
      if (ids.length) {
        const { data: ss } = await supabase.from("freight_stops").select("*").in("freight_id", ids);
        if (alive) store.hydrate("freight_stops", (ss ?? []) as FreightStopRow[]);
      }
    })();
    return () => { alive = false; };
  }, [store, userId]);

  const loads = useMemo(() => (store && userId ? store.list("freight_loads", (l) => l.driver_id === userId) : []), [store, userId, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const stopsOf = useCallback((id: string) => (store ? store.list("freight_stops", (s) => s.freight_id === id).sort((a, b) => a.seq - b.seq) : []), [store, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = useCallback((a: BeginArgs): string | null => {
    if (!store || !userId || !companyId) return null;
    const now = new Date().toISOString();
    const odo = toNumber(a.odometer);
    // The truck's earlier load that left it empty ends its empty stretch here.
    const prev = store.list("freight_loads", (l) => l.driver_id === userId && l.truck_id === a.truckId && isEmptyNow(l)).sort((x, y) => (y.delivered_at ?? "").localeCompare(x.delivered_at ?? ""))[0];
    const close = closeEmptyOnBegin(prev as any, now, odo);
    if (prev && close) store.put("freight_loads", { freight_id: prev.freight_id, ...close });
    const id = crypto.randomUUID();
    store.put("freight_loads", {
      freight_id: id, company_id: companyId, driver_id: userId, truck_id: a.truckId, trailer_id: a.trailerId, trailer_kind: a.trailerKind, trailer_label: a.trailerLabel?.trim() || null,
      preset: a.preset, reference: a.reference.trim() || null, customer: a.customer.trim() || null, origin_text: a.origin.trim() || null, destination_text: a.destination.trim() || null,
      route_number: a.routeNumber.trim() || null, status: "open", begin_odometer: odo, begun_at: now, end_odometer: null, delivered_at: null, empty_end_odometer: null, empty_ended_at: null,
      manifest_paths: [], manifest_signature: null, notes: null, source: "app",
    });
    void syncNow();
    return id;
  }, [store, userId, companyId, syncNow]);

  const deliver = useCallback((a: DeliverArgs) => {
    if (!store) return;
    const now = new Date().toISOString();
    const old = new Map(store.list("freight_stops", (s) => s.freight_id === a.freightId).map((s) => [s.seq, s]));
    a.stops.filter((s) => s.name.trim()).forEach((s, i) => {
      store.put("freight_stops", { stop_id: old.get(i)?.stop_id ?? crypto.randomUUID(), freight_id: a.freightId, seq: i, name: s.name.trim(), casings: Math.max(0, Math.trunc(toNumber(s.casings) ?? 0)), totes: Math.max(0, Math.trunc(toNumber(s.totes) ?? 0)), note: null });
    });
    store.put("freight_loads", { freight_id: a.freightId, status: "delivered", delivered_at: now, end_odometer: toNumber(a.endOdometer), manifest_paths: a.manifestPaths, manifest_signature: a.signature, notes: a.notes });
    void syncNow();
  }, [store, syncNow]);

  const endEmpty = useCallback((freightId: string, odometer: string) => {
    if (!store) return;
    store.put("freight_loads", { freight_id: freightId, empty_ended_at: new Date().toISOString(), empty_end_odometer: toNumber(odometer) });
    void syncNow();
  }, [store, syncNow]);

  const cancel = useCallback((freightId: string) => {
    if (!store) return;
    store.put("freight_loads", { freight_id: freightId, status: "cancelled" });
    void syncNow();
  }, [store, syncNow]);

  return { loads, stopsOf, begin, deliver, endEmpty, cancel };
}
