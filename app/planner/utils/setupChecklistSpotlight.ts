// app/planner/utils/setupChecklistSpotlight.ts
//
// Pure "where should the look-here highlight point right now" derivation
// for the Setup Guide -- kept separate from utils/setupChecklist.ts's own
// done/pending derivation (that file is about WHAT counts as done; this
// one is about WHERE to point the finger, a UI-layer concern that doesn't
// belong in the same pure data model). Same "derive from real data, never
// a separate tracked flag" rule: this is recomputed fresh from the same
// ChecklistStep[] the checklist card itself renders from, every render --
// so the spotlight can never point at a step that's already done, or fail
// to notice one that just became done.

import type { ChecklistStep } from "./setupChecklist";

export type SpotlightTarget = "location-icon" | "compartments" | "save-plan" | "switch-to-plan-b";

export type SpotlightStep = { target: SpotlightTarget; caption: string };

export function computeSpotlightStep(steps: ChecklistStep[], activeSlotLetter: number): SpotlightStep | null {
  const locationStep = steps.find((s) => s.id === "location");
  const planAStep = steps.find((s) => s.id === "plan-a");
  const planBStep = steps.find((s) => s.id === "plan-b");
  if (!locationStep || !planAStep || !planBStep) return null;

  if (!locationStep.done) {
    const pickDone = locationStep.subItems?.find((s) => s.id === "pick-location")?.done ?? false;
    return {
      target: "location-icon",
      caption: pickDone
        ? "Tap here again, then switch to a terminal in a different city."
        : "Tap here to pick a starting location.",
    };
  }

  if (!planAStep.done) {
    const compsDone = planAStep.subItems?.filter((s) => s.id.startsWith("plan-a-comp-")).every((s) => s.done) ?? false;
    return compsDone
      ? { target: "save-plan", caption: "Tap here to save Plan A." }
      : { target: "compartments", caption: "Tap a compartment, then “Edit Comp Product,” and pick a product (or MT) for every compartment." };
  }

  if (!planBStep.done) {
    if (activeSlotLetter !== 2) {
      return { target: "switch-to-plan-b", caption: "Tap here, then choose B to start Plan B." };
    }
    const compsDone = planBStep.subItems?.filter((s) => s.id.startsWith("plan-b-comp-")).every((s) => s.done) ?? false;
    const differDone = planBStep.subItems?.find((s) => s.id === "plan-b-different-products")?.done ?? false;
    return compsDone && differDone
      ? { target: "save-plan", caption: "Tap here to save Plan B." }
      : { target: "compartments", caption: "Pick different products than Plan A for every compartment." };
  }

  return null;
}
