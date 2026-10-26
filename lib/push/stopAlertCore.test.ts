import test from "node:test";
import assert from "node:assert/strict";
import { planStopNotice, type StopTrip } from "./stopAlertCore.ts";

const stop = { at: "2026-10-26T14:42:00.000Z", code: "ON", resumedAt: null, droveFrom: "2026-10-26T13:00:00.000Z" };
const base: StopTrip = { started_at: "2026-10-26T12:00:00Z", pickups: [{ seq: 1, arrived_at: null, left_at: null, outcome: null, name: "Marathon" }], deliveries: [] };

test("waiting on an arrival: asks about it", () => {
  const n = planStopNotice(base, [stop], 0);
  assert.equal(n?.kind, "arrive");
  assert.match(n!.body, /Marathon/);
});
test("at a rack and drove elsewhere: rack hop", () => {
  const t: StopTrip = { ...base, pickups: [{ seq: 1, arrived_at: "2026-10-26T12:30:00Z", left_at: null, outcome: null, name: "Marathon" }] };
  assert.equal(planStopNotice(t, [stop], 0)?.kind, "hop");
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
