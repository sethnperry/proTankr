"use client";
// app/planner/modals/EquipmentStatusModal.tsx
//
// The STUD (status-update) modal for a single truck or trailer -- In Use /
// Deadline / Readyline. Reuses the exact Region-then-scoped-Local-Area
// picker RequiredEquipmentFields.tsx already built for a unit's HOME
// location (exported from there for exactly this reuse) -- here it writes
// the unit's CURRENT location instead (current_region/current_local_area,
// via set_equipment_status), not its permanent home.
//
// Deadline/Readyline both mean "not currently with a driver" -- the RPC
// unlinks the unit from whoever holds it (same _evict_combo_to_partial
// mechanic couple_combo's own per-unit take-over already uses), so Region/
// Local Area are required for those two ("where is it now" only matters
// once it's not with a driver). In Use needs neither -- it's just clearing
// the flag, and coupling the unit for real already re-stamps its current
// location from the driver's own profile.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CatalogPicker } from "@/lib/ui/driver/RequiredEquipmentFields";

export type FleetStatus = "in_use" | "deadline" | "readyline";

const STATUS_OPTIONS: { value: FleetStatus; label: string; color: string }[] = [
  { value: "in_use",   label: "In Use",    color: "#67e8f9" },
  { value: "deadline",  label: "Deadline",  color: "#f87171" },
  { value: "readyline", label: "Readyline", color: "#4ade80" },
];

export function fleetStatusColor(status: string | null): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color ?? "rgba(255,255,255,0.5)";
}
export function fleetStatusLabel(status: string | null): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? "";
}

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 4, display: "block",
};

export default function EquipmentStatusModal({
  open, onClose, companyId, unitKind, unitId, unitName, currentStatus, currentNotes, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  unitKind: "truck" | "trailer";
  unitId: string;
  unitName: string;
  currentStatus: string | null;
  currentNotes: string | null;
  onSaved: (newStatus: FleetStatus) => void;
}) {
  const [status, setStatus] = useState<FleetStatus>("in_use");
  const [region, setRegion] = useState("");
  const [localArea, setLocalArea] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus((currentStatus as FleetStatus) || "in_use");
    setRegion("");
    setLocalArea("");
    setNotes(currentNotes ?? "");
    setErr(null);
  }, [open, currentStatus, currentNotes]);

  const needsLocation = status === "deadline" || status === "readyline";

  async function save() {
    if (needsLocation && (!region.trim() || !localArea.trim())) {
      setErr("Region and Local Area are required for Deadline or Readyline.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc("set_equipment_status", {
        p_unit_kind: unitKind,
        p_unit_id: unitId,
        p_status: status,
        p_region: region.trim() || null,
        p_local_area: localArea.trim() || null,
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
      onSaved(status);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullscreenModal open={open} onClose={onClose} title={`Status · ${unitName}`} footer={null}>
      <div style={{ display: "grid", gap: 16 }}>
        {err && (
          <div style={{ borderRadius: 6, padding: 12, background: "rgba(180,40,40,0.18)", border: "1px solid rgba(180,40,40,0.32)", color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: 700 }}>
            {err}
          </div>
        )}

        <div>
          <label style={fieldLabel}>Status</label>
          <div style={{ display: "grid", gap: 8 }}>
            {STATUS_OPTIONS.map((o) => {
              const sel = status === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                    borderRadius: 8, cursor: "pointer", textAlign: "left" as const,
                    border: sel ? `1px solid ${o.color}` : "1px solid rgba(255,255,255,0.12)",
                    background: sel ? `${o.color}22` : "rgba(255,255,255,0.04)",
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: o.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 800, color: sel ? o.color : "rgba(255,255,255,0.85)" }}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <CatalogPicker
            label={`Region${needsLocation ? " *" : ""}`} placeholder="Select region"
            value={region}
            onChange={(v) => { setRegion(v); if (v !== region) setLocalArea(""); }}
            table="equipment_regions" idCol="region_id" companyId={companyId} editable
          />
          <CatalogPicker
            label={`Local Area${needsLocation ? " *" : ""}`} placeholder="Select area"
            value={localArea} onChange={setLocalArea}
            table="equipment_local_areas" idCol="local_area_id" companyId={companyId} editable
            filterByRegionName={region}
          />
        </div>

        <div>
          <label style={fieldLabel}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Repair ticket #, contact, ETA…"
            style={{
              width: "100%", borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(0,0,0,0.3)", padding: "10px 11px", fontSize: 14, color: "#fff",
              boxSizing: "border-box" as const, minHeight: 72, resize: "vertical" as const, fontFamily: "inherit",
            }}
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            width: "100%", padding: "14px 18px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer",
          }}
        >
          {busy ? "Saving…" : "Save Status"}
        </button>
      </div>
    </FullscreenModal>
  );
}
