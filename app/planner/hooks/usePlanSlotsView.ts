"use client";
// app/planner/hooks/usePlanSlotsView.ts
//
// What the Planner does with the saved plans A-E: how each one reads in the quick
// pick (summary, name, colored dots), loading and saving them (one plan per
// layout), the Load / Edit / Clear sheet, and the Plan Builder's open/finish
// logic. Lifted out of PlannerHost unchanged.

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";
import { productColorFor } from "../utils/productColor";

import type { Dispatch, SetStateAction } from "react";
import type { useCalculatorShell } from "../CalculatorShellContext";
import type { useLoadWorkflow } from "./useLoadWorkflow";
import type { usePlanSlots } from "./usePlanSlots";
import type { CompPlanInput, CompRow } from "../types";

type Inputs = {
  shell: ReturnType<typeof useCalculatorShell>;
  active: boolean;
  planSlots: ReturnType<typeof usePlanSlots>;
  productNameById: Map<string, string>;
  compartments: CompRow[];
  setCompartments: Dispatch<SetStateAction<CompRow[]>>;
  compLoading: boolean;
  selectedTrailerId: string | null;
  compPlan: Record<number, CompPlanInput>;
  cgSlider: number;
  activeSlotLetter: number;
  setActiveSlotLetter: Dispatch<SetStateAction<number>>;
  setCaptureBaselineNext: Dispatch<SetStateAction<boolean>>;
  setCheckAvailabilityNext: Dispatch<SetStateAction<boolean>>;
  setBaselineOverrides: Dispatch<SetStateAction<string>>;
  overridesSnapshot: (plan: Record<number, CompPlanInput>, cg: number) => string;
  planRestoreAttempted: boolean;
  onboardingActive: boolean;
  setupSession: unknown;
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;
};

export function usePlanSlotsView(i: Inputs) {
  const {
    shell, active, planSlots, productNameById, compartments, setCompartments, compLoading, selectedTrailerId, compPlan, cgSlider,
    activeSlotLetter, setActiveSlotLetter, setCaptureBaselineNext, setCheckAvailabilityNext, setBaselineOverrides,
    overridesSnapshot, planRestoreAttempted, onboardingActive, setupSession, loadWorkflow,
  } = i;
  const { equipment } = shell;
  const router = useRouter();
  // Which preset slot (1-5) the action sheet is open for, if any -- set by
  // PresetQuickPick's long-press on a filled row (same reuse the sheet's
  // predecessor, the swipeable PresetDial, already established).
  const [presetSheetSlot, setPresetSheetSlot] = useState<number | null>(null);
  // Opens PresetQuickPick -- the plan-letter icon's tap target, replacing
  // the old dial entirely.
  const [presetQuickPickOpen, setPresetQuickPickOpen] = useState(false);


  // Shared by the PresetActionSheet summary and PresetQuickPick's per-row
  // summary (one implementation, not two copies -- this project has hit
  // real bugs before from exactly this kind of duplicated logic drifting
  // apart, e.g. CustomSelect.tsx/ServiceTypeManager.tsx's own precedent). A
  // preset saved at a different terminal may reference a product not sold
  // here, which productNameById (scoped to the *current* terminal) won't
  // resolve; surfaced honestly rather than silently dropped, since that's
  // exactly the mismatch the LOAD-blocking flow below also has to catch.
  const summaryForSlot = useCallback((slot: number) => {
    const snap = planSlots.peekSlot(slot);
    const plan = snap?.compPlan;
    if (!plan) return "Empty";
    const names = new Set<string>();
    let hasUnavailable = false;
    for (const v of Object.values(plan)) {
      if (!v || v.empty || !v.productId) continue;
      const name = productNameById.get(v.productId);
      if (name) names.add(name); else hasUnavailable = true;
    }
    const parts = Array.from(names);
    if (hasUnavailable) parts.push("unavailable product");
    return parts.length > 0 ? parts.join(", ") : "Empty";
  }, [planSlots, productNameById]);

  const presetSheetSummary = useMemo(() => {
    if (presetSheetSlot == null) return "";
    return summaryForSlot(presetSheetSlot);
  }, [presetSheetSlot, summaryForSlot]);

  // PresetQuickPick's per-row name -- direct peekSlot read, no memoization
  // needed (cheap localStorage read, same pattern peekSlot's own callers
  // already use elsewhere on this page).
  const nameForSlot = useCallback((slot: number) => planSlots.peekSlot(slot)?.name, [planSlots]);

  // PresetQuickPick's per-row colored-dot readout -- per explicit direction
  // ("instead of describing the plan just use colored dots for a quick
  // visual representation... the product selection, and each [compartment]")
  // -- reusing the same productColorFor family-coding the outage banner's
  // detail cards already use (diesel yellow / premium red / else white).
  // An empty compartment (or one with no product selected) renders black;
  // a compartment whose product isn't resolvable at the current terminal
  // (see summaryForSlot's own "unavailable product" case) still gets a
  // real dot -- productColorFor("") falls through to white -- rather than
  // silently disappearing from the readout.
  //
  // Iterates over the equipment's own real `compartments` list now, not
  // just whatever keys happen to exist in the saved plan snapshot -- per
  // explicit follow-up ("on this trailer, 3 comps, all plans should have
  // 3 dots"): a preset saved before this pass, or one whose snapshot never
  // recorded a since-added compartment, previously produced fewer dots
  // than the trailer actually has. Reading real compartment numbers
  // instead means the dot count can never drift from the truth, and a
  // missing plan entry for a real compartment (not just one explicitly
  // marked empty) also correctly renders black rather than being skipped.
  //
  // Order: DESCENDING comp number, not ascending -- matches
  // PlannerControls.tsx's own physical display order exactly (see that
  // file's `ordered = [...compartments].sort(asc).reverse()`, "right-to-
  // left display" comment) -- per explicit correction ("comp 1 is on the
  // right, looking at the passenger side... the dots are backwards").
  const colorsForSlot = useCallback((slot: number): string[] => {
    const plan = planSlots.peekSlot(slot)?.compPlan;
    return [...compartments]
      .map((c: any) => Number(c.comp_number))
      .sort((a, b) => b - a)
      .map((n) => {
        const v = plan?.[n];
        return (!v || v.empty || !v.productId) ? "#000000" : productColorFor(productNameById.get(v.productId) ?? "");
      });
  }, [planSlots, productNameById, compartments]);

  // Same tap-to-load/tap-empty-to-save sequence the old PresetDial's own
  // onLoad/onSave props used -- preserved verbatim, just triggered from
  // PresetQuickPick's row taps now instead of the dial's.
  const handlePresetLoad = (n: number) => {
    planSlots.loadFromSlot(n);
    setActiveSlotLetter(n);
    setCaptureBaselineNext(true);
    setCheckAvailabilityNext(true);
    setPresetQuickPickOpen(false);
  };
  // No two plans share a layout (which product is in which compartment). Saving a
  // layout you already have updates that plan instead of making a second one.
  const planSlotWithLayout = (plan: Record<number, any>, except?: number): number | null => {
    const nums = compartments.map((c) => Number(c.comp_number)).filter(Number.isFinite);
    const toLayout = (p: Record<number, any> | undefined) => layoutFromProducts(
      Object.fromEntries(Object.entries(p ?? {}).map(([n, v]: [string, any]) => [Number(n), v && !v.empty ? v.productId : null])), nums);
    const mine = toLayout(plan);
    const others = [1, 2, 3, 4, 5].filter((n) => n !== except).map((n) => ({ slot: n, comps: toLayout(planSlots.peekSlot(n)?.compPlan) }));
    return findMatchingPlan(others, mine)?.slot ?? null;
  };
  // PresetActionSheet (long-press on a saved plan): Load, Edit (save over it) or Clear.
  const handlePresetSheetLoad = () => {
    if (presetSheetSlot != null) {
      planSlots.loadFromSlot(presetSheetSlot);
      setActiveSlotLetter(presetSheetSlot);
      setCaptureBaselineNext(true);
      setCheckAvailabilityNext(true);
    }
    setPresetSheetSlot(null);
  };
  const handlePresetSheetEdit = () => {
    if (presetSheetSlot != null) {
      planSlots.saveToSlot(presetSheetSlot);
      setBaselineOverrides(overridesSnapshot(compPlan, cgSlider));
    }
    setPresetSheetSlot(null);
  };
  const handlePresetSheetClear = () => {
    if (presetSheetSlot != null) planSlots.clearSlot(presetSheetSlot);
    setPresetSheetSlot(null);
  };
  const closePresetSheet = () => setPresetSheetSlot(null);
  const handlePresetSaveEmpty = (n: number) => {
    const dup = planSlotWithLayout(compPlan, n);
    if (dup != null) n = dup;
    planSlots.saveToSlot(n);
    setBaselineOverrides(overridesSnapshot(compPlan, cgSlider));
    setActiveSlotLetter(n);
    setPresetQuickPickOpen(false);
  };

  const [wizardNew, setWizardNew] = useState(false);
  const hasAnyPlan = useMemo(() => {
    const holds = (plan: any) => Object.values(plan ?? {}).some((v: any) => v && !v.empty && v.productId);
    if (holds(compPlan)) return true;
    for (let n = 1; n <= 5; n++) { const snap = planSlots.peekSlot(n); if (snap && holds(snap.compPlan)) return true; }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compPlan, planSlots.slotHas, planSlots.presetsReady, equipment.selectedComboId]);
  const wizardAuto = !!equipment.selectedComboId && !equipment.isBobtail && !equipment.isTrailerOnly
    && !!selectedTrailerId && !compLoading && compartments.length > 0
    && planSlots.presetsReady && planRestoreAttempted
    && !onboardingActive && !setupSession && !hasAnyPlan
    && !loadWorkflow.loadingOpen && !loadWorkflow.activeLoadId;
  const wizardOpen = wizardNew || wizardAuto;
  const canSetCap = shell.isSuperAdmin || shell.role === "admin" || shell.role === "lead" || shell.role === "dispatch";

  const handleWizardSaveCaps = useCallback(async (changes: Record<number, number>) => {
    if (!selectedTrailerId) return;
    for (const [n, cap] of Object.entries(changes)) {
      const { data, error } = await supabase.from("trailer_compartments").update({ cap_gallons: cap })
        .eq("trailer_id", selectedTrailerId).eq("comp_number", Number(n)).select("comp_number");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("not allowed to change this cap");
    }
    setCompartments((prev) => prev.map((c) => (changes[Number(c.comp_number)] != null ? { ...c, cap_gallons: changes[Number(c.comp_number)] } : c)));
  }, [selectedTrailerId]);

  const handleWizardFinish = useCallback((plan: Record<number, any>) => {
    const slotFilled = (n: number) => { const snap = planSlots.peekSlot(n); return !!snap && Object.values(snap.compPlan ?? {}).some((v: any) => v && !v.empty && v.productId); };
    const empty = [1, 2, 3, 4, 5].find((n) => !slotFilled(n));
    const dupSlot = planSlotWithLayout(plan);
    const target = dupSlot ?? empty ?? activeSlotLetter;
    const first = !hasAnyPlan;
    planSlots.saveSnapshotToSlot(target, { compPlan: plan, name: first ? "Default" : undefined }, { makeLive: true });
    setActiveSlotLetter(target);
    setCaptureBaselineNext(true);
    setBaselineOverrides(overridesSnapshot(plan, cgSlider));
    setWizardNew(false);
    if (!wizardNew && !active) router.push("/planner?plan=1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSlots, activeSlotLetter, hasAnyPlan, cgSlider, wizardNew, active, router]);


  return {
    presetSheetSlot, setPresetSheetSlot, presetQuickPickOpen, setPresetQuickPickOpen,
    summaryForSlot, presetSheetSummary, nameForSlot, colorsForSlot,
    handlePresetLoad, handlePresetSaveEmpty, handlePresetSheetLoad, handlePresetSheetEdit, handlePresetSheetClear, closePresetSheet,
    planSlotWithLayout, hasAnyPlan, wizardNew, setWizardNew, wizardOpen, canSetCap, handleWizardSaveCaps, handleWizardFinish,
  };
}
