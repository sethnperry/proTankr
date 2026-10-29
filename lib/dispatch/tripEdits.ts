// lib/dispatch/tripEdits.ts
//
// Dispatch editing or cancelling a load already in progress. Each change is written straight to the
// trip (any company member may update trips), logged as a trip event, and the driver is sent a push.
// Every function returns an error message, or null when it worked.

import { supabase } from "@/lib/supabase/client";
import type { FleetTrip } from "@/lib/trips/useFleetTrips";

async function notifyDriver(tripId: string, text: string) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/dispatch/notify-driver", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ tripId, text }) });
  } catch { /* the change is saved; the push is best effort */ }
}

async function logEvent(tripId: string, actorId: string, type: string, payload: Record<string, unknown>) {
  await supabase.from("trip_events").insert({
    event_id: crypto.randomUUID(), trip_id: tripId, event_type: type, occurred_at: new Date().toISOString(),
    actor_id: actorId, pickup_id: null, delivery_id: null, payload,
  });
}

const nowIso = () => new Date().toISOString();

/** Point a rack the truck hasn't reached yet at a different terminal. */
export async function changePickupTerminal(ft: FleetTrip, pickupId: string, t: { terminalId: string; name: string; city: string | null; state: string | null }, actorId: string): Promise<string | null> {
  const pk = ft.pickups.find((p) => p.pickup_id === pickupId);
  if (!pk || pk.arrived_at || pk.left_at) return "The truck has already reached that rack.";
  const { error } = await supabase.from("trip_pickups").update({ terminal_id: t.terminalId, name: t.name, city: t.city, state: t.state, rack_id: null, client_updated_at: nowIso() }).eq("pickup_id", pickupId);
  if (error) return error.message;
  await logEvent(ft.trip.trip_id, actorId, "dispatch_edit", { change: "pickup_terminal", from: pk.name, to: t.name });
  void notifyDriver(ft.trip.trip_id, `Your pickup moved to ${t.name}${t.city ? `, ${t.city}` : ""}.`);
  return null;
}

/** Point a stop the truck hasn't reached yet at a different store. */
export async function changeDeliveryLocation(ft: FleetTrip, deliveryId: string, loc: { locationId: string; label: string }, actorId: string): Promise<string | null> {
  const d = ft.deliveries.find((x) => x.delivery_id === deliveryId);
  if (!d || d.arrived_at || d.left_at) return "The truck has already reached that stop.";
  const { error } = await supabase.from("trip_deliveries").update({ location_id: loc.locationId, one_off_name: null, one_off_address: null, client_updated_at: nowIso() }).eq("delivery_id", deliveryId);
  if (error) return error.message;
  await logEvent(ft.trip.trip_id, actorId, "dispatch_edit", { change: "delivery_location", to: loc.label });
  void notifyDriver(ft.trip.trip_id, `Your delivery changed to ${loc.label}.`);
  return null;
}

/** Fix the primary order number. */
export async function changeOrderNumber(ft: FleetTrip, orderNumber: string, actorId: string): Promise<string | null> {
  const n = orderNumber.trim();
  if (!n) return "Enter an order number.";
  const { data, error } = await supabase.from("trip_orders").update({ order_number: n, client_updated_at: nowIso() }).eq("trip_id", ft.trip.trip_id).eq("is_primary", true).select("order_id");
  if (error) return error.message;
  if (!data?.length) return "This load has no order to change.";
  await logEvent(ft.trip.trip_id, actorId, "dispatch_edit", { change: "order_number", from: ft.orderNumbers[0] ?? null, to: n });
  void notifyDriver(ft.trip.trip_id, `Your order number is now ${n}.`);
  return null;
}

/** Cancel a load. Refused when product is already aboard (park or deliver it instead). */
export async function cancelLoadInProgress(ft: FleetTrip, actorId: string, note: string): Promise<string | null> {
  if (ft.compLoads.some((c) => c.disposition === "loaded")) return "Product is already on the trailer. Park or deliver it instead of cancelling.";
  const at = nowIso();
  const { data, error } = await supabase.from("trips").update({
    status: "cancelled", cancelled_at: at, cancelled_by: actorId, cancel_reasons: ["dispatch_cancelled"], cancel_note: note.trim() || null, client_updated_at: at,
  }).eq("trip_id", ft.trip.trip_id).not("status", "in", "(complete,cancelled)").select("trip_id");
  if (error) return error.message;
  if (!data?.length) return "That load already ended.";
  await logEvent(ft.trip.trip_id, actorId, "dispatch_edit", { change: "cancelled", note: note.trim() || null });
  void notifyDriver(ft.trip.trip_id, note.trim() ? `Dispatch cancelled this load: ${note.trim()}` : "Dispatch cancelled this load.");
  return null;
}
