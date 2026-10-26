"use client";
// app/planner/modals/loading/PlanWeight.tsx
//
// Plan Review: live weight against target.

import { weightColor } from "./weight";
import type { LoadingModel } from "./useLoadingModel";

export function PlanWeight({ m }: { m: LoadingModel }) {
  const { livePreviewGrossLbs, showLivePreview, targetWeight } = m;
  return (
    showLivePreview && (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 12px",
          borderRadius: 2,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div
          style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 0.4, textTransform: "uppercase" as const }}
        >
          Live Weight
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: weightColor(livePreviewGrossLbs, targetWeight) }}>
          {Math.round(livePreviewGrossLbs!).toLocaleString()} lbs
        </div>
      </div>
    )
  );
}
