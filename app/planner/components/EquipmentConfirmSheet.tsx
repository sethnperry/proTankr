"use client";
// app/planner/components/EquipmentConfirmSheet.tsx
//
// The first thing Begin Trip asks after the shift starts: confirm the equipment. A list of choices, free pairs parked
// where the driver is now, then their own last truck. Tapping a row highlights it (the coordinates are a link that
// opens the map and does not select); then Confirm, or Commandeer when someone has it. Find equipment opens the
// equipment picker, and when that closes the Begin Trip sequence carries on.

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { latLonText, mapsUrl } from "@/lib/equipment/parkedNearby";

const MUTE = "rgba(255,255,255,0.55)";
const primary: React.CSSProperties = { width: "100%", padding: "18px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", borderRadius: 2 };
const secondary: React.CSSProperties = { ...primary, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", marginTop: 8 };

export type EquipChoice = {
  key: string;
  truckName: string | null;
  trailerName: string | null;
  /** There is a trailer even if its name didn't come back: never call that a bobtail. */
  hasTrailer: boolean;
  lat: number | null;
  lon: number | null;
  label: string | null;
  parkedBy: string | null;
  status?: string | null;
  distanceMi: number | null;
  isLast: boolean;
  inUse: boolean;
  holderName: string | null;
};

export function EquipmentConfirmSheet({ open, choices, selectedKey, onSelect, busy, error, onConfirm, onFind, onClose }: {
  open: boolean;
  choices: EquipChoice[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onFind: () => void;
  onClose: () => void;
}) {
  const picked = choices.find((c) => c.key === selectedKey) ?? null;
  return (
    <FullscreenModal open={open} onClose={onClose} title="Equipment" footer={null}>
      <div style={{ fontSize: 13, color: MUTE, marginBottom: 12 }}>
        {choices.length > 1 ? "Tap the equipment you're taking, then confirm." : "Confirm the equipment you're taking."}
      </div>
      {choices.map((c) => {
        const on = c.key === selectedKey;
        return (
          <div key={c.key} role="button" tabIndex={0} onClick={() => onSelect(c.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(c.key); }}
            style={{ padding: "14px 14px", marginBottom: 8, cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.14)"}`, background: on ? "rgba(255,255,255,0.1)" : "#0f0f10", borderRadius: 2 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="dash-num" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "0.02em" }}>
                {c.truckName ?? "?"}{c.hasTrailer ? ` / ${c.trailerName ?? "?"}` : ""}
              </span>
              {c.isLast && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE }}>Your last truck</span>}
            </div>
            {!c.hasTrailer && <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>Truck only (bobtail)</div>}
            <div style={{ fontSize: 13, color: MUTE, marginTop: 6, display: "flex", flexWrap: "wrap", gap: "2px 8px", alignItems: "baseline" }}>
              {c.inUse ? (
                <span style={{ color: "#fbbf24", fontWeight: 700 }}>In use by {c.holderName ?? "another driver"}</span>
              ) : c.lat != null && c.lon != null ? (
                <>
                  <span>{c.parkedBy ? `parked by ${c.parkedBy}` : "parked"}{c.status ? ` - ${c.status}` : ""}</span>
                  <a href={mapsUrl(c.lat, c.lon)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                    style={{ color: "#60a5fa", textDecoration: "underline" }}>{latLonText(c.lat, c.lon)}</a>
                  {c.distanceMi != null && <span>{c.distanceMi < 0.1 ? "right here" : `${c.distanceMi.toFixed(1)} mi away`}</span>}
                </>
              ) : (
                <span>No pin saved</span>
              )}
            </div>
            {c.label && !c.inUse && <div style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{c.label}</div>}
          </div>
        );
      })}
      {error && <div style={{ marginTop: 6, color: "#f87171", fontSize: 13 }}>{error}</div>}
      <div style={{ marginTop: 16 }}>
        <button type="button" className="dash-press" style={{ ...primary, opacity: busy || !picked ? 0.45 : 1 }} disabled={busy || !picked} aria-busy={busy} onClick={onConfirm}>
          {busy ? "Working…" : picked?.inUse ? "Commandeer" : "Confirm"}
        </button>
        <button type="button" className="dash-press" style={secondary} disabled={busy} onClick={onFind}>Find equipment</button>
      </div>
    </FullscreenModal>
  );
}
