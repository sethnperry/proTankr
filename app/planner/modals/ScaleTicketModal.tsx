"use client";
// modals/ScaleTicketModal.tsx
//
// Solo-tier replacement for the shared ComboEditModal ("Edit Combo") --
// equipment-settings-spec.md §6. Differences from ComboEditModal:
//  - Renamed "Scale Ticket".
//  - No "In-Use by User" header line (fleet-only concept).
//  - No Save Changes / Decouple buttons. Decoupling now happens by changing
//    the truck/trailer selection on the main Equipment modal instead.
//  - Autosaves tare/target on close (debounced while typing too, so a save
//    is never lost even if the tab is closed mid-edit).
//  - Keeps the existing "cutting it close" overweight warning logic as-is.

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import WeightRecordModal from "./WeightRecordModal";

export type ScaleTicketTarget = {
  combo_id: string;
  tare_lbs?: number | null;
  target_weight?: number | null;
};

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
};

export default function ScaleTicketModal({
  open, onClose, combo, companyId, authUserId, truckName, trailerName, onSaved, myRole,
}: {
  open: boolean;
  onClose: () => void;
  combo: ScaleTicketTarget | null;
  companyId: string;
  authUserId: string | null;
  truckName?: string | null;
  trailerName?: string | null;
  onSaved: () => void;
  /** Gates the target field only -- tare stays open to every role. */
  myRole?: string | null;
}) {
  const [tareLbs, setTareLbs] = useState("");
  const [targetLbs, setTargetLbs] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [weightRecordOpen, setWeightRecordOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirrors of the two fields, updated synchronously on every keystroke.
  // save() reads from these refs (not the state closure it was created
  // with), so whichever invocation actually runs always writes the latest
  // value -- see the note on `savingNowRef` below for why this matters.
  const tareLbsRef = useRef("");
  const targetLbsRef = useRef("");
  useEffect(() => { tareLbsRef.current = tareLbs; }, [tareLbs]);
  useEffect(() => { targetLbsRef.current = targetLbs; }, [targetLbs]);

  // Serializes saves instead of gating on a single shared "dirty" boolean.
  // An earlier version used a dirtyRef that save() cleared on success; with
  // Supabase auth-token-refresh lock contention sometimes delaying a call by
  // several seconds (see the usePlanSlots LockManager timeouts elsewhere in
  // this app), an earlier debounced save could complete *after* a later edit
  // had already set dirtyRef back to true, clobbering it back to false and
  // silently dropping the newer edit. Queuing a rerun instead of relying on
  // a shared flag can't lose an edit that way.
  const savingNowRef = useRef(false);
  const rerunNeededRef = useRef(false);

  useEffect(() => {
    if (!open || !combo) return;
    setTareLbs(combo.tare_lbs != null ? String(combo.tare_lbs) : "");
    setTargetLbs(combo.target_weight != null ? String(combo.target_weight) : "");
    setErr(null);
  }, [open, combo?.combo_id]);

  if (!combo) return null;

  const label = [truckName, trailerName].filter(Boolean).join(" / ") || "Unknown";
  const tooClose = Number(targetLbs) >= 79500;

  // Tare stays editable by every role, deliberately: the driver weighs the
  // truck, and a company that doubts a number has the weight ticket to check
  // it against.
  //
  // The target does not. It is the denominator of every payload-utilization
  // number now (see docs/incentive-redesign-plan.md section 4b), so leaving it
  // editable by the person being measured would let anyone lower their own
  // score's denominator in two taps. Same admin/dispatch/lead set already used
  // for compartment caps and Unit #, and no solo carve-out is needed -- a solo
  // company's sole member is always role='admin' by the existing
  // solo-provisioning design, so a solo driver still sets their own target.
  const canEditTarget =
    myRole === "admin" || myRole === "dispatch" || myRole === "lead";

  async function save() {
    if (!combo) return;
    if (savingNowRef.current) { rerunNeededRef.current = true; return; }
    savingNowRef.current = true;
    setSaving(true);
    setErr(null);
    try {
      const tare = Number(tareLbsRef.current);
      const target = Number(targetLbsRef.current);
      const patch: Record<string, any> = {};
      if (tareLbsRef.current && Number.isFinite(tare) && tare > 0) patch.tare_lbs = tare;
      // Gated here too, not just in the UI: disabling an input is a display
      // choice, and this autosaves on a debounce from a ref.
      if (canEditTarget && targetLbsRef.current && Number.isFinite(target) && target > 0) {
        patch.target_weight = target;
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("equipment_combos").update(patch).eq("combo_id", combo.combo_id);
        if (error) throw error;
        onSaved();
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
      savingNowRef.current = false;
      if (rerunNeededRef.current) {
        rerunNeededRef.current = false;
        void save();
      }
    }
  }

  function onFieldChange(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      // Debounced autosave while typing, so a value is never lost even if
      // the user closes the tab instead of the modal.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => { void save(); }, 800);
    };
  }

  function handleClose() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    void save();
    onClose();
  }

  return (
    <FullscreenModal open={open} onClose={handleClose} title="Scale Ticket" footer={null}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#000" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 8px" }}>

          <div style={{
            borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)", padding: "14px 16px",
            marginTop: 6, marginBottom: 20,
          }}>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: 0.2 }}>{label}</div>
          </div>

          {err && <div style={S.err}>{err}</div>}

          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Tare weight (lbs)</label>
            <input
              type="number" inputMode="numeric" placeholder="e.g. 34800"
              value={tareLbs}
              onChange={(e) => onFieldChange(setTareLbs)(e.target.value)}
              style={S.input}
            />
          </div>

          <div style={{ marginBottom: tooClose ? 4 : 24 }}>
            <label style={S.label}>Target gross weight (lbs)</label>
            <input
              type="number" inputMode="numeric" placeholder="80000"
              value={targetLbs}
              onChange={(e) => onFieldChange(setTargetLbs)(e.target.value)}
              disabled={!canEditTarget}
              style={{
                ...S.input,
                ...(canEditTarget ? null : { opacity: 0.5, cursor: "not-allowed" }),
              }}
            />
            {!canEditTarget && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6, lineHeight: 1.5 }}>
                Set by your company. Tare is yours to update after every weigh.
              </div>
            )}
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

          {saving && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Saving…</div>}
        </div>

        <div style={{
          padding: "12px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "#000", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
        }}>
          <button
            type="button"
            onClick={() => setWeightRecordOpen(true)}
            style={{
              width: "100%", borderRadius: 2, padding: "15px 18px",
              fontWeight: 900, fontSize: 17,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.85)", cursor: "pointer",
            }}
          >
            Validate Load
          </button>
          <button
            type="button"
            onClick={handleClose}
            style={{
              width: "100%", borderRadius: 2, padding: "15px 18px",
              fontWeight: 900, fontSize: 17,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.92)", cursor: "pointer",
            }}
          >
            Save & Close
          </button>
        </div>
      </div>

      <WeightRecordModal
        open={weightRecordOpen}
        onClose={() => setWeightRecordOpen(false)}
        companyId={companyId}
        comboId={combo.combo_id}
        authUserId={authUserId}
        currentTareLbs={tareLbs.trim() ? Number(tareLbs) : (combo.tare_lbs ?? null)}
        truckName={truckName}
        trailerName={trailerName}
        onSaved={(newTareLbs) => {
          if (newTareLbs != null) setTareLbs(String(newTareLbs));
          onSaved();
        }}
      />
    </FullscreenModal>
  );
}
