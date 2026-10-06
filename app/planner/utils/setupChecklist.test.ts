import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSetupChecklistSteps, type LocationChecklistInput } from "./setupChecklist.ts";
import type { CompRow } from "../types.ts";
import type { PlanSnapshot } from "../types.ts";

const comps: CompRow[] = [
  { trailer_id: "t1", comp_number: 1, max_gallons: 3000, cap_gallons: 2900, position: 0, active: true },
  { trailer_id: "t1", comp_number: 2, max_gallons: 3000, cap_gallons: 2900, position: 1, active: true },
];

const NO_LOCATION: LocationChecklistInput = { hasTerminalSelected: false, hasSwitchedCity: false };
const FULL_LOCATION: LocationChecklistInput = { hasTerminalSelected: true, hasSwitchedCity: true };

function snap(compPlan: PlanSnapshot["compPlan"], extra?: Partial<PlanSnapshot>): PlanSnapshot {
  return { v: 1, savedAt: 0, terminalId: "term1", compPlan, ...extra };
}

test("no saved plans, no location -- all three steps pending", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, NO_LOCATION);
  assert.equal(steps.length, 3);
  assert.equal(steps[0].done, false);
  assert.equal(steps[1].done, false);
  assert.equal(steps[2].done, false);
});

test("location step: terminal picked but city never switched -- pending, with one sub-item done", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, { hasTerminalSelected: true, hasSwitchedCity: false });
  assert.equal(steps[0].done, false);
  assert.equal(steps[0].subItems?.[0].done, true);
  assert.equal(steps[0].subItems?.[1].done, false);
});

test("location step: both sub-items done -- step done", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, FULL_LOCATION);
  assert.equal(steps[0].done, true);
  assert.ok(steps[0].subItems?.every((s) => s.done));
});

test("plan A partially filled -- step 2 still pending", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" } });
  const steps = computeSetupChecklistSteps(comps, planA, null, NO_LOCATION);
  assert.equal(steps[1].done, false);
});

test("plan A fully resolved (one product, one explicit MT) -- step 2 done", () => {
  const planA = snap({
    1: { empty: false, productId: "diesel" },
    2: { empty: true, productId: "" },
  });
  const steps = computeSetupChecklistSteps(comps, planA, null, NO_LOCATION);
  assert.equal(steps[1].done, true);
});

test("plan B same products as plan A -- step 3 pending even with cap/CG adjusted", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap(
    { 1: { empty: false, productId: "diesel", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    { cgSlider: 0.7 }
  );
  const steps = computeSetupChecklistSteps(comps, planA, planB, NO_LOCATION);
  assert.equal(steps[2].done, false);
});

test("plan B different products but no cap override -- step 3 pending", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap({ 1: { empty: false, productId: "regular" }, 2: { empty: false, productId: "gas" } }, { cgSlider: 0.7 });
  const steps = computeSetupChecklistSteps(comps, planA, planB, NO_LOCATION);
  assert.equal(steps[2].done, false);
});

test("plan B different products, cap override, default CG -- step 3 pending (CG untouched)", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap(
    { 1: { empty: false, productId: "regular", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    { cgSlider: 0.5 }
  );
  const steps = computeSetupChecklistSteps(comps, planA, planB, NO_LOCATION);
  assert.equal(steps[2].done, false);
});

test("plan B fully meets every requirement -- step 3 done", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap(
    { 1: { empty: false, productId: "regular", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    { cgSlider: 0.72 }
  );
  const steps = computeSetupChecklistSteps(comps, planA, planB, NO_LOCATION);
  assert.equal(steps[2].done, true);
});

test("CG exactly at default is not adjusted, just past the tolerance is", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planBAtDefault = snap(
    { 1: { empty: false, productId: "regular", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    { cgSlider: 0.5 }
  );
  const planBJustOver = snap(
    { 1: { empty: false, productId: "regular", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    { cgSlider: 0.502 }
  );
  assert.equal(computeSetupChecklistSteps(comps, planA, planBAtDefault, NO_LOCATION)[2].done, false);
  assert.equal(computeSetupChecklistSteps(comps, planA, planBJustOver, NO_LOCATION)[2].done, true);
});

test("empty compartments array never reads as complete", () => {
  const planA = snap({});
  const steps = computeSetupChecklistSteps([], planA, null, NO_LOCATION);
  assert.equal(steps[1].done, false);
});
