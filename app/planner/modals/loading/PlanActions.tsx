"use client";
// app/planner/modals/loading/PlanActions.tsx
//
// Plan Review: Finish Loading, update card, report issue, back.

import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../../cards/cardTheme";
import type { LoadingModel } from "./useLoadingModel";

export function PlanActions({ m }: { m: LoadingModel }) {
  const {
    busy,
    loadedDisabled,
    loadedLabel,
    logLoadButtonRef,
    onBackToPlanner,
    onReportTerminalIssue,
    onUpdateCardOnly,
    startLogSequence,
    styles,
  } = m;
  return (
    /* Action buttons -- the "next steps" that used to live in a separate
             sheet, now directly in the modal. */
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      <button
        ref={logLoadButtonRef}
        type="button"
        onClick={startLogSequence}
        disabled={busy}
        aria-busy={busy}
        style={{ ...(styles as any).doneBtn, opacity: busy ? 0.55 : 1, width: "100%" }}
      >
        {loadedDisabled ? (loadedLabel ?? "Saving…") : "Finish Loading"}
      </button>

      <button
        type="button"
        onClick={onUpdateCardOnly}
        disabled={busy}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 2,
          border: CARD_BORDER,
          background: CARD_BG,
          boxShadow: CARD_SHADOW,
          color: "rgba(255,255,255,0.90)",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          opacity: busy ? 0.55 : 1,
        }}
      >
        Couldn't load
      </button>

      <button
        type="button"
        onClick={onReportTerminalIssue}
        disabled={busy}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 2,
          border: CARD_BORDER,
          background: CARD_BG,
          boxShadow: CARD_SHADOW,
          color: "rgba(255,255,255,0.90)",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          opacity: busy ? 0.55 : 1,
        }}
      >
        Report Terminal Issue
      </button>

      <button
        type="button"
        onClick={onBackToPlanner}
        disabled={busy}
        style={{
          width: "100%",
          padding: "10px 0",
          borderRadius: 2,
          border: "none",
          background: "transparent",
          color: "rgba(255,255,255,0.40)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          opacity: busy ? 0.55 : 1,
        }}
      >
        Didn&apos;t Load / Cancel
      </button>
    </div>
  );
}
