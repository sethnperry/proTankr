"use client";
// app/planner/components/shift/ShiftBar.tsx
//
// Start and End shift on the Driver Dashboard, with the long-shift and idle questions. Presentational: it gets
// the shift and the callbacks (see app/planner/hooks/useShift.ts) and imports no data code.

import React from "react";
import { clockHM, type Shift, type ShiftPrompt } from "@/lib/shifts/shiftLogic";
import { LOOK } from "../../home/dashLook";
import { HEADER_CTRL_W } from "../dash/DashChrome";

/** Header controls in the same shape as the Dispatch region button and mode switch:
 *  Start/End shift on top, then a two-part readout: when the shift began | how long it has run. */
export function ShiftControls({ shift, onStart, onEnd }: { shift: Shift | null; onStart: () => void; onEnd: () => void }) {
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const began = shift ? hm(new Date(shift.startedAt)) : "--:--";
  const mins = shift ? Math.max(0, Math.round(shift.hours * 60)) : 0;
  const elapsed = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const btn: React.CSSProperties = { width: HEADER_CTRL_W, boxSizing: "border-box", cursor: "pointer", padding: "8px 0", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 };
  const cell = (value: string, on: boolean): React.ReactNode => (
    <span className="dash-num" style={{ flex: 1, textAlign: "center", padding: "7px 0", fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", borderRadius: 1, background: on ? "#fff" : "transparent", color: on ? "#000" : LOOK.muted }}>{value}</span>
  );
  return (
    <>
      {shift
        ? <button type="button" onClick={onEnd} className="dash-press" style={{ ...btn, border: "1px solid #fff", background: "#0f0f10", color: "#fff" }}>End shift</button>
        : <button type="button" onClick={onStart} className="dash-press" style={{ ...btn, border: "none", background: "#fff", color: "#000" }}>Start shift</button>}
      <div role="group" aria-label="Shift" style={{ display: "flex", padding: 2, border: `1px solid ${LOOK.hairline}`, background: "#0f0f10", flexShrink: 0, width: HEADER_CTRL_W, boxSizing: "border-box" }}>
        {cell(began, true)}
        {cell(elapsed, false)}
      </div>
    </>
  );
}

export function ShiftBar({ shift, prompt, onEnd, onAckLong, onKeepGoing }: {
  shift: Shift | null;
  /** "off_duty": telematics shows the driver off duty with the shift still open. */
  prompt: ShiftPrompt | "off_duty";
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
      {shift && prompt === "off_duty" && (
        <div style={{ ...LOOK.secondary, marginTop: 8, padding: "11px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Telematics shows you off duty. Still working?</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onKeepGoing} style={{ ...btn, flex: 1 }}>Still working</button>
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
