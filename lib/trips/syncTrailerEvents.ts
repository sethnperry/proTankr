"use client";
// lib/trips/syncTrailerEvents.ts
//
// Pulls Geotab's trailer hooks and drops for the trip's truck since the trip
// began and files them on the trip. Safe to run again: each event has a stable
// id, so the same hook is never added twice. Needs the telematics link and
// trailer tracking; otherwise it does nothing.

import { supabase } from "@/lib/supabase/client";
import type { TripRow } from "./types";
import type { TripStoreLike } from "./tripLogic";
import { DROP_EVENT, HOOK_EVENT, trailerEventId } from "./trailerEvents";

export async function syncTrailerEvents(store: TripStoreLike, o: { trip: TripRow; userId: string }): Promise<number> {
  const truckId = o.trip.truck_id;
  const from = o.trip.started_at ?? null;
  if (!truckId || !from) return 0;
  try {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) return 0;
    const q = new URLSearchParams({ truckId, from, to: new Date().toISOString() });
    const r = await fetch(`/api/telematics/trailer-events?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    if (!j?.connected) return 0;
    let added = 0;
    for (const e of j.events as { type: "hook" | "drop"; at: string; trailerId: string; trailerName: string; lat: number | null; lon: number | null; city: string | null; state: string | null }[]) {
      const kind = e.type === "hook" ? HOOK_EVENT : DROP_EVENT;
      const id = await trailerEventId(o.trip.trip_id, kind, e.trailerId, e.at);
      if (store.list("trip_events", (x) => x.event_id === id).length) continue;
      store.put("trip_events", {
        event_id: id, trip_id: o.trip.trip_id, event_type: kind, occurred_at: e.at, actor_id: o.userId, pickup_id: null, delivery_id: null,
        payload: { trailer_id: e.trailerId, trailer_name: e.trailerName, lat: e.lat, lon: e.lon, city: e.city, state: e.state, source: "geotab" },
      });
      added++;
    }
    return added;
  } catch {
    return 0;
  }
}
