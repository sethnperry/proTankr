"use client";
// app/planner/modals/binder/UnitInfoRow.tsx
//
// Part of the Binder (equipment file) dialog.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

import type { UnitDetail, UnitKind } from "./types";
import { inputStyle, labelStyle, saveBtnStyle, cancelBtnStyle } from "./styles";
import { InfoField } from "./InfoField";

export function UnitInfoRow({
  unitKind,
  unitId,
  detail,
  isExpanded,
  onToggleExpand,
  onSaved,
}: {
  unitKind: UnitKind;
  unitId: string;
  detail: UnitDetail | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [vin, setVin] = useState("");
  const [plate, setPlate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isExpanded) {
      setEditing(false);
      return;
    }
    setVin(detail?.vin_number ?? "");
    setPlate(detail?.plate_number ?? "");
    setNotes(detail?.notes ?? "");
    setErr(null);
  }, [isExpanded, detail]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const table = unitKind === "truck" ? "trucks" : "trailers";
      const idCol = unitKind === "truck" ? "truck_id" : "trailer_id";
      const patch = {
        vin_number: vin.trim() || null,
        plate_number: plate.trim() || null,
        notes: notes.trim() || null,
      };
      const { error } = await supabase.from(table).update(patch).eq(idCol, unitId);
      if (error) throw error;
      setEditing(false);
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div onClick={onToggleExpand} style={{ display: "flex", alignItems: "baseline", gap: 8, cursor: "pointer", padding: "2px 0 8px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>VIN / Plate / Notes</span>
        <span
          style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.3)",
            transform: isExpanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms",
          }}
        >
          ▼
        </span>
      </div>

      {isExpanded && (
        <div
          style={{ paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 4 }}
          onClick={(e) => e.stopPropagation()}
        >
          {err && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{err}</div>}

          {!editing ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <InfoField label="Plate" value={detail?.plate_number || "—"} />
                <InfoField label="VIN" value={detail?.vin_number || "—"} full />
                {detail?.notes && <InfoField label="Notes" value={detail.notes} full truncate />}
              </div>
              <button type="button" onClick={() => setEditing(true)} style={saveBtnStyle}>
                Edit
              </button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Plate</label>
                <input value={plate} onChange={(e) => setPlate(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>VIN</label>
                <input value={vin} onChange={(e) => setVin(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ ...inputStyle, minHeight: 60, fontFamily: "inherit", resize: "vertical" as const }}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setEditing(false)} disabled={busy} style={cancelBtnStyle}>
                  Cancel
                </button>
                <button aria-busy={!!busy} type="button" onClick={save} disabled={busy} style={saveBtnStyle}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Compartments (trailer only) ────────────────────────────────────────────
// max_gallons ("total volume") stays informational only; cap_gallons is the
// real ceiling the load-planning solver uses. Read-only here -- editing the
// cap is now role-gated to admin/dispatch/lead and lives in the Equipment
// modal's CompartmentEditor (lib/ui/driver/EquipmentDetails.tsx) instead,
// so there's exactly one editable place for it rather than two un-synced
// (and previously ungated) copies. This just shows the current value for
// anyone reviewing the Binder.
