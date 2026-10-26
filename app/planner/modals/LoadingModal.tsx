"use client";
// app/planner/modals/LoadingModal.tsx
//
// Plan Review before loading, and the read-only Load Report after. This file only
// composes: the model is loading/useLoadingModel, the pieces are in loading/.

import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useLoadingModel } from "./loading/useLoadingModel";
import { PlanView } from "./loading/PlanView";
import { ReportView } from "./loading/ReportView";
import { FinishOverlays } from "./loading/FinishOverlays";
import { TourSpotlights } from "./loading/TourSpotlights";
import type { LoadingModalProps } from "./loading/types";

export type { LoadingTripMode, TripCompExtra, TripLoadExtras, ProductInputs, TuneRow } from "./loading/types";

export default function LoadingModal(props: LoadingModalProps) {
  const m = useLoadingModel(props);
  return (
    <FullscreenModal open={m.open} title={m.report ? "Load Report" : "Plan Review"} onClose={m.onClose} footer={null} hideCloseButton>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        {m.report ? <ReportView m={m} /> : <PlanView m={m} />}
      </div>
      <FinishOverlays m={m} />
      <TourSpotlights m={m} />
    </FullscreenModal>
  );
}
