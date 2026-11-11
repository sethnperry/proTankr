"use client";
// app/planner/components/shift/OffDutySheet.tsx
//
// The driver says they are still working while the ELD shows off duty: why? From the company's own list (default
// starter reasons). The answer is saved on the shift and feeds gray-zone reporting and the PTD explanation.
// Presentational; there is no skip, the question stays until it is answered.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { ReasonChips, type ReasonPick } from "../reasons/ReasonChips";
import { explanationProblem } from "@/lib/shifts/explanation";

export function OffDutySheet({ open, statusLabel, reasons, onSubmit, onClose }: {
  open: boolean;
  statusLabel: string;
  reasons: { reason_id: string; label: string; category: string | null }[];
  onSubmit: (pick: ReasonPick) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<ReasonPick | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setPick(null); setErr(null); } }, [open]);
  return (
    <FullscreenModal open={open} title="Working off duty" onClose={onClose} footer={null}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Your ELD shows {statusLabel.toLowerCase()}.</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>Why are you still working?</div>
      <ReasonChips reasons={reasons} value={pick} onPick={(p) => { setPick(p); setErr(null); }} />
      {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
      <button type="button" onClick={() => { const e = explanationProblem(pick); if (e) setErr(e); else onSubmit(pick!); }}
        style={{ width: "100%", marginTop: 18, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>
        Submit
      </button>
    </FullscreenModal>
  );
}
