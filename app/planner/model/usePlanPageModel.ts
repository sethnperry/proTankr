"use client";
// app/planner/model/usePlanPageModel.ts
//
// Planner model layer (page). Page: plan-slot view, the plan builder, and the unsaved-changes state.
// Built from hooks; no JSX. Part of the Planner composition: see docs/planner-architecture.md.

import { usePlanSlotsView } from "../hooks/usePlanSlotsView";
import { useTripPlanApply } from "../hooks/useTripPlanApply";

import type { usePlannerView } from "./usePlannerView";
import type { usePlanModel } from "./usePlanModel";
import type { useLoadModel } from "./useLoadModel";
type UsePlannerViewModel = ReturnType<typeof usePlannerView>;
type UsePlanModelModel = ReturnType<typeof usePlanModel>;
type UseLoadModelModel = ReturnType<typeof useLoadModel>;

export function usePlanPageModel(v: UsePlannerViewModel, p: UsePlanModelModel, l: UseLoadModelModel) {
  const { shell, setupSession, effectiveUserId, equipment, active, onboardingActive } = v;
  const { setCompModalOpen, setCompModalComp, activeSlotLetter, setActiveSlotLetter, setSelectedComp, planRestoreAttempted, compartments, setCompartments, compLoading, selectedTrailerId, cgSlider, setCgSlider, compPlan, setCompPlan, overridesSnapshot, baselineOverrides, setBaselineOverrides, setCaptureBaselineNext, planSlots, productNameById, setCheckAvailabilityNext } = p;
  const { loadWorkflow, tripWaitingPickup } = l;
  const {
    presetSheetSlot, setPresetSheetSlot, presetQuickPickOpen, setPresetQuickPickOpen,
    summaryForSlot, presetSheetSummary, nameForSlot, stripForSlot,
    handlePresetLoad, handlePresetSaveEmpty, handlePresetSheetLoad, handlePresetSheetEdit, handlePresetSheetClear, closePresetSheet,
    planSlotWithLayout, wizardNew, setWizardNew, wizardOpen, canSetCap, handleWizardSaveCaps, handleWizardFinish,
  } = usePlanSlotsView({
    shell, active, planSlots, productNameById, compartments, setCompartments, compLoading, selectedTrailerId, compPlan, cgSlider,
    activeSlotLetter, setActiveSlotLetter, setCaptureBaselineNext, setCheckAvailabilityNext, setBaselineOverrides,
    overridesSnapshot, planRestoreAttempted, onboardingActive, setupSession, loadWorkflow,
  });
  // (closes the compartment window; kept next to its state)
  const closeCompModal = () => { setCompModalOpen(false); setCompModalComp(null); setSelectedComp(null); };
  useTripPlanApply({
    effectiveUserId, tripId: tripWaitingPickup?.trip_id ?? null, planSlots, comboId: equipment.selectedComboId,
    compartmentCount: compartments.length, handlePresetLoad, setCompPlan, setCgSlider, setCaptureBaselineNext,
  });

  const currentOverrides = overridesSnapshot(compPlan, cgSlider);
  const isDirty = currentOverrides !== baselineOverrides;

  return {
    presetSheetSlot,
    setPresetSheetSlot,
    presetQuickPickOpen,
    setPresetQuickPickOpen,
    summaryForSlot,
    presetSheetSummary,
    nameForSlot,
    stripForSlot,
    handlePresetLoad,
    handlePresetSaveEmpty,
    handlePresetSheetLoad,
    handlePresetSheetEdit,
    handlePresetSheetClear,
    closePresetSheet,
    planSlotWithLayout,
    wizardNew,
    setWizardNew,
    wizardOpen,
    canSetCap,
    handleWizardSaveCaps,
    handleWizardFinish,
    closeCompModal,
    currentOverrides,
    isDirty,
  };
}
