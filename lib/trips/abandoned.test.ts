import test from "node:test";
import assert from "node:assert/strict";
import { abandonedTrips, reportDue, wasRedispatched, weekKey } from "./abandoned.ts";

const H = 3600000, NOW = Date.parse("2026-11-09T20:00:00Z");
const open = (o: object) => ({ tripId: "t", status: "loading", lastActivityMs: NOW - 20 * H, productAboard: false, ...o });

test("only quiet, unloaded, en-route trips are abandoned", () => {
  assert.deepEqual(abandonedTrips([open({})], NOW), ["t"]);
  assert.deepEqual(abandonedTrips([open({ lastActivityMs: NOW - 10 * H })], NOW), []);
  assert.deepEqual(abandonedTrips([open({ productAboard: true })], NOW), []);
  assert.deepEqual(abandonedTrips([open({ status: "parked" }), open({ status: "in_transit" })], NOW), []);
});
const c = { tripId: "c", driverId: "d", terminalId: "T", locationId: "L", orderNumbers: ["A-1"], createdMs: 100, cancelledMs: 200 };
test("redispatched by order number, ignoring case; without one, by driver, rack and drop", () => {
  assert.equal(wasRedispatched(c, [{ tripId: "n", driverId: "x", terminalId: "T2", locationId: "L2", orderNumbers: ["a-1"], createdMs: 300 }]), true);
  assert.equal(wasRedispatched(c, [{ tripId: "n", driverId: "d", terminalId: "T", locationId: "L", orderNumbers: ["B-2"], createdMs: 300 }]), false);
  const none = { ...c, orderNumbers: [] };
  assert.equal(wasRedispatched(none, [{ tripId: "n", driverId: "d", terminalId: "T", locationId: "L", orderNumbers: [], createdMs: 300 }]), true);
  assert.equal(wasRedispatched(none, [{ tripId: "n", driverId: "e", terminalId: "T", locationId: "L", orderNumbers: [], createdMs: 300 }]), false);
  assert.equal(wasRedispatched(c, [{ tripId: "n", driverId: "d", terminalId: "T", locationId: "L", orderNumbers: ["A-1"], createdMs: 50 }]), false);
});
test("the report is due Monday from 6am local, and the week key is that Monday", () => {
  const tz = "America/New_York";
  assert.equal(reportDue(Date.parse("2026-11-09T10:59:00Z"), tz), false); // Mon 5:59 EST
  assert.equal(reportDue(Date.parse("2026-11-09T11:00:00Z"), tz), true);  // Mon 6:00 EST
  assert.equal(reportDue(Date.parse("2026-11-10T11:00:00Z"), tz), false); // Tuesday
  assert.equal(weekKey(Date.parse("2026-11-12T15:00:00Z"), tz), "2026-11-09");
  assert.equal(weekKey(Date.parse("2026-11-09T11:00:00Z"), tz), "2026-11-09");
});
