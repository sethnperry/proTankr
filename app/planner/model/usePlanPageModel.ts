"use client";
// app/planner/model/usePlanPageModel.ts
//
// Planner model layer (page). Page: plan-slot view, the plan builder, and the unsaved-changes state.
// Built from hooks; no JSX. Part of the Planner composition: see docs/planner-architecture.md.

import { useState } from "react";
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
  const { setCompModalOpen, setCompModalComp, activeSlotLetter, setActiveSlotLetter, setSelectedComp, planRestoreAttempted, compartments, setCompartments, compLoading, selectedTrailerId, cgSlider, setCgSlider, compPlan, setCompPlan, overridesSnapshot, baselineOverrides, setBaselineOverrides, setCaptureBaselineNext, planSlots, productNameById, terminalProducts, setCheckAvailabilityNext } = p;
  const { loadWorkflow, tripWaitingPickup } = l;
  const {
    presetSheetSlot, setPresetSheetSlot, presetQuickPickOpen, setPresetQuickPickOpen,
    summaryForSlot, presetSheetSummary, compsForSlot,
    handlePresetLoad, handlePresetSaveEmpty, handlePresetSheetLoad, handlePresetSheetEdit, handlePresetSheetClear, closePresetSheet,
    planSlotWithLayout, wizardNew, setWizardNew, wizardOpen, canSetCap, handleWizardSaveCaps, handleSaveTrailerComp, handleWizardFinish,
  } = usePlanSlotsView({
    shell, active, planSlots, productNameById, terminalProducts, compartments, setCompartments, compLoading, selectedTrailerId, compPlan, cgSlider,
    activeSlotLetter, setActiveSlotLetter, setCaptureBaselineNext, setCheckAvailabilityNext, setBaselineOverrides,
    overridesSnapshot, planRestoreAttempted, onboardingActive, setupSession, loadWorkflow,
  });
  // A trip is set up and waiting to load. Putting a different plan live would change what it loads, so ask first.
  const [switchPrompt, setSwitchPrompt] = useState<{ from: string; to: string; run: () => void; keep?: () => void } | null>(null);
  const namesOf = (plan: Record<string, any> | undefined | null) => Array.from(new Set(
    Object.values(plan ?? {}).filter((x: any) => x && !x.empty && x.productId).map((x: any) => productNameById.get(x.productId) ?? "another product"),
  )).sort();
  const guardSwitch = (plan: Record<string, any> | undefined | null, run: () => void, keep?: () => void) => {
    if (!tripWaitingPickup) return run();
    const from = namesOf(compPlan), to = namesOf(plan);
    if (!to.length || from.join("|") === to.join("|")) return run();
    setSwitchPrompt({ from: from.join(", ") || "its current plan", to: to.join(", "), run, keep });
  };
  const handlePresetLoadGuarded = (n: number) => guardSwitch(planSlots.peekSlot(n)?.compPlan, () => handlePresetLoad(n));
  const handlePresetSheetLoadGuarded = () => guardSwitch(presetSheetSlot != null ? planSlots.peekSlot(presetSheetSlot)?.compPlan : null, handlePresetSheetLoad, () => closePresetSheet());
  const handleWizardFinishGuarded = (plan: Record<number, any>) => guardSwitch(plan, () => handleWizardFinish(plan), () => handleWizardFinish(plan, { keepLive: true }));

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
    compsForSlot,
    handlePresetLoad: handlePresetLoadGuarded,
    switchPrompt, setSwitchPrompt,
    handlePresetSaveEmpty,
    handlePresetSheetLoad: handlePresetSheetLoadGuarded,
    handlePresetSheetEdit,
    handlePresetSheetClear,
    closePresetSheet,
    planSlotWithLayout,
    wizardNew,
    setWizardNew,
    wizardOpen,
    canSetCap,
    handleWizardSaveCaps,
    handleSaveTrailerComp,
    handleWizardFinish: handleWizardFinishGuarded,
    closeCompModal,
    currentOverrides,
    isDirty,
  };
}
