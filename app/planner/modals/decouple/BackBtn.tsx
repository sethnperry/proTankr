"use client";
// app/planner/modals/decouple/BackBtn.tsx
//
// Part of DecoupleModal.tsx.


import { D } from "./helpers";

export function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ ...D.btn, background: "transparent", border: "none", padding: "0 0 16px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
      ← Back
    </button>
  );
}
