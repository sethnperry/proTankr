"use client";
// app/planner/hooks/usePlanDirty.ts
//
// "Is the plan on screen different from what was last saved or loaded?" A
// snapshot of the plan (product, empty flag and cap per compartment, plus CG)
// is compared against a baseline taken right after the last load or save. The
// baseline is re-captured for a short quiet period after a load so the plan's
// asynchronous restore can land first. Lifted out of PlannerHost unchanged.

import { useCallback, useEffect, useState } from "react";
import type { CompPlanInput } from "../types";

export function usePlanDirty(compPlan: Record<number, CompPlanInput>, cgSlider: number) {
  // "Save plan {letter}" is dirty-tracked against a baseline snapshot taken
  // right after the last load/save -- it only shows when the current plan
  // actually diverges from what's saved, and hides itself immediately after
  // a successful save (per explicit feedback: no button when there's nothing
  // new to save). Covers everything buildSnapshot()/saveToSlot() actually
  // persist -- product selection + empty flag + cap override per comp, and
  // the CG slider -- not just cap overrides, so picking a different product
  // or sliding CG also surfaces the button.
  const overridesSnapshot = useCallback((plan: Record<number, CompPlanInput>, cg: number) => {
    const comps: Record<number, { productId: string; empty: boolean; capOverride: number | null }> = {};
    for (const k of Object.keys(plan || {})) {
      const v = (plan as any)[k] ?? {};
      comps[Number(k)] = {
        productId: v.productId ?? "",
        empty: !!v.empty,
        capOverride: v.capOverride ?? null,
      };
    }
    return JSON.stringify({ comps, cg: Math.round((Number(cg) || 0) * 1000) / 1000 });
  }, []);
  // Lazy initializer (not a literal "{}") so the baseline matches whatever
  // compPlan/cgSlider actually start as -- broadening the snapshot to include
  // productId/empty/cg means a hardcoded "{}" no longer matches an empty
  // plan's real serialized shape, which made "Save plan" appear spuriously
  // on a completely fresh mount.
  const [baselineOverrides, setBaselineOverrides] = useState(() => overridesSnapshot(compPlan, cgSlider));
  const [captureBaselineNext, setCaptureBaselineNext] = useState(false);
  // Fires once compPlan has actually re-rendered post-load (loadFromSlot
  // applies asynchronously via the hook's own setCompPlan), so the baseline
  // reflects what was really loaded, not what was on screen before it.
  //
  // Re-captures on every compPlan/cgSlider change while the flag is set,
  // and only clears it after a short quiet period (debounced, same idea as
  // usePlanSlots' own 350ms autosave debounce) rather than immediately on
  // the first change. usePlanSlots' automatic restores (slot-0-on-terminal-
  // change, last-load-from-log-on-combo-claim) hit the DB first and call
  // setCompPlan/setCgSlider only once that resolves -- consuming the flag
  // on the very next render (the pre-restore value) meant the baseline got
  // locked in *before* the real restore landed, so the button showed
  // "dirty" the instant equipment/terminal was picked, before the user had
  // touched anything.
  useEffect(() => {
    if (!captureBaselineNext) return;
    setBaselineOverrides(overridesSnapshot(compPlan, cgSlider));
    const t = setTimeout(() => setCaptureBaselineNext(false), 600);
    return () => clearTimeout(t);
  }, [compPlan, cgSlider, captureBaselineNext, overridesSnapshot]);

  return { overridesSnapshot, baselineOverrides, setBaselineOverrides, captureBaselineNext, setCaptureBaselineNext };
}
