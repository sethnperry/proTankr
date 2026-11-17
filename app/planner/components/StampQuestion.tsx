"use client";
// app/planner/components/StampQuestion.tsx
//
// The question a back arrow asks when the window stamped a time (arrival, begin loading, finish loading, begin
// delivery): undo that time, or keep it. Both leave the window; "Stay here" is just a dismiss.

import React from "react";

/** "23:45" or "11:45 PM", the way the phone shows time. */
export const stampClock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

export function StampQuestion({ open, title, undoLabel, keepLabel, onUndo, onKeep, onStay }: {
  open: boolean; title: string; undoLabel: string; keepLabel: string; onUndo: () => void; onKeep: () => void; onStay: () => void;
}) {
  if (!open) return null;
  const btn: React.CSSProperties = { width: "100%", padding: "15px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", borderRadius: 2 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.6)" }} onClick={onStay}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 640, background: "#0b0b0b", borderTop: "1px solid rgba(255,255,255,0.18)", padding: "18px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>{title}</div>
        <button type="button" onClick={onKeep} style={{ ...btn, background: "#fff", color: "#000", border: "none" }}>{keepLabel}</button>
        <button type="button" onClick={onUndo} style={{ ...btn, background: "transparent", color: "#f87171", border: "1px solid rgba(248,113,113,0.55)" }}>{undoLabel}</button>
        <button type="button" onClick={onStay} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, padding: "8px 0", cursor: "pointer" }}>Stay here</button>
      </div>
    </div>
  );
}
