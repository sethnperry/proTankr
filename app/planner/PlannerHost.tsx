"use client";
// app/planner/PlannerHost.tsx
//
// Mounted for every /planner screen. Builds the model once, provides it, and mounts the
// plan page and the windows. No logic lives here: see docs/planner-architecture.md.

import { usePlannerModel } from "./model/usePlannerModel";
import { PlannerProvider } from "./PlannerContext";
import PlanPage from "./components/PlanPage";
import PlanReviewFlow from "./flows/PlanReviewFlow";
import PlanSlotsFlow from "./flows/PlanSlotsFlow";
import CompartmentFlow from "./flows/CompartmentFlow";
import PlanBuilderFlow from "./flows/PlanBuilderFlow";
import TerminalSwitchFlow from "./flows/TerminalSwitchFlow";
import HopSupplierFlow from "./flows/HopSupplierFlow";
import ReportIssueFlow from "./flows/ReportIssueFlow";
import StaleApiFlow from "./flows/StaleApiFlow";
import RecallEquipmentFlow from "./flows/RecallEquipmentFlow";
import TempConfirmFlow from "./flows/TempConfirmFlow";

export default function PlannerHost() {
  const model = usePlannerModel();
  return (
    <PlannerProvider value={model}>
      <PlanPage />
      <PlanReviewFlow />
      <PlanSlotsFlow />
      <CompartmentFlow />
      <PlanBuilderFlow />
      <TerminalSwitchFlow />
      <HopSupplierFlow />
      <ReportIssueFlow />
      <StaleApiFlow />
      <RecallEquipmentFlow />
      <TempConfirmFlow />
    </PlannerProvider>
  );
}
