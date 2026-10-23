// lib/trips/tripFlow.ts
//
// Trip workflow phases 3, 5 and 6 (docs/trip-workflow-design.md §5, §6, §9,
// §10): pickup and delivery steps, times and delays, compartment readiness,
// and the deviations (split, rack hop, reroute, handoff).
//
// Pure, like tripLogic.ts: everything goes through a store-like object, so it
// runs under node's test runner.

import { calculateNetGallons, type NetMethod } from "./netGallons.ts";
import { OPEN_STATUSES, type TripStoreLike } from "./tripLogic.ts";
import type {
  DeliveryType,
  ParkFor,
  ReadinessStatus,
  TripCompartmentLoadRow,
  TripDeliveryRow,
  TripEventRow,
  TripPickupRow,
  TripRow,
} from "./types.ts";
import { readPlannedMeta } from "../dispatch/compPlan.ts";
import { splitDelayChoice } from "./terminalIssues.ts";
import { DELIVERY_DETAILS_EVENT, detailsPayload, hasDetails, type DeliveryDetails } from "./deliveryDetails.ts";

type Clock = { now: Date; newId: () => string };

function logEvent(
  store: TripStoreLike,
  newId: () => string,
  e: Pick<TripEventRow, "trip_id" | "event_type" | "occurred_at" | "actor_id"> &
    Partial<Pick<TripEventRow, "pickup_id" | "delivery_id" | "payload">>,
) {
  store.put("trip_events", { event_id: newId(), pickup_id: null, delivery_id: null, payload: {}, ...e });
}

const MIN = 60_000;

// ── Reading the trip ─────────────────────────────────────────────────────────

export type TripSnapshot = {
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[]; // every status
  compLoads: TripCompartmentLoadRow[];
};

export function tripSnapshot(store: TripStoreLike, tripId: string): TripSnapshot {
  return {
    pickups: store.list("trip_pickups", (p) => p.trip_id === tripId).sort((a, b) => a.seq - b.seq),
    deliveries: store.list("trip_deliveries", (d) => d.trip_id === tripId).sort((a, b) => a.seq - b.seq),
    compLoads: store
      .list("trip_compartment_loads", (c) => c.trip_id === tripId)
      .sort((a, b) => a.comp_number - b.comp_number),
  };
}

// The pickup the driver is working on: the first one not yet left.
export function activePickup(pickups: TripPickupRow[]): TripPickupRow | null {
  return [...pickups].sort((a, b) => a.seq - b.seq).find((p) => !p.left_at) ?? null;
}

export function plannedDeliveries(deliveries: TripDeliveryRow[]): TripDeliveryRow[] {
  return deliveries.filter((d) => d.status === "planned").sort((a, b) => a.seq - b.seq);
}

// Compartment loads still on the trailer.
export function onBoard(compLoads: TripCompartmentLoadRow[]): TripCompartmentLoadRow[] {
  return compLoads.filter((c) => c.disposition === "loaded");
}

// ── Next step ────────────────────────────────────────────────────────────────

export type TripStep =
  | { kind: "start"; label: string }
  | { kind: "arrive_pickup"; label: string; detail: string; pickup: TripPickupRow }
  | { kind: "planner"; label: string; detail: string }
  | { kind: "loaded"; label: string; detail: string; pickup: TripPickupRow }
  | { kind: "next_rack"; label: string; detail: string }
  | { kind: "add_delivery"; label: string; detail: string }
  | { kind: "arrive_delivery"; label: string; detail: string; delivery: TripDeliveryRow }
  | { kind: "finish_delivery"; label: string; detail: string; delivery: TripDeliveryRow };

// The dashboard's one big button: Begin Trip → Arrived → Loaded → Arrived →
// Finish Delivery. `deliveryName` names a delivery for the detail line.
export function nextStep(
  trip: TripRow | null,
  snap: TripSnapshot | null,
  deliveryName: (d: TripDeliveryRow) => string = (d) => d.one_off_name ?? "the delivery",
): TripStep {
  if (!trip || !OPEN_STATUSES.has(trip.status)) return { kind: "start", label: "Begin Trip" };
  const s = snap ?? { pickups: [], deliveries: [], compLoads: [] };
  const p = activePickup(s.pickups);
  if (p) {
    const where = p.name ? ` at ${p.name}` : "";
    const logged = s.compLoads.some((c) => c.pickup_id === p.pickup_id && c.disposition !== "cancelled");
    if (logged) return { kind: "loaded", label: "Loaded", detail: `Confirm BOL and times${where}`, pickup: p };
    if (!p.arrived_at && !p.load_id) {
      return { kind: "arrive_pickup", label: "Arrive", detail: `Tap when you arrive${where || " at the pickup"}`, pickup: p };
    }
    return {
      kind: "planner",
      label: p.load_id ? "Continue Trip" : "Begin Loading",
      detail: p.load_id ? `Loading${where}` : `Review the plan and start${where}`,
    };
  }
  // Every rack so far ended without a load (rack hop): pick the next one.
  const nothingLoaded = !s.compLoads.some((c) => c.disposition === "loaded" || c.disposition === "delivered" || c.disposition === "retained");
  if (s.pickups.length > 0 && nothingLoaded && s.pickups.every((x) => x.left_at)) {
    const last = s.pickups[s.pickups.length - 1];
    return { kind: "next_rack", label: "Next Rack", detail: `Couldn't load${last.name ? ` at ${last.name}` : ""}. Pick the next terminal.` };
  }
  const next = plannedDeliveries(s.deliveries)[0];
  if (!next) return { kind: "add_delivery", label: "Add Delivery", detail: "Where is this load going?" };
  const name = deliveryName(next);
  if (!next.arrived_at) {
    return { kind: "arrive_delivery", label: "Arrive", detail: `Tap when arrived at ${name}`, delivery: next };
  }
  return { kind: "finish_delivery", label: "Finish Delivery", detail: name, delivery: next };
}

// ── Times and delays (§5) ────────────────────────────────────────────────────

export type StepTimes = { arrivedAt: string; beginAt: string; leftAt: string };

// Prefilled times when the driver finishes a step: begin = now − offset,
// leave = now. Begin never lands before arrival. `beganAt` is a begin time the
// driver already recorded (Start Loading in the Planner); when it's valid it
// wins over the offset.
export function defaultStepTimes(now: Date, offsetMinutes: number, arrivedAt: string | null, beganAt?: string | null, departedAt?: string | null): StepTimes {
  // When the truck's position showed it leaving, that beats the moment of the tap.
  const dep = departedAt ? Date.parse(departedAt) : NaN;
  const leave = Number.isFinite(dep) && dep <= now.getTime() ? dep : now.getTime();
  let begin = leave - Math.max(0, offsetMinutes) * MIN;
  const began = beganAt ? Date.parse(beganAt) : NaN;
  if (Number.isFinite(began) && began <= leave) begin = began;
  const arrived = arrivedAt ? Date.parse(arrivedAt) : NaN;
  if (Number.isFinite(arrived) && arrived > begin) begin = Math.min(arrived, leave);
  const iso = (t: number) => new Date(t).toISOString();
  return { arrivedAt: Number.isFinite(arrived) ? iso(arrived) : iso(begin), beginAt: iso(begin), leftAt: iso(leave) };
}

// Arrival → begin, whole minutes; null when either is missing.
export function delayMinutes(arrivedAt: string | null | undefined, beginAt: string | null | undefined): number | null {
  if (!arrivedAt || !beginAt) return null;
  const a = Date.parse(arrivedAt);
  const b = Date.parse(beginAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / MIN));
}

export function needsDelayReason(minutes: number | null, thresholdMinutes: number): boolean {
  return minutes != null && minutes > thresholdMinutes;
}

// Problems with a set of times, or null when they're fine.
export function timesProblem(t: StepTimes): string | null {
  const a = Date.parse(t.arrivedAt), b = Date.parse(t.beginAt), l = Date.parse(t.leftAt);
  if (![a, b, l].every(Number.isFinite)) return "Enter all three times.";
  if (b < a) return "Begin can't be before Arrive.";
  if (l < b) return "Depart can't be before Begin.";
  return null;
}

// ── Miles (§6) ───────────────────────────────────────────────────────────────

// Odometer is asked only when a pickup is in a different city from the
// previous pickup (a cross-city rack hop).
export function pickupNeedsOdometer(pickups: TripPickupRow[], pickupId: string): boolean {
  const sorted = [...pickups].sort((a, b) => a.seq - b.seq);
  const i = sorted.findIndex((p) => p.pickup_id === pickupId);
  if (i <= 0) return false;
  const cur = sorted[i], prev = sorted[i - 1];
  const key = (p: TripPickupRow) =>
    p.city ? `${p.city.trim().toLowerCase()}|${(p.state ?? "").trim().toLowerCase()}` : null;
  const a = key(prev), b = key(cur);
  return !!a && !!b && a !== b;
}

// ── Readiness (§3) ───────────────────────────────────────────────────────────

function setReadiness(
  store: TripStoreLike,
  args: { trailerId: string | null; companyId: string; userId: string },
  comp: number,
  status: ReadinessStatus,
  extra: { last_product_id?: string | null; compartment_load_id?: string | null } = {},
) {
  if (!args.trailerId) return;
  store.put("compartment_readiness", {
    trailer_id: args.trailerId,
    comp_number: comp,
    company_id: args.companyId,
    status,
    updated_by: args.userId,
    ...extra,
  });
}

// An interior wash sets the chosen compartments (all when none given) to
// Cleaned & Purged.
export function markCompartmentsCleaned(
  store: TripStoreLike,
  args: { trailerId: string; companyId: string; userId: string; compNumbers: number[] },
) {
  for (const n of args.compNumbers) {
    setReadiness(store, args, n, "cleaned_and_purged", { compartment_load_id: null });
  }
}

// ── Pickup (phase 3) ─────────────────────────────────────────────────────────

export function arrivePickup(store: TripStoreLike, args: { userId: string; pickup: TripPickupRow } & Clock) {
  const at = args.now.toISOString();
  store.put("trip_pickups", { pickup_id: args.pickup.pickup_id, arrived_at: at });
  logEvent(store, args.newId, {
    trip_id: args.pickup.trip_id, event_type: "pickup_arrived", occurred_at: at,
    actor_id: args.userId, pickup_id: args.pickup.pickup_id,
  });
}

export type LoadedReading = {
  comp: number;
  productId: string | null;
  gallons: number;
  api: number | null;
  tempF: number | null;
  netMethod?: NetMethod;
};

// The Planner logged the load: one compartment load per filled compartment,
// on the pickup that load is attached to. Run again (Edit Load) it updates
// the same rows; a compartment that's no longer filled is cancelled.
export function recordLoadCompleted(
  store: TripStoreLike,
  args: { userId: string; loadId: string; readings: LoadedReading[] } & Clock,
): boolean {
  const pickup = store.list("trip_pickups", (p) => p.load_id === args.loadId)[0];
  if (!pickup) return false;
  const tripId = pickup.trip_id;
  const existing = store.list("trip_compartment_loads", (c) => c.pickup_id === pickup.pickup_id);
  const byComp = new Map(existing.map((c) => [c.comp_number, c]));
  const primary = store.list("trip_orders", (o) => o.trip_id === tripId && o.is_primary)[0] ?? null;
  const plannedMeta = readPlannedMeta(pickup.planned_comps);
  const filled = new Set<number>();

  for (const r of args.readings) {
    if (!(r.gallons > 0)) continue;
    filled.add(r.comp);
    const old = byComp.get(r.comp);
    const calc = calculateNetGallons(r.gallons, r.api, r.tempF, r.netMethod ?? "table6b");
    store.put("trip_compartment_loads", {
      compartment_load_id: old?.compartment_load_id ?? args.newId(),
      trip_id: tripId,
      pickup_id: pickup.pickup_id,
      order_id: old?.order_id ?? plannedMeta.get(r.comp)?.order_id ?? pickup.order_id ?? primary?.order_id ?? null,
      comp_number: r.comp,
      product_id: r.productId,
      gross_gallons: r.gallons,
      temp_f: r.tempF,
      api: r.api,
      net_calculated_gallons: calc,
      net_gallons: calc,
      disposition: "loaded",
      loading_driver_id: old?.loading_driver_id ?? args.userId,
      ...(old ? {} : { supplier: null, bol_number: null, delivery_id: null, tank_number: null }),
    });
  }
  for (const c of existing) {
    if (!filled.has(c.comp_number) && c.disposition === "loaded") {
      store.put("trip_compartment_loads", { compartment_load_id: c.compartment_load_id, disposition: "cancelled" });
    }
  }
  logEvent(store, args.newId, {
    trip_id: tripId, event_type: existing.length ? "load_edited" : "load_completed",
    occurred_at: args.now.toISOString(), actor_id: args.userId, pickup_id: pickup.pickup_id,
    payload: { load_id: args.loadId, compartments: [...filled].sort((a, b) => a - b) },
  });
  return true;
}

export type LoadedCompartmentEdit = {
  compartment_load_id: string;
  comp_number: number;
  product_id: string | null;
  order_id: string | null;
  bol_number: string | null;
  supplier: string | null;
  supplier_id?: string | null;
  gross_gallons: number | null;
  net_gallons: number | null;
  net_calculated_gallons: number | null;
  temp_f: number | null;
  api: number | null;
};

// "Loaded" on the dashboard: BOL, supplier, gallons, times, delay. Moves the
// compartments to Pre-Loaded and the trip on to transit (or back to loading
// when another pickup is still ahead).
export function confirmLoaded(
  store: TripStoreLike,
  args: {
    userId: string;
    companyId: string;
    trailerId: string | null;
    pickup: TripPickupRow;
    times: StepTimes;
    delayReasonId: string | null;
    delayNote: string | null;
    odometer: number | null;
    compartments: LoadedCompartmentEdit[];
    signed: boolean;
  } & Clock,
) {
  const p = args.pickup;
  // The delay picker can carry a shared terminal issue instead of a company
  // reason (lib/trips/terminalIssues.ts).
  const { delayReasonId, delayCode } = splitDelayChoice(args.delayReasonId);
  store.put("trip_pickups", {
    pickup_id: p.pickup_id,
    arrived_at: args.times.arrivedAt,
    begin_at: args.times.beginAt,
    left_at: args.times.leftAt,
    delay_reason_id: delayReasonId,
    delay_code: delayCode,
    delay_note: args.delayNote,
    odometer: args.odometer,
    outcome: "loaded",
  });
  for (const c of args.compartments) {
    store.put("trip_compartment_loads", {
      compartment_load_id: c.compartment_load_id,
      order_id: c.order_id,
      bol_number: c.bol_number,
      supplier: c.supplier,
      ...(c.supplier_id !== undefined ? { supplier_id: c.supplier_id } : {}),
      gross_gallons: c.gross_gallons,
      net_gallons: c.net_gallons,
      net_calculated_gallons: c.net_calculated_gallons,
      temp_f: c.temp_f,
      api: c.api,
    });
    setReadiness(store, args, c.comp_number, "preloaded", {
      last_product_id: c.product_id,
      compartment_load_id: c.compartment_load_id,
    });
  }
  const others = store.list("trip_pickups", (x) => x.trip_id === p.trip_id && x.pickup_id !== p.pickup_id && !x.left_at);
  // Confirming details after leaving (Finish Later) must not drag a trip that is already
  // delivering back to in transit.
  const cur = store.list("trips", (t) => t.trip_id === p.trip_id)[0]?.status;
  if (!cur || cur === "draft" || cur === "loading") {
    store.put("trips", { trip_id: p.trip_id, status: others.length ? "loading" : "in_transit" });
  }
  const at = args.now.toISOString();
  const bols = [...new Set(args.compartments.map((c) => c.bol_number).filter(Boolean))];
  logEvent(store, args.newId, {
    trip_id: p.trip_id, event_type: "loaded", occurred_at: at, actor_id: args.userId, pickup_id: p.pickup_id,
    payload: { bol_numbers: bols, compartments: args.compartments.map((c) => c.comp_number) },
  });
  if (args.signed) {
    logEvent(store, args.newId, {
      trip_id: p.trip_id, event_type: "signature_accepted", occurred_at: at, actor_id: args.userId,
      pickup_id: p.pickup_id, payload: { role: "loading_driver" },
    });
  }
}

// Edit Load from the Planner report: BOL, supplier and net only. Gross,
// temp and API were already rewritten by recordLoadCompleted; trip status
// and times stay as they are.
export function updateLoadedCompartments(
  store: TripStoreLike,
  compartments: { compartment_load_id: string; bol_number: string | null; supplier: string | null; supplier_id: string | null; net_gallons: number | null }[],
) {
  for (const c of compartments) {
    store.put("trip_compartment_loads", {
      compartment_load_id: c.compartment_load_id,
      bol_number: c.bol_number,
      supplier: c.supplier,
      supplier_id: c.supplier_id,
      net_gallons: c.net_gallons,
    });
  }
}

// Rack hop (§10): another pickup on the same trip. The Planner's next load
// attaches to it.
export function addPickup(
  store: TripStoreLike,
  args: {
    userId: string;
    tripId: string;
    terminalId: string | null;
    rackId: string | null;
    name: string | null;
    city: string | null;
    state: string | null;
    plannedComps?: { comp_number: number; product_id: string }[] | null;
    orderId?: string | null;
  } & Clock,
): string {
  const pickups = store.list("trip_pickups", (p) => p.trip_id === args.tripId);
  const seq = pickups.reduce((m, p) => Math.max(m, p.seq), 0) + 1;
  const pickupId = args.newId();
  store.put("trip_pickups", {
    pickup_id: pickupId, trip_id: args.tripId, seq, pickup_type: "terminal",
    terminal_id: args.terminalId, rack_id: args.rackId, name: args.name, city: args.city, state: args.state,
    load_id: null, arrived_at: null, begin_at: null, left_at: null,
    ...(args.plannedComps?.length ? { planned_comps: args.plannedComps } : {}),
    ...(args.orderId ? { order_id: args.orderId } : {}),
  });
  store.put("trips", { trip_id: args.tripId, status: "loading" });
  logEvent(store, args.newId, {
    trip_id: args.tripId, event_type: "pickup_added", occurred_at: args.now.toISOString(),
    actor_id: args.userId, pickup_id: pickupId,
    payload: { seq, ...(args.plannedComps?.length ? { planned_comps: args.plannedComps } : {}) },
  });
  return pickupId;
}

// An order number on this trip: an existing one with the same number is
// reused, otherwise a new (non-primary) order is added. Returns its id.
export function addTripOrder(
  store: TripStoreLike,
  args: { tripId: string; orderNumber: string; newId: () => string },
): string | null {
  const num = args.orderNumber.trim();
  if (!num) return null;
  const key = num.toUpperCase().replace(/\s+/g, "");
  const existing = store.list("trip_orders", (o) => o.trip_id === args.tripId)
    .find((o) => (o.order_number ?? "").toUpperCase().replace(/\s+/g, "") === key);
  if (existing) return existing.order_id;
  const orderId = args.newId();
  store.put("trip_orders", {
    order_id: orderId, trip_id: args.tripId, order_number: num,
    shipper: null, customer: null, is_primary: false,
  });
  return orderId;
}

// Which order a pickup loads under. Compartments already loaded there move
// with it, so the PTD shows the right order per compartment.
export function setPickupOrder(
  store: TripStoreLike,
  args: { userId: string; pickup: TripPickupRow; orderId: string | null } & Clock,
) {
  const p = args.pickup;
  store.put("trip_pickups", { pickup_id: p.pickup_id, order_id: args.orderId });
  const primary = store.list("trip_orders", (o) => o.trip_id === p.trip_id && o.is_primary)[0] ?? null;
  const target = args.orderId ?? primary?.order_id ?? null;
  for (const c of store.list("trip_compartment_loads", (c) => c.pickup_id === p.pickup_id && c.disposition !== "cancelled")) {
    store.put("trip_compartment_loads", { compartment_load_id: c.compartment_load_id, order_id: target });
  }
  logEvent(store, args.newId, {
    trip_id: p.trip_id, event_type: "pickup_order_set", occurred_at: args.now.toISOString(),
    actor_id: args.userId, pickup_id: p.pickup_id, payload: { order_id: target },
  });
}

// Couldn't load here (rack hop): the pickup ends with no load, with the
// terminal issue that stopped it and the times spent there. Any compartment
// already recorded against it is cancelled. The trip goes back to waiting
// for the next rack.
export function closePickupNoLoad(
  store: TripStoreLike,
  args: {
    userId: string;
    pickup: TripPickupRow;
    reason: string; // TerminalIssueCode or "other"
    note: string | null;
    arrivedAt: string | null;
    beginAt?: string | null; // Start Loading, if it was tapped before giving up
    leftAt: string;
  } & Clock,
) {
  const p = args.pickup;
  const arrived = args.arrivedAt ?? p.arrived_at ?? args.leftAt;
  store.put("trip_pickups", {
    pickup_id: p.pickup_id,
    arrived_at: arrived,
    begin_at: args.beginAt ?? p.begin_at ?? null,
    left_at: args.leftAt,
    load_id: null,
    outcome: "no_load",
    no_load_reason: args.reason,
    no_load_note: args.note,
  });
  for (const c of store.list("trip_compartment_loads", (x) => x.pickup_id === p.pickup_id && x.disposition === "loaded")) {
    store.put("trip_compartment_loads", { compartment_load_id: c.compartment_load_id, disposition: "cancelled" });
  }
  store.put("trips", { trip_id: p.trip_id, status: "loading" });
  logEvent(store, args.newId, {
    trip_id: p.trip_id, event_type: "pickup_no_load", occurred_at: args.now.toISOString(),
    actor_id: args.userId, pickup_id: p.pickup_id,
    payload: { reason: args.reason, note: args.note },
  });
}

// ── Delivery (phase 5) ───────────────────────────────────────────────────────

export function arriveDelivery(store: TripStoreLike, args: { userId: string; delivery: TripDeliveryRow } & Clock) {
  const at = args.now.toISOString();
  store.put("trip_deliveries", { delivery_id: args.delivery.delivery_id, arrived_at: at });
  store.put("trips", { trip_id: args.delivery.trip_id, status: "delivering" });
  logEvent(store, args.newId, {
    trip_id: args.delivery.trip_id, event_type: "delivery_arrived", occurred_at: at,
    actor_id: args.userId, delivery_id: args.delivery.delivery_id,
  });
}

export type DeliveryDestination = { locationId: string | null; oneOffName: string | null; deliveryType: DeliveryType };

// Split (§9): compartments that go somewhere else become a new delivery on
// the same trip.
export function splitToNewDelivery(
  store: TripStoreLike,
  args: { userId: string; tripId: string; compartmentLoadIds: string[]; to: DeliveryDestination; fromDeliveryId?: string | null } & Clock,
): string {
  const deliveries = store.list("trip_deliveries", (d) => d.trip_id === args.tripId);
  const seq = deliveries.reduce((m, d) => Math.max(m, d.seq), 0) + 1;
  const deliveryId = args.newId();
  store.put("trip_deliveries", {
    delivery_id: deliveryId, trip_id: args.tripId, seq,
    location_id: args.to.locationId, one_off_name: args.to.locationId ? null : args.to.oneOffName,
    delivery_type: args.to.deliveryType, status: "planned",
  });
  for (const id of args.compartmentLoadIds) {
    store.put("trip_compartment_loads", { compartment_load_id: id, delivery_id: deliveryId });
  }
  logEvent(store, args.newId, {
    trip_id: args.tripId, event_type: "delivery_split", occurred_at: args.now.toISOString(),
    actor_id: args.userId, delivery_id: deliveryId,
    payload: { from_delivery_id: args.fromDeliveryId ?? null, compartment_load_ids: args.compartmentLoadIds },
  });
  return deliveryId;
}

// Reroute (§10): a delivery's location can change until it's finished.
// Every change is logged.
export function rerouteDelivery(
  store: TripStoreLike,
  args: { userId: string; delivery: TripDeliveryRow; to: DeliveryDestination } & Clock,
): boolean {
  const d = args.delivery;
  if (d.status !== "planned") return false;
  const sameDest = (d.location_id ?? null) === args.to.locationId
    && (args.to.locationId ? true : (d.one_off_name ?? null) === (args.to.oneOffName ?? null));
  if (sameDest && d.delivery_type === args.to.deliveryType) return false;
  store.put("trip_deliveries", {
    delivery_id: d.delivery_id,
    location_id: args.to.locationId,
    one_off_name: args.to.locationId ? null : args.to.oneOffName,
    delivery_type: args.to.deliveryType,
  });
  logEvent(store, args.newId, {
    trip_id: d.trip_id, event_type: "delivery_rerouted", occurred_at: args.now.toISOString(),
    actor_id: args.userId, delivery_id: d.delivery_id,
    payload: {
      from: { location_id: d.location_id, one_off_name: d.one_off_name, delivery_type: d.delivery_type },
      to: { location_id: args.to.locationId, one_off_name: args.to.oneOffName, delivery_type: args.to.deliveryType },
    },
  });
  return true;
}

export type DeliveredCompartment = { compartment_load_id: string; comp_number: number; product_id: string | null; tank_number: string | null };
export type DeliveryTankReading = {
  tank_number: string;
  product_id: string | null;
  before_reading: number | null;
  after_reading: number | null;
  water_reading: number | null;
  reading_unit: "gallons" | "inches";
};

// Finish Delivery (§9): times, tanks, which compartments went where,
// signatures. When no planned delivery is left, the trip completes and any
// compartment still aboard becomes Retained.
export function finishDelivery(
  store: TripStoreLike,
  args: {
    userId: string;
    companyId: string;
    trailerId: string | null;
    delivery: TripDeliveryRow;
    times: StepTimes;
    delayReasonId: string | null;
    delayNote: string | null;
    // Time past the estimate (and grace) the driver said had no reason.
    unaccountedMin?: number | null;
    delivered: DeliveredCompartment[];
    tanks: DeliveryTankReading[];
    consigneeName: string | null;
    consigneeSignature: string | null;
    signed: boolean;
    endMiles: number | null;
    // Kept aboard for the next leg of this same trip (Retain on the delivery
    // screen). They come off this delivery and the trip stays open.
    retained?: DeliveredCompartment[];
    // Noted after the drop: bio blended per compartment, additives, issues,
    // the odometer at this stop.
    bioBlends?: { compartment_load_id: string; bio_blend: string | null }[];
    details?: DeliveryDetails;
  } & Clock,
): { tripComplete: boolean } {
  const d = args.delivery;
  const at = args.now.toISOString();
  store.put("trip_deliveries", {
    delivery_id: d.delivery_id,
    status: "complete",
    arrived_at: args.times.arrivedAt,
    begin_at: args.times.beginAt,
    left_at: args.times.leftAt,
    delay_reason_id: args.delayReasonId,
    delay_note: args.delayNote,
    unaccounted_delay_min: args.unaccountedMin ?? null,
    delivering_driver_id: args.userId,
    driver_signed_at: args.signed ? at : null,
    consignee_name: args.consigneeName,
    consignee_signature: args.consigneeSignature,
  });

  const oldTanks = new Map(
    store.list("trip_delivery_tanks", (t) => t.delivery_id === d.delivery_id).map((t) => [t.tank_number, t]),
  );
  for (const t of args.tanks) {
    const num = t.tank_number.trim();
    if (!num) continue;
    store.put("trip_delivery_tanks", {
      delivery_tank_id: oldTanks.get(num)?.delivery_tank_id ?? args.newId(),
      delivery_id: d.delivery_id,
      tank_number: num,
      product_id: t.product_id,
      before_reading: t.before_reading,
      after_reading: t.after_reading,
      water_reading: t.water_reading,
      reading_unit: t.reading_unit,
    });
  }

  for (const c of args.delivered) {
    store.put("trip_compartment_loads", {
      compartment_load_id: c.compartment_load_id,
      delivery_id: d.delivery_id,
      tank_number: c.tank_number,
      disposition: "delivered",
    });
    setReadiness(store, args, c.comp_number, "residue", {
      last_product_id: c.product_id,
      compartment_load_id: c.compartment_load_id,
    });
  }

  for (const b of args.bioBlends ?? []) {
    store.put("trip_compartment_loads", { compartment_load_id: b.compartment_load_id, bio_blend: b.bio_blend });
  }

  const remaining = store.list(
    "trip_deliveries",
    (x) => x.trip_id === d.trip_id && x.status === "planned" && x.delivery_id !== d.delivery_id,
  );
  const retained = args.retained ?? [];
  for (const c of retained) {
    store.put("trip_compartment_loads", { compartment_load_id: c.compartment_load_id, delivery_id: null, tank_number: null });
  }
  const tripComplete = remaining.length === 0 && retained.length === 0;
  if (tripComplete) {
    const deliveredIds = new Set(args.delivered.map((c) => c.compartment_load_id));
    const leftAboard = store.list(
      "trip_compartment_loads",
      (c) => c.trip_id === d.trip_id && c.disposition === "loaded" && !deliveredIds.has(c.compartment_load_id),
    );
    for (const c of leftAboard) {
      store.put("trip_compartment_loads", { compartment_load_id: c.compartment_load_id, disposition: "retained" });
      setReadiness(store, args, c.comp_number, "retained", {
        last_product_id: c.product_id,
        compartment_load_id: c.compartment_load_id,
      });
    }
    store.put("trips", { trip_id: d.trip_id, status: "complete", completed_at: at, end_miles: args.endMiles });
  } else {
    store.put("trips", { trip_id: d.trip_id, status: "in_transit" });
  }

  logEvent(store, args.newId, {
    trip_id: d.trip_id, event_type: "delivery_finished", occurred_at: at, actor_id: args.userId,
    delivery_id: d.delivery_id,
    payload: {
      compartments: args.delivered.map((c) => c.comp_number),
      retained: retained.map((c) => c.comp_number),
      trip_complete: tripComplete,
    },
  });
  if (args.details && hasDetails(args.details)) {
    logEvent(store, args.newId, {
      trip_id: d.trip_id, event_type: DELIVERY_DETAILS_EVENT, occurred_at: at, actor_id: args.userId,
      delivery_id: d.delivery_id, payload: detailsPayload(args.details),
    });
  }
  if (args.signed) {
    logEvent(store, args.newId, {
      trip_id: d.trip_id, event_type: "signature_accepted", occurred_at: at, actor_id: args.userId,
      delivery_id: d.delivery_id, payload: { role: "delivering_driver" },
    });
  }
  return { tripComplete };
}

// Delivery progress saved as the driver goes (Drop / Pump Off, tank readings),
// so leaving the screen or a refresh doesn't lose it. Finish Delivery writes
// the rest.
export function saveDeliveryProgress(
  store: TripStoreLike,
  args: {
    delivery: TripDeliveryRow;
    beginAt?: string;
    delayReasonId?: string | null;
    delayNote?: string | null;
    tanks?: DeliveryTankReading[];
    compTanks?: { compartment_load_id: string; tank_number: string | null }[];
    newId: () => string;
  },
) {
  const d = args.delivery;
  if (args.beginAt) {
    store.put("trip_deliveries", {
      delivery_id: d.delivery_id,
      begin_at: args.beginAt,
      delay_reason_id: args.delayReasonId ?? null,
      delay_note: args.delayNote ?? null,
    });
  }
  if (args.tanks) {
    const old = new Map(store.list("trip_delivery_tanks", (t) => t.delivery_id === d.delivery_id).map((t) => [t.tank_number, t]));
    for (const t of args.tanks) {
      const num = t.tank_number.trim();
      if (!num) continue;
      store.put("trip_delivery_tanks", {
        delivery_tank_id: old.get(num)?.delivery_tank_id ?? args.newId(),
        delivery_id: d.delivery_id,
        tank_number: num,
        product_id: t.product_id,
        before_reading: t.before_reading,
        after_reading: t.after_reading,
        water_reading: t.water_reading,
        reading_unit: t.reading_unit,
      });
    }
  }
  for (const c of args.compTanks ?? []) {
    store.put("trip_compartment_loads", { compartment_load_id: c.compartment_load_id, tank_number: c.tank_number });
  }
}

// Compartments this delivery should default to: aboard and assigned here, or
// not assigned to another planned delivery.
export function compartmentsForDelivery(
  compLoads: TripCompartmentLoadRow[],
  deliveries: TripDeliveryRow[],
  deliveryId: string,
): TripCompartmentLoadRow[] {
  const otherPlanned = new Set(
    deliveries.filter((d) => d.status === "planned" && d.delivery_id !== deliveryId).map((d) => d.delivery_id),
  );
  return onBoard(compLoads).filter((c) => c.delivery_id === deliveryId || !c.delivery_id || !otherPlanned.has(c.delivery_id));
}

// Compartment → tank prefill from the location's saved tanks: the tank that
// holds the same product, when exactly one does.
export function suggestTank(
  productId: string | null,
  tanks: { tank_number: string; product_id: string | null }[],
): string | null {
  if (!productId) return null;
  const matches = tanks.filter((t) => t.product_id === productId);
  return matches.length === 1 ? matches[0].tank_number : null;
}

// ── Handoff (§10) ────────────────────────────────────────────────────────────

// Another driver's open trip on this trailer, if any.
export function handoffCandidate(trips: TripRow[], trailerId: string | null, userId: string): TripRow | null {
  if (!trailerId) return null;
  const open = trips
    .filter((t) => t.trailer_id === trailerId && t.driver_id !== userId && OPEN_STATUSES.has(t.status))
    .sort((a, b) => String(b.started_at ?? "").localeCompare(String(a.started_at ?? "")));
  return open[0] ?? null;
}

export function takeOverTrip(
  store: TripStoreLike,
  args: { userId: string; trip: TripRow; truckId: string | null } & Clock,
) {
  store.put("trips", { trip_id: args.trip.trip_id, driver_id: args.userId, truck_id: args.truckId ?? args.trip.truck_id });
  logEvent(store, args.newId, {
    trip_id: args.trip.trip_id, event_type: "handoff", occurred_at: args.now.toISOString(), actor_id: args.userId,
    payload: { from_driver_id: args.trip.driver_id, to_driver_id: args.userId },
  });
}

// ── Park Preloaded ───────────────────────────────────────────────────────────
// A loaded trailer staged for a slip-seat driver, or for the same driver after
// a layover. The trip keeps its load and stops; whoever picks up the trailer
// resumes it (a different driver takes it over, same as a handoff).

export const PARK_EVENT = "parked";
export const RESUME_EVENT = "resumed";

export const PARK_FOR_LABEL: Record<ParkFor, string> = {
  slip_seat: "Slip seat driver",
  layover: "Me, after layover",
};

// Parking is offered whenever product is aboard and nothing is going in the
// ground: between stops, and at a delivery until Drop / Pump Off begins. After
// a partial drop (the rest retained), the trip is between stops again.
export function canPark(trip: TripRow | null, step: TripStep, hasLoadOnBoard: boolean): boolean {
  if (!trip || !OPEN_STATUSES.has(trip.status) || !hasLoadOnBoard) return false;
  if (step.kind === "finish_delivery") return !step.delivery.begin_at;
  return step.kind === "arrive_delivery" || step.kind === "add_delivery";
}

export function parkTrip(
  store: TripStoreLike,
  args: { trip: TripRow; userId: string; parkFor: ParkFor; where: string | null; region?: string | null; note: string | null; parkedAt: string } & Clock,
) {
  const where = args.where?.trim() || null;
  const note = args.note?.trim() || null;
  // A delivery arrived at but not begun goes back to planned-and-not-arrived,
  // with its tank picks cleared: the plan can still change, and whoever
  // resumes arrives fresh.
  const undone = store.list(
    "trip_deliveries",
    (d) => d.trip_id === args.trip.trip_id && d.status === "planned" && !!d.arrived_at && !d.begin_at,
  );
  for (const d of undone) {
    store.put("trip_deliveries", { delivery_id: d.delivery_id, arrived_at: null, delay_reason_id: null, delay_note: null });
  }
  if (undone.length) {
    const aboard = store.list(
      "trip_compartment_loads",
      (c) => c.trip_id === args.trip.trip_id && c.disposition === "loaded" && c.tank_number != null,
    );
    for (const c of aboard) store.put("trip_compartment_loads", { compartment_load_id: c.compartment_load_id, tank_number: null });
  }
  store.put("trips", {
    trip_id: args.trip.trip_id,
    status: "parked",
    parked_at: args.parkedAt,
    parked_by: args.userId,
    parked_for: args.parkFor,
    parked_where: where,
    parked_region: args.region?.trim() || null,
    parked_note: note,
  });
  logEvent(store, args.newId, {
    trip_id: args.trip.trip_id, event_type: PARK_EVENT, occurred_at: args.parkedAt, actor_id: args.userId,
    payload: {
      parked_for: args.parkFor, where, region: args.region?.trim() || null, note, from_status: args.trip.status,
      reset_deliveries: undone.map((d) => d.delivery_id),
    },
  });
}

// The parked trip on this trailer, if any (anyone's, including the driver's own).
export function parkedTripOnTrailer(trips: TripRow[], trailerId: string | null): TripRow | null {
  if (!trailerId) return null;
  const parked = trips
    .filter((t) => t.trailer_id === trailerId && t.status === "parked")
    .sort((a, b) => String(b.parked_at ?? "").localeCompare(String(a.parked_at ?? "")));
  return parked[0] ?? null;
}

// Resume a parked trip. A different driver takes it over (logged as a handoff
// too); the truck becomes whatever truck is pulling the trailer now.
export function resumeTrip(
  store: TripStoreLike,
  args: { trip: TripRow; userId: string; truckId: string | null } & Clock,
) {
  const at = args.now.toISOString();
  store.put("trips", {
    trip_id: args.trip.trip_id,
    status: "in_transit",
    driver_id: args.userId,
    truck_id: args.truckId ?? args.trip.truck_id,
    parked_at: null,
    parked_by: null,
    parked_for: null,
    parked_where: null,
    parked_region: null,
    parked_note: null,
  });
  logEvent(store, args.newId, {
    trip_id: args.trip.trip_id, event_type: RESUME_EVENT, occurred_at: at, actor_id: args.userId,
    payload: { parked_at: args.trip.parked_at ?? null, parked_by: args.trip.parked_by ?? null },
  });
  if (args.trip.driver_id !== args.userId) {
    logEvent(store, args.newId, {
      trip_id: args.trip.trip_id, event_type: "handoff", occurred_at: at, actor_id: args.userId,
      payload: { from_driver_id: args.trip.driver_id, to_driver_id: args.userId },
    });
  }
}

export type ParkRecord = { parkedAt: string; resumedAt: string | null; parkFor: ParkFor | null; where: string | null; note: string | null };

// Every park on a trip, paired with the resume that followed it (for the PTD).
export function parkRecords(events: TripEventRow[]): ParkRecord[] {
  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const out: ParkRecord[] = [];
  for (const e of sorted) {
    if (e.event_type === PARK_EVENT) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      out.push({
        parkedAt: e.occurred_at,
        resumedAt: null,
        parkFor: (p.parked_for as ParkFor) ?? null,
        where: (p.where as string) ?? null,
        note: (p.note as string) ?? null,
      });
    } else if (e.event_type === RESUME_EVENT) {
      const open = [...out].reverse().find((r) => !r.resumedAt);
      if (open) open.resumedAt = e.occurred_at;
    }
  }
  return out;
}

// ── Cancel a load ────────────────────────────────────────────────────────────
//
// The driver gives up on an open trip with nothing on board (e.g. no
// allocation and out of hours, so back to the yard empty). Reasons compound
// and are kept in the order picked. A rack the driver was still at is closed
// as a no-load at the cancel time, so the PTD keeps the time spent there.
// Product on board can't be cancelled: park it or deliver it.

export function canCancelLoad(trip: TripRow | null, hasLoadOnBoard: boolean): boolean {
  return !!trip && OPEN_STATUSES.has(trip.status) && !hasLoadOnBoard;
}

export function cancelLoad(
  store: TripStoreLike,
  args: {
    trip: TripRow;
    userId: string;
    reasons: string[];
    note: string | null;
    returnedTo: string | null;
    endMiles: number | null;
    cancelledAt: string;
    rackReason: string; // a TerminalIssueCode or "other", for an unfinished rack
  } & Clock,
) {
  const t = args.trip;
  for (const p of store.list("trip_pickups", (x) => x.trip_id === t.trip_id && !x.outcome && !!x.arrived_at && !x.left_at)) {
    store.put("trip_pickups", {
      pickup_id: p.pickup_id,
      left_at: args.cancelledAt,
      load_id: null,
      outcome: "no_load",
      no_load_reason: args.rackReason,
      no_load_note: args.note,
    });
  }
  for (const d of store.list("trip_deliveries", (x) => x.trip_id === t.trip_id && x.status === "planned")) {
    store.put("trip_deliveries", { delivery_id: d.delivery_id, status: "cancelled" });
  }
  store.put("trips", {
    trip_id: t.trip_id,
    status: "cancelled",
    cancel_reasons: args.reasons,
    cancel_note: args.note?.trim() || null,
    cancel_returned_to: args.returnedTo?.trim() || null,
    cancelled_at: args.cancelledAt,
    cancelled_by: args.userId,
    end_miles: args.endMiles ?? t.end_miles,
  });
  logEvent(store, args.newId, {
    trip_id: t.trip_id, event_type: "trip_cancelled", occurred_at: args.cancelledAt, actor_id: args.userId,
    payload: { reasons: args.reasons, note: args.note?.trim() || null, returned_to: args.returnedTo?.trim() || null },
  });
}

// Hide (or show again) a cancelled trip in the driver's own Trips list.
// Managers still see it.
export function setTripHidden(store: TripStoreLike, tripId: string, hidden: boolean) {
  store.put("trips", { trip_id: tripId, driver_hidden: hidden });
}

// ── Undo an accidental Arrive ────────────────────────────────────────────────

export type UndoableArrival =
  | { kind: "pickup"; pickup: TripPickupRow }
  | { kind: "delivery"; delivery: TripDeliveryRow };

/** The stop the driver arrived at but hasn't started anything at yet, so the
 * Arrive tap can still be taken back. Null once loading has begun, a load is
 * attached, the stop is closed, or a delivery has begun. */
export function undoableArrival(snap: TripSnapshot): UndoableArrival | null {
  const pk = snap.pickups.find((p) => p.arrived_at && !p.begin_at && !p.load_id && !p.left_at && !p.outcome);
  if (pk) return { kind: "pickup", pickup: pk };
  const dl = snap.deliveries.find((d) => d.arrived_at && !d.begin_at && !d.left_at && d.status !== "complete" && d.status !== "cancelled");
  if (dl) return { kind: "delivery", delivery: dl };
  return null;
}

/** Take back an Arrive tap at a pickup. The time and any delay reason go; the
 * trip logs that it happened. */
export function undoArrivePickup(store: TripStoreLike, args: { userId: string; pickup: TripPickupRow } & Clock) {
  store.put("trip_pickups", { pickup_id: args.pickup.pickup_id, arrived_at: null, delay_reason_id: null, delay_note: null });
  logEvent(store, args.newId, {
    trip_id: args.pickup.trip_id, event_type: "pickup_arrival_undone", occurred_at: args.now.toISOString(),
    actor_id: args.userId, pickup_id: args.pickup.pickup_id, payload: { was: args.pickup.arrived_at },
  });
}

/** Take back an Arrive tap at a delivery; the trip goes back to in transit. */
export function undoArriveDelivery(store: TripStoreLike, args: { userId: string; delivery: TripDeliveryRow } & Clock) {
  store.put("trip_deliveries", { delivery_id: args.delivery.delivery_id, arrived_at: null, delay_reason_id: null, delay_note: null });
  store.put("trips", { trip_id: args.delivery.trip_id, status: "in_transit" });
  logEvent(store, args.newId, {
    trip_id: args.delivery.trip_id, event_type: "delivery_arrival_undone", occurred_at: args.now.toISOString(),
    actor_id: args.userId, delivery_id: args.delivery.delivery_id, payload: { was: args.delivery.arrived_at },
  });
}
