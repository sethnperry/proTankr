"use client";
// app/planner/model/useLoadModel.ts
//
// Planner model layer (load). Load: beginning a load, Plan Review, suppliers, trip, terminal switch and report launching.
// Built from hooks; no JSX. Part of the Planner composition: see docs/planner-architecture.md.

import { useTruckReading } from "@/lib/telematics/useTruckReading";
import { useCallback, useMemo, useRef } from "react";
import { useLoadWorkflow } from "../hooks/useLoadWorkflow";
import { useTripLoading } from "../hooks/useTripLoading";
import { usePlannerIntents } from "../hooks/usePlannerIntents";
import { useLoadBegin } from "../hooks/useLoadBegin";
import { useLoadPrep } from "../hooks/useLoadPrep";
import { usePlannerSuppliers } from "../hooks/usePlannerSuppliers";
import { useLoadReportLauncher } from "../hooks/useLoadReportLauncher";
import { useTerminalSwitchDuringLoad } from "../hooks/useTerminalSwitchDuringLoad";
import { useTripEquipment } from "../hooks/useTripEquipment";
import { useSupplierPicks } from "@/lib/suppliers/useSupplierPicks";
import { markSuppliersLoaded } from "@/lib/suppliers/useTerminalSuppliers";

import type { usePlannerView } from "./usePlannerView";
import type { usePlanModel } from "./usePlanModel";
type UsePlannerViewModel = ReturnType<typeof usePlannerView>;
type UsePlanModelModel = ReturnType<typeof usePlanModel>;

export function useLoadModel(v: UsePlannerViewModel, p: UsePlanModelModel) {
  const { shell, effectiveUserId, equipment, location, terminals, router, active, leaveTo } = v;
  const { setTempDialOpen, setCancelLoadConfirmOpen, setApiSafetyOverride, tunedApiTempByProduct, setTunedApiTempByProduct, staleApiPrompt, setStaleApiPrompt, beginAfterOverride, setBeginAfterOverride, activeSlotLetter, setActiveSlotLetter, altEquipmentPrompt, setAltEquipmentPrompt, preLoadCardedOnRef, selectedTruckId, fetchTerminalProducts, terminalProducts, tempF, setTempF, tempFRef, productTempF, setProductTempF, setSingleProductTempF, compPlan, setCaptureBaselineNext, productInputs, setProductInputs, setProductApi, setProductTemp, predictedFuelTempF, fuelTempConfidence, fuelTempLoading, fuelTempUnbiasedF, refreshFuelTemp, userAdjustedTempRef, apiBasisForProduct, capacityResult, cgBias, effectivePlanRows, effectivePlannedGallonsTotal, effectivePlannedWeightLbs, lbsPerGalForProductId, planRows, plannedProductIds, setLoadingGallonsOverride, tare, tripStoreHook, planSlots, productNameById, unavailableComps } = p;
  const supplierPicks = useSupplierPicks(effectiveUserId || null, location.selectedTerminalId ? String(location.selectedTerminalId) : null);
  const supplierPicksRef = useRef(supplierPicks);
  supplierPicksRef.current = supplierPicks;
  // Picks resolved against the current plan (set below, once products are known).
  const resolvedSupplierPicksRef = useRef<{ product_id: string; supplier_id: string | null; name: string }[]>([]);

  const loadWorkflow = useLoadWorkflow({
    authUserId: effectiveUserId || null,
    selectedComboId: equipment.selectedComboId,
    selectedTerminalId: location.selectedTerminalId,
    selectedRackId: location.selectedRackId,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    selectedCityId: location.selectedCityId,
    tare, cgBias,
    ambientTempF: location.ambientTempF,
    tempF, planRows: effectivePlanRows, plannedGallonsTotal: effectivePlannedGallonsTotal, plannedWeightLbs: effectivePlannedWeightLbs,
    terminalProducts, productNameById,
    productInputs, setProductInputs,
    setLoadingGallonsOverride,
    onRefreshTerminalProducts: fetchTerminalProducts,
    onRefreshTerminalAccess: terminals.refreshTerminalAccessForUser,
      // After a load is logged the temp entered becomes the next plan's anchor: clear any
    // manual dial nudge and refetch the prediction.
    onPostLoadComplete: async () => {
      // The suppliers this load ran on worked here: stamp them and clear any
      // "not working" flag, then forget the picks for the next visit.
      const sp = supplierPicksRef.current;
      const ids = resolvedSupplierPicksRef.current.map((p) => p.supplier_id).filter((x): x is string => !!x);
      if (ids.length && shell.companyId && location.selectedTerminalId && effectiveUserId) {
        void markSuppliersLoaded(shell.companyId, String(location.selectedTerminalId), ids, effectiveUserId);
      }
      sp.clear();
      userAdjustedTempRef.current = false;
      refreshFuelTemp();
      await planSlots.refreshLastLoad();
    },
    predictedTempF: predictedFuelTempF,
    unbiasedPredictedTempF: fuelTempUnbiasedF,
    activeSlotLetter,
    capacityResult,
  });

  // The truck's own fuel level (telematics), used only when recent.
  const fuelReading = useTruckReading(selectedTruckId ?? null, loadWorkflow.loadingOpen);
  const recentFuelPct = fuelReading?.fuelLevelPct != null && fuelReading.at && Date.now() - Date.parse(fuelReading.at) < 30 * 60_000 ? fuelReading.fuelLevelPct : null;

  const {
    tripStoreObj, tripSuppliers, addTripSupplier, loadGeoShips,
    tripPickup, tripWaitingPickup, tripNeedsArrive, tripModeForLoading, recordTripLoaded,
  } = useTripLoading({ shell, active, effectiveUserId, loadWorkflow, tripStoreHook, supplierPicks, plannedProductIds, compPlan, leaveTo });

  const { handleBackToPlannerNoUpdate, handleRecallLastLoad, handleSubmitOutageReport, requestBegin } = useLoadBegin({ beginAfterOverride, effectiveUserId, loadWorkflow, planSlots, preLoadCardedOnRef, predictedFuelTempF, refreshFuelTemp, resolvedSupplierPicksRef, setActiveSlotLetter, setAltEquipmentPrompt, setApiSafetyOverride, setBeginAfterOverride, setCancelLoadConfirmOpen, setCaptureBaselineNext, setProductTempF, setTempF, setTunedApiTempByProduct, shell, tempFRef, userAdjustedTempRef });

  const { reportPending, reportFromDashboard, openLoadReportAtTerminal } = useLoadReportLauncher({ shell, loadWorkflow, leaveTo });

  // Never claims or switches equipment (someone else may be driving it); links to the
  // load's read-only report instead.
  const handleViewAltLoadInReports = useCallback(() => {
    if (!altEquipmentPrompt) return;
    router.push(`/planner/reports?loadId=${encodeURIComponent(altEquipmentPrompt.loadId)}`);
    setAltEquipmentPrompt(null);
  }, [altEquipmentPrompt, router]);

  // ── Derived labels ─────────────────────────────────────────────────────────
  const terminalLabel = useMemo(() => {
    if (!location.selectedTerminalId) return undefined;
    const t = terminals.terminals.find((t) => String(t.terminal_id) === String(location.selectedTerminalId))
      ?? terminals.terminalCatalog.find((t) => String(t.terminal_id) === String(location.selectedTerminalId));
    return t?.terminal_name ? String(t.terminal_name) : "Terminal";
  }, [terminals.terminals, terminals.terminalCatalog, location.selectedTerminalId]);

  const {
    terminalSwitchConfirm,
    handleTapTerminalInLoadingModal,
    handleUpdateCardAtPrevious,
    handleSwitchWithoutUpdating,
    handleSubmitOutageReportForPreviousTerminal,
    tempReconfirmProductIds,
    setTempReconfirmProductIds,
    handleConfirmTempReconfirm,
    switchReportedIssueRef,
    switchReasonNoteRef,
  } = useTerminalSwitchDuringLoad({
    shell, loadWorkflow, tripStoreHook, tripPickup, tripWaitingPickup, effectiveUserId, terminalLabel,
    effectivePlanRows: effectivePlanRows as any[], setProductApi, setProductTemp, setTunedApiTempByProduct,
    userAdjustedTempRef, setTempDialOpen, setTempF, tempF, fuelTempLoading, predictedFuelTempF,
    handleSubmitOutageReport,
  });

  // Last API reading per product, from terminalProducts (refreshed after a load is logged).
  const lastProductInfoById = useMemo(() => {
    const out: Record<string, { last_api: number | null; last_api_updated_at: string | null }> = {};
    for (const p of terminalProducts) {
      const pid = String((p as any).product_id ?? "");
      if (!pid) continue;
      out[pid] = {
        last_api: (p as any).last_api ?? null,
        last_api_updated_at: (p as any).last_api_updated_at ?? null,
      };
    }
    return out;
  }, [terminalProducts]);

  const productHexCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) { if (p.product_id && p.hex_code) rec[p.product_id] = String(p.hex_code); }
    return rec;
  }, [terminalProducts]);

  // Short code for the Tune panel (product code, not the full label) -- same
  // fallback chain the compartment bars already use.
  const productCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) {
      if (!p.product_id) continue;
      const code = (p as any).button_code || (p as any).product_code || String(p.product_name ?? "").split(/\s+/)[0] || "";
      rec[p.product_id] = String(code);
    }
    return rec;
  }, [terminalProducts]);

  const { supplierPanelProducts, resolvedSupplierPicks, supplierPromptToken, onSupplierPicks, onSupplierSwitched } = usePlannerSuppliers({
    shell, effectiveUserId, loadWorkflow, tripStoreHook, tripStoreObj, tripPickup, tripWaitingPickup,
    supplierPicks, resolvedSupplierPicksRef, plannedProductIds, productCodeById, productNameById, productHexCodeById,
  });

  const { handleConfirmTempAndBeginLoad, handleStaleIgnore, handleStaleSafe, handleStaleSafest, loadDisabled, onTuneProduct, productInputsForModal, tempModalProductGroups, tuneRows, tuneTempColor } = useLoadPrep({ apiBasisForProduct, equipment, fuelTempConfidence, lastProductInfoById, lbsPerGalForProductId, loadWorkflow, location, planRows, plannedProductIds, productCodeById, productHexCodeById, productInputs, productNameById, productTempF, requestBegin, setProductApi, setProductTemp, setSingleProductTempF, setStaleApiPrompt, setTempDialOpen, setTunedApiTempByProduct, staleApiPrompt, tempF, terminalProducts, tunedApiTempByProduct });

  // Mid-trip equipment change, shared with the Driver Dashboard: warning
  // before the picker, and the truck-change record when a loaded trailer is
  // now behind a different truck.
  const tripEquip = useTripEquipment(tripStoreHook, effectiveUserId || null);
  const openEquipment = tripEquip.openEquipment;

  usePlannerIntents({ effectiveUserId, loadDisabled, loadWorkflow, openLoadReportAtTerminal, planSlots, plannedProductIds, requestBegin, shell, tripNeedsArrive, tripStoreHook, unavailableComps });

  return {
    supplierPicks,
    loadWorkflow,
    recentFuelPct,
    tripSuppliers,
    addTripSupplier,
    loadGeoShips,
    tripPickup,
    tripWaitingPickup,
    tripModeForLoading,
    recordTripLoaded,
    handleBackToPlannerNoUpdate,
    handleRecallLastLoad,
    handleSubmitOutageReport,
    reportPending,
    reportFromDashboard,
    handleViewAltLoadInReports,
    terminalLabel,
    terminalSwitchConfirm,
    handleTapTerminalInLoadingModal,
    handleUpdateCardAtPrevious,
    handleSwitchWithoutUpdating,
    handleSubmitOutageReportForPreviousTerminal,
    tempReconfirmProductIds,
    setTempReconfirmProductIds,
    handleConfirmTempReconfirm,
    switchReportedIssueRef,
    switchReasonNoteRef,
    productHexCodeById,
    supplierPanelProducts,
    resolvedSupplierPicks,
    supplierPromptToken,
    onSupplierPicks,
    onSupplierSwitched,
    handleConfirmTempAndBeginLoad,
    handleStaleIgnore,
    handleStaleSafe,
    handleStaleSafest,
    onTuneProduct,
    productInputsForModal,
    tempModalProductGroups,
    tuneRows,
    tuneTempColor,
    tripEquip,
    openEquipment,
  };
}
