"use client";
// app/planner/modals/loading/ReportView.tsx
//
// The read-only Load Report: header, compartments, basis, actual weight, actions.

import type { LoadingModel } from "./useLoadingModel";
import { ReviewHeader } from "./ReviewHeader";
import { ReportCompartments } from "./ReportCompartments";
import { TuneBasis } from "./TuneBasis";
import { ReportWeight } from "./ReportWeight";
import { ErrorBanner } from "./ErrorBanner";
import { ReportActions } from "./ReportActions";

export function ReportView({ m }: { m: LoadingModel }) {
  return (
    <>
      <ReviewHeader m={m} />
      <ReportCompartments m={m} />
      <TuneBasis m={m} />
      <ReportWeight m={m} />
      <ErrorBanner m={m} />
      <ReportActions m={m} />
    </>
  );
}
