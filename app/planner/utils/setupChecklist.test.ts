import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSetupChecklistSteps, type LocationChecklistInput, type LiveCompartmentPlanInput } from "./setupChecklist.ts";
import type { CompRow } from "../types.ts";
import type { PlanSnapshot } from "../types.ts";

const comps: CompRow[] = [
  { trailer_id: "t1", comp_number: 1, max_gallons: 3000, cap_gallons: 2900, position: 0, active: true },
  { trailer_id: "t1", comp_number: 2, max_gallons: 3000, cap_gallons: 2900, position: 1, active: true },
];

const NO_LOCATION: LocationChecklistInput = { hasTerminalSelected: false, hasSwitchedCity: false };
const FULL_LOCATION: LocationChecklistInput = { hasTerminalSelected: true, hasSwitchedCity: true };
const NO_LIVE: LiveCompartmentPlanInput = { activeSlotLetter: 0, compPlan: {}, cgSlider: 0.5 };

function snap(compPlan: PlanSnapshot["compPlan"], extra?: Partial<PlanSnapshot>): PlanSnapshot {
  return { v: 1, savedAt: 0, terminalId: "term1", compPlan, ...extra };
}
function byId(step: ReturnType<typeof computeSetupChecklistSteps>[number], id: string) {
  const sub = step.subItems?.find((s) => s.id === id);
  if (!sub) throw new Error(`sub-item ${id} not found on step ${step.id}`);
  return sub;
}

test("no saved plans, no location, nothing active -- all three steps pending, all sub-items pending", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, NO_LOCATION, NO_LIVE);
  assert.equal(steps.length, 3);
  assert.equal(steps[0].done, false);
  assert.equal(steps[1].done, false);
  assert.equal(steps[2].done, false);
  assert.ok(steps[1].subItems?.every((s) => !s.done));
});

test("location step: terminal picked but city never switched -- pending, with one sub-item done", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, { hasTerminalSelected: true, hasSwitchedCity: false }, NO_LIVE);
  assert.equal(steps[0].done, false);
  assert.equal(steps[0].subItems?.[0].done, true);
  assert.equal(steps[0].subItems?.[1].done, false);
});

test("location step: both sub-items done -- step done", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, FULL_LOCATION, NO_LIVE);
  assert.equal(steps[0].done, true);
  assert.ok(steps[0].subItems?.every((s) => s.done));
});

test("plan A: live editing while A is active checks off comp sub-items before any save", () => {
  const live: LiveCompartmentPlanInput = {
    activeSlotLetter: 1,
    compPlan: { 1: { empty: false, productId: "diesel" } }, // comp 2 still untouched
    cgSlider: 0.5,
  };
  const steps = computeSetupChecklistSteps(comps, null, null, NO_LOCATION, live);
  const planA = steps[1];
  assert.equal(byId(planA, "plan-a-comp-1").done, true);
  assert.equal(byId(planA, "plan-a-comp-2").done, false);
  // Nothing saved yet -- the step itself and "Save plan A" stay pending
  // even though a comp is live-resolved.
  assert.equal(planA.done, false);
  assert.equal(byId(planA, "save-plan-a").done, false);
});

test("plan A: not the active slot -- comp sub-items ignore live edits, read the saved snapshot instead", () => {
  const planASaved = snap({ 1: { empty: false, productId: "diesel" } }); // only comp 1 saved
  const live: LiveCompartmentPlanInput = {
    activeSlotLetter: 2, // driver has moved on to Plan B
    compPlan: {}, // Plan B's live edits happen to be empty right now
    cgSlider: 0.5,
  };
  const steps = computeSetupChecklistSteps(comps, planASaved, null, NO_LOCATION, live);
  const planA = steps[1];
  // Must reflect the SAVED snapshot (comp 1 done, comp 2 not), never the
  // live compPlan (which would show both comps unresolved) -- this is the
  // exact cross-contamination bug this design avoids.
  assert.equal(byId(planA, "plan-a-comp-1").done, true);
  assert.equal(byId(planA, "plan-a-comp-2").done, false);
});

test("plan A fully resolved and saved -- step and save sub-item both done", () => {
  const planA = snap({
    1: { empty: false, productId: "diesel" },
    2: { empty: true, productId: "" },
  });
  const steps = computeSetupChecklistSteps(comps, planA, null, NO_LOCATION, NO_LIVE);
  assert.equal(steps[1].done, true);
  assert.equal(byId(steps[1], "save-plan-a").done, true);
});

test("plan B live sub-items (different products/cap/CG) update while B is active, before saving", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const live: LiveCompartmentPlanInput = {
    activeSlotLetter: 2,
    compPlan: { 1: { empty: false, productId: "regular", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    cgSlider: 0.7,
  };
  const steps = computeSetupChecklistSteps(comps, planA, null, NO_LOCATION, live);
  const planB = steps[2];
  assert.equal(byId(planB, "plan-b-different-products").done, true); // comp 1 differs live
  assert.equal(byId(planB, "plan-b-cap").done, true);
  assert.equal(byId(planB, "plan-b-cg").done, true);
  // Still not saved -- the step and its save sub-item stay pending.
  assert.equal(planB.done, false);
  assert.equal(byId(planB, "save-plan-b").done, false);
});

test("plan B same products as plan A -- step pending even with cap/CG adjusted", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap(
    { 1: { empty: false, productId: "diesel", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    { cgSlider: 0.7 }
  );
  const steps = computeSetupChecklistSteps(comps, planA, planB, NO_LOCATION, NO_LIVE);
  assert.equal(steps[2].done, false);
});

test("plan B different products but no cap override -- pending", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap({ 1: { empty: false, productId: "regular" }, 2: { empty: false, productId: "gas" } }, { cgSlider: 0.7 });
  const steps = computeSetupChecklistSteps(comps, planA, planB, NO_LOCATION, NO_LIVE);
  assert.equal(steps[2].done, false);
});

test("plan B different products, cap override, default CG -- pending (CG untouched)", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap(
    { 1: { empty: false, productId: "regular", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    { cgSlider: 0.5 }
  );
  const steps = computeSetupChecklistSteps(comps, planA, planB, NO_LOCATION, NO_LIVE);
  assert.equal(steps[2].done, false);
});

test("plan B fully meets every requirement and is saved -- step done", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap(
    { 1: { empty: false, productId: "regular", capOverride: 2500 }, 2: { empty: false, productId: "gas" } },
    { cgSlider: 0.72 }
  );
  const steps = computeSetupChecklistSteps(comps, planA, planB, NO_LOCATION, NO_LIVE);
  assert.equal(steps[2].done, true);
  assert.equal(byId(steps[2], "save-plan-b").done, true);
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
  assert.equal(computeSetupChecklistSteps(comps, planA, planBAtDefault, NO_LOCATION, NO_LIVE)[2].done, false);
  assert.equal(computeSetupChecklistSteps(comps, planA, planBJustOver, NO_LOCATION, NO_LIVE)[2].done, true);
});

test("empty compartments array never reads as complete", () => {
  const planA = snap({});
  const steps = computeSetupChecklistSteps([], planA, null, NO_LOCATION, NO_LIVE);
  assert.equal(steps[1].done, false);
});
