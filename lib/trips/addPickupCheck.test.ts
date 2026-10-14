import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAddPickup, grossColor, readPlannedComps } from "./addPickupCheck.ts";

const on = (...n: number[]) => n.map((comp_number) => ({ comp_number }));

test("all compartments loaded blocks", () => {
  const r = checkAddPickup({ compNumbers: [1, 2, 3], onBoard: on(1, 2, 3), gross: 70000, target: 79500 });
  assert.equal(r.level, "full");
  assert.equal(r.canAdd, false);
});

test("empty compartment under target is allowed", () => {
  const r = checkAddPickup({ compNumbers: [1, 2, 3], onBoard: on(1, 3), gross: 70000, target: 79500 });
  assert.equal(r.level, "ok");
  assert.deepEqual(r.emptyComps, [2]);
  assert.equal(r.canAdd, true);
});

test("near and over target warn but allow; legal blocks", () => {
  assert.equal(checkAddPickup({ compNumbers: [1, 2], onBoard: on(1), gross: 79200, target: 79500 }).level, "near_target");
  const over = checkAddPickup({ compNumbers: [1, 2], onBoard: on(1), gross: 79700, target: 79500 });
  assert.equal(over.level, "over_target");
  assert.equal(over.canAdd, true);
  const legal = checkAddPickup({ compNumbers: [1, 2], onBoard: on(1), gross: 80000, target: 79500 });
  assert.equal(legal.level, "over_legal");
  assert.equal(legal.canAdd, false);
});

test("no compartments known blocks", () => {
  assert.equal(checkAddPickup({ compNumbers: [], onBoard: on(1), gross: null, target: null }).canAdd, false);
});

test("gross color and planned comps parsing", () => {
  assert.equal(grossColor(80100, 79500), "#ef4444");
  assert.equal(grossColor(79500, 79500), "#4ade80");
  assert.equal(grossColor(70000, 79500), "#fff");
  assert.deepEqual(readPlannedComps([{ comp_number: 2, product_id: "p" }, { comp_number: "x" }]), [{ comp_number: 2, product_id: "p" }]);
  assert.equal(readPlannedComps(null), null);
});
