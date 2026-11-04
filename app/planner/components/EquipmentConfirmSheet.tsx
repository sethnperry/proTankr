"use client";
// app/planner/components/EquipmentConfirmSheet.tsx
//
// The first thing Begin Trip asks after the shift starts: confirm the equipment. Shows the last truck with its trailer.
// Parked and free: Confirm. Held by another driver: Commandeer (it names them). Switch units opens the equipment
// picker, and when that closes the Begin Trip sequence carries on.

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

const MUTE = "rgba(255,255,255,0.55)";
const primary: React.CSSProperties = { width: "100%", padding: "18px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", borderRadius: 2 };
const secondary: React.CSSProperties = { ...primary, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", marginTop: 8 };

export function EquipmentConfirmSheet({ open, truckName, trailerName, hasTrailer, inUse, holderName, busy, error, onConfirm, onSwitch, onClose }: {
  open: boolean;
  truckName: string | null;
  trailerName: string | null;
  /** There is a trailer even if its name didn't come back: never call that a bobtail. */
  hasTrailer: boolean;
  inUse: boolean;
  holderName: string | null;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onSwitch: () => void;
  onClose: () => void;
}) {
  return (
    <FullscreenModal open={open} onClose={onClose} title="Equipment" footer={null}>
      <div style={{ fontSize: 13, color: MUTE }}>{inUse ? "Your last truck is in use." : "Your last truck is parked and free."}</div>
      <div className="dash-num" style={{ margin: "14px 0 4px", fontSize: 36, fontWeight: 900, letterSpacing: "0.02em" }}>Truck {truckName ?? "?"}</div>
      <div className="dash-num" style={{ fontSize: 24, fontWeight: 800, color: hasTrailer ? "#fff" : MUTE }}>{hasTrailer ? `Trailer ${trailerName ?? ""}`.trim() : "No trailer (bobtail)"}</div>
      {inUse && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid rgba(251,191,36,0.55)", background: "rgba(251,191,36,0.08)", fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>
          In use by {holderName ?? "another driver"}. Commandeering takes it from them.
        </div>
      )}
      {error && <div style={{ marginTop: 12, color: "#f87171", fontSize: 13 }}>{error}</div>}
      <div style={{ marginTop: 22 }}>
        <button type="button" className="dash-press" style={{ ...primary, opacity: busy ? 0.5 : 1 }} disabled={busy} aria-busy={busy} onClick={onConfirm}>
          {busy ? "Working…" : inUse ? "Commandeer" : "Confirm"}
        </button>
        <button type="button" className="dash-press" style={secondary} disabled={busy} onClick={onSwitch}>Switch units</button>
      </div>
    </FullscreenModal>
  );
}
