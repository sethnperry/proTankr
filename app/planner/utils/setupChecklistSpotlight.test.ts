import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSpotlightStep } from "./setupChecklistSpotlight.ts";
import { computeSetupChecklistSteps, type LocationChecklistInput, type LiveCompartmentPlanInput } from "./setupChecklist.ts";
import type { CompRow, PlanSnapshot } from "../types.ts";

const comps: CompRow[] = [
  { trailer_id: "t1", comp_number: 1, max_gallons: 3000, cap_gallons: 2900, position: 0, active: true },
  { trailer_id: "t1", comp_number: 2, max_gallons: 3000, cap_gallons: 2900, position: 1, active: true },
];

const NO_LOCATION: LocationChecklistInput = { hasTerminalSelected: false, hasSwitchedCity: false };
const FULL_LOCATION: LocationChecklistInput = { hasTerminalSelected: true, hasSwitchedCity: true };
const NO_LIVE: LiveCompartmentPlanInput = { activeSlotLetter: 0, compPlan: {} };

function snap(compPlan: PlanSnapshot["compPlan"]): PlanSnapshot {
  return { v: 1, savedAt: 0, terminalId: "term1", compPlan };
}

test("nothing done yet -- points at the location icon, 'pick a starting location'", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, NO_LOCATION, NO_LIVE);
  const step = computeSpotlightStep(steps, 0);
  assert.equal(step?.target, "location-icon");
  assert.match(step!.caption, /pick a starting location/);
});

test("location picked but city never switched -- still the location icon, now 'switch cities'", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, { hasTerminalSelected: true, hasSwitchedCity: false }, NO_LIVE);
  const step = computeSpotlightStep(steps, 0);
  assert.equal(step?.target, "location-icon");
  assert.match(step!.caption, /switch to a terminal in a different city/);
});

test("location done, plan A untouched -- points at compartments", () => {
  const steps = computeSetupChecklistSteps(comps, null, null, FULL_LOCATION, NO_LIVE);
  const step = computeSpotlightStep(steps, 1);
  assert.equal(step?.target, "compartments");
});

test("location done, plan A compartments resolved but not saved -- points at Save plan", () => {
  const live: LiveCompartmentPlanInput = {
    activeSlotLetter: 1,
    compPlan: { 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } },
  };
  const steps = computeSetupChecklistSteps(comps, null, null, FULL_LOCATION, live);
  const step = computeSpotlightStep(steps, 1);
  assert.equal(step?.target, "save-plan");
});

test("plan A saved, plan B not started, not on slot B -- points at the plan-letter icon", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const steps = computeSetupChecklistSteps(comps, planA, null, FULL_LOCATION, NO_LIVE);
  const step = computeSpotlightStep(steps, 1); // still viewing A
  assert.equal(step?.target, "switch-to-plan-b");
});

test("plan A saved, now on slot B with nothing set -- points at compartments", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const live: LiveCompartmentPlanInput = { activeSlotLetter: 2, compPlan: {} };
  const steps = computeSetupChecklistSteps(comps, planA, null, FULL_LOCATION, live);
  const step = computeSpotlightStep(steps, 2);
  assert.equal(step?.target, "compartments");
});

test("plan A saved, on slot B with different products resolved but not saved -- points at Save plan", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const live: LiveCompartmentPlanInput = {
    activeSlotLetter: 2,
    compPlan: { 1: { empty: false, productId: "regular" }, 2: { empty: false, productId: "gas" } },
  };
  const steps = computeSetupChecklistSteps(comps, planA, null, FULL_LOCATION, live);
  const step = computeSpotlightStep(steps, 2);
  assert.equal(step?.target, "save-plan");
});

test("everything done -- no spotlight step", () => {
  const planA = snap({ 1: { empty: false, productId: "diesel" }, 2: { empty: false, productId: "gas" } });
  const planB = snap({ 1: { empty: false, productId: "regular" }, 2: { empty: false, productId: "gas" } });
  const steps = computeSetupChecklistSteps(comps, planA, planB, FULL_LOCATION, NO_LIVE);
  const step = computeSpotlightStep(steps, 2);
  assert.equal(step, null);
});
