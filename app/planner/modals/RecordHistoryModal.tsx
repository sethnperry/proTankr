"use client";
// modals/RecordHistoryModal.tsx
//
// Service/Wash history view -- equipment-settings-spec.md §5. Tapping the
// "Service" or "Washed on" report line on the main Equipment modal opens
// this (a full chronological list), not the record-creation modal directly.
//
// Rows are flattened to one row per unit per record (not merged into a
// "Both" group) but still visually grouped under a date header. A record
// whose service type doesn't apply to its own unit (see applies_to on
// service_types -- e.g. a miles-interval type logged on a trailer, or a
// trailer-only type logged on a truck) only exists because it tagged along
// on a "Both" service with the other unit, so its collapsed line calls that
// out directly ("Wet (with Truck 25184)") instead of showing a bogus due-at
// calculation.
//
// Only one row is ever expanded at a time -- expanding reveals shop/
// location/notes plus the due/reading line, and a bottom action bar
// (Edit/Delete) appears for that one row. This is the solo tier, so the
// driver has full read/write/delete control here (RLS already allows it);
// gating this to admin-only is a fleet-tier follow-up, not implemented yet.

import { createPortal } from "react-dom";
import { useRecordHistory } from "./recordHistory/useRecordHistory";
import { HistoryHeader } from "./recordHistory/HistoryHeader";
import { HistoryList } from "./recordHistory/HistoryList";
import { HistoryActionBar } from "./recordHistory/HistoryActionBar";
import type { Props } from "./recordHistory/types";

export type { RecordHistoryKind } from "./recordHistory/types";

export default function RecordHistoryModal(props: Props) {
  const m = useRecordHistory(props);
  const { open } = props;
  const { onClose, noteOverlay, setNoteOverlay } = m;
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <HistoryHeader m={m} />
        <HistoryList m={m} />
        <HistoryActionBar m={m} />
      </div>

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
    </div>,
    document.body
  );

}
