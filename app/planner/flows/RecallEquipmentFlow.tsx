"use client";
// app/planner/flows/RecallEquipmentFlow.tsx
//
// Offered when the last load at this terminal was done in different equipment. A container: reads the planner model with usePlanner() and hands the
// window what it shows. Mount it anywhere under PlannerProvider.

import RecallDifferentEquipmentSheet from "../components/RecallDifferentEquipmentSheet";
import { usePlanner } from "../PlannerContext";

export default function RecallEquipmentFlow() {
  const { shell, altEquipmentPrompt, setAltEquipmentPrompt, handleViewAltLoadInReports } = usePlanner();

  return (
    <RecallDifferentEquipmentSheet
      open={!!altEquipmentPrompt}
      truckLabel={altEquipmentPrompt?.truckLabel ?? ""}
      trailerLabel={altEquipmentPrompt?.trailerLabel ?? ""}
      onViewInReports={handleViewAltLoadInReports}
      onCancel={() => setAltEquipmentPrompt(null)}
      darkMode={shell.theme.darkMode}
      accentColor={shell.theme.accentColor}
    />
  );
}
