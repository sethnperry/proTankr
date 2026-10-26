"use client";
// app/planner/flows/PlanBuilderFlow.tsx
//
// The Plan Builder: lay out a new plan one compartment at a time. A container: reads the planner model with usePlanner() and hands the
// windows what they show. Mount it anywhere under PlannerProvider.

import PlanWizard from "../components/PlanWizard";
import { usePlanner } from "../PlannerContext";

export default function PlanBuilderFlow() {
  const {
    wizardOpen,
    wizardNew,
    compartments,
    planCatalogProducts,
    canSetCap,
    planSlots,
    activeSlotLetter,
    handleWizardSaveCaps,
    handleWizardFinish,
    setWizardNew,
  } = usePlanner();

  return (
    <>
      <PlanWizard
        open={wizardOpen}
        mode={wizardNew ? "new" : "first"}
        compartments={compartments}
        products={planCatalogProducts}
        canSetCap={canSetCap}
        replacingLetter={
          wizardNew &&
          [1, 2, 3, 4, 5].every((n) => {
            const snap = planSlots.peekSlot(n);
            return !!snap && Object.values(snap.compPlan ?? {}).some((v: any) => v && !v.empty && v.productId);
          })
            ? String.fromCharCode(64 + activeSlotLetter)
            : null
        }
        onSaveCaps={handleWizardSaveCaps}
        onFinish={handleWizardFinish}
        onCancel={() => setWizardNew(false)}
      />
    </>
  );
}
