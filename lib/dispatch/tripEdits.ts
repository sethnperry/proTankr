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

/** Dispatch marks the truck arrived at the stop it is headed to. */
export async function arriveByDispatch(ft: FleetTrip, actorId: string): Promise<string | null> {
  const at = nowIso();
  const pk = ft.pickups.filter((p) => p.outcome !== "no_load" && !p.left_at).sort((a, b) => a.seq - b.seq)[0];
  if (pk && !pk.arrived_at) {
    const { error } = await supabase.from("trip_pickups").update({ arrived_at: at, client_updated_at: at }).eq("pickup_id", pk.pickup_id);
    if (error) return error.message;
    await logEvent(ft.trip.trip_id, actorId, "pickup_arrived", { by: "dispatch" });
    void notifyDriver(ft.trip.trip_id, `Dispatch marked you arrived at ${pk.name ?? "the rack"}.`);
    return null;
  }
  const d = ft.deliveries.filter((x) => x.status === "planned").sort((a, b) => a.seq - b.seq)[0];
  if (!pk && d && !d.arrived_at) {
    const a = await supabase.from("trip_deliveries").update({ arrived_at: at, client_updated_at: at }).eq("delivery_id", d.delivery_id);
    if (a.error) return a.error.message;
    await supabase.from("trips").update({ status: "delivering", client_updated_at: at }).eq("trip_id", ft.trip.trip_id);
    await logEvent(ft.trip.trip_id, actorId, "delivery_arrived", { by: "dispatch" });
    void notifyDriver(ft.trip.trip_id, "Dispatch marked you arrived at the delivery.");
    return null;
  }
  return "There is no stop to arrive at.";
}

/** Tell the driver to park the loaded trailer. */
export async function requestPark(ft: FleetTrip, actorId: string): Promise<string | null> {
  if (!ft.compLoads.some((c) => c.disposition === "loaded")) return "Nothing is loaded yet, so there is nothing to park.";
  const at = nowIso();
  const { error } = await supabase.from("trips").update({ park_requested_at: at, park_requested_by: actorId, client_updated_at: at }).eq("trip_id", ft.trip.trip_id);
  if (error) return error.message;
  await logEvent(ft.trip.trip_id, actorId, "park_requested", {});
  void notifyDriver(ft.trip.trip_id, "Dispatch asked you to park this load. Open the dashboard and tap Park it.");
  return null;
}

export async function withdrawPark(ft: FleetTrip, actorId: string): Promise<string | null> {
  const at = nowIso();
  const { error } = await supabase.from("trips").update({ park_requested_at: null, park_requested_by: null, client_updated_at: at }).eq("trip_id", ft.trip.trip_id);
  if (error) return error.message;
  await logEvent(ft.trip.trip_id, actorId, "park_withdrawn", {});
  void notifyDriver(ft.trip.trip_id, "Dispatch said don't park. Carry on with the trip.");
  return null;
}

/** Dispatch parks the load on the driver's behalf. */
export async function parkByDispatch(ft: FleetTrip, actorId: string): Promise<string | null> {
  const at = nowIso();
  // A stop arrived at but not begun goes back to not arrived, as when the driver parks.
  for (const d of ft.deliveries.filter((x) => x.status === "planned" && x.arrived_at && !x.begin_at)) {
    await supabase.from("trip_deliveries").update({ arrived_at: null, delay_reason_id: null, delay_note: null, client_updated_at: at }).eq("delivery_id", d.delivery_id);
  }
  const { data, error } = await supabase.from("trips").update({
    status: "parked", parked_at: at, parked_by: actorId, parked_for: "layover", park_requested_at: null, park_requested_by: null, client_updated_at: at,
  }).eq("trip_id", ft.trip.trip_id).not("status", "in", "(complete,cancelled,parked)").select("trip_id");
  if (error) return error.message;
  if (!data?.length) return "That load can't be parked now.";
  await logEvent(ft.trip.trip_id, actorId, "parked", { by: "dispatch" });
  void notifyDriver(ft.trip.trip_id, "Dispatch parked your load.");
  return null;
}

// ── The full edit (the driver's Begin Trip card, used by dispatch) ───────────

type Rows = { trip: Record<string, any>; orders: Record<string, any>[]; pickups: Record<string, any>[]; deliveries: Record<string, any>[]; events: Record<string, any>[] };

async function write(table: string, key: string, rows: Record<string, any>[], known: Set<string>) {
  const at = nowIso();
  for (const r of rows) {
    const row = { ...r, client_updated_at: at };
    const res = known.has(String(r[key]))
      ? await supabase.from(table).update(row).eq(key, r[key])
      : await supabase.from(table).insert(row);
    if (res.error) return res.error.message;
  }
  return null;
}

/** Writes the rows buildStartLoad produced for an existing trip. */
export async function saveTripEdit(ft: FleetTrip, orderIds: string[], rows: Rows, supplierId: string | null | undefined, actorId: string): Promise<string | null> {
  const at = nowIso();
  const t = await supabase.from("trips").update({ ...rows.trip, client_updated_at: at }).eq("trip_id", ft.trip.trip_id);
  if (t.error) return t.error.message;
  const known = (ids: string[]) => new Set(ids);
  for (const [table, key, list, ids] of [
    ["trip_orders", "order_id", rows.orders, orderIds],
    ["trip_pickups", "pickup_id", rows.pickups, ft.pickups.map((p) => p.pickup_id)],
    ["trip_deliveries", "delivery_id", rows.deliveries, ft.deliveries.map((d) => d.delivery_id)],
  ] as const) {
    const err = await write(table, key, list, known(ids));
    if (err) return err;
  }
  if (supplierId !== undefined) {
    const pk = rows.pickups[0]?.pickup_id;
    if (pk) await supabase.from("trip_pickups").update({ supplier_id: supplierId, client_updated_at: at }).eq("pickup_id", pk);
  }
  if (rows.events.length) await supabase.from("trip_events").insert(rows.events);
  await logEvent(ft.trip.trip_id, actorId, "dispatch_edit", { change: "trip_edited" });
  void notifyDriver(ft.trip.trip_id, "Dispatch updated your trip. Open the dashboard to see the changes.");
  return null;
}
