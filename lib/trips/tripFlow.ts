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
  ReadinessStatus,
  TripCompartmentLoadRow,
  TripDeliveryRow,
  TripEventRow,
  TripPickupRow,
  TripRow,
} from "./types.ts";
import { splitDelayChoice } from "./terminalIssues.ts";

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

// The dashboard's one big button: Start Load → Arrived → Loaded → Arrived →
// Finish Delivery. `deliveryName` names a delivery for the detail line.
export function nextStep(
  trip: TripRow | null,
  snap: TripSnapshot | null,
  deliveryName: (d: TripDeliveryRow) => string = (d) => d.one_off_name ?? "the delivery",
): TripStep {
  if (!trip || !OPEN_STATUSES.has(trip.status)) return { kind: "start", label: "Start Load" };
  const s = snap ?? { pickups: [], deliveries: [], compLoads: [] };
  const p = activePickup(s.pickups);
  if (p) {
    const where = p.name ? ` at ${p.name}` : "";
    const logged = s.compLoads.some((c) => c.pickup_id === p.pickup_id && c.disposition !== "cancelled");
    if (logged) return { kind: "loaded", label: "Loaded", detail: `Confirm BOL and times${where}`, pickup: p };
    if (!p.arrived_at && !p.load_id) {
      return { kind: "arrive_pickup", label: "Arrived", detail: `Tap when you get${where || " to the pickup"}`, pickup: p };
    }
    return {
      kind: "planner",
      label: "Continue Trip",
      detail: p.load_id ? `Loading${where}` : `Plan and load${where}`,
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
    return { kind: "arrive_delivery", label: "Arrived", detail: `Tap at ${name}, while still parked`, delivery: next };
  }
  return { kind: "finish_delivery", label: "Finish Delivery", detail: name, delivery: next };
}

// ── Times and delays (§5) ────────────────────────────────────────────────────

export type StepTimes = { arrivedAt: string; beginAt: string; leftAt: string };

// Prefilled times when the driver finishes a step: begin = now − offset,
// leave = now. Begin never lands before arrival. `beganAt` is a begin time the
// driver already recorded (Start Loading in the Planner); when it's valid it
// wins over the offset.
export function defaultStepTimes(now: Date, offsetMinutes: number, arrivedAt: string | null, beganAt?: string | null): StepTimes {
  const leave = now.getTime();
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
  if (b < a) return "Begin can't be before arrival.";
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
      order_id: old?.order_id ?? primary?.order_id ?? null,
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
  store.put("trips", { trip_id: p.trip_id, status: others.length ? "loading" : "in_transit" });
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
  } & Clock,
): string {
  const pickups = store.list("trip_pickups", (p) => p.trip_id === args.tripId);
  const seq = pickups.reduce((m, p) => Math.max(m, p.seq), 0) + 1;
  const pickupId = args.newId();
  store.put("trip_pickups", {
    pickup_id: pickupId, trip_id: args.tripId, seq, pickup_type: "terminal",
    terminal_id: args.terminalId, rack_id: args.rackId, name: args.name, city: args.city, state: args.state,
    load_id: null, arrived_at: null, begin_at: null, left_at: null,
  });
  store.put("trips", { trip_id: args.tripId, status: "loading" });
  logEvent(store, args.newId, {
    trip_id: args.tripId, event_type: "pickup_added", occurred_at: args.now.toISOString(),
    actor_id: args.userId, pickup_id: pickupId, payload: { seq },
  });
  return pickupId;
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
    delivered: DeliveredCompartment[];
    tanks: DeliveryTankReading[];
    consigneeName: string | null;
    consigneeSignature: string | null;
    signed: boolean;
    endMiles: number | null;
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

  const remaining = store.list(
    "trip_deliveries",
    (x) => x.trip_id === d.trip_id && x.status === "planned" && x.delivery_id !== d.delivery_id,
  );
  const tripComplete = remaining.length === 0;
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
    payload: { compartments: args.delivered.map((c) => c.comp_number), trip_complete: tripComplete },
  });
  if (args.signed) {
    logEvent(store, args.newId, {
      trip_id: d.trip_id, event_type: "signature_accepted", occurred_at: at, actor_id: args.userId,
      delivery_id: d.delivery_id, payload: { role: "delivering_driver" },
    });
  }
  return { tripComplete };
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
