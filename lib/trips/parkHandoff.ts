// lib/trips/parkHandoff.ts
//
// A driver commandeers a trailer that holds a parked preloaded trip: they become the delivery driver at
// that moment. The trip moves to them (in transit, their truck), the commandeer time is the begin time
// of their leg, and a handoff is recorded for the PTD and for the alert on their dashboard.

import { supabase } from "@/lib/supabase/client";

/** Returns the trip id that was taken over, or null when the trailer holds no parked trip. */
export async function takeOverParkedTrip(trailerId: string, truckId: string | null, userId: string): Promise<string | null> {
  const { data } = await supabase.from("trips").select("trip_id, driver_id, parked_at, parked_by").eq("trailer_id", trailerId).eq("status", "parked").limit(1);
  const t = ((data ?? []) as { trip_id: string; driver_id: string; parked_at: string | null; parked_by: string | null }[])[0];
  if (!t) return null;
  const at = new Date().toISOString();
  const up = await supabase.from("trips").update({
    status: "in_transit", driver_id: userId, ...(truckId ? { truck_id: truckId } : {}),
    parked_at: null, parked_by: null, parked_for: null, parked_where: null, parked_region: null, parked_note: null,
    park_requested_at: null, park_requested_by: null, handoff_at: at, handoff_from: t.parked_by ?? t.driver_id, client_updated_at: at,
  }).eq("trip_id", t.trip_id).eq("status", "parked").select("trip_id");
  if (up.error || !up.data?.length) return null;
  await supabase.from("trip_events").insert([
    { event_id: crypto.randomUUID(), trip_id: t.trip_id, event_type: "resumed", occurred_at: at, actor_id: userId, pickup_id: null, delivery_id: null, payload: { parked_at: t.parked_at, parked_by: t.parked_by, commandeered: true } },
    { event_id: crypto.randomUUID(), trip_id: t.trip_id, event_type: "handoff", occurred_at: at, actor_id: userId, pickup_id: null, delivery_id: null, payload: { from_driver_id: t.driver_id, to_driver_id: userId, commandeered: true } },
  ]);
  return t.trip_id;
}
