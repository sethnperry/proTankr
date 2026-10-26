"use client";
// app/planner/modals/loading/ErrorBanner.tsx
//
// Error message block.

import type { LoadingModel } from "./useLoadingModel";

export function ErrorBanner({ m }: { m: LoadingModel }) {
  const { errorMessage } = m;
  return errorMessage ? (
    <div
      style={{
        borderRadius: 2,
        border: "1px solid rgba(255,80,80,0.35)",
        background: "rgba(255,80,80,0.10)",
        padding: "10px 12px",
        color: "rgba(255,210,210,0.95)",
        fontWeight: 850,
        lineHeight: 1.25,
      }}
    >
      {errorMessage}
    </div>
  ) : null;
}
