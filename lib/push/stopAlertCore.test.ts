import test from "node:test";
import assert from "node:assert/strict";
import { dropFuelStops, planStopNotice, type StopTrip } from "./stopAlertCore.ts";

const stop = { at: "2026-10-26T14:42:00.000Z", code: "ON", resumedAt: null, droveFrom: "2026-10-26T13:00:00.000Z" };
const base: StopTrip = { started_at: "2026-10-26T12:00:00Z", pickups: [{ seq: 1, arrived_at: null, left_at: null, outcome: null, name: "Marathon" }], deliveries: [] };

test("waiting on an arrival: asks about it", () => {
  const n = planStopNotice(base, [stop], 0, undefined, Date.parse(stop.at) + 16 * 60_000);
  assert.equal(n?.kind, "arrive");
  assert.equal(n!.title, "Did you arrive at Marathon?");
  assert.equal(n!.body, "");
});
test("at a rack and drove elsewhere: rack hop", () => {
  const t: StopTrip = { ...base, pickups: [{ seq: 1, arrived_at: "2026-10-26T12:30:00Z", left_at: null, outcome: null, name: "Marathon" }] };
  assert.equal(planStopNotice(t, [stop], 0, undefined, Date.parse(stop.at) + 16 * 60_000, 9)?.kind, "hop");
});
test("already announced or already recorded stops send nothing", () => {
  assert.equal(planStopNotice(base, [stop], Date.parse(stop.at)), null);
  const t: StopTrip = { ...base, pickups: [{ seq: 1, arrived_at: "2026-10-26T14:50:00Z", left_at: "2026-10-26T15:00:00Z", outcome: null, name: "Marathon" }] };
  assert.equal(planStopNotice(t, [stop], 0), null);
});
test("nothing waiting: no push", () => {
  const t: StopTrip = { ...base, pickups: [{ seq: 1, arrived_at: "2026-10-26T12:30:00Z", left_at: "2026-10-26T13:00:00Z", outcome: null, name: "M" }] };
  assert.equal(planStopNotice(t, [stop], 0), null);
});

test("waits five minutes after the stop", () => {
  assert.equal(planStopNotice(base, [stop], 0, undefined, Date.parse(stop.at) + 2 * 60_000), null);
  assert.ok(planStopNotice(base, [stop], 0, undefined, Date.parse(stop.at) + 5 * 60_000));
});
test("a stop inside a fuel stop is dropped", () => {
  const fuel = [{ started_at: "2026-10-26T14:45:00Z", completed_at: null }];
  assert.equal(dropFuelStops([stop], fuel).length, 0);
  assert.equal(dropFuelStops([stop], [{ started_at: "2026-10-26T18:00:00Z", completed_at: null }]).length, 1);
});

test("a stop while still at the rack you arrived at asks nothing (moving up in line)", () => {
  const trip = { started_at: "2026-10-26T12:00:00.000Z", pickups: [{ seq: 1, arrived_at: "2026-10-26T13:00:00.000Z", left_at: null, outcome: null, name: "Buckey North" }], deliveries: [] };
  const s = { at: "2026-10-26T14:42:00.000Z", code: "ON", resumedAt: null, droveFrom: "2026-10-26T14:00:00.000Z" };
  const now = Date.parse("2026-10-26T15:00:00.000Z");
  assert.equal(planStopNotice(trip as any, [s], 0, "America/New_York", now, 0.1), null);
  assert.equal(planStopNotice(trip as any, [s], 0, "America/New_York", now, 8)?.kind, "hop");
  assert.equal(planStopNotice(trip as any, [s], 0, "America/New_York", now, null), null);
});

test("no 'Did you arrive?' while the truck is nowhere near the next stop", () => {
  const stop = { at: "2026-10-29T22:30:00Z", code: "ON", resumedAt: null, droveFrom: "x" };
  const now = Date.parse(stop.at) + 16 * 60_000;
  const trip: StopTrip = {
    started_at: "2026-10-29T20:00:00Z",
    pickups: [{ seq: 1, arrived_at: "2026-10-29T21:00:00Z", left_at: "2026-10-29T22:00:00Z", outcome: "loaded", name: "Rack" }],
    deliveries: [{ seq: 1, arrived_at: null, left_at: null, status: "planned", name: "Loves" }],
  };
  assert.equal(planStopNotice(trip, [stop], 0, undefined, now, null, 12), null);               // 12 mi away
  assert.equal(planStopNotice(trip, [stop], 0, undefined, now, null, 0.4)?.title, "Did you arrive at Loves?");
  assert.equal(planStopNotice(trip, [stop], 0, undefined, now, null, null)?.kind, "arrive");   // distance unknown: still asks
});
