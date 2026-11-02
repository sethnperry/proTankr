"use client";
// app/planner/components/shift/ShiftBar.tsx
//
// Start and End shift on the Driver Dashboard, with the long-shift and idle questions. Presentational: it gets
// the shift and the callbacks (see app/planner/hooks/useShift.ts) and imports no data code.

import React from "react";
import { clockHM, type Shift, type ShiftPrompt } from "@/lib/shifts/shiftLogic";
import { LOOK } from "../../home/dashLook";

export function ShiftBar({ shift, prompt, onStart, onEnd, onAckLong, onKeepGoing }: {
  shift: Shift | null;
  prompt: ShiftPrompt;
  onStart: () => void;
  onEnd: () => void;
  onAckLong: () => void;
  onKeepGoing: () => void;
}) {
  const btn: React.CSSProperties = { ...LOOK.secondary, color: "#fff", padding: "9px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...LOOK.primary, display: "flex", alignItems: "center", gap: 12, padding: "11px 14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...LOOK.sectionLabel, margin: 0 }}>{shift ? "On shift" : "Shift"}</div>
          <div className="dash-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 2, color: shift ? "#fff" : LOOK.muted }}>
            {shift ? clockHM(shift.hours) : "Not started"}
          </div>
        </div>
        {shift
          ? <button type="button" onClick={onEnd} style={btn}>End shift</button>
          : <button type="button" onClick={onStart} style={{ ...btn, background: "#fff", color: "#000", border: "none" }}>Start shift</button>}
      </div>
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
