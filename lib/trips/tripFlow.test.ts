// lib/trips/tripFlow.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripStore } from "./tripStore.ts";
import { applyStartLoad, buildStartLoad, linkLoadToOpenTrip, type StartLoadInput } from "./tripLogic.ts";
import {
  addPickup,
  addTripOrder,
  setPickupOrder,
  arriveDelivery,
  arrivePickup,
  undoableArrival,
  undoArrivePickup,
  canCancelLoad,
  cancelLoad,
  setTripHidden,
  compartmentsForDelivery,
  confirmLoaded,
  defaultStepTimes,
  delayMinutes,
  finishDelivery,
  handoffCandidate,
  markCompartmentsCleaned,
  needsDelayReason,
  nextStep,
  pickupNeedsOdometer,
  recordLoadCompleted,
  rerouteDelivery,
  splitToNewDelivery,
  suggestTank,
  stampLoadedLater,
  pendingLoadDetails,
  takeOverTrip,
  timesProblem,
  tripSnapshot,
} from "./tripFlow.ts";
import type { TripPickupRow, TripRow } from "./types.ts";

const ME = "me";
const NOW = new Date("2026-10-10T15:00:00Z");

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function input(over: Partial<StartLoadInput> = {}): StartLoadInput {
  return {
    companyId: "co", userId: ME, truckId: "truck-1", trailerId: "trailer-1",
    orderNumber: "4471", extraOrderNumbers: [], shipper: "Acme", customer: "",
    pickup: { terminalId: "term-1", rackId: null, name: "Marathon", city: "Tampa", state: "FL" },
    deliveries: [{ locationId: null, oneOffName: "Store 12", deliveryType: "drop" }],
    beginMiles: 1000,
    ...over,
  };
}

function setup(over: Partial<StartLoadInput> = {}) {
  const s = createTripStore({ storageKey: "k" });
  const newId = ids();
  applyStartLoad(s, buildStartLoad(input(over), { now: NOW, newId }));
  const trip = s.list("trips")[0];
  return { s, newId, trip, snap: () => tripSnapshot(s, trip.trip_id), getTrip: () => s.list("trips")[0] };
}

const reading = (comp: number, gallons: number, productId = "d2") => ({ comp, productId, gallons, api: 35, tempF: 80 });

test("next step walks the whole trip", () => {
  const { s, newId, trip, snap, getTrip } = setup();
  assert.equal(nextStep(null, null).kind, "start");

  let step = nextStep(getTrip(), snap());
  assert.equal(step.kind, "arrive_pickup");
  arrivePickup(s, { userId: ME, pickup: snap().pickups[0], now: NOW, newId });
  assert.equal(nextStep(getTrip(), snap()).kind, "planner");

  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  assert.equal(nextStep(getTrip(), snap()).label, "Continue Trip");

  assert.ok(recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 4000), reading(2, 3800)], now: NOW, newId }));
  step = nextStep(getTrip(), snap());
  assert.equal(step.kind, "loaded");

  const pickup = snap().pickups[0];
  confirmLoaded(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", pickup,
    times: defaultStepTimes(NOW, 10, pickup.arrived_at), delayReasonId: null, delayNote: null, odometer: null,
    compartments: snap().compLoads.map((c) => ({ ...c, bol_number: "B1", supplier: "Sup" })), signed: true, now: NOW, newId,
  });
  assert.equal(getTrip().status, "in_transit");
  assert.equal(s.list("compartment_readiness").length, 2);
  assert.ok(s.list("compartment_readiness").every((r) => r.status === "preloaded"));

  step = nextStep(getTrip(), snap());
  assert.equal(step.kind, "arrive_delivery");
  const d = snap().deliveries[0];
  arriveDelivery(s, { userId: ME, delivery: d, now: NOW, newId });
  assert.equal(getTrip().status, "delivering");
  step = nextStep(getTrip(), snap());
  assert.equal(step.kind, "finish_delivery");

  const res = finishDelivery(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", delivery: snap().deliveries[0],
    times: defaultStepTimes(NOW, 10, snap().deliveries[0].arrived_at), delayReasonId: null, delayNote: null,
    delivered: snap().compLoads.map((c) => ({ compartment_load_id: c.compartment_load_id, comp_number: c.comp_number, product_id: c.product_id, tank_number: "1" })),
    tanks: [{ tank_number: "1", product_id: "d2", before_reading: 10, after_reading: 90, water_reading: 0, reading_unit: "gallons" }],
    consigneeName: null, consigneeSignature: null, signed: true, endMiles: 1100, now: NOW, newId,
  });
  assert.equal(res.tripComplete, true);
  assert.equal(getTrip().status, "complete");
  assert.equal(getTrip().end_miles, 1100);
  assert.ok(s.list("compartment_readiness").every((r) => r.status === "residue"));
  assert.ok(snap().compLoads.every((c) => c.disposition === "delivered"));
  assert.equal(nextStep(getTrip(), snap()).kind, "start");
});

test("recorded load: net is calculated, an edit reuses rows and cancels dropped compartments", () => {
  const { s, newId, snap } = setup();
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 8000), reading(2, 3000)], now: NOW, newId });
  const first = snap().compLoads;
  assert.equal(first[0].net_gallons, 7926);
  assert.equal(first[0].order_id, s.list("trip_orders")[0].order_id);
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 7900)], now: NOW, newId });
  const after = snap().compLoads;
  assert.equal(after.length, 2);
  assert.equal(after[0].compartment_load_id, first[0].compartment_load_id);
  assert.equal(after[0].gross_gallons, 7900);
  assert.equal(after[1].disposition, "cancelled");
  assert.deepEqual(s.list("trip_events").map((e) => e.event_type).slice(-2), ["load_completed", "load_edited"]);
  assert.equal(recordLoadCompleted(s, { userId: ME, loadId: "nope", readings: [], now: NOW, newId }), false);
});

test("step times: begin = now - offset but never before arrival; delay and problems", () => {
  const t = defaultStepTimes(NOW, 10, "2026-10-10T14:00:00Z");
  assert.equal(t.beginAt, "2026-10-10T14:50:00.000Z");
  assert.equal(t.leftAt, NOW.toISOString());
  assert.equal(delayMinutes(t.arrivedAt, t.beginAt), 50);
  assert.equal(needsDelayReason(50, 30), true);
  assert.equal(needsDelayReason(30, 30), false);
  const late = defaultStepTimes(NOW, 10, "2026-10-10T14:58:00Z");
  assert.equal(late.beginAt, "2026-10-10T14:58:00.000Z");
  assert.equal(timesProblem(t), null);
  // A recorded Start Loading time wins over the offset, still never before arrival.
  const began = defaultStepTimes(NOW, 10, "2026-10-10T14:00:00Z", "2026-10-10T14:20:00Z");
  assert.equal(began.beginAt, "2026-10-10T14:20:00.000Z");
  assert.equal(began.leftAt, NOW.toISOString());
  assert.equal(defaultStepTimes(NOW, 10, "2026-10-10T14:30:00Z", "2026-10-10T14:20:00Z").beginAt, "2026-10-10T14:30:00.000Z");
  assert.equal(timesProblem({ ...t, beginAt: "2026-10-10T13:00:00Z" }), "Begin can't be before Arrive.");
});

test("odometer only on a cross-city rack hop", () => {
  const p = (id: string, seq: number, city: string): TripPickupRow => ({
    pickup_id: id, trip_id: "t", seq, pickup_type: "terminal", terminal_id: null, rack_id: null, name: null,
    city, state: "FL", odometer: null, arrived_at: null, begin_at: null, left_at: null, delay_reason_id: null,
    delay_note: null, load_id: null,
  });
  const ps = [p("a", 1, "Tampa"), p("b", 2, "Tampa"), p("c", 3, "Orlando")];
  assert.equal(pickupNeedsOdometer(ps, "a"), false);
  assert.equal(pickupNeedsOdometer(ps, "b"), false);
  assert.equal(pickupNeedsOdometer(ps, "c"), true);
});

test("rack hop: after the first pickup is loaded, the next Planner load attaches to the new pickup", () => {
  const { s, newId, trip, snap, getTrip } = setup();
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 4000)], now: NOW, newId });
  const p1 = snap().pickups[0];
  confirmLoaded(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", pickup: p1, times: defaultStepTimes(NOW, 10, null),
    delayReasonId: null, delayNote: null, odometer: null, compartments: [], signed: false, now: NOW, newId,
  });
  assert.equal(getTrip().status, "in_transit");
  addPickup(s, { userId: ME, tripId: trip.trip_id, terminalId: "term-2", rackId: null, name: "Buckeye", city: "Tampa", state: "FL", now: NOW, newId });
  assert.equal(getTrip().status, "loading");
  assert.ok(linkLoadToOpenTrip(s, { userId: ME, loadId: "L2", pickup: { terminalId: "term-2", rackId: null }, now: NOW, newId }));
  assert.equal(snap().pickups[1].load_id, "L2");
  assert.equal(snap().pickups[0].load_id, "L1");
});

test("split, reroute, and a partial delivery keeps the trip going; leftovers are retained", () => {
  const { s, newId, trip, snap, getTrip } = setup();
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 4000), reading(2, 3000), reading(3, 2000)], now: NOW, newId });
  const [c1, c2, c3] = snap().compLoads;
  const first = snap().deliveries[0];
  const second = splitToNewDelivery(s, {
    userId: ME, tripId: trip.trip_id, compartmentLoadIds: [c2.compartment_load_id],
    to: { locationId: null, oneOffName: "Store 40", deliveryType: "pump_off" }, fromDeliveryId: first.delivery_id, now: NOW, newId,
  });
  assert.equal(snap().deliveries.length, 2);
  assert.deepEqual(compartmentsForDelivery(snap().compLoads, snap().deliveries, first.delivery_id).map((c) => c.comp_number), [1, 3]);

  assert.equal(rerouteDelivery(s, { userId: ME, delivery: snap().deliveries[1], to: { locationId: null, oneOffName: "Store 40", deliveryType: "pump_off" }, now: NOW, newId }), false);
  assert.equal(rerouteDelivery(s, { userId: ME, delivery: snap().deliveries[1], to: { locationId: "loc-9", oneOffName: null, deliveryType: "pump_off" }, now: NOW, newId }), true);
  assert.equal(snap().deliveries[1].location_id, "loc-9");

  const r1 = finishDelivery(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", delivery: snap().deliveries[0], times: defaultStepTimes(NOW, 0, null),
    delayReasonId: null, delayNote: null,
    delivered: [{ compartment_load_id: c1.compartment_load_id, comp_number: 1, product_id: "d2", tank_number: null }],
    tanks: [], consigneeName: null, consigneeSignature: null, signed: false, endMiles: null, now: NOW, newId,
  });
  assert.equal(r1.tripComplete, false);
  assert.equal(getTrip().status, "in_transit");
  assert.equal(rerouteDelivery(s, { userId: ME, delivery: snap().deliveries[0], to: { locationId: "x", oneOffName: null, deliveryType: "drop" }, now: NOW, newId }), false, "finished deliveries can't move");

  const r2 = finishDelivery(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", delivery: snap().deliveries.find((d) => d.delivery_id === second)!,
    times: defaultStepTimes(NOW, 0, null), delayReasonId: null, delayNote: null,
    delivered: [{ compartment_load_id: c2.compartment_load_id, comp_number: 2, product_id: "d2", tank_number: null }],
    tanks: [], consigneeName: null, consigneeSignature: null, signed: false, endMiles: 1200, now: NOW, newId,
  });
  assert.equal(r2.tripComplete, true);
  assert.equal(snap().compLoads.find((c) => c.compartment_load_id === c3.compartment_load_id)!.disposition, "retained");
  const readiness = new Map(s.list("compartment_readiness").map((r) => [r.comp_number, r.status]));
  assert.equal(readiness.get(3), "retained");
  assert.equal(readiness.get(1), "residue");
});

test("start load edit keeps finished deliveries and logs a reroute", () => {
  const { s, newId, trip } = setup({ deliveries: [{ locationId: null, oneOffName: "Store 12", deliveryType: "drop" }, { locationId: null, oneOffName: "Store 13", deliveryType: "drop" }] });
  const ds = s.list("trip_deliveries").sort((a, b) => a.seq - b.seq);
  s.put("trip_deliveries", { delivery_id: ds[0].delivery_id, status: "complete" });
  const existing = {
    trip: s.list("trips")[0], orders: s.list("trip_orders"), pickups: s.list("trip_pickups"),
    deliveries: s.list("trip_deliveries"),
  };
  const rows = buildStartLoad(input({ deliveries: [{ locationId: "loc-5", oneOffName: null, deliveryType: "drop" }] }), { now: NOW, newId, existing });
  assert.equal(rows.deliveries.length, 1);
  assert.equal(rows.deliveries[0].delivery_id, ds[1].delivery_id);
  assert.equal(rows.deliveries[0].seq, 2);
  assert.equal(rows.events[0].event_type, "delivery_rerouted");
  assert.equal(trip.trip_id, rows.trip.trip_id);
});

test("interior wash marks compartments clean; tank suggestion needs exactly one match", () => {
  const s = createTripStore({ storageKey: "k" });
  markCompartmentsCleaned(s, { trailerId: "tr", companyId: "co", userId: ME, compNumbers: [1, 2] });
  assert.equal(s.list("compartment_readiness").filter((r) => r.status === "cleaned_and_purged").length, 2);
  assert.equal(suggestTank("d2", [{ tank_number: "1", product_id: "d2" }, { tank_number: "2", product_id: "87" }]), "1");
  assert.equal(suggestTank("d2", [{ tank_number: "1", product_id: "d2" }, { tank_number: "3", product_id: "d2" }]), null);
  assert.equal(suggestTank(null, []), null);
});

test("handoff: another driver's open trip on my trailer can be taken over", () => {
  const t = (over: Partial<TripRow>): TripRow => ({
    trip_id: "t1", company_id: "co", truck_id: "truck-a", trailer_id: "tr", driver_id: "other", created_by: "other",
    status: "in_transit", shipper: null, customer: null, begin_miles: null, end_miles: null, entered_late: false,
    notes: null, started_at: "2026-10-10T10:00:00Z", completed_at: null, ...over,
  });
  assert.equal(handoffCandidate([t({})], "tr", ME)?.trip_id, "t1");
  assert.equal(handoffCandidate([t({ driver_id: ME })], "tr", ME), null);
  assert.equal(handoffCandidate([t({ status: "complete" })], "tr", ME), null);
  assert.equal(handoffCandidate([t({})], "other-trailer", ME), null);
  const s = createTripStore({ storageKey: "k" });
  s.put("trips", t({}));
  takeOverTrip(s, { userId: ME, trip: t({}), truckId: "truck-b", now: NOW, newId: ids() });
  assert.equal(s.list("trips")[0].driver_id, ME);
  assert.equal(s.list("trips")[0].truck_id, "truck-b");
  assert.equal(s.list("trip_events")[0].event_type, "handoff");
});

test("park and resume", async () => {
  const { canPark, parkTrip, parkedTripOnTrailer, resumeTrip, parkRecords, nextStep } = await import("./tripFlow.ts");
  const rows: Record<string, any[]> = {};
  const store = {
    put: (t: string, r: any) => { (rows[t] ??= []).push(r); },
    list: (t: string) => rows[t] ?? [],
  } as any;
  const trip: any = { trip_id: "t1", trailer_id: "R1", driver_id: "A", truck_id: "T1", status: "in_transit" };
  const step = nextStep(trip, { pickups: [], deliveries: [], compLoads: [] });
  assert.equal(step.kind, "add_delivery");
  assert.equal(canPark(trip, step, true), true);
  assert.equal(canPark(trip, step, false), false);
  assert.equal(canPark({ ...trip, status: "draft" }, { kind: "start", label: "" } as any, true), false);

  let id = 0;
  const clock = { now: new Date("2026-10-12T20:00:00Z"), newId: () => `e${++id}` };
  parkTrip(store, { trip, userId: "A", parkFor: "slip_seat", where: " Yard ", note: "", parkedAt: "2026-10-12T20:00:00Z", ...clock });
  const parked = { ...trip, ...rows.trips[0] };
  assert.equal(parked.status, "parked");
  assert.equal(parked.parked_where, "Yard");
  assert.equal(parked.parked_note, null);
  assert.equal(parkedTripOnTrailer([parked], "R1")?.trip_id, "t1");
  assert.equal(parkedTripOnTrailer([parked], "R2"), null);

  resumeTrip(store, { trip: parked, userId: "B", truckId: "T2", now: new Date("2026-10-13T11:00:00Z"), newId: clock.newId });
  const resumed = rows.trips[1];
  assert.equal(resumed.status, "in_transit");
  assert.equal(resumed.driver_id, "B");
  assert.equal(resumed.truck_id, "T2");
  assert.deepEqual(rows.trip_events.map((e) => e.event_type), ["parked", "resumed", "handoff"]);
  const recs = parkRecords(rows.trip_events);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].resumedAt, "2026-10-13T11:00:00.000Z");
  assert.equal(recs[0].parkFor, "slip_seat");
});

test("retain keeps compartments aboard for the next leg; progress is saved as you go", async () => {
  const { saveDeliveryProgress } = await import("./tripFlow.ts");
  const { s, newId, snap, getTrip } = setup();
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 4000), reading(2, 3000)], now: NOW, newId });
  const pickup = snap().pickups[0];
  confirmLoaded(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", pickup,
    times: defaultStepTimes(NOW, 10, pickup.arrived_at), delayReasonId: null, delayNote: null, odometer: null,
    compartments: snap().compLoads.map((c) => ({ ...c, bol_number: "B1", supplier: "Sup" })), signed: true, now: NOW, newId,
  });
  const d = snap().deliveries[0];
  arriveDelivery(s, { userId: ME, delivery: d, now: NOW, newId });
  const [c1, c2] = snap().compLoads;

  saveDeliveryProgress(s, {
    delivery: d, beginAt: "2026-10-12T15:05:00.000Z", delayReasonId: null, delayNote: null,
    tanks: [{ tank_number: "4", product_id: "d2", before_reading: 1000, after_reading: null, water_reading: null, reading_unit: "gallons" }],
    compTanks: [{ compartment_load_id: c1.compartment_load_id, tank_number: "4" }],
    newId,
  });
  assert.equal(snap().deliveries[0].begin_at, "2026-10-12T15:05:00.000Z");
  assert.equal(s.list("trip_delivery_tanks").length, 1);
  assert.equal(snap().compLoads[0].tank_number, "4");
  saveDeliveryProgress(s, {
    delivery: d,
    tanks: [{ tank_number: "4", product_id: "d2", before_reading: 1000, after_reading: 5000, water_reading: null, reading_unit: "gallons" }],
    newId,
  });
  assert.equal(s.list("trip_delivery_tanks").length, 1, "same tank row is updated");

  const res = finishDelivery(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", delivery: snap().deliveries[0],
    times: defaultStepTimes(NOW, 0, null), delayReasonId: null, delayNote: null,
    delivered: [{ compartment_load_id: c1.compartment_load_id, comp_number: 1, product_id: "d2", tank_number: "4" }],
    retained: [{ compartment_load_id: c2.compartment_load_id, comp_number: 2, product_id: "d2", tank_number: null }],
    tanks: [], consigneeName: null, consigneeSignature: null, signed: true, endMiles: null, now: NOW, newId,
  });
  assert.equal(res.tripComplete, false);
  assert.equal(getTrip().status, "in_transit");
  const kept = snap().compLoads.find((c) => c.compartment_load_id === c2.compartment_load_id)!;
  assert.equal(kept.disposition, "loaded");
  assert.equal(kept.delivery_id, null);
  assert.equal(nextStep(getTrip(), snap()).kind, "add_delivery");
});

test("cancel a load: reasons in order, open rack closed as no-load, deliveries cancelled", () => {
  const { s, newId, trip, snap, getTrip } = setup();
  arrivePickup(s, { userId: ME, pickup: snap().pickups[0], now: NOW, newId });
  assert.equal(canCancelLoad(getTrip(), false), true);
  assert.equal(canCancelLoad(getTrip(), true), false);
  cancelLoad(s, {
    trip: getTrip(), userId: ME, reasons: ["traffic", "rack_hopping", "out_of_allocation", "hours_of_service"],
    note: "No allocation after gauging", returnedTo: "Yard", endMiles: 1080,
    cancelledAt: "2026-10-10T18:00:00Z", rackReason: "out_of_allocation", now: NOW, newId,
  });
  const t = getTrip();
  assert.equal(t.status, "cancelled");
  assert.deepEqual(t.cancel_reasons, ["traffic", "rack_hopping", "out_of_allocation", "hours_of_service"]);
  assert.equal(t.end_miles, 1080);
  const p = snap().pickups[0];
  assert.equal(p.outcome, "no_load");
  assert.equal(p.no_load_reason, "out_of_allocation");
  assert.equal(p.left_at, "2026-10-10T18:00:00Z");
  assert.ok(snap().deliveries.every((d) => d.status === "cancelled"));
  assert.equal(canCancelLoad(t, false), false);
  setTripHidden(s, trip.trip_id, true);
  assert.equal(getTrip().driver_hidden, true);
});

test("a second pickup can load under its own order number", () => {
  const { s, newId, trip, snap } = setup();
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 4000)], now: NOW, newId });
  const primary = s.list("trip_orders").find((o) => o.is_primary)!;
  assert.equal(snap().compLoads[0].order_id, primary.order_id);
  // Same number as an order already on the trip reuses it.
  assert.equal(addTripOrder(s, { tripId: trip.trip_id, orderNumber: " 4471 ", newId }), primary.order_id);
  const second = addTripOrder(s, { tripId: trip.trip_id, orderNumber: "5520", newId })!;
  assert.notEqual(second, primary.order_id);
  addPickup(s, { userId: ME, tripId: trip.trip_id, terminalId: "term-2", rackId: null, name: "Buckeye", city: "Tampa", state: "FL", orderId: second, now: NOW, newId });
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L2", pickup: { terminalId: "term-2", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L2", readings: [reading(2, 3000)], now: NOW, newId });
  const c2 = snap().compLoads.find((c) => c.comp_number === 2)!;
  assert.equal(c2.order_id, second);
  // Changing the first pickup's order moves its compartments with it.
  setPickupOrder(s, { userId: ME, pickup: snap().pickups[0], orderId: second, now: NOW, newId });
  assert.equal(snap().compLoads.find((c) => c.comp_number === 1)!.order_id, second);
  setPickupOrder(s, { userId: ME, pickup: snap().pickups[0], orderId: null, now: NOW, newId });
  assert.equal(snap().compLoads.find((c) => c.comp_number === 1)!.order_id, primary.order_id);
});

test("park stays open at a delivery until the drop begins, and after a partial drop", async () => {
  const { canPark, parkTrip, saveDeliveryProgress } = await import("./tripFlow.ts");
  const { s, newId, snap, getTrip } = setup();
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 4000), reading(2, 3000)], now: NOW, newId });
  const pickup = snap().pickups[0];
  confirmLoaded(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", pickup,
    times: defaultStepTimes(NOW, 10, pickup.arrived_at), delayReasonId: null, delayNote: null, odometer: null,
    compartments: snap().compLoads.map((c) => ({ ...c, bol_number: "B1", supplier: "Sup" })), signed: true, now: NOW, newId,
  });
  const d = snap().deliveries[0];
  arriveDelivery(s, { userId: ME, delivery: d, now: NOW, newId });
  const [c1] = snap().compLoads;
  saveDeliveryProgress(s, { delivery: snap().deliveries[0], compTanks: [{ compartment_load_id: c1.compartment_load_id, tank_number: "4" }], newId });

  let step = nextStep(getTrip(), snap());
  assert.equal(step.kind, "finish_delivery");
  assert.equal(canPark(getTrip(), step, true), true, "arrived, not dropped: can park");

  parkTrip(s, { trip: getTrip(), userId: ME, parkFor: "slip_seat", where: null, note: null, parkedAt: NOW.toISOString(), now: NOW, newId });
  assert.equal(getTrip().status, "parked");
  assert.equal(snap().deliveries[0].arrived_at, null, "delivery back to not arrived");
  assert.equal(snap().deliveries[0].status, "planned");
  assert.equal(snap().compLoads[0].tank_number, null, "tank picks cleared");

  const begun = { ...getTrip(), status: "delivering" as const };
  step = nextStep(begun, { ...snap(), deliveries: [{ ...snap().deliveries[0], arrived_at: NOW.toISOString(), begin_at: NOW.toISOString() }] });
  assert.equal(step.kind, "finish_delivery");
  assert.equal(canPark(begun, step, true), false, "drop begun: no park");
});

test("finish delivery: bio blend goes on the compartment, details become one event", () => {
  const { s, newId, snap } = setup();
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 4000)], now: NOW, newId });
  const [c1] = snap().compLoads;
  const d = snap().deliveries[0];
  finishDelivery(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", delivery: d, times: defaultStepTimes(NOW, 0, null),
    delayReasonId: null, delayNote: null,
    delivered: [{ compartment_load_id: c1.compartment_load_id, comp_number: 1, product_id: "d2", tank_number: "1" }],
    tanks: [], consigneeName: null, consigneeSignature: null, signed: false, endMiles: 1234, now: NOW, newId,
    bioBlends: [{ compartment_load_id: c1.compartment_load_id, bio_blend: "B20" }],
    details: { odometer: 1234, additives: ["biocide"], additiveNote: null, issues: ["vapor"], issueNote: "Bucket leaked" },
  });
  assert.equal(snap().compLoads[0].bio_blend, "B20");
  const ev = s.list("trip_events").filter((e) => e.event_type === "delivery_details");
  assert.equal(ev.length, 1);
  assert.deepEqual((ev[0].payload as any).issues, ["vapor"]);
  assert.equal((ev[0].payload as any).odometer, 1234);
});

test("defaultStepTimes: a geofence departure sets the leave time, never in the future", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const t = defaultStepTimes(now, 10, "2026-10-23T10:00:00Z", null, "2026-10-23T11:30:00Z");
  assert.equal(t.leftAt, "2026-10-23T11:30:00.000Z");
  assert.equal(defaultStepTimes(now, 10, null, null, "2026-10-23T13:00:00Z").leftAt, now.toISOString());
});

test("undo an accidental pickup arrival", () => {
  const { s, newId, snap, getTrip } = setup();
  assert.equal(undoableArrival(snap()), null);
  arrivePickup(s, { userId: ME, pickup: snap().pickups[0], now: NOW, newId });
  assert.equal(nextStep(getTrip(), snap()).kind, "planner");
  const u = undoableArrival(snap());
  assert.equal(u?.kind, "pickup");
  undoArrivePickup(s, { userId: ME, pickup: snap().pickups[0], now: NOW, newId });
  assert.equal(snap().pickups[0].arrived_at, null);
  assert.equal(nextStep(getTrip(), snap()).kind, "arrive_pickup");
  assert.equal(undoableArrival(snap()), null);
});

test("undo is refused once a load is attached", () => {
  const { s, newId, snap } = setup();
  arrivePickup(s, { userId: ME, pickup: snap().pickups[0], now: NOW, newId });
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  assert.equal(undoableArrival(snap()), null);
});

test("finish later: times are stamped now, details stay owed until confirmed, status is not dragged back", () => {
  const { s, newId, trip, snap, getTrip } = setup();
  arrivePickup(s, { userId: ME, pickup: snap().pickups[0], now: NOW, newId });
  linkLoadToOpenTrip(s, { userId: ME, loadId: "L1", pickup: { terminalId: "term-1", rackId: null }, now: NOW, newId });
  recordLoadCompleted(s, { userId: ME, loadId: "L1", readings: [reading(1, 4000), reading(2, 3800)], now: NOW, newId });
  assert.equal(pendingLoadDetails(s, trip.trip_id).length, 0); // not left yet: the normal Loaded step still applies

  const pickup = snap().pickups[0];
  const times = defaultStepTimes(NOW, 10, pickup.arrived_at);
  stampLoadedLater(s, { userId: ME, companyId: "co", trailerId: "trailer-1", pickup, times, now: NOW, newId });
  assert.equal(getTrip().status, "in_transit");
  assert.ok(snap().pickups[0].left_at);
  assert.equal(nextStep(getTrip(), snap()).kind, "arrive_delivery"); // can drive on and arrive

  const pend = pendingLoadDetails(s, trip.trip_id);
  assert.equal(pend.length, 1);
  assert.deepEqual([pend[0].missingBol, pend[0].missingSupplier, pend[0].missingSignature], [true, true, true]);

  // Arrive at the delivery, then complete the details: the trip stays "delivering".
  arriveDelivery(s, { userId: ME, delivery: snap().deliveries[0], now: NOW, newId });
  assert.equal(getTrip().status, "delivering");
  confirmLoaded(s, {
    userId: ME, companyId: "co", trailerId: "trailer-1", pickup: snap().pickups[0],
    times: { arrivedAt: snap().pickups[0].arrived_at!, beginAt: snap().pickups[0].begin_at!, leftAt: snap().pickups[0].left_at! },
    delayReasonId: null, delayNote: null, odometer: null,
    compartments: snap().compLoads.map((c) => ({ ...c, bol_number: "B9", supplier: "Sup" })), signed: true, now: NOW, newId,
  });
  assert.equal(getTrip().status, "delivering");
  assert.equal(pendingLoadDetails(s, trip.trip_id).length, 0);
});
