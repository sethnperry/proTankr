"use client";
// app/planner/PlannerContext.tsx
//
// The Planner's model, shared. PlannerHost builds this once from the model
// hooks and provides it; each window (a "flow") reads what it needs with
// usePlanner() instead of being handed 40 props. A flow can therefore be mounted
// anywhere under the provider without wiring.
//
// Add a field here when a flow needs it. Keep it to model values and actions,
// not layout.

import { createContext, useContext } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { useCalculatorShell } from "./CalculatorShellContext";
import type { useLoadWorkflow } from "./hooks/useLoadWorkflow";
import type { usePlanMath } from "./hooks/usePlanMath";
import type { useTripLoading } from "./hooks/useTripLoading";
import type { useTerminalSwitchDuringLoad } from "./hooks/useTerminalSwitchDuringLoad";
import type { useTerminalProducts } from "./hooks/useTerminalProducts";
import type { usePlannerEquipment } from "./hooks/usePlannerEquipment";
import type { TuneRow } from "./utils/tuneRows";
import type { useFuelTempPrediction } from "./hooks/useFuelTempPrediction";
import type { usePlanInputs } from "./hooks/usePlanInputs";
import type { OutageReportType } from "./hooks/useTerminalOutageReports";
import type { StaleProduct } from "./components/StaleApiOverlay";
import type { CompPlanInput } from "./types";

type Math = ReturnType<typeof usePlanMath>;
type Trip = ReturnType<typeof useTripLoading>;
type Switch = ReturnType<typeof useTerminalSwitchDuringLoad>;
type Equip = ReturnType<typeof usePlannerEquipment>;
type Products = ReturnType<typeof useTerminalProducts>;
type Temp = ReturnType<typeof useFuelTempPrediction>;
type Inputs = ReturnType<typeof usePlanInputs>;

export type PlannerCtx = {
  shell: ReturnType<typeof useCalculatorShell>;
  effectiveUserId: string | null | undefined;
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;

  // plan
  setCompPlan: Dispatch<SetStateAction<Record<number, CompPlanInput>>>;
  effectivePlanRows: Math["effectivePlanRows"];
  capOverridesForReview: Math["capOverridesForReview"];
  persistedCapForComp: Math["persistedCapForComp"];
  livePreviewGrossLbs: Math["livePreviewGrossLbs"];
  livePreviewDiffLbs: Math["livePreviewDiffLbs"];
  targetWeight: Math["targetWeight"];
  unavailableComps: unknown[];

  // products and tune
  productNameById: Map<string, string>;
  productHexCodeById: Record<string, string>;
  productInputsForModal: Record<string, { api?: string; tempF?: number }>;
  tuneRows: TuneRow[];
  onTuneProduct: (productId: string, api: number, tempF: number) => void;
  tuneTempColor: string;
  fuelTempAmbientF: number | null;

  // equipment and terminal labels
  terminalLabel: string | undefined;
  selectedRackName: Products["selectedRackName"];
  fuelTankGallons: Equip["fuelTankGallons"];
  saveFuelTankGallons: Equip["saveFuelTankGallons"];
  recentFuelPct: number | null;

  // trip
  tripModeForLoading: Trip["tripModeForLoading"];
  recordTripLoaded: Trip["recordTripLoaded"];
  loadGeoShips: Trip["loadGeoShips"];
  reportFromDashboard: boolean;

  // actions
  handleTapTerminalInLoadingModal: Switch["handleTapTerminalInLoadingModal"];
  handleBackToPlannerNoUpdate: () => Promise<void>;
  openCancelLoadSheet: () => void;

  // leaving a rack mid-load
  terminalSwitchConfirm: Switch["terminalSwitchConfirm"];
  handleUpdateCardAtPrevious: Switch["handleUpdateCardAtPrevious"];
  handleSwitchWithoutUpdating: Switch["handleSwitchWithoutUpdating"];
  handleSubmitOutageReportForPreviousTerminal: Switch["handleSubmitOutageReportForPreviousTerminal"];
  switchReportedIssueRef: Switch["switchReportedIssueRef"];
  switchReasonNoteRef: Switch["switchReasonNoteRef"];
  tripPickup: Trip["tripPickup"];
  tripWaitingPickup: Trip["tripWaitingPickup"];

  // report a terminal issue
  cancelLoadConfirmOpen: boolean;
  setCancelLoadConfirmOpen: Dispatch<SetStateAction<boolean>>;
  handleSubmitOutageReport: (
    reportType: OutageReportType, productIds: string[], overrideTerminalId?: string, overrideRackId?: string | null,
  ) => Promise<{ error: string | null }>;

  // stale API choice
  staleApiPrompt: { products: StaleProduct[] } | null;
  setStaleApiPrompt: Dispatch<SetStateAction<{ products: StaleProduct[] } | null>>;
  handleStaleSafest: () => void;
  handleStaleSafe: () => void;
  handleStaleIgnore: () => void;

  // equipment differs from the last load here
  altEquipmentPrompt: { loadId: string; truckLabel: string; trailerLabel: string } | null;
  setAltEquipmentPrompt: Dispatch<SetStateAction<{ loadId: string; truckLabel: string; trailerLabel: string } | null>>;
  handleViewAltLoadInReports: () => void;

  // temperature confirm
  tempDialOpen: boolean;
  setTempDialOpen: Dispatch<SetStateAction<boolean>>;
  tempReconfirmProductIds: Switch["tempReconfirmProductIds"];
  setTempReconfirmProductIds: Switch["setTempReconfirmProductIds"];
  handleConfirmTempReconfirm: Switch["handleConfirmTempReconfirm"];
  handleConfirmTempAndBeginLoad: () => void;
  fuelTempLoading: Temp["loading"];
  fuelTempConfidence: Temp["confidence"];
  predictedFuelTempF: Temp["predictedFuelTempF"];
  tempF: Inputs["tempF"];
  setTempF: Inputs["setTempF"];
  setSingleProductTempF: Inputs["setSingleProductTempF"];
  tempModalProductGroups: { productId: string; name: string; hex: string; tempF: number }[];

  // parts the host still builds
  supplierPanel: ReactNode;
};

const Ctx = createContext<PlannerCtx | null>(null);

export function PlannerProvider({ value, children }: { value: PlannerCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanner(): PlannerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlanner must be used inside PlannerProvider");
  return v;
}
