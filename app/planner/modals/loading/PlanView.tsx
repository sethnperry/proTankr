"use client";
// app/planner/modals/loading/PlanView.tsx
//
// Plan Review: header, editable compartments, load basis, live weight, actions.

import type { LoadingModel } from "./useLoadingModel";
import { ReviewHeader } from "./ReviewHeader";
import { RackWaitBar } from "./RackWaitBar";
import { PlanCompartments } from "./PlanCompartments";
import { TuneBasis } from "./TuneBasis";
import { PlanWeight } from "./PlanWeight";
import { ErrorBanner } from "./ErrorBanner";
import { PlanActions } from "./PlanActions";

export function PlanView({ m }: { m: LoadingModel }) {
  return (
    <>
      <ReviewHeader m={m} />
      <RackWaitBar m={m} />
      <PlanCompartments m={m} />
      <TuneBasis m={m} />
      <PlanWeight m={m} />
      <ErrorBanner m={m} />
      <PlanActions m={m} />
    </>
  );
}
