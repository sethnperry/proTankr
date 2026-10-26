"use client";
// modals/ScaleHistoryModal.tsx
//
// History of weight_records (Heavy/Light scale-ticket entries) for a combo, opened from the
// Tare / Target lines on the Equipment modal. Combo-level, so rows are flat by date.
// Model: scaleHistory/useScaleHistory; pieces: scaleHistory/*.

import { createPortal } from "react-dom";
import type { Props } from "./scaleHistory/types";
import { useScaleHistory } from "./scaleHistory/useScaleHistory";
import { HistoryTop } from "./scaleHistory/HistoryTop";
import { HistoryList } from "./scaleHistory/HistoryList";
import { HistoryDetail } from "./scaleHistory/HistoryDetail";
import { NoteOverlay } from "./scaleHistory/NoteOverlay";

export default function ScaleHistoryModal(props: Props) {
  const m = useScaleHistory(props);
  if (!props.open || typeof document === "undefined") return null;
  return createPortal(
    <div onClick={props.onClose} style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <HistoryTop m={m} />
        <HistoryList m={m} />
        <HistoryDetail m={m} />
      </div>
      <NoteOverlay m={m} />
    </div>,
    document.body
  );
}
