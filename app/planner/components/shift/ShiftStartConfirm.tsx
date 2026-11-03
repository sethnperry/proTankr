"use client";
// app/planner/components/shift/ShiftStartConfirm.tsx
//
// "Start your shift?": shown before Begin Trip opens (or when telematics shows the driver on duty or driving, or a
// fuel stop or inspection starts). It states why, shows the start time, lets the driver change it, and starts the
// shift at that time. Presentational: the caller writes the shift event. Rules: lib/shifts/autoStart.ts.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DateTimePopout, formatDateTime } from "@/lib/ui/DateTimePopout";
import { useDashLook } from "@/app/planner/home/dashLook";
import { startTimeProblem } from "@/lib/shifts/autoStart";

export function ShiftStartConfirm({ open, reason, atMs, nowMs, skipLabel, onConfirm, onSkip }: {
  open: boolean; reason: string; atMs: number; nowMs: number;
  /** What the secondary button says ("Continue without a shift" / "Not now"). */
  skipLabel: string;
  onConfirm: (atMs: number) => void; onSkip: () => void;
}) {
  const L = useDashLook();
  const [at, setAt] = useState(atMs);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setAt(atMs); setErr(null); setPicking(false); } }, [open, atMs]);
  return (
    <>
      <FullscreenModal open={open && !picking} title="Start your shift?" onClose={onSkip} footer={null}>
        <div style={{ color: L.muted, fontSize: 14, marginBottom: 14 }}>{reason}</div>
        <button type="button" onClick={() => setPicking(true)} className="dash-press"
          style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", padding: "14px", marginBottom: 6, color: "#fff", cursor: "pointer" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>Start time</div>
          <div className="dash-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{formatDateTime(at)} ›</div>
        </button>
        <div style={{ fontSize: 12, color: L.faint, marginBottom: 14 }}>Tap to change it if you started earlier.</div>
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <button type="button" className="dash-press" onClick={() => { const p = startTimeProblem(at, nowMs); if (p) return setErr(p); onConfirm(at); }}
          style={{ width: "100%", padding: "16px 0", border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2 }}>Start shift</button>
        <button type="button" className="dash-press" onClick={onSkip}
          style={{ width: "100%", marginTop: 10, padding: "14px 0", border: `1px solid ${L.hairline}`, background: "transparent", color: "#fff", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2 }}>{skipLabel}</button>
      </FullscreenModal>
      <DateTimePopout open={open && picking} title="Shift start time" valueMs={at} onSet={(ms) => { setAt(ms); setErr(null); setPicking(false); }} onCancel={() => setPicking(false)} />
    </>
  );
}
