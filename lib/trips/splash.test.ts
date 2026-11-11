import test from "node:test";
import assert from "node:assert/strict";
import { canSplashInto, splashPlan } from "./splash.ts";

test("10% ethanol: 850 aboard in an 8,500 compartment takes 7,650 on top", () => {
  const p = splashPlan({ max: 8500, aboard: 850, pct: 10 });
  assert.deepEqual([p.add, p.short, p.total, p.room], [7650, false, 8500, 7650]);
  assert.equal(Math.round(p.blend!), 10);
});
test("15% of 600 aboard needs 3,400 on top", () => {
  const p = splashPlan({ max: 8500, aboard: 600, pct: 15 });
  assert.equal(p.add, 3400);
  assert.equal(Math.round(p.blend!), 15);
});
test("short room: too much aboard for the percent holds the load to the room and shows the real blend", () => {
  const p = splashPlan({ max: 8500, aboard: 1500, pct: 10 }); // needs 13,500, room 7,000
  assert.deepEqual([p.add, p.short], [7000, true]);
  assert.equal(Math.round(p.blend!), 18);
});
test("a bad percent or nothing aboard loads nothing", () => {
  assert.equal(splashPlan({ max: 8500, aboard: 800, pct: 0 }).add, 0);
  assert.equal(splashPlan({ max: 8500, aboard: 800, pct: 100 }).add, 0);
  assert.equal(splashPlan({ max: 8500, aboard: 0, pct: 10 }).add, 0);
});
test("only a loaded compartment with room that isn't already blended takes a splash", () => {
  assert.equal(canSplashInto({ max: 8500, aboard: 850, rows: 1 }), true);
  assert.equal(canSplashInto({ max: 8500, aboard: 850, rows: 2 }), false);
  assert.equal(canSplashInto({ max: 8500, aboard: 8500, rows: 1 }), false);
  assert.equal(canSplashInto({ max: 8500, aboard: null, rows: 1 }), false);
});
