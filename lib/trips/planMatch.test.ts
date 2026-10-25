import test from "node:test";
import assert from "node:assert/strict";
import { layoutKey, sameLayout, findMatchingPlan, layoutFromProducts, layoutHasProduct } from "./planMatch.ts";

test("empty compartments are part of the layout", () => {
  assert.equal(sameLayout(["d2", null, "d2"], ["d2", null, "d2"]), true);
  assert.equal(sameLayout(["d2", null, "d2"], ["d2", "d2", null]), false);
  assert.notEqual(layoutKey(["a", null]), layoutKey([null, "a"]));
});

test("finds the driver's plan with the same layout, lowest slot first", () => {
  const plans = [
    { slot: 3, comps: ["d2", null, "d2"] as (string | null)[] },
    { slot: 1, comps: ["d2", "d2", "d2"] as (string | null)[] },
    { slot: 2, comps: ["d2", null, "d2"] as (string | null)[] },
  ];
  assert.equal(findMatchingPlan(plans, ["d2", null, "d2"])?.slot, 2);
  assert.equal(findMatchingPlan(plans, ["87", null, "d2"]), null);
});

test("a layout with no product never matches", () => {
  assert.equal(findMatchingPlan([{ slot: 1, comps: [null, null] }], [null, null]), null);
  assert.equal(layoutHasProduct([null]), false);
});

test("layoutFromProducts orders highest compartment first and fills gaps with null", () => {
  assert.deepEqual(layoutFromProducts({ 1: "a", 3: "b" }, [1, 2, 3]), ["b", null, "a"]);
  assert.deepEqual(layoutFromProducts({ 1: "", 2: "x" }, []), ["x", null]);
});
