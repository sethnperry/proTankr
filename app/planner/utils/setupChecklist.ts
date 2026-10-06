// app/planner/utils/setupChecklist.ts
//
// Pure derivation for the Planner's "Setup Guide" checklist -- Stripe-style
// progress steps for a brand-new driver, but with no state of its own.
// Every step's done/pending status is computed fresh from the driver's own
// saved presets (via usePlanSlots' peekSlot) each render, the same "derive
// from real data, never a separate tracked flag" rule this app already
// applies to onboarding resume state (see SoloOnboarding.tsx's own header
// comment) and the preset dial's own slotHas. This means the checklist can
// never drift out of sync with reality: clearing Plan A after completing
// it correctly un-checks step 1 again, with nothing extra to keep in sync.
//
// More steps are expected later (explicit user direction, not guessed) --
// COMPUTE_STEPS is written as one function per step so adding step 3+ is
// appending a function + a line in computeSetupChecklistSteps, not
// restructuring this file or the presentational component that renders it.

import type { CompRow } from "../types";
import type { PlanSnapshot } from "../types";

export type ChecklistSubItem = {
  id: string;
  title: string;
  done: boolean;
};

export type ChecklistStep = {
  id: string;
  title: string;
  caption: string;
  done: boolean;
  // Present only for a step made of distinct sub-tasks (today: the
  // location step). The step's own `done` is the AND of these -- a step
  // with sub-items that aren't all done yet still gets its own row (with
  // its own hollow/pending circle), but reads as "in progress" rather
  // than fully pending, since its sub-items show their own state
  // underneath it.
  subItems?: ChecklistSubItem[];
};

// "Resolved" = the driver made an explicit choice for this compartment --
// a real product, or explicitly marked empty (MT). An unset compartment
// (no entry in compPlan at all) is neither -- still pending.
function compartmentResolved(snap: PlanSnapshot | null, compNumber: number): boolean {
  const entry = snap?.compPlan?.[compNumber];
  if (!entry) return false;
  return entry.empty === true || !!entry.productId;
}

function allCompartmentsResolved(snap: PlanSnapshot | null, compartments: CompRow[]): boolean {
  if (!snap || compartments.length === 0) return false;
  return compartments.every((c) => compartmentResolved(snap, c.comp_number));
}

// At least one compartment's product differs between the two plans -- not
// requiring every compartment to differ, since a real driver's two presets
// (e.g. "diesel run" vs "gas run") can legitimately share a comp's product
// while still being meaningfully different plans overall.
function productsDiffer(a: PlanSnapshot | null, b: PlanSnapshot | null): boolean {
  if (!a || !b) return false;
  const compNumbers = new Set([
    ...Object.keys(a.compPlan ?? {}).map(Number),
    ...Object.keys(b.compPlan ?? {}).map(Number),
  ]);
  for (const n of compNumbers) {
    const pa = a.compPlan?.[n]?.productId ?? "";
    const pb = b.compPlan?.[n]?.productId ?? "";
    if (pa !== pb) return true;
  }
  return false;
}

// capOverride is only ever set by dragging a compartment's cap handle --
// null/undefined means "still at the compartment's full configured cap,"
// per CompPlanInput's own definition. At least one dragged handle is
// enough to count as "adjusted the cap handles" for this step.
function capHandleAdjusted(snap: PlanSnapshot | null): boolean {
  if (!snap?.compPlan) return false;
  return Object.values(snap.compPlan).some((v) => v.capOverride != null);
}

// 0.5 is the CG slider's own hardcoded default (page.tsx's
// useState<number>(0.5)) -- any real drag away from it is enough to count.
const CG_DEFAULT = 0.5;
function cgAdjusted(snap: PlanSnapshot | null): boolean {
  if (!snap || typeof snap.cgSlider !== "number") return false;
  return Math.abs(snap.cgSlider - CG_DEFAULT) > 0.001;
}

export type LocationChecklistInput = {
  // Whether a real terminal is currently selected -- by the time a driver
  // reaches the live Planner this is almost always already true (SetupGate
  // forces a first pick before the Planner renders at all), but it's
  // computed from real state rather than assumed, same as every other
  // sub-item here.
  hasTerminalSelected: boolean;
  // Sticky "ever switched to a different city" flag -- see
  // utils/locationSwitchProgress.ts's own header comment for why this is
  // a one-time-demonstration flag, not derived fresh every render the way
  // the rest of this file's rules are.
  hasSwitchedCity: boolean;
};

export function computeSetupChecklistSteps(
  compartments: CompRow[],
  planA: PlanSnapshot | null,
  planB: PlanSnapshot | null,
  location: LocationChecklistInput
): ChecklistStep[] {
  const locationSubItems: ChecklistSubItem[] = [
    { id: "pick-location", title: "Pick a starting location", done: location.hasTerminalSelected },
    { id: "switch-city", title: "Switch to a terminal in a different city", done: location.hasSwitchedCity },
  ];
  const step0Done = locationSubItems.every((s) => s.done);

  const step1Done = allCompartmentsResolved(planA, compartments);
  const step2Done =
    allCompartmentsResolved(planB, compartments) &&
    productsDiffer(planA, planB) &&
    capHandleAdjusted(planB) &&
    cgAdjusted(planB);

  return [
    {
      id: "location",
      title: "Set up your location",
      caption: "Tap the map icon up top to star your home city, then switch to a terminal in a different city to see how switching works.",
      done: step0Done,
      subItems: locationSubItems,
    },
    {
      id: "plan-a",
      title: "Set up Plan A",
      caption: "Tap a compartment, then “Edit Comp Product”, and pick a product (or MT for empty) for every compartment. Then tap “Save plan A.”",
      done: step1Done,
    },
    {
      id: "plan-b",
      title: "Set up Plan B",
      caption: "Switch to preset B (tap the plan letter up top), pick different products, adjust a cap handle and the CG, then tap “Save plan B.”",
      done: step2Done,
    },
  ];
}
