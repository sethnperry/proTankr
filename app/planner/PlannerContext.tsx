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
import type { CompPlanInput } from "./types";

type Math = ReturnType<typeof usePlanMath>;
type Trip = ReturnType<typeof useTripLoading>;
type Switch = ReturnType<typeof useTerminalSwitchDuringLoad>;
type Equip = ReturnType<typeof usePlannerEquipment>;
type Products = ReturnType<typeof useTerminalProducts>;

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
