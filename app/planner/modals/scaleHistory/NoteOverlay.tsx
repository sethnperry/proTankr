"use client";
// app/planner/modals/scaleHistory/NoteOverlay.tsx
//
// Part of ScaleHistoryModal.tsx: full-text note popup.

import type { ScaleHistoryModel } from "./useScaleHistory";

export function NoteOverlay({ m }: { m: ScaleHistoryModel }) {
  const { noteOverlay, setNoteOverlay } = m;
  return (
    <>
      {noteOverlay && (
        <div onClick={() => setNoteOverlay(null)} style={{ position: "fixed", inset: 0, zIndex: 10300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#181c20", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 2, padding: 18, maxWidth: 320, maxHeight: "60vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>{noteOverlay}</div>
            <button onClick={() => setNoteOverlay(null)} style={{ marginTop: 14, width: "100%", padding: "10px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
