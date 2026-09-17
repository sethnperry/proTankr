"use client";
// modals/BinderModal.tsx
//
// Solo-tier Binder redesign -- equipment-settings-spec.md §7. Replaces the
// old fixed permit-category system (trucks.reg_expiration_date,
// trailers.tank_v_expiration_date, etc. -- see CLAUDE.md) with a company-
// managed permit_types + equipment_permits system, mirroring the
// service_types pattern exactly: the driver can create, rename, and
// soft-delete permit categories per unit type (truck/trailer/both), and
// view/upload documents + edit expiration dates directly here.
//
// Deliberately NOT touched by this pass: the old hardcoded columns,
// truck_other_permits, and the fleet-tier admin equipment screens
// (app/admin/page.tsx, lib/ui/driver/EquipmentDetails.tsx) -- those keep
// reading/writing the old columns until a later pass migrates them too,
// consistent with this app's solo-tier-first rollout.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { RequiredEquipmentFields } from "@/lib/ui/driver/RequiredEquipmentFields";
import { ServiceTypeListModal } from "./ServiceTypeManager";
import {
  usePermitAttachments, AttachmentIndicator, DocPreviewModal,
  type AttachmentRecord, type AttachmentGroup,
} from "@/lib/ui/driver/DocHub";

type PermitType = {
  permit_type_id: string;
  name: string;
  applies_to: "truck" | "trailer" | "both";
  is_active: boolean;
};
type PermitRecord = {
  equipment_permit_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  permit_type_id: string;
  expiration_date: string | null;
  enforcement_date: string | null;
  notes: string | null;
};

type UnitDetail = {
  year: number | null;
  make: string | null;
  model: string | null;
  vin_number: string | null;
  plate_number: string | null;
  notes: string | null;
  region: string | null;
  local_area: string | null;
};

type UnitKind = "truck" | "trailer";
type Row = {
  id: string; // `${unitKind}-${permit_type_id}`
  type: PermitType;
  record: PermitRecord | null;
  daysLeft: number | null;
  expired: boolean;
};

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
}
function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(iso + "T00:00:00");
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}
function statusColor(row: Row): string {
  if (!row.record?.expiration_date) return "rgba(255,255,255,0.3)";
  if (row.expired) return "#ef4444";
  if (row.daysLeft != null && row.daysLeft <= 30) return "#fbbf24";
  return "rgba(255,255,255,0.6)";
}
// Canonical starter names -- mirrors the categories the old hardcoded
// truck/trailer columns used to track (see CLAUDE.md), offered as a
// quick-pick so a fresh company isn't stuck typing every standard permit
// name from scratch. Purely a suggestion list for the "Add permit type"
// flow -- doesn't touch the schema, and "+ Add custom" always falls
// through to the same free-text editor.
const PERMIT_SUGGESTIONS: Record<UnitKind, string[]> = {
  truck: [
    "Registration", "Annual Inspection", "IFTA Permits + Decals",
    "PHMSA HazMat Permit", "Alliance HazMat Permit", "Fleet Insurance Cab Card",
    "HazMat Transportation Lic", "Inner Bridge Permit",
  ],
  trailer: [
    "Trailer Registration", "Annual Inspection",
    "Tank V", "Tank K", "Tank L", "Tank T", "Tank I", "Tank P", "Tank UC",
  ],
};

function statusText(row: Row): string {
  if (!row.record?.expiration_date) return "Not set";
  if (row.expired) return `Expired ${fmtDate(row.record.expiration_date)}`;
  if (row.daysLeft != null && row.daysLeft <= 30) return `Expires ${fmtDate(row.record.expiration_date)}`;
  return fmtDate(row.record.expiration_date);
}

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 6, padding: "9px 11px", border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 14, boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" };
const saveBtnStyle: React.CSSProperties = {
  flex: 1, padding: "12px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.20)",
  background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
};
const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: "12px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
};
const dangerBtnStyle: React.CSSProperties = {
  padding: "12px 14px", borderRadius: 6, border: "1px solid rgba(220,60,60,0.4)",
  background: "rgba(180,40,40,0.12)", color: "#fca5a5", fontWeight: 800, fontSize: 14, cursor: "pointer",
};
// Front-page nav buttons -- matches the Add/Edit Truck/Trailer modal's own
// "Service Schedule"/"Details →" ghost-button look (css.btn("ghost") in
// EquipmentDetails.tsx), reproduced here since this file has its own style
// constants rather than importing that file's tokens.
const navBtnStyle: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 6, marginBottom: 8,
  border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)",
  color: "#fff", fontSize: 14, fontWeight: 700, textAlign: "left" as const, cursor: "pointer",
};

// ─── Permit type editor (rename / change applies_to / soft-delete) ──────────

function PermitTypeEditorModal({
  open, onClose, companyId, mode, type, unit, initialName, onSaved, onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  mode: "new" | "edit";
  type: PermitType | null;
  unit: UnitKind;
  initialName?: string;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState("");
  const [appliesTo, setAppliesTo] = useState<PermitType["applies_to"]>("both");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmingDelete(false);
    setErr(null);
    if (mode === "edit" && type) {
      setName(type.name);
      setAppliesTo(type.applies_to);
    } else {
      setName(initialName ?? "");
      setAppliesTo(unit);
    }
  }, [open, mode, type, unit, initialName]);

  async function save() {
    if (!name.trim()) { setErr("Enter a permit name."); return; }
    setBusy(true);
    setErr(null);
    try {
      if (mode === "edit" && type) {
        const { error } = await supabase.from("permit_types").update({ name: name.trim(), applies_to: appliesTo }).eq("permit_type_id", type.permit_type_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("permit_types").insert({ company_id: companyId, name: name.trim(), applies_to: appliesTo });
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save permit type.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!type) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from("permit_types").update({ is_active: false }).eq("permit_type_id", type.permit_type_id);
      if (error) throw error;
      onDeleted();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete permit type.");
      setBusy(false);
    }
  }

  return (
    <FullscreenModal open={open} onClose={onClose} title={mode === "edit" ? "Edit Permit Type" : "New Permit Type"} footer={null}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div>}

        {!confirmingDelete ? (
          <>
            <div>
              <label style={labelStyle}>Permit name</label>
              <input placeholder="e.g. Registration, IFTA, Tank V" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Applies to</label>
              <CustomSelect
                value={appliesTo}
                onChange={(v) => setAppliesTo(v as any)}
                options={[
                  { value: "both", label: "Truck & Trailer" },
                  { value: "truck", label: "Truck only" },
                  { value: "trailer", label: "Trailer only" },
                ]}
              />
            </div>

            <button type="button" onClick={save} disabled={busy} style={saveBtnStyle}>{busy ? "Saving…" : "Save"}</button>

            {mode === "edit" && (
              <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} style={{ ...dangerBtnStyle, width: "100%" }}>
                Delete permit type
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Delete &quot;{type?.name}&quot;?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              This only affects future entries -- it stops showing up as an option going forward. Existing dates and documents already recorded under it are unaffected.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} style={cancelBtnStyle}>Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={busy} style={{ ...dangerBtnStyle, flex: 1 }}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>
    </FullscreenModal>
  );
}

// ─── Add-permit picker (pick a common name, or add a custom one) ───────────
// Sits in front of PermitTypeEditorModal -- picking a suggestion just
// pre-fills that modal's name field (still goes through the same save/
// applies_to/validation path); "+ Add custom" opens it blank, same as
// "+ Add permit type" always did before this existed.

function AddPermitTypeModal({
  open, onClose, unit, existingTypes, onPick,
}: {
  open: boolean;
  onClose: () => void;
  unit: UnitKind;
  existingTypes: PermitType[];
  onPick: (name: string) => void;
}) {
  const suggestions = useMemo(() => {
    const existingNames = new Set(
      existingTypes
        .filter((t) => t.applies_to === unit || t.applies_to === "both")
        .map((t) => t.name.trim().toLowerCase())
    );
    return PERMIT_SUGGESTIONS[unit].filter((n) => !existingNames.has(n.toLowerCase()));
  }, [existingTypes, unit]);

  const rowStyle: React.CSSProperties = {
    textAlign: "left" as const, padding: "12px 14px", borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
    color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%",
  };

  return (
    <FullscreenModal open={open} onClose={onClose} title="Add Permit Type" footer={null}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
          Pick a common permit, or add a custom one.
        </div>
        {suggestions.map((name) => (
          <button key={name} type="button" onClick={() => onPick(name)} style={rowStyle}>
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick("")}
          style={{
            textAlign: "left" as const, padding: "12px 14px", borderRadius: 6,
            border: "1px dashed rgba(255,255,255,0.18)", background: "transparent",
            color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%",
          }}
        >
          + Add custom
        </button>
      </div>
    </FullscreenModal>
  );
}

// ─── Unit info row (year/make/model/VIN/plate/notes) ────────────────────────
// Collapsed, this is just the section header ("Truck · 25184"). Tapping it
// expands a read-only summary of the unit's own details, with a bottom Edit
// button that swaps the summary for editable fields (Save/Cancel) --
// mirroring the same expand-then-edit convention as the permit rows below.

function InfoField({ label, value, full, truncate }: { label: string; value: string; full?: boolean; truncate?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>{label}</div>
      <div style={{
        fontSize: 13, color: "rgba(255,255,255,0.85)",
        ...(truncate ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const } : {}),
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Required fields -- big, un-collapsed, always visible ──────────────────
// Per explicit follow-up ("required fields out front, big and easy to
// use... the rest behind buttons"): Unit #/Year/Make/Model/Region/Local
// Area now live here, always shown, using the same shared component the
// new Add/Edit Truck/Trailer front page uses (lib/ui/driver/
// RequiredEquipmentFields.tsx) -- one editor for these 6 fields, not two.
// VIN/Plate/Notes stay in UnitInfoRow below, unchanged (already
// collapsed-then-edit, already "behind a button").
//
// Known, accepted gap: renaming the Unit # here doesn't refresh the
// caller's own truckName/trailerName prop (e.g. SoloEquipmentModal's
// header/labels) within this same Binder session -- that only picks up
// the new name the next time the caller's own equipment list reloads.
// Not worth a new callback chain just for this cosmetic case.
function RequiredFieldsBlock({
  unitKind, unitId, unitName, companyId, detail, onSaved, myRole,
}: {
  unitKind: UnitKind;
  unitId: string;
  unitName: string;
  companyId: string;
  detail: UnitDetail | null;
  onSaved: () => void;
  myRole?: string | null;
}) {
  // Same gate EquipmentDetails.tsx's TruckModal/TrailerModal already apply
  // to these identical fields -- Binder is always for an EXISTING unit
  // (no isNew bypass needed here), and was a real, previously-unguarded
  // gap: this block hardcoded `editable` to true regardless of role, so
  // any driver reaching Edit -> Binder could freely rename Unit#/Year/
  // Make/Model/Region/Local Area.
  const canEditRestricted = myRole === "admin" || myRole === "dispatch" || myRole === "lead";
  const [name, setName] = useState(unitName);
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [region, setRegion] = useState("");
  const [localArea, setLocalArea] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setName(unitName);
    setYear(detail?.year != null ? String(detail.year) : "");
    setMake(detail?.make ?? "");
    setModel(detail?.model ?? "");
    setRegion(detail?.region ?? "");
    setLocalArea(detail?.local_area ?? "");
    setDirty(false);
    setErr(null);
  }, [unitName, detail]);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true); };
  }

  async function save() {
    if (!name.trim()) { setErr("Unit # is required."); return; }
    if (!region.trim()) { setErr("Region is required."); return; }
    if (!localArea.trim()) { setErr("Local area is required."); return; }
    setBusy(true);
    setErr(null);
    try {
      const table = unitKind === "truck" ? "trucks" : "trailers";
      const idCol = unitKind === "truck" ? "truck_id" : "trailer_id";
      const nameCol = unitKind === "truck" ? "truck_name" : "trailer_name";
      const patch: any = {
        [nameCol]: name.trim(),
        year: year.trim() ? Number(year) : null,
        make: make.trim() || null,
        model: model.trim() || null,
        region: region || null,
        local_area: localArea || null,
      };
      const { error } = await supabase.from(table).update(patch).eq(idCol, unitId);
      if (error) throw error;
      setDirty(false);
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 10 }}>
        {unitKind === "truck" ? "Truck" : "Trailer"}
      </div>
      {err && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <RequiredEquipmentFields
        kind={unitKind} companyId={companyId} editable={canEditRestricted}
        name={name} onNameChange={markDirty(setName)}
        year={year} onYearChange={markDirty(setYear)}
        make={make} onMakeChange={markDirty(setMake)}
        model={model} onModelChange={markDirty(setModel)}
        region={region} onRegionChange={markDirty(setRegion)}
        localArea={localArea} onLocalAreaChange={markDirty(setLocalArea)}
      />
      {dirty && (
        <button type="button" onClick={save} disabled={busy} style={{ ...saveBtnStyle, marginTop: 12 }}>
          {busy ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}

// ─── VIN / Plate / Notes -- "the rest," collapsed then edit ────────────────

function UnitInfoRow({
  unitKind, unitId, detail, isExpanded, onToggleExpand, onSaved,
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
    if (!isExpanded) { setEditing(false); return; }
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
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>
          VIN / Plate / Notes
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>▼</span>
      </div>

      {isExpanded && (
        <div style={{ paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 4 }} onClick={(e) => e.stopPropagation()}>
          {err && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{err}</div>}

          {!editing ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <InfoField label="Plate" value={detail?.plate_number || "—"} />
                <InfoField label="VIN" value={detail?.vin_number || "—"} full />
                {detail?.notes && <InfoField label="Notes" value={detail.notes} full truncate />}
              </div>
              <button type="button" onClick={() => setEditing(true)} style={saveBtnStyle}>Edit</button>
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
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60, fontFamily: "inherit", resize: "vertical" as const }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setEditing(false)} disabled={busy} style={cancelBtnStyle}>Cancel</button>
                <button type="button" onClick={save} disabled={busy} style={saveBtnStyle}>{busy ? "Saving…" : "Save"}</button>
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

type CompartmentRow = {
  trailer_id: string;
  comp_number: number;
  max_gallons: number;
  cap_gallons: number | null;
};

function CompartmentRowItem({
  comp, isExpanded, onToggleExpand,
}: {
  comp: CompartmentRow;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const effectiveCap = comp.cap_gallons ?? comp.max_gallons;

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <div onClick={onToggleExpand} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 2px", cursor: "pointer" }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Comp {comp.comp_number}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{Math.round(effectiveCap).toLocaleString()} gal cap</span>
      </div>
      {isExpanded && (
        <div style={{ padding: "4px 2px 14px" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Total volume (informational only)</label>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>{Math.round(comp.max_gallons).toLocaleString()} gal</div>
          </div>
          <div>
            <label style={labelStyle}>Cap (overflow prevention -- edit in Equipment)</label>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>{Math.round(effectiveCap).toLocaleString()} gal</div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompartmentsSection({
  trailerId, expandedId, onToggleExpand,
}: {
  trailerId: string;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const [compartments, setCompartments] = useState<CompartmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("trailer_compartments")
      .select("trailer_id, comp_number, max_gallons, cap_gallons")
      .eq("trailer_id", trailerId)
      .eq("active", true)
      .order("comp_number");
    setCompartments((data ?? []) as CompartmentRow[]);
    setLoading(false);
  }, [trailerId]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !compartments.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>
        Compartments
      </div>
      {compartments.map((c) => (
        <CompartmentRowItem
          key={c.comp_number}
          comp={c}
          isExpanded={expandedId === `trailer-comp-${c.comp_number}`}
          onToggleExpand={() => onToggleExpand(`trailer-comp-${c.comp_number}`)}
        />
      ))}
    </div>
  );
}

// ─── Per-unit permit list section ───────────────────────────────────────────

// 2026-08-29 follow-up: restructured to match the Add/Edit Truck/Trailer
// modal's own shape exactly, per explicit direction ("match the edit
// truck modal to the add truck modal... same thing with service
// Schedule etc. just a different name") -- front page (Required Fields,
// unchanged from the prior pass) + Service Schedule / Details →/ Save &
// Close, with everything else (VIN/Plate/Notes, Compartments, the permit
// + attachment list) behind Details, same "front page vs. Details"
// pattern EquipmentDetails.tsx's TruckModal/TrailerModal already
// established.
//
// Service Schedule opens ServiceTypeListModal (types + intervals only,
// same as the Add/Edit modal's own button) per the same-day clarification
// this codebase's other Service Schedule buttons already got fixed to
// match: "this is where we determine service types and the intervals...
// we record the service from the main modal service button." Recording
// an actual service stays exactly where it already was -- the main
// equipment picker's own "Service" button -- untouched by this file.
function UnitSection({
  unitKind, unitId, unitName, companyId, types, records, detail, expandedId, onToggleExpand,
  onEditType, onAddType, onSaved, onClose, myRole,
}: {
  unitKind: UnitKind;
  unitId: string;
  unitName: string;
  companyId: string;
  types: PermitType[];
  records: PermitRecord[];
  detail: UnitDetail | null;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEditType: (t: PermitType) => void;
  onAddType: () => void;
  onSaved: () => void;
  onClose: () => void;
  myRole?: string | null;
}) {
  const { pagesFor, hasDoc, reload: reloadDocs } = usePermitAttachments(unitKind, unitId, companyId);
  const [screen, setScreen] = useState<"front" | "details">("front");
  const [serviceOpen, setServiceOpen] = useState(false);

  const rows: Row[] = useMemo(() => {
    const applicable = types.filter((t) => {
      const usable = t.applies_to === unitKind || t.applies_to === "both";
      if (!usable) return false;
      if (t.is_active) return true;
      // Inactive types still show if this unit already has a recorded date --
      // deactivating only stops future selection, doesn't hide history.
      return records.some((r) =>
        r.permit_type_id === t.permit_type_id &&
        (unitKind === "truck" ? r.truck_id === unitId : r.trailer_id === unitId)
      );
    });
    return applicable.map((t) => {
      // Registration/Annual Inspection share one permit_type_id across both
      // unit types (applies_to='both'), so matching by permit_type_id alone
      // would grab whichever unit's record happens to come first in the
      // combined list -- must also check the record actually belongs to
      // *this* unit.
      const record = records.find((r) =>
        r.permit_type_id === t.permit_type_id &&
        (unitKind === "truck" ? r.truck_id === unitId : r.trailer_id === unitId)
      ) ?? null;
      const daysLeft = record?.expiration_date ? daysUntil(record.expiration_date) : null;
      return { id: `${unitKind}-${t.permit_type_id}`, type: t, record, daysLeft, expired: daysLeft != null && daysLeft < 0 };
    }).sort((a, b) => {
      const aNone = a.daysLeft == null, bNone = b.daysLeft == null;
      if (aNone !== bNone) return aNone ? 1 : -1;
      if (aNone && bNone) return a.type.name.localeCompare(b.type.name);
      return (a.daysLeft as number) - (b.daysLeft as number);
    });
  }, [types, records, unitKind, unitId]);

  return (
    <div style={{ marginBottom: 18 }}>
      {screen === "front" ? (
        <>
          <RequiredFieldsBlock
            unitKind={unitKind} unitId={unitId} unitName={unitName} companyId={companyId} detail={detail}
            onSaved={onSaved} myRole={myRole}
          />
          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={() => setServiceOpen(true)} style={navBtnStyle}>Service Schedule</button>
            <button type="button" onClick={() => setScreen("details")} style={navBtnStyle}>Details →</button>
          </div>
          {/* Everything below Required Fields already autosaves per field
              (RequiredFieldsBlock's own Save, each permit row's own Save,
              etc.) -- there's nothing left pending to batch-commit, so
              "Save & Close" here is really just Close, styled the same as
              the Add/Edit Truck/Trailer modal's own button for visual
              consistency. No separate Cancel either, for the same reason
              -- there's nothing uncommitted to discard. */}
          <button type="button" onClick={onClose} style={{ ...saveBtnStyle, marginTop: 8 }}>Save & Close</button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setScreen("front")} style={{ ...cancelBtnStyle, width: "auto", padding: "6px 12px", fontSize: 11, marginBottom: 14 }}>
            ← Back
          </button>

          <UnitInfoRow
            unitKind={unitKind} unitId={unitId} detail={detail}
            isExpanded={expandedId === `${unitKind}-info`}
            onToggleExpand={() => onToggleExpand(`${unitKind}-info`)}
            onSaved={onSaved}
          />
          {unitKind === "trailer" && (
            <CompartmentsSection trailerId={unitId} expandedId={expandedId} onToggleExpand={onToggleExpand} />
          )}
          {rows.map((row) => (
            <PermitRow
              key={row.id}
              row={row}
              unitKind={unitKind}
              unitId={unitId}
              companyId={companyId}
              isExpanded={expandedId === row.id}
              onToggleExpand={() => onToggleExpand(row.id)}
              onEditType={() => onEditType(row.type)}
              hasDoc={hasDoc(row.type.permit_type_id)}
              pages={pagesFor(row.type.permit_type_id)}
              onDocsChanged={reloadDocs}
              onSaved={onSaved}
            />
          ))}
          <div
            onClick={onAddType}
            style={{
              borderRadius: 6, border: "1px dashed rgba(255,255,255,0.18)", padding: "10px 12px",
              textAlign: "center" as const, cursor: "pointer", fontSize: 13, fontWeight: 700,
              color: "rgba(255,255,255,0.35)", marginTop: 4,
            }}
          >
            + Add permit type
          </div>
        </>
      )}

      <ServiceTypeListModal open={serviceOpen} onClose={() => setServiceOpen(false)} companyId={companyId} unit={unitKind} />
    </div>
  );
}

// ─── Single permit row (collapsed + expanded edit/doc/delete) ───────────────

function PermitRow({
  row, unitKind, unitId, companyId, isExpanded, onToggleExpand, onEditType, hasDoc, pages, onDocsChanged, onSaved,
}: {
  row: Row;
  unitKind: UnitKind;
  unitId: string;
  companyId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditType: () => void;
  hasDoc: boolean;
  pages: AttachmentRecord[];
  onDocsChanged: () => void;
  onSaved: () => void;
}) {
  const [expDate, setExpDate] = useState("");
  const [enfDate, setEnfDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [previewGroup, setPreviewGroup] = useState<AttachmentGroup | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;
    setExpDate(row.record?.expiration_date ?? "");
    setEnfDate(row.record?.enforcement_date ?? "");
    setErr(null);
    setConfirmingDelete(false);
  }, [isExpanded, row.record]);

  // Attribution tooltip ("Uploaded by X") -- same resolve-on-demand pattern
  // as RecordHistoryModal.tsx's Logged-by names.
  const [namesByUserId, setNamesByUserId] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = Array.from(new Set(pages.map((p) => p.uploaded_by).filter((x): x is string => !!x)));
    const missing = ids.filter((id) => !(id in namesByUserId));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: missing });
      const next: Record<string, string> = {};
      for (const nameRow of (data ?? []) as any[]) {
        if (nameRow?.user_id) next[nameRow.user_id] = nameRow.display_name ?? "Unknown";
      }
      setNamesByUserId((prev) => ({ ...prev, ...next }));
    })();
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const patch: any = {
        company_id: companyId,
        expiration_date: expDate || null,
        enforcement_date: enfDate || null,
        permit_type_id: row.type.permit_type_id,
        truck_id: unitKind === "truck" ? unitId : null,
        trailer_id: unitKind === "trailer" ? unitId : null,
      };
      if (row.record) {
        const { error } = await supabase.from("equipment_permits").update(patch).eq("equipment_permit_id", row.record.equipment_permit_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("equipment_permits").insert(patch);
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord() {
    if (!row.record) return;
    setBusy(true);
    setErr(null);
    try {
      for (const p of pages) {
        await supabase.storage.from("equipment-docs").remove([p.file_path]);
        await supabase.from("equipment_attachments").delete().eq("id", p.id);
      }
      const { error } = await supabase.from("equipment_permits").delete().eq("equipment_permit_id", row.record.equipment_permit_id);
      if (error) throw error;
      onDocsChanged();
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File, replace: boolean) {
    setUploading(true);
    setErr(null);
    try {
      if (replace) {
        for (const p of pages) {
          await supabase.storage.from("equipment-docs").remove([p.file_path]);
          await supabase.from("equipment_attachments").delete().eq("id", p.id);
        }
      }
      const pageOrder = replace ? 0 : pages.length;
      const ext = file.name.split(".").pop() ?? "bin";
      const newId = crypto.randomUUID();
      const filePath = `${companyId}/${unitKind}/${unitId}/permit_${row.type.permit_type_id}/${newId}.${ext}`;
      const { error: storageErr } = await supabase.storage.from("equipment-docs").upload(filePath, file, { contentType: file.type, upsert: false });
      if (storageErr) throw storageErr;
      const { data: { user } } = await supabase.auth.getUser();
      const { error: dbErr } = await supabase.from("equipment_attachments").insert({
        id: newId, company_id: companyId, equipment_type: unitKind, equipment_id: unitId,
        category: row.type.permit_type_id, category_label: row.type.name, permit_type_id: row.type.permit_type_id,
        file_path: filePath, original_name: file.name, mime_type: file.type || "application/octet-stream", page_order: pageOrder,
        uploaded_by: user?.id ?? null,
      });
      if (dbErr) { await supabase.storage.from("equipment-docs").remove([filePath]); throw dbErr; }
      onDocsChanged();
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function deletePage(page: AttachmentRecord) {
    setBusy(true);
    try {
      await supabase.storage.from("equipment-docs").remove([page.file_path]);
      await supabase.from("equipment_attachments").delete().eq("id", page.id);
      onDocsChanged();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to remove document.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <div onClick={onToggleExpand} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 2px", cursor: "pointer" }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {row.type.name}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(row), flexShrink: 0 }}>{statusText(row)}</span>
        <AttachmentIndicator hasDoc={hasDoc} onOpen={() => setPreviewGroup({ category: row.type.permit_type_id, label: row.type.name, pages })} />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEditType(); }}
          title={`Edit "${row.type.name}"`}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}
        >
          ✎
        </button>
      </div>

      {isExpanded && (
        <div style={{ padding: "4px 2px 14px" }} onClick={(e) => e.stopPropagation()}>
          {err && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{err}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Expiration date</label>
              <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Enforcement date (optional)</label>
              <input type="date" value={enfDate} onChange={(e) => setEnfDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Document{pages.length > 1 ? "s" : ""}</label>
            {pages.map((p) => (
              <div
                key={p.id}
                title={p.uploaded_by ? `Uploaded by ${namesByUserId[p.uploaded_by] ?? "…"}` : undefined}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 10px", marginBottom: 4 }}
              >
                <span style={{ fontSize: 14 }}>{p.mime_type?.startsWith("image/") ? "🖼" : "📄"}</span>
                <span style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.original_name}</span>
                <button type="button" onClick={() => setPreviewGroup({ category: row.type.permit_type_id, label: row.type.name, pages })} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>View</button>
                <button type="button" onClick={() => deletePage(p)} disabled={busy} style={{ background: "none", border: "none", color: "#fca5a5", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            <label style={{ display: "block", textAlign: "center" as const, padding: "8px", borderRadius: 6, border: "1px dashed rgba(255,255,255,0.18)", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              {uploading ? "Uploading…" : pages.length ? "+ Add another page" : "+ Add document"}
              <input
                type="file" accept="image/*,application/pdf,.pdf" style={{ display: "none" }}
                disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f, false); e.target.value = ""; }}
              />
            </label>
          </div>

          {confirmingDelete ? (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 10 }}>
                This clears the date and removes any attached document for {row.type.name}. This can&apos;t be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} style={cancelBtnStyle}>Cancel</button>
                <button type="button" onClick={deleteRecord} disabled={busy} style={{ ...dangerBtnStyle, flex: 1 }}>{busy ? "Deleting…" : "Delete"}</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              {row.record && (
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} style={dangerBtnStyle}>Delete</button>
              )}
              <button type="button" onClick={save} disabled={busy} style={saveBtnStyle}>{busy ? "Saving…" : "Save"}</button>
            </div>
          )}
        </div>
      )}

      {previewGroup && <DocPreviewModal group={previewGroup} onClose={() => setPreviewGroup(null)} />}
    </div>
  );
}

// ─── Main Binder modal ───────────────────────────────────────────────────────

export default function BinderModal({
  open, onClose, companyId, truckId, trailerId, truckName, trailerName, myRole,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  truckId: string | null;
  trailerId: string | null;
  truckName?: string | null;
  trailerName?: string | null;
  myRole?: string | null;
}) {
  const [types, setTypes] = useState<PermitType[]>([]);
  const [records, setRecords] = useState<PermitRecord[]>([]);
  const [truckDetail, setTruckDetail] = useState<UnitDetail | null>(null);
  const [trailerDetail, setTrailerDetail] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeEditor, setTypeEditor] = useState<{ mode: "new" | "edit"; type: PermitType | null; unit: UnitKind; initialName?: string } | null>(null);
  const [addPicker, setAddPicker] = useState<UnitKind | null>(null);

  const detailCols = "year, make, model, vin_number, plate_number, notes, region, local_area";

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: r }, { data: td }, { data: trd }] = await Promise.all([
      supabase.from("permit_types").select("permit_type_id, name, applies_to, is_active").eq("company_id", companyId).order("name"),
      (async () => {
        if (!truckId && !trailerId) return { data: [] as PermitRecord[] };
        const [{ data: tr }, { data: trr }] = await Promise.all([
          truckId ? supabase.from("equipment_permits").select("equipment_permit_id, truck_id, trailer_id, permit_type_id, expiration_date, enforcement_date, notes").eq("truck_id", truckId) : Promise.resolve({ data: [] as PermitRecord[] }),
          trailerId ? supabase.from("equipment_permits").select("equipment_permit_id, truck_id, trailer_id, permit_type_id, expiration_date, enforcement_date, notes").eq("trailer_id", trailerId) : Promise.resolve({ data: [] as PermitRecord[] }),
        ]);
        return { data: [...((tr ?? []) as PermitRecord[]), ...((trr ?? []) as PermitRecord[])] };
      })(),
      truckId ? supabase.from("trucks").select(detailCols).eq("truck_id", truckId).maybeSingle() : Promise.resolve({ data: null }),
      trailerId ? supabase.from("trailers").select(detailCols).eq("trailer_id", trailerId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setTypes((t ?? []) as PermitType[]);
    setRecords((r ?? []) as PermitRecord[]);
    setTruckDetail((td ?? null) as UnitDetail | null);
    setTrailerDetail((trd ?? null) as UnitDetail | null);
    setLoading(false);
  }, [companyId, truckId, trailerId]);

  useEffect(() => {
    if (!open) return;
    setExpandedId(null);
    void load();
  }, [open, load]);

  function toggleExpand(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  // Reflects whichever single unit this Binder is actually scoped to --
  // Edit now always opens it single-unit (see SoloEquipmentModal.tsx's
  // openEdit()). Generic "Equipment File" is kept as the fallback for any
  // caller still passing both truckId and trailerId, or neither.
  const modalTitle =
    truckId && !trailerId ? `Truck · ${truckName ?? "File"}` :
    trailerId && !truckId ? `Trailer · ${trailerName ?? "File"}` :
    "Equipment File";

  return (
    <>
      <FullscreenModal open={open} onClose={onClose} title={modalTitle} footer={null}>
        {loading && <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "24px 0" }}>Loading…</div>}
        {!loading && !truckId && !trailerId && (
          <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "24px 0" }}>Select equipment first.</div>
        )}
        {!loading && truckId && (
          <UnitSection
            unitKind="truck" unitId={truckId} unitName={truckName ?? "Truck"} companyId={companyId}
            types={types} records={records} detail={truckDetail} expandedId={expandedId} onToggleExpand={toggleExpand}
            onEditType={(t) => setTypeEditor({ mode: "edit", type: t, unit: "truck" })}
            onAddType={() => setAddPicker("truck")}
            onSaved={load}
            onClose={onClose}
            myRole={myRole}
          />
        )}
        {!loading && trailerId && (
          <UnitSection
            unitKind="trailer" unitId={trailerId} unitName={trailerName ?? "Trailer"} companyId={companyId}
            types={types} records={records} detail={trailerDetail} expandedId={expandedId} onToggleExpand={toggleExpand}
            onEditType={(t) => setTypeEditor({ mode: "edit", type: t, unit: "trailer" })}
            onAddType={() => setAddPicker("trailer")}
            onSaved={load}
            onClose={onClose}
            myRole={myRole}
          />
        )}
      </FullscreenModal>

      <AddPermitTypeModal
        open={!!addPicker}
        onClose={() => setAddPicker(null)}
        unit={addPicker ?? "truck"}
        existingTypes={types}
        onPick={(name) => {
          setTypeEditor({ mode: "new", type: null, unit: addPicker ?? "truck", initialName: name });
          setAddPicker(null);
        }}
      />

      <PermitTypeEditorModal
        open={!!typeEditor}
        onClose={() => setTypeEditor(null)}
        companyId={companyId}
        mode={typeEditor?.mode ?? "new"}
        type={typeEditor?.type ?? null}
        unit={typeEditor?.unit ?? "truck"}
        initialName={typeEditor?.initialName}
        onSaved={() => { setTypeEditor(null); void load(); }}
        onDeleted={() => { setTypeEditor(null); void load(); }}
      />
    </>
  );
}
