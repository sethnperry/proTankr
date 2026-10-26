"use client";
// app/planner/hooks/planSlots/types.ts
//
// Inputs to usePlanSlots.

import type { CompPlanInput } from "../../types";

export type Props = {
  authUserId: string;
  selectedTerminalId: string;
  selectedComboId: string;
  tempF: number;
  compPlan: Record<number, CompPlanInput>;
  setCompPlan: (v: Record<number, CompPlanInput>) => void;
  cgSlider: number;
  setCgSlider: (v: number) => void;
  compartmentsLoaded: boolean;
  // Called by useLoadWorkflow after completeLoad — writes slot 0 as equipment-scoped
  onSaveLastLoad?: (payload: any) => Promise<void>;
  // page.tsx's activeSlotLetter -- read (via a ref, so the debounced
  // autosave never closes over a stale value) when writing slot 0's own
  // snapshot, so a refresh can restore the plan-letter highlight from
  // what was actually on screen instead of always deriving it from the
  // driver's last COMPLETED load (see the restore effect below).
  activeSlotLetter?: number | null;
  // Fired whenever slot 0 is restored from a genuine local draft (raw
  // exists) -- with that draft's own saved activeSlot (or null, if it was
  // a manually-edited plan with no preset tied to it). page.tsx uses this
  // to set activeSlotLetter/lastLoadedSlot AND to mark the one-shot
  // "already resolved" guard that otherwise lets the last-completed-load
  // fallback hijack the highlight. Never fired when slot 0 is genuinely
  // empty, so that fallback still gets to run for a brand-new combo.
  onPlanRestored?: (activeSlot: number | null) => void;
  // Fired once, unconditionally, at the end of the mount-time "restore the
  // live plan on combo change" effect -- regardless of whether a real local
  // draft was actually found. Unlike onPlanRestored (which only fires for a
  // genuine hit), page.tsx needs SOME signal that the synchronous restore
  // attempt for the current combo has already happened at all, so its own
  // "seed a blank entry per real compartment" effect can wait for it --
  // real bug found via a live debug capture: that effect reads compPlan via
  // a functional updater (always sees the latest state), but if it runs
  // before this restore attempt has had a chance to apply anything (e.g.
  // compartments happen to resolve before the combo does), it fills in
  // fully blank per-compartment entries against a still-empty compPlan --
  // and since that's a real compPlan change, the debounced autosave picks
  // it up and can persist it, permanently overwriting a real saved plan
  // with an all-empty one the next time this combo loads.
  onRestoreAttempted?: () => void;
};
