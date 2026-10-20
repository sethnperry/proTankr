import test from "node:test";
import assert from "node:assert/strict";
import { buildDispatchedTrip, runOrder, swapRunOrder, type DispatchLeg } from "./dispatchTrip.ts";

let n = 0;
const newId = () => `id${++n}`;
const leg: DispatchLeg = {
  terminalId: "T", terminalName: "Marathon", city: "Tampa", state: "FL", locationId: "L", deliveryType: "drop",
  supplierId: "S", orderNumber: " 4816492 ", startMs: Date.UTC(2026, 9, 21, 10), endMs: Date.UTC(2026, 9, 21, 15),
  truckId: "tr", trailerId: "tl", warnings: ["Shift 12.4 h"],
};

test("a dispatched trip carries the plan and no truck yet", () => {
  const r = buildDispatchedTrip({ companyId: "c", dispatcherId: "disp", driverId: "drv", leg, seq: 2 }, { now: new Date("2026-10-20T12:00:00Z"), newId });
  assert.equal(r.trip.status, "dispatched");
  assert.equal(r.trip.driver_id, "drv");
  assert.equal(r.trip.created_by, "disp");
  assert.equal(r.trip.truck_id, null);
  assert.equal(r.trip.planned_truck_id, "tr");
  assert.equal(r.trip.dispatch_seq, 2);
  assert.equal(r.orders[0].order_number, "4816492");
  assert.equal((r.pickups[0] as any).supplier_id, "S");
  assert.equal((r.pickups[0] as any).trip_id, r.trip.trip_id);
  assert.equal((r.deliveries[0] as any).status, "planned");
  assert.deepEqual((r.events[0] as any).payload.warnings, ["Shift 12.4 h"]);
});

test("no order number leaves it blank for the driver", () => {
  const r = buildDispatchedTrip({ companyId: "c", dispatcherId: "d", driverId: "x", leg: { ...leg, orderNumber: "  " }, seq: 1 }, { now: new Date(), newId });
  assert.equal(r.orders[0].order_number, null);
});

test("run order: planned start, then sequence", () => {
  const out = runOrder([
    { dispatch_seq: 2, planned_start_at: "2026-10-21T15:00:00Z" },
    { dispatch_seq: 1, planned_start_at: "2026-10-21T10:00:00Z" },
  ]);
  assert.deepEqual(out.map((t) => t.dispatch_seq), [1, 2]);
});

test("swapRunOrder trades time and sequence", () => {
  const [x, y] = swapRunOrder(
    { trip_id: "a", planned_start_at: "2026-10-21T10:00:00Z", dispatch_seq: 1 },
    { trip_id: "b", planned_start_at: "2026-10-21T15:00:00Z", dispatch_seq: 2 },
  );
  assert.equal(x.planned_start_at, "2026-10-21T15:00:00Z");
  assert.equal(x.dispatch_seq, 2);
  assert.equal(y.planned_start_at, "2026-10-21T10:00:00Z");
  assert.equal(y.dispatch_seq, 1);
});
