"use client";
// app/planner/components/CompartmentDetailModal.tsx
//
// Opens when a compartment is tapped on the Plan page: one compartment drawn
// large, then Max volume / Safety cap / Driver's cap rows (each opens a
// number pop-out), and Change product / Close. Max and Safety belong to the
// trailer (lead drivers and admins); the driver's cap is the driver's own and
// "Auto" means no cap.

import React, { useState } from "react";
import { HEADSPACE_SCALE } from "../utils/headspace";
import ValueEntryOverlay from "./ValueEntryOverlay";

type Field = "max" | "safety" | "driver";

export default function CompartmentDetailModal({
  open, compNumber, trueMax, persistedCap, capGallons, plannedGallons, hasOverride,
  productLabel, code, color, isEmpty, canEditTrailer, onCapChange, onResetCap, onSaveTrailer, onChangeProduct, onClose,
}: {
  open: boolean;
  compNumber: number | null;
  trueMax: number;
  persistedCap: number;
  capGallons: number;
  plannedGallons: number;
  hasOverride: boolean;
  productLabel: string;
  code: string;
  color: string;
  isEmpty: boolean;
  /** Lead drivers and admins may change the trailer's max and safety cap. */
  canEditTrailer: boolean;
  onCapChange: (gallons: number) => void;
  onResetCap: () => void;
  onSaveTrailer: (patch: { max_gallons?: number; cap_gallons?: number | null }) => Promise<void>;
  onChangeProduct: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Field | null>(null);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open || compNumber == null) return null;

  const scaledMax = Math.max(1, trueMax * HEADSPACE_SCALE);
  const fillPct = Math.max(0, Math.min(1, Math.min(plannedGallons, capGallons) / scaledMax));
  const capPct = Math.max(0, Math.min(1, capGallons / scaledMax));

  const begin = (f: Field) => {
    const cur = f === "max" ? trueMax : f === "safety" ? persistedCap : hasOverride ? capGallons : persistedCap;
    setValue(String(Math.round(cur)));
    setErr(null);
    setEditing(f);
  };

  const submit = async () => {
    const n = Math.max(0, Math.round(Number(value) || 0));
    setErr(null);
    if (editing === "driver") {
      onCapChange(Math.min(n, persistedCap));
      setEditing(null);
      return;
    }
    if (n <= 0) { setErr("Enter a gallon amount."); return; }
    setBusy(true);
    try {
      if (editing === "max") {
        await onSaveTrailer(persistedCap > n ? { max_gallons: n, cap_gallons: n } : { max_gallons: n });
      } else {
        await onSaveTrailer({ cap_gallons: Math.min(n, trueMax) });
      }
      setEditing(null);
    } catch (e: any) {
      setErr(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const rows: { f: Field; label: string; val: string; editable: boolean; note: string }[] = [
    { f: "max", label: "Max volume", val: `${Math.round(trueMax).toLocaleString()} gal`, editable: canEditTrailer, note: "Trailer" },
    { f: "safety", label: "Safety cap", val: `${Math.round(persistedCap).toLocaleString()} gal`, editable: canEditTrailer, note: "Trailer" },
    { f: "driver", label: "Driver's cap", val: hasOverride ? `${Math.round(capGallons).toLocaleString()} gal` : "Auto", editable: true, note: "You" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Compartment ${compNumber}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 360, maxHeight: "94vh", overflowY: "auto", background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, padding: 18, display: "grid", gap: 14, color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Compartment {compNumber}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: isEmpty ? "rgba(255,255,255,0.35)" : color }}>{code}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 110, height: 190, background: "rgba(255,255,255,0.06)" }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              {capPct < 0.999 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${(1 - capPct) * 100}%`, background: "rgba(0,0,0,0.30)", borderBottom: "1px dashed rgba(255,160,0,0.5)" }} />
              )}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fillPct * 100}%`, background: isEmpty ? "rgba(255,255,255,0.08)" : color, transition: "height 250ms ease" }} />
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{productLabel}</div>

        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <button key={r.f} type="button" disabled={!r.editable} onClick={() => begin(r.f)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "16px 14px", minHeight: 56, borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", cursor: r.editable ? "pointer" : "default", opacity: r.editable ? 1 : 0.6, textAlign: "left" }}>
              <span>
                <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{r.label}</span>
                <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{r.note}{!r.editable ? " · lead driver or admin" : ""}</span>
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: r.f === "driver" && hasOverride ? "#ffb020" : "#fff" }}>{r.val}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" onClick={onChangeProduct} style={{ padding: "13px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer" }}>
            {isEmpty ? "Pick product" : "Change product"}
          </button>
          <button type="button" onClick={onClose} style={{ padding: "13px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <ValueEntryOverlay
          open={editing != null}
          title={editing === "max" ? `Comp ${compNumber} max volume` : editing === "safety" ? `Comp ${compNumber} safety cap` : `Comp ${compNumber} driver's cap`}
          hint={editing === "driver" ? `up to ${Math.round(persistedCap).toLocaleString()} gal` : editing === "safety" ? `up to ${Math.round(trueMax).toLocaleString()} gal (max)` : "Physical size of this compartment"}
          fields={editing ? [{ key: "g", label: "Gallons", value: value, onChange: setValue }] : []}
          error={err}
          busyLabel={busy ? "Saving…" : null}
          footer={editing === "driver" ? (
            <button type="button" onClick={() => { onResetCap(); setEditing(null); }}
              style={{ width: "100%", padding: "12px", borderRadius: 2, border: "1px solid rgba(255,176,32,0.5)", background: "rgba(255,176,32,0.08)", color: "#ffb020", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              Auto (no cap)
            </button>
          ) : undefined}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
        />
      </div>
    </div>
  );
}
