"use client";
// app/planner/dispatch/useDriverPlans.ts
//
// The driver's saved plans (A-E) for the truck and trailer pairing being planned.
import { useCallback, useEffect, useState } from "react";
import { comboFor, loadDriverPlans, trailerComps, type PlanComp } from "@/lib/dispatch/driverPlansIO";
import type { PresetSummary } from "@/lib/trips/tripPlan";

export function useDriverPlans(driverId: string | null, truckId: string | null, trailerId: string | null) {
  const [state, setState] = useState<{ presets: PresetSummary[]; raw: Record<number, any>; comboId: string | null; comps: PlanComp[]; ready: boolean }>({ presets: [], raw: {}, comboId: null, comps: [], ready: false });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!driverId) return;
    let off = false;
    void (async () => {
      const [comboId, comps] = await Promise.all([comboFor(truckId, trailerId), trailerComps(trailerId)]);
      const { presets, raw } = await loadDriverPlans(driverId, comboId, comps.map((c) => c.comp_number));
      if (!off) setState({ presets, raw, comboId, comps, ready: true });
    })();
    return () => { off = true; };
  }, [driverId, truckId, trailerId, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { ...state, reload };
}
