// lib/trips/tripLogic.ts
//
// Trip workflow rules on top of the offline store (docs/trip-workflow-design.md
// §9, phase 2): what the driver's open trip is, what the next step is, what
// Start Load writes, and how a Planner load attaches to the trip.
//
// Pure: takes a store-like object (put/list) and never touches React or
// Supabase, so it runs under node's test runner.

import type { TripStore } from "./tripStore.ts";
import type {
  DeliveryType,
  TripDeliveryRow,
  TripEventRow,
  TripOrderRow,
  TripPickupRow,
  TripRow,
} from "./types.ts";

export type TripStoreLike = Pick<TripStore, "put" | "list">;

// Statuses that count as "the driver's current trip".
export const OPEN_STATUSES = new Set<TripRow["status"]>(["draft", "loading", "in_transit", "delivering"]);

function tripTime(t: TripRow): string {
  return t.started_at ?? t.client_updated_at ?? "";
}

// The driver's current trip, or null. If a driver somehow has two open trips
// (two phones offline), the newest wins.
export function openTripForDriver(trips: TripRow[], userId: string): TripRow | null {
  const open = trips.filter((t) => t.driver_id === userId && OPEN_STATUSES.has(t.status));
  open.sort((a, b) => tripTime(b).localeCompare(tripTime(a)));
  return open[0] ?? null;
}

// The truck's last ending miles: beginning miles for its next trip (§6).
// Per truck, not per driver or combo.
export function truckBeginMiles(trips: TripRow[], truckId: string | null | undefined): number | null {
  if (!truckId) return null;
  const done = trips.filter((t) => t.truck_id === truckId && t.end_miles != null && t.completed_at);
  done.sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
  const m = done[0]?.end_miles;
  return m == null ? null : Number(m);
}

// Shipper/customer prefill: the driver's most recent trip that has them.
export function lastShipperCustomer(trips: TripRow[], userId: string): { shipper: string | null; customer: string | null } {
  const mine = trips
    .filter((t) => t.driver_id === userId && t.status !== "cancelled" && (t.shipper || t.customer))
    .sort((a, b) => tripTime(b).localeCompare(tripTime(a)));
  return { shipper: mine[0]?.shipper ?? null, customer: mine[0]?.customer ?? null };
}

// ── Next step ────────────────────────────────────────────────────────────────

export type TripStep =
  | { kind: "start"; label: string }
  | { kind: "planner"; label: string; detail: string }
  | { kind: "later"; label: string; detail: string };

// The dashboard's one big button. Phase 2 covers Start Load and handing the
// driver to the Planner to load; Arrived / Loaded / Finish Delivery come with
// phases 3 and 5.
export function nextStep(trip: TripRow | null, pickup: TripPickupRow | null): TripStep {
  if (!trip) return { kind: "start", label: "Start Load" };
  const where = pickup?.name ? ` at ${pickup.name}` : "";
  switch (trip.status) {
    case "draft":
      return { kind: "planner", label: "Go to Planner", detail: `Load${where}` };
    case "loading":
      return { kind: "planner", label: "Back to Load", detail: `Loading${where}` };
    case "in_transit":
      return { kind: "later", label: "In Transit", detail: "Delivery steps are coming next" };
    case "delivering":
      return { kind: "later", label: "Delivering", detail: "Delivery steps are coming next" };
    default:
      return { kind: "start", label: "Start Load" };
  }
}

// ── Start Load ───────────────────────────────────────────────────────────────

export type StartLoadPickup = {
  terminalId: string | null;
  rackId: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
};

export type StartLoadDelivery = {
  locationId: string | null;
  oneOffName: string | null;
  deliveryType: DeliveryType;
};

export type StartLoadInput = {
  companyId: string;
  userId: string;
  truckId: string | null;
  trailerId: string | null;
  orderNumber: string;
  extraOrderNumbers: string[];
  shipper: string;
  customer: string;
  pickup: StartLoadPickup;
  deliveries: StartLoadDelivery[];
  beginMiles: number | null;
};

export type StartLoadRows = {
  trip: Partial<TripRow> & { trip_id: string };
  orders: (Partial<TripOrderRow> & { order_id: string })[];
  pickups: (Partial<TripPickupRow> & { pickup_id: string })[];
  deliveries: (Partial<TripDeliveryRow> & { delivery_id: string })[];
  events: TripEventRow[];
};

export type ExistingTrip = {
  trip: TripRow;
  orders: TripOrderRow[];
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
};

const blank = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

const deliveryIsEmpty = (d: StartLoadDelivery) => !d.locationId && !blank(d.oneOffName);

// Rows Start Load writes. With `existing`, edits that trip in place: same ids,
// and anything the driver removed is cancelled or blanked rather than
// deleted (the offline store syncs upserts only).
export function buildStartLoad(
  input: StartLoadInput,
  opts: { now: Date; newId: () => string; existing?: ExistingTrip | null },
): StartLoadRows {
  const nowIso = opts.now.toISOString();
  const ex = opts.existing ?? null;
  const tripId = ex?.trip.trip_id ?? opts.newId();

  const trip: StartLoadRows["trip"] = {
    trip_id: tripId,
    company_id: input.companyId,
    truck_id: input.truckId,
    trailer_id: input.trailerId,
    shipper: blank(input.shipper),
    customer: blank(input.customer),
    begin_miles: input.beginMiles,
  };
  if (!ex) {
    Object.assign(trip, {
      driver_id: input.userId,
      created_by: input.userId,
      status: "draft",
      entered_late: false,
      started_at: nowIso,
    });
  }

  // Orders: the primary order keeps its id; extras reuse ids in order, and
  // leftover old extras are blanked.
  const oldPrimary = ex?.orders.find((o) => o.is_primary) ?? null;
  const oldExtras = (ex?.orders ?? []).filter((o) => !o.is_primary);
  const extras = input.extraOrderNumbers.map(blank).filter((s): s is string => !!s);
  const orders: StartLoadRows["orders"] = [
    { order_id: oldPrimary?.order_id ?? opts.newId(), trip_id: tripId, order_number: blank(input.orderNumber), is_primary: true },
    ...extras.map((n, i) => ({
      order_id: oldExtras[i]?.order_id ?? opts.newId(),
      trip_id: tripId,
      order_number: n,
      is_primary: false,
    })),
    ...oldExtras.slice(extras.length).map((o) => ({ order_id: o.order_id, trip_id: tripId, order_number: null, is_primary: false })),
  ];

  // Pickup: the first one. A pickup already tied to a load keeps its own
  // terminal (the Planner owns it from there).
  const oldPickup = [...(ex?.pickups ?? [])].sort((a, b) => a.seq - b.seq)[0] ?? null;
  const pickups: StartLoadRows["pickups"] = [
    oldPickup?.load_id
      ? { pickup_id: oldPickup.pickup_id, trip_id: tripId }
      : {
          pickup_id: oldPickup?.pickup_id ?? opts.newId(),
          trip_id: tripId,
          seq: oldPickup?.seq ?? 1,
          pickup_type: "terminal",
          terminal_id: input.pickup.terminalId,
          rack_id: input.pickup.rackId,
          name: blank(input.pickup.name),
          city: blank(input.pickup.city),
          state: blank(input.pickup.state),
        },
  ];

  // Deliveries: by position, reusing old ids; removed ones are cancelled.
  const oldDeliveries = (ex?.deliveries ?? []).filter((d) => d.status !== "cancelled").sort((a, b) => a.seq - b.seq);
  const wanted = input.deliveries.filter((d) => !deliveryIsEmpty(d));
  const deliveries: StartLoadRows["deliveries"] = [
    ...wanted.map((d, i) => ({
      delivery_id: oldDeliveries[i]?.delivery_id ?? opts.newId(),
      trip_id: tripId,
      seq: i + 1,
      location_id: d.locationId,
      one_off_name: d.locationId ? null : blank(d.oneOffName),
      delivery_type: d.deliveryType,
      status: "planned" as const,
    })),
    ...oldDeliveries.slice(wanted.length).map((d) => ({
      delivery_id: d.delivery_id,
      trip_id: tripId,
      status: "cancelled" as const,
    })),
  ];

  const events: TripEventRow[] = ex
    ? []
    : [{
        event_id: opts.newId(),
        trip_id: tripId,
        event_type: "trip_started",
        occurred_at: nowIso,
        actor_id: input.userId,
        pickup_id: pickups[0].pickup_id,
        delivery_id: null,
        payload: {},
      }];

  return { trip, orders, pickups, deliveries, events };
}

// Write Start Load's rows, parents first.
export function applyStartLoad(store: TripStoreLike, rows: StartLoadRows) {
  store.put("trips", rows.trip);
  for (const o of rows.orders) store.put("trip_orders", o);
  for (const p of rows.pickups) store.put("trip_pickups", p);
  for (const d of rows.deliveries) store.put("trip_deliveries", d);
  for (const e of rows.events) store.put("trip_events", e);
}

export function tripChildren(store: TripStoreLike, tripId: string) {
  const orders = store.list("trip_orders", (o) => o.trip_id === tripId);
  const pickups = store.list("trip_pickups", (p) => p.trip_id === tripId).sort((a, b) => a.seq - b.seq);
  const deliveries = store
    .list("trip_deliveries", (d) => d.trip_id === tripId && d.status !== "cancelled")
    .sort((a, b) => a.seq - b.seq);
  return {
    primaryOrder: orders.find((o) => o.is_primary) ?? null,
    extraOrders: orders.filter((o) => !o.is_primary && !!o.order_number),
    orders,
    pickups,
    pickup: pickups[0] ?? null,
    deliveries,
  };
}

function event(
  store: TripStoreLike,
  newId: () => string,
  e: Omit<TripEventRow, "event_id" | "delivery_id" | "payload"> & { payload?: Record<string, unknown> },
) {
  store.put("trip_events", { event_id: newId(), delivery_id: null, payload: {}, ...e });
}

export function cancelTrip(store: TripStoreLike, trip: TripRow, userId: string, opts: { now: Date; newId: () => string }) {
  store.put("trips", { trip_id: trip.trip_id, status: "cancelled" });
  event(store, opts.newId, {
    trip_id: trip.trip_id, event_type: "trip_cancelled", occurred_at: opts.now.toISOString(),
    actor_id: userId, pickup_id: null,
  });
}

// ── Planner wiring ───────────────────────────────────────────────────────────

export type LoadPickupInfo = {
  terminalId: string | null;
  rackId: string | null;
  name?: string | null;
  city?: string | null;
  state?: string | null;
};

// A load begun in the Planner attaches to the driver's open trip: the first
// pickup without a load takes it, and the trip moves to "loading". No open
// trip → nothing happens (the Planner works exactly as before).
export function linkLoadToOpenTrip(
  store: TripStoreLike,
  args: { userId: string; loadId: string; pickup: LoadPickupInfo; now: Date; newId: () => string },
): boolean {
  const trip = openTripForDriver(store.list("trips"), args.userId);
  if (!trip || (trip.status !== "draft" && trip.status !== "loading")) return false;
  const pickups = store.list("trip_pickups", (p) => p.trip_id === trip.trip_id).sort((a, b) => a.seq - b.seq);
  if (pickups.some((p) => p.load_id === args.loadId)) return true;
  const target = pickups.find((p) => !p.load_id);
  if (!target) return false;
  store.put("trip_pickups", { pickup_id: target.pickup_id, load_id: args.loadId, ...pickupFields(args.pickup) });
  store.put("trips", { trip_id: trip.trip_id, status: "loading" });
  event(store, args.newId, {
    trip_id: trip.trip_id, event_type: "load_begun", occurred_at: args.now.toISOString(),
    actor_id: args.userId, pickup_id: target.pickup_id, payload: { load_id: args.loadId },
  });
  return true;
}

// The Planner load was cancelled: detach it, and the trip goes back to not
// started (design §9: "Didn't Load" returns the trip, never deletes it).
export function unlinkCancelledLoad(
  store: TripStoreLike,
  args: { userId: string; loadId: string; now: Date; newId: () => string },
): boolean {
  const pickup = store.list("trip_pickups", (p) => p.load_id === args.loadId)[0];
  if (!pickup) return false;
  store.put("trip_pickups", { pickup_id: pickup.pickup_id, load_id: null });
  const trip = store.list("trips", (t) => t.trip_id === pickup.trip_id)[0];
  const stillLoading = store.list("trip_pickups", (p) => p.trip_id === pickup.trip_id && !!p.load_id && p.pickup_id !== pickup.pickup_id).length > 0;
  if (trip && trip.status === "loading" && !stillLoading) {
    store.put("trips", { trip_id: trip.trip_id, status: "draft" });
  }
  event(store, args.newId, {
    trip_id: pickup.trip_id, event_type: "load_cancelled", occurred_at: args.now.toISOString(),
    actor_id: args.userId, pickup_id: pickup.pickup_id, payload: { load_id: args.loadId },
  });
  return true;
}

// Mid-load terminal switch: the pickup follows the load (design §2).
export function retagLoadPickup(store: TripStoreLike, loadId: string, pickup: LoadPickupInfo): boolean {
  const p = store.list("trip_pickups", (r) => r.load_id === loadId)[0];
  if (!p) return false;
  store.put("trip_pickups", { pickup_id: p.pickup_id, ...pickupFields(pickup) });
  return true;
}

function pickupFields(p: LoadPickupInfo): Partial<TripPickupRow> {
  const out: Partial<TripPickupRow> = { terminal_id: p.terminalId, rack_id: p.rackId };
  if (p.name !== undefined) out.name = blank(p.name);
  if (p.city !== undefined) out.city = blank(p.city);
  if (p.state !== undefined) out.state = blank(p.state);
  return out;
}
