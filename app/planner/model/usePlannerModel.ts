"use client";
// app/planner/model/usePlannerModel.ts
//
// The Planner model, composed from four layers in dependency order. Each layer is a
// hook that takes the earlier layers' results and returns its own; this file only
// stitches them together. The result is what usePlanner() gives every window and
// page component (see PlannerContext.tsx).

import { usePlannerView } from "./usePlannerView";
import { usePlanModel } from "./usePlanModel";
import { useLoadModel } from "./useLoadModel";
import { usePlanPageModel } from "./usePlanPageModel";

export function usePlannerModel() {
  const v = usePlannerView();
  const p = usePlanModel(v);
  const l = useLoadModel(v, p);
  const g = usePlanPageModel(v, p, l);
  return {
    ...v,
    ...p,
    ...l,
    ...g,
    openCancelLoadSheet: () => p.setCancelLoadConfirmOpen(true),
  };
}

export type PlannerModel = ReturnType<typeof usePlannerModel>;
