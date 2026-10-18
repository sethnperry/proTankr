"use client";
// modals/ProductTempModal.tsx
//
// Step one of tapping LOAD (2026-09-05) -- was previously its own
// always-available header icon (a live °F reading, tappable any time).
// Removed from the header per explicit direction to reduce its icon
// count; opening this modal is now the first thing LOAD does, before
// LoadingModal's "Plan Review" step -- see page.tsx's loadButtonEl and
// handleConfirmTempAndBeginLoad. Content/behavior below (prediction
// banner, per-product temp list, the dial) is otherwise unchanged.

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { FuelTempConfidence } from "../hooks/useFuelTempPrediction";

type Styles = {
  smallBtn: React.CSSProperties;
  help: React.CSSProperties;
};

type TempDialProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
};

type TempProductGroup = {
  productId: string;
  name: string;
  hex: string;
  tempF: number;
};

function clampNum(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Same row shape as LoadingModal's planned-compartments rows (dot + name in
// light gray + value in bold white) -- continuity across the two temp-facing
// screens, gallons swapped for each product's own planned temp here. Tapping
// a row opens a popup that visually matches the dial's own center-tap popup,
// but scoped to just this one product -- doesn't touch the others.
function ProductTempList({ groups, onSetProductTemp }: {
  groups: TempProductGroup[];
  onSetProductTemp: (productId: string, value: number) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const editingGroup = groups.find((g) => g.productId === editingId) ?? null;

  function openEdit(g: TempProductGroup) {
    setEditingValue(String(g.tempF));
    setEditingId(g.productId);
  }
  function commitEdit() {
    if (!editingId) return;
    const parsed = clampNum(Math.round((Number(editingValue) || 0) * 10) / 10, -20, 140);
    onSetProductTemp(editingId, parsed);
    setEditingId(null);
  }

  if (groups.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {groups.map((g) => (
        <button
          key={g.productId}
          type="button"
          onClick={() => openEdit(g)}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
            padding: "9px 12px", borderRadius: 2,
            border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)",
            cursor: "pointer", width: "100%", textAlign: "left" as const,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.hex, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {g.name}
            </span>
          </div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
            {g.tempF.toFixed(1)}°F
          </div>
        </button>
      ))}

      {editingGroup && (
        <div
          onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingLeft: 24, paddingRight: 24, paddingBottom: 24, paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 280, background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const, textAlign: "center" as const }}>
              Set Temp (°F) — {editingGroup.name}
            </div>
            <input
              type="text" inputMode="decimal" autoFocus
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value.replace(/[^0-9.\-]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); }}
              style={{ width: "100%", textAlign: "center" as const, background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.20)", color: "#fff", fontSize: 40, fontWeight: 700, padding: "4px 0" }}
            />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>-20° to 140°</div>
            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
              <button type="button" onClick={() => setEditingId(null)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={commitEdit}
                style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Single source of truth for confidence -> color, shared by the dot/label and the
// predicted temp number below. Keeps the two from ever disagreeing again.
const CONFIDENCE_COLOR: Record<FuelTempConfidence, string> = {
  high:   "#4ade80",
  medium: "#fbbf24",
  low:    "#f87171",
};
const CONFIDENCE_LABEL: Record<FuelTempConfidence, string> = {
  high:   "HIGH CONFIDENCE",
  medium: "MEDIUM CONFIDENCE",
  low:    "LOW CONFIDENCE",
};

function ConfidenceDot({ confidence }: { confidence: FuelTempConfidence | null }) {
  if (!confidence) return null;
  const color = CONFIDENCE_COLOR[confidence];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: 0.6 }}>{CONFIDENCE_LABEL[confidence]}</span>
    </span>
  );
}

function PredictionBanner({
  loading, error, predictedTempF, confidence, currentTempF, onAccept,
}: {
  loading: boolean;
  error: string | null;
  predictedTempF: number | null;
  confidence: FuelTempConfidence | null;
  currentTempF: number;
  onAccept: (v: number) => void;
}) {
  const isAccepted = predictedTempF != null && Math.abs(currentTempF - predictedTempF) < 0.15;

  if (loading) {
    return (
      <div style={{
        borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)", padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          border: "2px solid rgba(255,255,255,0.12)", borderTopColor: "rgba(255,255,255,0.55)",
          animation: "ptSpin 0.8s linear infinite",
        }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
            Predicting product temp…
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
            Fetching 30h weather · running thermal model
          </div>
        </div>
        <style>{`@keyframes ptSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || predictedTempF == null) return null;

  return (
    <div style={{
      borderRadius: 2,
      border: isAccepted ? "1px solid rgba(74,222,128,0.25)" : "1px solid rgba(255,255,255,0.10)",
      background: isAccepted ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.03)",
      padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: 0.6 }}>
            PREDICTED PRODUCT TEMP
          </span>
          <ConfidenceDot confidence={confidence} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: confidence ? CONFIDENCE_COLOR[confidence] : "rgba(255,255,255,0.85)", lineHeight: 1 }}>
            {predictedTempF.toFixed(1)}°F
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            conservative · errs cold
          </span>
        </div>
      </div>
      {isAccepted ? (
        <div style={{ fontSize: 12, fontWeight: 800, color: "#4ade80", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>✓</span> APPLIED
        </div>
      ) : (
        <button type="button" onClick={() => onAccept(predictedTempF)} style={{
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 2, padding: "8px 16px", color: "rgba(255,255,255,0.85)",
          fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          USE THIS
        </button>
      )}
    </div>
  );
}


// ─── Main modal ───────────────────────────────────────────────────────────────

export default function ProductTempModal(props: {
  open: boolean;
  onClose: () => void;
  // Fired by the footer's "Confirm & Continue" button -- this modal is now
  // step one of tapping LOAD (was previously its own always-available
  // header icon, opened at any time with no particular next step). onClose
  // (the header's plain "Close" button, or backdrop/Escape) is the bail-
  // out -- no load has started yet at this point, so it just closes with
  // no further action, same as it always has. See page.tsx's
  // handleConfirmTempAndBeginLoad for what onConfirm actually does.
  onConfirm: () => void;
  styles: Styles;
  selectedCity: string;
  selectedState: string;
  selectedTerminalId?: string | null;
  ambientTempLoading: boolean;
  ambientTempF: number | null;
  tempF: number;
  setTempF: React.Dispatch<React.SetStateAction<number>>;
  productGroups: TempProductGroup[];
  onSetProductTemp: (productId: string, value: number) => void;
  predictedFuelTempF?: number | null;
  fuelTempConfidence?: FuelTempConfidence | null;
  fuelTempLoading?: boolean;
  TempDial: React.ComponentType<TempDialProps>;
}) {
  const {
    open, onClose, onConfirm, styles,
    selectedCity, selectedState,
    ambientTempLoading, ambientTempF,
    tempF, setTempF, TempDial,
    productGroups, onSetProductTemp,
    predictedFuelTempF = null,
    fuelTempConfidence = null,
    fuelTempLoading = false,
  } = props;

  const router = useRouter();

  // Auto-apply is fully handled by page.tsx.
  // Modal just displays the current tempF (already predicted or user-set)
  // and lets the driver override with the dial.

  return (
    <FullscreenModal
      open={open}
      title="Confirm Temp"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onConfirm}
          style={{ ...(styles as any).doneBtn, width: "100%", textAlign: "center" as const }}
        >
          Confirm & Continue
        </button>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>

        <div style={{ textAlign: "center", fontWeight: 800, letterSpacing: 0.2, userSelect: "none" }}>
          <span style={{ color: "white" }}>
            {selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : "City, ST"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.50)" }}>{" "} - {" "}</span>
          <span style={{ color: "rgba(255,255,255,0.65)" }}>
            {ambientTempLoading ? "Loading…" : ambientTempF == null ? "—" : `${Math.round(ambientTempF)}°F ambient`}
          </span>
        </div>

        <PredictionBanner
          loading={fuelTempLoading}
          error={null}
          predictedTempF={predictedFuelTempF}
          confidence={fuelTempConfidence}
          currentTempF={tempF}
          onAccept={(v) => setTempF(v)}
        />

        <ProductTempList groups={productGroups} onSetProductTemp={onSetProductTemp} />

        <TempDial value={tempF} min={-20} max={140} step={0.1} onChange={(v) => setTempF(v)} />

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) - 0.5) * 10) / 10)}>−0.5</button>
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) - 0.1) * 10) / 10)}>−0.1</button>
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF(60)} title="Snap to 60°F">60°</button>
          {predictedFuelTempF != null && Math.abs(tempF - predictedFuelTempF) > 0.15 && (
            <button type="button"
              style={{ ...styles.smallBtn, color: "rgba(255,255,255,0.92)", borderColor: "rgba(255,255,255,0.35)" }}
              onClick={() => setTempF(predictedFuelTempF)}
              title="Snap to predicted temp">
              {predictedFuelTempF.toFixed(1)}°
            </button>
          )}
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) + 0.1) * 10) / 10)}>+0.1</button>
          <button type="button" style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) + 0.5) * 10) / 10)}>+0.5</button>
        </div>

        {/* Learn link */}
        <button
          type="button"
          onClick={() => { onClose(); router.push("/learn"); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "11px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", cursor: "pointer" }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>How this prediction works</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>›</span>
        </button>

      </div>
    </FullscreenModal>
  );
}
