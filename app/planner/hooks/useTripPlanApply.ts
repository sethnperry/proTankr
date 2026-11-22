"use client";
// app/planner/hooks/useTripPlanApply.ts
//
// Applies the plan chosen on Begin Trip, once, the first time the Planner opens for
// that trip. A saved plan (A-E) is loaded after presets have synced. A dispatch
// "quick load" instead runs its layout with CG centered, keeping the driver's caps, saving nothing.

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getTripPlan, markTripPlanApplied, takeTripQuick } from "@/lib/trips/tripPlan";
import type { CompPlanInput } from "../types";
import type { usePlanSlots } from "./usePlanSlots";

type Inputs = {
  effectiveUserId: string | null | undefined;
  tripId: string | null;
  planSlots: ReturnType<typeof usePlanSlots>;
  comboId: string | null | undefined;
  compartmentCount: number;
  handlePresetLoad: (slot: number) => void;
  setCompPlan: Dispatch<SetStateAction<Record<number, CompPlanInput>>>;
  setCgSlider: (v: number) => void;
  setCaptureBaselineNext: (v: boolean) => void;
};

export function useTripPlanApply(i: Inputs) {
  const { effectiveUserId, tripId, planSlots, comboId, compartmentCount, handlePresetLoad, setCompPlan, setCgSlider, setCaptureBaselineNext } = i;

  useEffect(() => {
    if (!effectiveUserId || !tripId || !planSlots.presetsReady || !comboId) return;
    const pending = getTripPlan(effectiveUserId, tripId);
    if (!pending || pending.applied) return;
    markTripPlanApplied(effectiveUserId, tripId);
    if (!planSlots.peekSlot(pending.slot)) return;
    handlePresetLoad(pending.slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, tripId, planSlots.presetsReady, comboId]);

  useEffect(() => {
    if (!effectiveUserId || !tripId || !planSlots.presetsReady || !comboId || compartmentCount === 0) return;
    if (!takeTripQuick(effectiveUserId, tripId)) return;
    // The driver's own compartment caps are a safety limit, not part of a layout: a quick load keeps them.
    setCgSlider(0.5);
    setCaptureBaselineNext(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, tripId, planSlots.presetsReady, comboId, compartmentCount]);
}
