"use client";
// app/planner/components/shift/ExplanationSheet.tsx
//
// Shown when the driver ends a shift that ran past the company's limit: what happened, from the company's own
// reason list. Skippable (the manager sees shifts with no explanation). Presentational.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { ReasonChips, type ReasonPick } from "../reasons/ReasonChips";
import { clockHM } from "@/lib/shifts/shiftLogic";
import { explanationProblem } from "@/lib/shifts/explanation";

export function ExplanationSheet({ open, hours, reasons, onSubmit, onSkip, onClose }: {
  open: boolean;
  hours: number;
  reasons: { reason_id: string; label: string; category: string | null }[];
  onSubmit: (pick: ReasonPick) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<ReasonPick | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setPick(null); setErr(null); } }, [open]);
  return (
    <FullscreenModal open={open} title="Long shift" onClose={onClose} footer={null}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>This shift ran {clockHM(hours)}.</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>What happened?</div>
      <ReasonChips reasons={reasons} value={pick} onPick={(p) => { setPick(p); setErr(null); }} />
      {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
      <button type="button" onClick={() => { const e = explanationProblem(pick); if (e) setErr(e); else onSubmit(pick!); }}
        style={{ width: "100%", marginTop: 18, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>
        Submit and end shift
      </button>
      <button type="button" onClick={onSkip}
        style={{ width: "100%", marginTop: 10, padding: "14px 0", fontSize: 14, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", cursor: "pointer" }}>
        Skip and end shift
      </button>
    </FullscreenModal>
  );
}
