"use client";
// app/planner/hooks/usePlannerWindowState.ts
//
// Open/closed flags and small pieces of state shared between the Planner's windows
// and its model hooks: the compartment picker, temperature dial, Finish Loading
// sheet, stale-API choice, tuned readings, the active plan letter, and the
// "recall under different equipment" prompt. Plain state, no logic. (Equipment,
// location, terminal and expirations windows are open/closed in the shell.)

import { useCallback, useRef, useState } from "react";
import type { StaleProduct } from "../components/StaleApiOverlay";

export function usePlannerWindowState() {
  // The equipment, location, terminal and expirations windows are open/closed in the
  // shell, because the header opens them too.
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalComp, setCompModalComp] = useState<number | null>(null);
  const [tempDialOpen, setTempDialOpen] = useState(false);
  // The Finish Loading choice sheet (log the load / update card only / keep editing).
  const [cancelLoadConfirmOpen, setCancelLoadConfirmOpen] = useState(false);
  // The terminal's access date before begin_load re-carded it, so "Back to Planner" can
  // undo that. A null prevValue means there was no prior record.
  const preLoadCardedOnRef = useRef<{ terminalId: string; prevValue: string | null } | null>(null);

  // ── Stale-API safety ───────────────────────────────────────────────────────
  // Per-product API override that forces a heavier density when the driver chose
  // Safest/Safe for a stale reading. Cleared when Plan Review closes.
  const [apiSafetyOverride, setApiSafetyOverride] = useState<Record<string, number>>({});
  // Per-product API and temperature the driver tuned in Plan Review. Overrides the
  // density basis for that product. Cleared when Plan Review closes.
  const [tunedApiTempByProduct, setTunedApiTempByProduct] = useState<Record<string, { api: number; tempF: number }>>({});
  // The stale-API decision overlay's own open state + which products it lists.
  const [staleApiPrompt, setStaleApiPrompt] = useState<{ products: StaleProduct[] } | null>(null);
  // A stale-API choice sets the override and flips this; an effect then begins the load
  // on the next render, once the plan has recomputed against the override.
  const [beginAfterOverride, setBeginAfterOverride] = useState(false);

  // ── Action row state ───────────────────────────────────────────────────────
  // activeSlotLetter is the plan letter on screen. Every load is tagged with it.
  // selectedComp is the compartment last tapped.
  const [activeSlotLetter, setActiveSlotLetter] = useState(1);
  const [selectedComp, setSelectedComp] = useState<number | null>(null);
  // usePlanSlots calls this when the live plan restores, to put the plan letter back.
  const handlePlanRestored = useCallback((slot: number | null) => {
    if (slot != null) setActiveSlotLetter(slot);
  }, []);
  // Holds back seeding blank compartment entries until usePlanSlots has tried to restore
  // the saved plan for this combo; otherwise a blank plan could be autosaved over it.
  const [planRestoreAttempted, setPlanRestoreAttempted] = useState(false);
  const handleRestoreAttempted = useCallback(() => {
    setPlanRestoreAttempted(true);
  }, []);
  // Recall Last Load found a load at this terminal under different equipment. Informational
  // only: it links to that load's report and never switches equipment.
  const [altEquipmentPrompt, setAltEquipmentPrompt] = useState<{ loadId: string; truckLabel: string; trailerLabel: string } | null>(null);


  return {
    compModalOpen,
    setCompModalOpen,
    compModalComp,
    setCompModalComp,
    tempDialOpen,
    setTempDialOpen,
    cancelLoadConfirmOpen,
    setCancelLoadConfirmOpen,
    apiSafetyOverride,
    setApiSafetyOverride,
    tunedApiTempByProduct,
    setTunedApiTempByProduct,
    staleApiPrompt,
    setStaleApiPrompt,
    beginAfterOverride,
    setBeginAfterOverride,
    activeSlotLetter,
    setActiveSlotLetter,
    selectedComp,
    setSelectedComp,
    planRestoreAttempted,
    setPlanRestoreAttempted,
    altEquipmentPrompt,
    setAltEquipmentPrompt,
    preLoadCardedOnRef,
    handlePlanRestored,
    handleRestoreAttempted,
  };
}
