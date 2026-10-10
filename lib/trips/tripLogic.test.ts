// lib/trips/tripLogic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripStore } from "./tripStore.ts";
import {
  applyStartLoad,
  buildStartLoad,
  cancelTrip,
  lastShipperCustomer,
  linkLoadToOpenTrip,
  nextStep,
  openTripForDriver,
  retagLoadPickup,
  truckBeginMiles,
  tripChildren,
  unlinkCancelledLoad,
  type StartLoadInput,
} from "./tripLogic.ts";
import type { TripRow } from "./types.ts";

const ME = "user-me";
const NOW = new Date("2026-10-10T15:00:00Z");

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function input(over: Partial<StartLoadInput> = {}): StartLoadInput {
  return {
    companyId: "co",
    userId: ME,
    truckId: "truck-1",
    trailerId: "trailer-1",
    orderNumber: " 4471 ",
    extraOrderNumbers: [],
    shipper: "Acme",
    customer: "",
    pickup: { terminalId: "term-1", rackId: null, name: "Marathon", city: "Tampa", state: "FL" },
    deliveries: [{ locationId: null, oneOffName: "Store 12", deliveryType: "drop" }],
    beginMiles: 120000,
    ...over,
  };
}

function trip(over: Partial<TripRow>): TripRow {
  return {
    trip_id: "t", company_id: "co", truck_id: null, trailer_id: null, driver_id: ME, created_by: ME,
    status: "draft", shipper: null, customer: null, begin_miles: null, end_miles: null,
    entered_late: false, notes: null, started_at: null, completed_at: null, ...over,
  };
}

test("start load writes one trip, primary order, pickup, delivery and a started event", () => {
  const s = createTripStore({ storageKey: "k" });
  const rows = buildStartLoad(input(), { now: NOW, newId: ids() });
  applyStartLoad(s, rows);
  const t = s.list("trips")[0];
  assert.equal(t.status, "draft");
  assert.equal(t.driver_id, ME);
  assert.equal(t.customer, null, "blank text is stored as null");
  assert.equal(t.started_at, NOW.toISOString());
  const c = tripChildren(s, t.trip_id);
  assert.equal(c.primaryOrder?.order_number, "4471");
  assert.equal(c.pickup?.name, "Marathon");
  assert.equal(c.deliveries.length, 1);
  assert.equal(c.deliveries[0].one_off_name, "Store 12");
  assert.equal(s.list("trip_events")[0].event_type, "trip_started");
  assert.equal(s.pendingCount(), 5);
});

test("an empty delivery row is not written", () => {
  const rows = buildStartLoad(input({ deliveries: [{ locationId: null, oneOffName: "  ", deliveryType: "drop" }] }), { now: NOW, newId: ids() });
  assert.equal(rows.deliveries.length, 0);
});

test("editing a trip reuses ids, cancels removed deliveries and blanks removed orders", () => {
  const s = createTripStore({ storageKey: "k" });
  const newId = ids();
  applyStartLoad(s, buildStartLoad(input({
    extraOrderNumbers: ["A2", "A3"],
    deliveries: [
      { locationId: "loc-1", oneOffName: null, deliveryType: "drop" },
      { locationId: null, oneOffName: "Farm", deliveryType: "pump_off" },
    ],
  }), { now: NOW, newId }));
  const t = s.list("trips")[0];
  const before = tripChildren(s, t.trip_id);

  const rows = buildStartLoad(input({ orderNumber: "5000", extraOrderNumbers: ["A2"], deliveries: [{ locationId: "loc-1", oneOffName: null, deliveryType: "drop" }] }), {
    now: NOW, newId, existing: { trip: t, orders: before.orders, pickups: before.pickups, deliveries: before.deliveries },
  });
  applyStartLoad(s, rows);

  assert.equal(s.list("trips").length, 1);
  assert.equal(rows.events.length, 0, "an edit is not a new start");
  const after = tripChildren(s, t.trip_id);
  assert.equal(after.primaryOrder?.order_id, before.primaryOrder?.order_id);
  assert.equal(after.primaryOrder?.order_number, "5000");
  assert.deepEqual(after.extraOrders.map((o) => o.order_number), ["A2"]);
  assert.equal(after.deliveries.length, 1);
  assert.equal(s.list("trip_deliveries").length, 2, "removed delivery is cancelled, not deleted");
  assert.equal(after.pickup?.pickup_id, before.pickup?.pickup_id);
});

test("editing after the load began leaves the pickup's terminal alone", () => {
  const s = createTripStore({ storageKey: "k" });
  const newId = ids();
  applyStartLoad(s, buildStartLoad(input(), { now: NOW, newId }));
  linkLoadToOpenTrip(s, { userId: ME, loadId: "load-1", pickup: { terminalId: "term-2", rackId: "r" }, now: NOW, newId });
  const t = s.list("trips")[0];
  const c = tripChildren(s, t.trip_id);
  applyStartLoad(s, buildStartLoad(input({ pickup: { terminalId: "term-9", rackId: null, name: "X", city: null, state: null } }), {
    now: NOW, newId, existing: { trip: t, orders: c.orders, pickups: c.pickups, deliveries: c.deliveries },
  }));
  assert.equal(tripChildren(s, t.trip_id).pickup?.terminal_id, "term-2");
});

test("open trip: newest open trip for this driver only", () => {
  const trips = [
    trip({ trip_id: "old", started_at: "2026-10-09T00:00:00Z" }),
    trip({ trip_id: "new", started_at: "2026-10-10T00:00:00Z" }),
    trip({ trip_id: "done", status: "complete", started_at: "2026-10-11T00:00:00Z" }),
    trip({ trip_id: "other", driver_id: "someone", started_at: "2026-10-12T00:00:00Z" }),
  ];
  assert.equal(openTripForDriver(trips, ME)?.trip_id, "new");
  assert.equal(openTripForDriver([], ME), null);
});

test("begin miles come from the truck's last completed trip", () => {
  const trips = [
    trip({ truck_id: "T", end_miles: 100, completed_at: "2026-10-01T00:00:00Z", status: "complete" }),
    trip({ truck_id: "T", end_miles: 250, completed_at: "2026-10-05T00:00:00Z", status: "complete", driver_id: "someone" }),
    trip({ truck_id: "U", end_miles: 999, completed_at: "2026-10-09T00:00:00Z", status: "complete" }),
  ];
  assert.equal(truckBeginMiles(trips, "T"), 250, "per truck, any driver");
  assert.equal(truckBeginMiles(trips, "nope"), null);
  assert.equal(truckBeginMiles(trips, null), null);
});

test("shipper/customer prefill from the driver's last trip that had them", () => {
  const trips = [
    trip({ shipper: "Old", started_at: "2026-10-01T00:00:00Z" }),
    trip({ shipper: "New", customer: "Cust", started_at: "2026-10-02T00:00:00Z" }),
    trip({ shipper: "Cancelled", status: "cancelled", started_at: "2026-10-03T00:00:00Z" }),
  ];
  assert.deepEqual(lastShipperCustomer(trips, ME), { shipper: "New", customer: "Cust" });
});

test("next step follows the trip state", () => {
  assert.equal(nextStep(null, null).label, "Start Load");
  const p = { name: "Marathon" } as never;
  assert.deepEqual(nextStep(trip({ status: "draft" }), p), { kind: "planner", label: "Go to Planner", detail: "Load at Marathon" });
  assert.equal(nextStep(trip({ status: "loading" }), null).label, "Back to Load");
});

test("a Planner load attaches to the open trip and a cancel puts it back", () => {
  const s = createTripStore({ storageKey: "k" });
  const newId = ids();
  applyStartLoad(s, buildStartLoad(input(), { now: NOW, newId }));
  const ok = linkLoadToOpenTrip(s, { userId: ME, loadId: "load-1", pickup: { terminalId: "term-2", rackId: "rack-2", name: "Global South" }, now: NOW, newId });
  assert.ok(ok);
  let t = s.list("trips")[0];
  assert.equal(t.status, "loading");
  let p = tripChildren(s, t.trip_id).pickup!;
  assert.equal(p.load_id, "load-1");
  assert.equal(p.terminal_id, "term-2");
  assert.equal(p.name, "Global South");
  assert.equal(p.city, "Tampa", "fields not passed are kept");

  // Same load again is a no-op success, not a second pickup.
  assert.ok(linkLoadToOpenTrip(s, { userId: ME, loadId: "load-1", pickup: { terminalId: "x", rackId: null }, now: NOW, newId }));
  assert.equal(tripChildren(s, t.trip_id).pickup?.terminal_id, "term-2");

  assert.ok(retagLoadPickup(s, "load-1", { terminalId: "term-3", rackId: null, name: "Chevron" }));
  assert.equal(tripChildren(s, t.trip_id).pickup?.name, "Chevron");

  assert.ok(unlinkCancelledLoad(s, { userId: ME, loadId: "load-1", now: NOW, newId }));
  t = s.list("trips")[0];
  p = tripChildren(s, t.trip_id).pickup!;
  assert.equal(t.status, "draft");
  assert.equal(p.load_id, null);
  assert.deepEqual(
    s.list("trip_events").map((e) => e.event_type).sort(),
    ["load_begun", "load_cancelled", "trip_started"],
  );
});

test("no open trip: the Planner works as before", () => {
  const s = createTripStore({ storageKey: "k" });
  assert.equal(linkLoadToOpenTrip(s, { userId: ME, loadId: "l", pickup: { terminalId: null, rackId: null }, now: NOW, newId: ids() }), false);
  assert.equal(unlinkCancelledLoad(s, { userId: ME, loadId: "l", now: NOW, newId: ids() }), false);
  assert.equal(s.pendingCount(), 0);
});

test("cancelling a trip closes it", () => {
  const s = createTripStore({ storageKey: "k" });
  const newId = ids();
  applyStartLoad(s, buildStartLoad(input(), { now: NOW, newId }));
  cancelTrip(s, s.list("trips")[0], ME, { now: NOW, newId });
  assert.equal(openTripForDriver(s.list("trips"), ME), null);
});
