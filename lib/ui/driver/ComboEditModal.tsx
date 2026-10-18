"use client";

/**
 * ComboEditModal — shared between driver EquipmentModal and admin page.
 *
 * Edits: tare weight, target gross weight.
 * No truck/trailer dropdowns — decouple to change units.
 * No combo name field, no buffer field.
 *
 * Shell: FullscreenModal (same as EquipmentModal family).
 */

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

// ─── Minimal combo shape needed by this modal ────────────────────────────────

export type ComboEditTarget = {
  combo_id: string;
  tare_lbs?: number | null;
  target_weight?: number | null;
  claimed_by?: string | null;
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  label: {
    fontSize: 13, fontWeight: 700 as const,
    color: "rgba(255,255,255,0.55)", marginBottom: 6, display: "block",
  },
  input: {
    width: "100%", borderRadius: 2, padding: "12px 14px",
    border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.28)",
    color: "rgba(255,255,255,0.92)", fontSize: 18, fontWeight: 700 as const,
    outline: "none", boxSizing: "border-box" as const,
  } as React.CSSProperties,
  err: {
    borderRadius: 2, padding: 14,
    background: "rgba(180,40,40,0.18)", border: "1px solid rgba(180,40,40,0.32)",
    color: "rgba(255,255,255,0.92)", fontWeight: 700, marginBottom: 16,
    fontSize: 13, lineHeight: 1.5,
  } as React.CSSProperties,
  info: {
    borderRadius: 2, padding: 14,
    background: "rgba(40,80,180,0.14)", border: "1px solid rgba(64,140,255,0.22)",
    color: "rgba(200,220,255,0.88)", fontSize: 14, lineHeight: 1.5,
    marginBottom: 16, fontWeight: 700 as const,
  } as React.CSSProperties,
  btn: {
    borderRadius: 2, padding: "8px 14px", fontWeight: 900 as const,
    fontSize: 13, letterSpacing: 0.5,
    border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.92)", cursor: "pointer",
    whiteSpace: "nowrap" as const, flexShrink: 0,
  } as React.CSSProperties,
  btnPrimary: {
    background: "rgba(255,255,255,0.13)",
    border: "1px solid rgba(255,255,255,0.20)",
  } as React.CSSProperties,
  btnDecouple: {
    background: "rgba(180,80,20,0.18)", border: "1px solid rgba(220,120,40,0.35)",
    color: "rgba(255,190,120,0.95)",
  } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ComboEditModal({
  open,
  onClose,
  combo,
  truckName,
  trailerName,
  claimedByName,
  onDecouple,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  combo: ComboEditTarget | null;
  truckName?: string | null;
  trailerName?: string | null;
  claimedByName?: string | null;
  onDecouple: () => void;
  onSaved: () => void;
}) {
  const [tareLbs,   setTareLbs]   = useState("");
  const [targetLbs, setTargetLbs] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState<string | null>(null);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    if (!open || !combo) return;
    setTareLbs(combo.tare_lbs   != null ? String(combo.tare_lbs)    : "");
    setTargetLbs((combo as any).target_weight != null ? String((combo as any).target_weight) : "");
    setErr(null);
    setSaved(false);
  }, [open, combo?.combo_id]);

  if (!combo) return null;

  const label = [truckName, trailerName].filter(Boolean).join(" / ") || "Unknown";
  const tooClose = Number(targetLbs) >= 79500;

  async function handleSave() {
    if (!combo) return;
    setSaving(true); setErr(null); setSaved(false);
    try {
      const tare   = Number(tareLbs);
      const target = Number(targetLbs);
      const patch: Record<string, any> = {};
      if (tareLbs   && Number.isFinite(tare)   && tare   > 0) patch.tare_lbs      = tare;
      if (targetLbs && Number.isFinite(target) && target > 0) patch.target_weight = target;

      const { error } = await supabase
        .from("equipment_combos")
        .update(patch)
        .eq("combo_id", combo.combo_id);
      if (error) throw error;
      setSaved(true);
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FullscreenModal open={open} onClose={onClose} title="Edit Combo" footer={null}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#000" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 8px" }}>

          {/* Combo identity header */}
          <div style={{
            borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)", padding: "14px 16px",
            marginTop: 6, marginBottom: 20,
          }}>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>{label}</div>
            {claimedByName && (
              <div style={{ marginTop: 6, color: "rgba(255,170,80,0.90)", fontWeight: 800, fontSize: 13 }}>
                In use · {claimedByName}
              </div>
            )}
          </div>

          {err && <div style={S.err}>{err}</div>}
          {saved && !err && <div style={S.info}>Saved ✓</div>}

          {/* Tare */}
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Tare weight (lbs)</label>
            <input
              type="number" inputMode="numeric" placeholder="e.g. 34800"
              value={tareLbs}
              onChange={(e) => { setTareLbs(e.target.value); setSaved(false); }}
              style={S.input}
              disabled={saving}
            />
          </div>

          {/* Target */}
          <div style={{ marginBottom: tooClose ? 4 : 24 }}>
            <label style={S.label}>Target gross weight (lbs)</label>
            <input
              type="number" inputMode="numeric" placeholder="80000"
              value={targetLbs}
              onChange={(e) => { setTargetLbs(e.target.value); setSaved(false); }}
              style={S.input}
              disabled={saving}
            />
          </div>
          {tooClose && (
            <div style={{ padding: "8px 12px", borderRadius: 2, marginBottom: 24,
              background: "rgba(180,50,20,0.12)", border: "1px solid rgba(220,80,40,0.35)" }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "#fb923c", letterSpacing: 0.8, marginBottom: 2 }}>⚠ CUTTING IT CLOSE</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
                Right at the legal limit. Consider a small buffer for API variance and density shifts.
              </div>
            </div>
          )}

          {/* Save */}
          <button aria-busy={!!(saving)}
            type="button"
            style={{ ...S.btn, ...S.btnPrimary, width: "100%", padding: "15px 18px", borderRadius: 2, fontSize: 16, textAlign: "center" as const, marginBottom: 12, opacity: saving ? 0.55 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>

          {/* Decouple */}
          <button
            type="button"
            style={{ ...S.btn, ...S.btnDecouple, width: "100%", padding: "13px 18px", borderRadius: 2, fontSize: 15, textAlign: "center" as const, opacity: saving ? 0.55 : 1 }}
            onClick={() => { onClose(); onDecouple(); }}
            disabled={saving}
          >
            DECOUPLE
          </button>

        </div>

        {/* Done footer */}
        <div style={{
          padding: "12px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "#000", flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%", borderRadius: 2, padding: "15px 18px",
              fontWeight: 900, fontSize: 17,
              border: "none",
              background: "#fff",
              color: "#000", cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </FullscreenModal>
  );
}
