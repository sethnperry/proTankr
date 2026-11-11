import test from "node:test";
import assert from "node:assert/strict";
import { nextFreeSlot, planSnapshot, saveErrorText } from "./driverPlans.ts";

test("next free slot is the first unused of A to Z, null when full", () => {
  assert.equal(nextFreeSlot([{ slot: 1 }, { slot: 3 }]), 2);
  assert.equal(nextFreeSlot([1, 2, 3, 4, 5].map((slot) => ({ slot }))), 6);
  assert.equal(nextFreeSlot(Array.from({ length: 26 }, (_, i) => ({ slot: i + 1 }))), null);
});
test("snapshot matches the Planner's shape; a replaced plan keeps its CG and name", () => {
  const plan = { 1: { empty: false, productId: "p" } };
  const fresh = planSnapshot(plan, null, 5);
  assert.deepEqual([fresh.v, fresh.terminalId, fresh.cgSlider, fresh.savedAt], [1, "__universal__", 0.5, 5]);
  assert.equal("name" in fresh, false);
  const kept = planSnapshot(plan, { cgSlider: 0.62, name: "Default" }, 5);
  assert.deepEqual([kept.cgSlider, (kept as any).name], [0.62, "Default"]);
});
test("a blocked write reads as the missing access rule", () => {
  assert.match(saveErrorText('new row violates row-level security policy for table "user_plan_slots"'), /access rule/);
  assert.equal(saveErrorText("boom"), "boom");
});
