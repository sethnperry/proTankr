"use client";
// app/planner/hooks/usePlanSlotsView.ts
//
// What the Planner does with the saved plans A-E: how each one reads in the quick
// pick (summary, name, colored dots), loading and saving them (one plan per
// layout), the Load / Edit / Clear sheet, and the Plan Builder's open/finish
// logic. Lifted out of PlannerHost unchanged.

import { useRouter } from "next/navigation";
import { segsFor, type StripSeg } from "@/lib/equipment/trailerStrip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";
import { detourActive, finishDetour, RESUME_URL, startDetour } from "@/lib/trips/planDetour";
import { productColorFor } from "../utils/productColor";
import type { PlanLineComp } from "../components/PlanLine";

import type { Dispatch, SetStateAction } from "react";
import type { useCalculatorShell } from "../CalculatorShellContext";
import type { useLoadWorkflow } from "./useLoadWorkflow";
import type { usePlanSlots } from "./usePlanSlots";
import type { CompPlanInput, CompRow } from "../types";
import { MAX_PLAN_SLOTS, PLAN_SLOT_NUMBERS } from "@/lib/planSlotLimit";

type Inputs = {
  shell: ReturnType<typeof useCalculatorShell>;
  active: boolean;
  planSlots: ReturnType<typeof usePlanSlots>;
  productNameById: Map<string, string>;
  terminalProducts: any[];
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
    shell, active, planSlots, productNameById, terminalProducts, compartments, setCompartments, compLoading, selectedTrailerId, compPlan, cgSlider,
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

  // PresetQuickPick's per-row readout: one entry per real compartment, highest number first (the trip card's
  // order), with the product's button code, full name and color. Empty compartments have no code.
  const compsForSlot = useCallback((slot: number): PlanLineComp[] => {
    const plan = planSlots.peekSlot(slot)?.compPlan;
    const byId = new Map<string, any>(terminalProducts.map((p: any) => [String(p.product_id), p]));
    return [...compartments].map((c: any) => Number(c.comp_number)).sort((a, b) => b - a).map((num) => {
      const v = plan?.[num];
      if (!v || v.empty || !v.productId) return { num, code: null, name: null, color: null };
      const p = byId.get(String(v.productId));
      const name = productNameById.get(v.productId) ?? null;
      const code = String(p?.button_code ?? p?.product_code ?? (name ?? "").split(/\s+/)[0] ?? "").trim().toUpperCase() || "?";
      const hex = typeof p?.hex_code === "string" && p.hex_code.trim() ? p.hex_code.trim() : null;
      return { num, code, name: name ?? "Unavailable product", color: hex ?? productColorFor(name ?? "") };
    });
  }, [planSlots, productNameById, terminalProducts, compartments]);

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
    const others = PLAN_SLOT_NUMBERS.filter((n) => n !== except).map((n) => ({ slot: n, comps: toLayout(planSlots.peekSlot(n)?.compPlan) }));
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
  // Clearing a plan closes the gap: every later plan moves up one letter, so there is never an empty plan between two plans.
  const handlePresetSheetClear = () => {
    const n = presetSheetSlot;
    if (n != null) {
      const holds = (snap: any) => !!snap && Object.values(snap.compPlan ?? {}).some((v: any) => v && !v.empty && v.productId);
      let k = n;
      while (k < MAX_PLAN_SLOTS) {
        const next: any = planSlots.peekSlot(k + 1);
        if (!holds(next)) break;
        planSlots.saveSnapshotToSlot(k, { compPlan: next.compPlan, cgSlider: next.cgSlider, name: next.name });
        k++;
      }
      planSlots.clearSlot(k);
      if (activeSlotLetter > n && activeSlotLetter <= k) setActiveSlotLetter(activeSlotLetter - 1);
    }
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
    for (const n of PLAN_SLOT_NUMBERS) { const snap = planSlots.peekSlot(n); if (snap && holds(snap.compPlan)) return true; }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compPlan, planSlots.slotHas, planSlots.presetsReady, equipment.selectedComboId]);
  // A saved plan but an empty live plan (no terminal yet, so nothing was autosaved, or a fresh
  // device): load the first saved plan once, so Begin Loading finds it instead of sending the
  // driver to the plan page. Never replaces a live plan, never runs mid-load.
  const seededLiveFor = useRef<string | null>(null);
  useEffect(() => {
    const combo = equipment.selectedComboId;
    if (!combo || seededLiveFor.current === combo) return;
    if (!planSlots.presetsReady || !planRestoreAttempted || compLoading || compartments.length === 0) return;
    if (loadWorkflow.loadingOpen || loadWorkflow.activeLoadId || setupSession || onboardingActive) return;
    seededLiveFor.current = combo;
    const holds = (plan: any) => Object.values(plan ?? {}).some((v: any) => v && !v.empty && v.productId);
    if (holds(compPlan)) return;
    for (const n of PLAN_SLOT_NUMBERS) {
      const snap = planSlots.peekSlot(n);
      if (snap && holds(snap.compPlan)) { handlePresetLoad(n); return; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment.selectedComboId, planSlots.presetsReady, planRestoreAttempted, compLoading, compartments.length]);
  // Opened from the Begin / Edit Trip card to make or change a plan: "?detour=new" or "?detour=edit&slot=N".
  const detourDone = useRef(false);
  useEffect(() => {
    if (detourDone.current || typeof window === "undefined" || !active || !planSlots.presetsReady || !planRestoreAttempted || compLoading || compartments.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("detour");
    if (!kind) return;
    detourDone.current = true;
    const slot = Number(params.get("slot"));
    params.delete("detour"); params.delete("slot");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    startDetour();
    if (kind === "edit" && slot >= 1 && slot <= MAX_PLAN_SLOTS) handlePresetLoad(slot);
    else setWizardNew(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, planSlots.presetsReady, planRestoreAttempted, compLoading, compartments.length]);
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

  // Trailer-level save from the compartment window: the physical max and/or the safety cap. Keeps safety <= max.
  const handleSaveTrailerComp = useCallback(async (comp: number, patch: { max_gallons?: number; cap_gallons?: number | null }) => {
    if (!selectedTrailerId) return;
    const { data, error } = await supabase.from("trailer_compartments").update(patch)
      .eq("trailer_id", selectedTrailerId).eq("comp_number", comp).select("comp_number");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("not allowed to change this trailer");
    setCompartments((prev) => prev.map((c) => (Number(c.comp_number) === comp ? { ...c, ...patch } : c)));
  }, [selectedTrailerId]);

  // keepLive: save the new plan to its slot but leave the live plan (what the trip in progress will load) alone.
  const handleWizardFinish = useCallback((plan: Record<number, any>, opts?: { keepLive?: boolean }) => {
    const slotFilled = (n: number) => { const snap = planSlots.peekSlot(n); return !!snap && Object.values(snap.compPlan ?? {}).some((v: any) => v && !v.empty && v.productId); };
    const empty = PLAN_SLOT_NUMBERS.find((n) => !slotFilled(n));
    const dupSlot = planSlotWithLayout(plan);
    const target = dupSlot ?? empty ?? activeSlotLetter;
    const first = !hasAnyPlan;
    planSlots.saveSnapshotToSlot(target, { compPlan: plan, name: first ? "Default" : undefined }, { makeLive: !opts?.keepLive });
    if (!opts?.keepLive) {
      setActiveSlotLetter(target);
      setCaptureBaselineNext(true);
      setBaselineOverrides(overridesSnapshot(plan, cgSlider));
    }
    setWizardNew(false);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("plan-saved", { detail: { slot: target } }));
    if (detourActive()) { finishDetour(target); router.push(RESUME_URL); return; }
    if (!wizardNew && !active) router.push("/planner?plan=1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSlots, activeSlotLetter, hasAnyPlan, cgSlider, wizardNew, active, router]);


  return {
    presetSheetSlot, setPresetSheetSlot, presetQuickPickOpen, setPresetQuickPickOpen,
    summaryForSlot, presetSheetSummary, compsForSlot, 
    handlePresetLoad, handlePresetSaveEmpty, handlePresetSheetLoad, handlePresetSheetEdit, handlePresetSheetClear, closePresetSheet,
    planSlotWithLayout, hasAnyPlan, wizardNew, setWizardNew, wizardOpen, canSetCap, handleWizardSaveCaps, handleSaveTrailerComp, handleWizardFinish,
  };
}
