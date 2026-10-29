import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTripRoute, elapsed, truckStartPlace, type Place } from "./fleetProgress.ts";

const trip: any = { trip_id: "t", status: "in_transit", started_at: "2026-10-12T10:00:00Z" };
const p = (over: any = {}): any => ({ pickup_id: "p1", trip_id: "t", seq: 1, name: "Marathon", city: "Tampa", state: "FL", arrived_at: null, begin_at: null, left_at: null, load_id: null, ...over });
const d = (over: any = {}): any => ({ delivery_id: "d1", trip_id: "t", seq: 1, location_id: "L1", one_off_name: null, status: "planned", arrived_at: null, begin_at: null, left_at: null, ...over });
const locs = new Map<string, Place>([["L1", { name: "Store 12", city: "Lakeland", state: "FL", number: "12" }], ["L2", { name: "Store 40", city: "Plant City", state: "FL" }]]);
const start: Place = { name: "Yard", city: "Brandon", state: "FL" };

test("one row: origin left, terminal in the middle, store on the right", () => {
  const r = buildTripRoute(trip, [p()], [d()], locs, start);
  assert.deepEqual(r.nodes.map((n) => [n.kind, n.row, n.x, n.label]), [
    ["start", "top", 0, "Brandon"], ["pickup", "top", 0.5, "MA - Tampa"], ["delivery", "top", 1, "#12 - Lakeland"],
  ]);
  assert.equal(r.position.at, 1);
  assert.equal(r.position.enRoute, true);
  assert.equal(r.status, "En route to Marathon");
});

test("progress through loading, delivery, two drops", () => {
  let r = buildTripRoute(trip, [p({ arrived_at: "2026-10-12T11:00:00Z", begin_at: "2026-10-12T11:20:00Z", load_id: "L" })], [d()], locs, start);
  assert.equal(r.status, "Loading at Marathon");
  assert.equal(r.nodes[1].state, "current");
  assert.equal(r.since, "2026-10-12T11:20:00Z");

  const loaded = p({ arrived_at: "a", left_at: "2026-10-12T12:00:00Z" });
  r = buildTripRoute(trip, [loaded], [d(), d({ delivery_id: "d2", seq: 2, location_id: "L2" })], locs, start);
  assert.deepEqual(r.nodes.filter((n) => n.kind === "delivery").map((n) => [n.label, n.x]), [["#12 - Lakeland", 2 / 3], ["Store 40 - Plant City", 1]]);
  assert.equal(r.status, "En route to Store 12");
  assert.equal(r.since, "2026-10-12T12:00:00Z");

  r = buildTripRoute(trip, [loaded], [d({ status: "complete", left_at: "2026-10-12T13:00:00Z" }), d({ delivery_id: "d2", seq: 2, location_id: "L2", arrived_at: "x" })], locs, start);
  assert.equal(r.position.at, 3);
  assert.equal(r.status, "Arrived at Store 40");
});

test("rack hop is skipped, parked trips say so, unknown start", () => {
  const r = buildTripRoute({ ...trip, status: "parked", parked_where: "Yard", parked_at: "z" },
    [p({ outcome: "no_load", left_at: "1" }), p({ pickup_id: "p2", seq: 2, name: "Citgo", left_at: "2" })], [d()], locs, null);
  assert.equal(r.nodes[0].label, "Start");
  assert.equal(r.nodes[1].state, "skipped");
  assert.equal(r.nodes[1].x, 1 / 3);
  assert.equal(r.status, "Parked at Yard");
  const none = buildTripRoute(trip, [p({ left_at: "1" })], [], locs, start);
  assert.equal(none.status, "Loaded · no delivery set");
});

test("elapsed and start place", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  assert.equal(elapsed("2026-10-12T11:18:00Z", now), "42m");
  assert.equal(elapsed("2026-10-12T08:50:00Z", now), "3h 10m");
  assert.equal(elapsed(null, now), null);
  const place = truckStartPlace([
    { left_at: "2026-10-11T10:00:00Z", place: { name: "A", city: "Old", state: null } },
    { left_at: "2026-10-12T09:00:00Z", place: { name: "B", city: "Recent", state: null } },
    { left_at: "2026-10-12T15:00:00Z", place: { name: "C", city: "After", state: null } },
  ], "2026-10-12T10:00:00Z");
  assert.equal(place?.city, "Recent");
});
