"use client";
// app/planner/components/shift/ShiftBar.tsx
//
// Start and End shift on the Driver Dashboard, with the long-shift and idle questions. Presentational: it gets
// the shift and the callbacks (see app/planner/hooks/useShift.ts) and imports no data code.

import React from "react";
import { clockHM, type Shift, type ShiftPrompt } from "@/lib/shifts/shiftLogic";
import { LOOK } from "../../home/dashLook";

/** Header controls in the same shape as the Dispatch region button and mode switch:
 *  Start/End shift on top, then a two-part readout: when the shift began | how long it has run. */
export function ShiftControls({ shift, onStart, onEnd }: { shift: Shift | null; onStart: () => void; onEnd: () => void }) {
  const began = shift ? new Date(shift.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase() : "—";
  const seg: React.CSSProperties = { padding: "7px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 1 };
  return (
    <>
      {shift
        ? <button type="button" onClick={onEnd} className="dash-press" style={{ border: "1px solid #fff", background: "#0f0f10", color: "#fff", cursor: "pointer", padding: "8px 10px", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>End shift</button>
        : <button type="button" onClick={onStart} className="dash-press" style={{ border: "none", background: "#fff", color: "#000", cursor: "pointer", padding: "9px 11px", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Start shift</button>}
      <div role="group" aria-label="Shift" className="dash-num" style={{ display: "inline-flex", padding: 2, border: `1px solid ${LOOK.hairline}`, background: "#0f0f10", flexShrink: 0 }}>
        <span style={{ ...seg, background: "#fff", color: "#000" }}>Began {began}</span>
        <span style={{ ...seg, color: LOOK.muted }}>{shift ? clockHM(shift.hours) : "0:00"}</span>
      </div>
    </>
  );
}

export function ShiftBar({ shift, prompt, onEnd, onAckLong, onKeepGoing }: {
  shift: Shift | null;
  prompt: ShiftPrompt;
  onEnd: () => void;
  onAckLong: () => void;
  onKeepGoing: () => void;
}) {
  const btn: React.CSSProperties = { ...LOOK.secondary, color: "#fff", padding: "9px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" };
  return (
    <div style={{ marginBottom: shift && prompt ? 14 : 0 }}>
      {shift && prompt === "long" && (
        <div style={{ ...LOOK.secondary, marginTop: 8, padding: "11px 14px", borderColor: "rgba(251,191,36,0.55)" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>This is a long shift. Still working?</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onAckLong} style={{ ...btn, flex: 1 }}>Still on shift</button>
            <button type="button" onClick={onEnd} style={{ ...btn, flex: 1 }}>End shift</button>
          </div>
        </div>
      )}
      {shift && prompt === "idle" && (
        <div style={{ ...LOOK.secondary, marginTop: 8, padding: "11px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Nothing for a while. Still working?</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onKeepGoing} style={{ ...btn, flex: 1 }}>Still working</button>
            <button type="button" onClick={onEnd} style={{ ...btn, flex: 1 }}>End shift</button>
          </div>
        </div>
      )}
    </div>
  );
}
