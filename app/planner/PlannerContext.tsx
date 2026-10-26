"use client";
// app/planner/PlannerContext.tsx
//
// The Planner model, shared. PlannerHost builds it once with usePlannerModel() and
// provides it; every window (flow) and page component reads what it needs with
// usePlanner() instead of being handed props. The type comes from the model itself,
// so there is nothing to declare twice.

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { PlannerModel } from "./model/usePlannerModel";

export type PlannerCtx = PlannerModel;

const Ctx = createContext<PlannerCtx | null>(null);

export function PlannerProvider({ value, children }: { value: PlannerCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlanner(): PlannerCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlanner must be used inside <PlannerProvider>");
  return v;
}
