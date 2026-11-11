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

import { blendLabel, blendPct, offTarget, stageGallons, stopLayouts, topOff } from "./splash.ts";

test("stage gallons: a 1% cushion, then the additive's share", () => {
  assert.deepEqual(stageGallons({ volume: 8500, pct: 10 }), { total: 8415, additive: 841, base: 7574 });
  assert.deepEqual(stageGallons({ volume: 8500, pct: 0 }), { total: 8415, additive: 0, base: 8415 });
});
test("top-off after the additive went in first puts the base on top", () => {
  const t = topOff({ firstIsAdditive: true, aboard: 841, pct: 10, max: 8500 });
  assert.equal(t.add, 7569);
  assert.equal(t.limitedBy, "none");
  assert.equal(Math.round(t.blend!), 10);
});
test("top-off after the base went in first puts the additive on top", () => {
  const t = topOff({ firstIsAdditive: false, aboard: 7500, pct: 10, max: 8500 });
  assert.equal(t.add, 833);
  assert.equal(Math.round(t.blend!), 10);
});
test("weight can hold the top-off short, which leaves the blend richer", () => {
  const t = topOff({ firstIsAdditive: true, aboard: 850, pct: 10, max: 8500, maxByWeight: 6000 });
  assert.deepEqual([t.add, t.limitedBy], [6000, "weight"]);
  assert.ok(t.blend! > 10);
  assert.equal(offTarget(t.blend!, 10), true);
});
test("room holds the top-off too", () => {
  const t = topOff({ firstIsAdditive: true, aboard: 1500, pct: 10, max: 8500 });
  assert.deepEqual([t.add, t.limitedBy], [7000, "room"]);
});
test("labels and the actual blend", () => {
  assert.equal(blendLabel(10.4), "E10");
  assert.equal(blendLabel(14.6), "E15");
  assert.equal(Math.round(blendPct(850, 7650)!), 10);
  assert.equal(offTarget(10.9, 10), false);
});
test("stop layouts: additive in the splash compartments, base in every filled one", () => {
  const l = stopLayouts({
    1: { productId: "87" },
    2: { productId: "87" },
    3: { productId: "87", splash: { additiveProductId: "ETH", pct: 10 } },
    4: { productId: "", empty: true },
  });
  assert.deepEqual(l.additive, { 3: "ETH" });
  assert.deepEqual(l.base, { 1: "87", 2: "87", 3: "87" });
});
