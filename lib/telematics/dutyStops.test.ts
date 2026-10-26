import test from "node:test";
import assert from "node:assert/strict";
import { drivingStops } from "./dutyStops.ts";

const log = (t: string, status: string) => ({ dateTime: t, status, eventType: 1 });
const NOW = Date.parse("2026-10-26T18:00:00Z");

test("a change away from driving is a stop, with when driving resumed", () => {
  const s = drivingStops([log("2026-10-26T12:00:00Z", "D"), log("2026-10-26T14:00:00Z", "ON"), log("2026-10-26T15:00:00Z", "D")], NOW);
  assert.deepEqual(s, [{ at: "2026-10-26T14:00:00.000Z", code: "ON", droveFrom: "2026-10-26T12:00:00.000Z", resumedAt: "2026-10-26T15:00:00.000Z" }]);
});
test("still stopped has no resume time", () => {
  const s = drivingStops([log("2026-10-26T12:00:00Z", "D"), log("2026-10-26T16:30:00Z", "OFF")], NOW);
  assert.equal(s[0].resumedAt, null);
});
test("old stops and blips are dropped", () => {
  assert.equal(drivingStops([log("2026-10-24T12:00:00Z", "D"), log("2026-10-24T13:00:00Z", "ON")], NOW).length, 0);
  assert.equal(drivingStops([log("2026-10-26T12:00:00Z", "D"), log("2026-10-26T14:00:00Z", "ON"), log("2026-10-26T14:00:30Z", "D")], NOW).length, 0);
});
