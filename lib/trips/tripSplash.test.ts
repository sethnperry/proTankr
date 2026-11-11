import test from "node:test";
import assert from "node:assert/strict";
import { pendingTopOffs, stageFirstPickup } from "./tripSplash.ts";

const splash = { 3: { additiveProductId: "ETH", pct: 10 } };
const bases = { 1: "87", 2: "87", 3: "87" };
const sizes = { 1: 8500, 2: 8500, 3: 8500 };

test("a rack with the additive loads it first in the splash compartment, and the straight ones it sells", () => {
  const s = stageFirstPickup({ splash, bases, sizes, rackProductIds: ["ETH"] })!;
  assert.deepEqual(s, [{ comp_number: 3, product_id: "ETH", splash: { pct: 10, aboard: 0, add: 841 } }]);
});
test("a rack with both loads the additive first and the straight compartments", () => {
  const s = stageFirstPickup({ splash, bases, sizes, rackProductIds: ["ETH", "87"] })!;
  assert.deepEqual(s.map((c) => [c.comp_number, c.product_id]), [[1, "87"], [2, "87"], [3, "ETH"]]);
});
test("a rack with only the base loads the base share of the splash compartment", () => {
  const s = stageFirstPickup({ splash, bases, sizes, rackProductIds: ["87"] })!;
  assert.deepEqual(s.map((c) => [c.comp_number, c.product_id, c.splash?.add ?? null]), [[1, "87", null], [2, "87", null], [3, "87", 7574]]);
});
test("nothing to stage without a splash or a matching rack", () => {
  assert.equal(stageFirstPickup({ splash: {}, bases, sizes, rackProductIds: ["87"] }), null);
  assert.equal(stageFirstPickup({ splash, bases, sizes, rackProductIds: ["D2"] }), null);
});
test("a splash compartment with one load aboard needs its top-off", () => {
  assert.deepEqual(pendingTopOffs({ splash, aboard: { 3: { product_id: "ETH", gallons: 841, rows: 1 } } }), [3]);
  assert.deepEqual(pendingTopOffs({ splash, aboard: { 3: { product_id: "ETH", gallons: 8400, rows: 2 } } }), []);
  assert.deepEqual(pendingTopOffs({ splash, aboard: {} }), []);
});
