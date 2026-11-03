"use client";
// app/planner/components/shift/ShiftSheet.tsx
//
// The Shift pop-out (opened from the footer): the scheduled start, Start or End shift, a short recap of the days
// and hours worked this pay period (today's line appears once a shift has started), Call out and Sign out.
// Presentational: the caller owns the data and what each button does.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "@/app/planner/home/dashLook";
import { recapDate, type Recap } from "@/lib/shifts/recap";

export function ShiftSheet({ open, onClose, scheduled, running, recap, periodLabel, onStart, onEnd, onCallout, onSignOut }: {
  open: boolean; onClose: () => void;
  scheduled: string | null; running: boolean; recap: Recap; periodLabel: string;
  onStart: () => void; onEnd: () => void; onCallout: () => void; onSignOut: () => void;
}) {
  const L = useDashLook();
  const [confirmOut, setConfirmOut] = useState(false);
  useEffect(() => { if (!open) setConfirmOut(false); }, [open]);
  const big: React.CSSProperties = { width: "100%", padding: "16px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2 };
  const small: React.CSSProperties = { ...L.secondary, flex: 1, color: "#fff", padding: "13px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", textAlign: "center" };
  return (
    <FullscreenModal open={open} title="Shift" onClose={onClose} footer={null}>
      <div style={{ ...L.secondary, display: "flex", justifyContent: "space-between", padding: "12px 14px", marginBottom: 12, fontSize: 14 }}>
        <span style={{ color: L.muted }}>Scheduled start</span>
        <b>{scheduled ?? "Not scheduled"}</b>
      </div>

      {running
        ? <button type="button" onClick={onEnd} className="dash-press" style={{ ...big, border: "1px solid #fff", background: "#0f0f10", color: "#fff" }}>End shift</button>
        : <button type="button" onClick={onStart} className="dash-press" style={{ ...big, border: "none", background: "#fff", color: "#000" }}>Start shift</button>}

      <div style={{ ...L.sectionLabel, marginTop: 22 }}>{periodLabel}</div>
      {recap.rows.length === 0 && <div style={{ color: L.muted, fontSize: 14, padding: "6px 0" }}>No shifts yet this period.</div>}
      {recap.rows.map((r) => (
        <div key={r.date} className="dash-num" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${L.hairline}`, fontSize: 15 }}>
          <span>{recapDate(r.date)}{r.meeting >= 0.05 && <span style={{ color: L.muted, fontSize: 12 }}> · incl. safety meeting {r.meeting.toFixed(1)}</span>}</span><b>{r.hours.toFixed(1)} h</b>
        </div>
      ))}
      {recap.rows.length > 0 && (
        <div className="dash-num" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 15, color: L.muted }}>
          <span>Total</span><b style={{ color: "#fff" }}>{recap.total.toFixed(1)} h</b>
        </div>
      )}

      {!confirmOut ? (
        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <button type="button" onClick={onCallout} className="dash-press" style={small}>Call out</button>
          <button type="button" onClick={() => setConfirmOut(true)} className="dash-press" style={{ ...small, color: "#f87171" }}>Sign out</button>
        </div>
      ) : (
        <div style={{ ...L.secondary, marginTop: 24, padding: 14, borderColor: "rgba(248,113,113,0.55)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Sign out?</div>
          <div style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>You will have to send a new magic link email to log back in.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setConfirmOut(false)} className="dash-press" style={small}>Stay signed in</button>
            <button type="button" onClick={onSignOut} className="dash-press" style={{ ...small, background: "#fff", color: "#000" }}>Sign out</button>
          </div>
        </div>
      )}
    </FullscreenModal>
  );
}
