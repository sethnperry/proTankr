"use client";
// app/planner/hooks/useLanternfly.ts
//
// Spotted Lanternfly for the driver's open trip: which zone counties the trip has entered, which are attested,
// and attesting (written through the offline store). The rules are in lib/slf/slf.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripStore, TripStoreState } from "@/lib/trips/tripStore";
import type { SlfAttestationRow } from "@/lib/trips/types";
import { status, zoneCountiesEntered, zoneKeys, type CountyEntry, type Zone, type TripStop } from "@/lib/slf/slf";
import { stopsFor } from "@/lib/slf/loadStops";

export function useLanternfly(o: { store: TripStore | null; state: TripStoreState; syncNow: () => unknown; userId: string | null; companyId: string | null; tripId: string | null }) {
  const { store, state, syncNow, userId, companyId, tripId } = o;
  const [zone, setZone] = useState<Zone[]>([]);
  const [stops, setStops] = useState<TripStop[]>([]);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    void supabase.from("slf_zone_counties").select("state, county").eq("company_id", companyId).then(({ data }) => { if (alive) setZone((data ?? []) as Zone[]); });
    return () => { alive = false; };
  }, [companyId]);

  // The trip's stops, as the store has them (so a stop arrived at a moment ago counts), with their counties.
  const rows = useMemo(() => {
    if (!store || !tripId) return { pickups: [], deliveries: [], att: [] as SlfAttestationRow[] };
    return { pickups: store.list("trip_pickups", (p) => p.trip_id === tripId), deliveries: store.list("trip_deliveries", (d) => d.trip_id === tripId), att: store.list("slf_attestations", (a) => a.trip_id === tripId) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, tripId, state]);
  const sig = rows.pickups.map((p) => `${p.pickup_id}${p.arrived_at ?? ""}`).join() + rows.deliveries.map((d) => `${d.delivery_id}${d.arrived_at ?? ""}`).join();
  useEffect(() => {
    if (!tripId || zone.length === 0) { setStops([]); return; }
    let alive = true;
    void stopsFor(rows.pickups, rows.deliveries).then((m) => { if (alive) setStops(m.get(tripId) ?? []); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, sig, zone.length]);

  useEffect(() => {
    if (!store || !tripId) return;
    void supabase.from("slf_attestations").select("*").eq("trip_id", tripId).then(({ data, error }) => { if (!error) store.hydrate("slf_attestations", (data ?? []) as SlfAttestationRow[]); });
  }, [store, tripId]);

  const st = useMemo(() => status(zoneCountiesEntered(stops, zoneKeys(zone)), rows.att), [stops, zone, rows.att]);

  const attest = useCallback((e: CountyEntry) => {
    if (!store || !userId || !companyId || !tripId) return;
    store.put("slf_attestations", { trip_id: tripId, state: e.state, county: e.county, company_id: companyId, user_id: userId, cab_exterior: true, frame_tool_box: true, trailer: true, attested_at: new Date().toISOString(), source: "app" });
    void syncNow();
  }, [store, userId, companyId, tripId, syncNow]);

  return { ...st, attest, hasZone: zone.length > 0 };
}
