"use client";
// app/planner/modals/ServiceTypeManager.tsx
//
// Service type creation/editing (name + interval + which unit it applies
// to) and the "log a service" form that uses it -- shared by
// SoloEquipmentModal.tsx (solo-tier picker) and EquipmentDetails.tsx
// (fleet-tier TruckModal/TrailerModal). Originally only lived inline inside
// SoloEquipmentModal.tsx, so a fleet (non-solo) company had no way at all
// to create a service type or set its interval -- extracted here 2026-08-07
// per explicit user direction ("make it the same for all... everyone
// should be able to edit") rather than building a second, independently-
// drifting copy for the fleet modal -- exactly the class of bug this
// codebase has hit before whenever a shared UI piece got duplicated
// per-tier (see lib/ui/CustomSelect.tsx's own header comment).
//
// Deliberately NOT role-gated -- unlike the fleet equipment cap/Unit#
// fields (canEditRestricted, admin/lead/dispatch only in EquipmentDetails.tsx),
// service type management has never been role-gated in the solo flow this
// was extracted from, and the user explicitly asked that stay true
// everywhere it's used.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";

export type ServiceType = {
  service_type_id: string;
  name: string;
  interval_kind: "miles" | "hours" | "duration" | "none";
  interval_value: number | null;
  applies_to: "truck" | "trailer" | "both";
  is_active: boolean;
};

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.45)" };
const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.28)", color: "#fff", fontSize: 15, boxSizing: "border-box",
};
const saveBtnStyle: React.CSSProperties = {
  width: "100%", padding: "14px 18px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer",
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(255,255,255,0.4)' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 14px center",
  paddingRight: 36,
};

// Fetches fresh from the DB every call rather than relying on caller-held
// state -- a caller that just created/edited a type wants the very next
// read to reflect it, not a stale closure (same reasoning SoloEquipmentModal's
// own loadServiceAndWash comment documents for the sibling due-computation
// fetch).
export async function fetchServiceTypes(companyId: string): Promise<ServiceType[]> {
  const { data } = await supabase
    .from("service_types")
    .select("service_type_id, name, interval_kind, interval_value, applies_to, is_active")
    .eq("company_id", companyId)
    .order("name");
  return (data ?? []) as ServiceType[];
}

// ─── Create/edit a service type (name, interval, which unit it applies to) ──

export function ServiceTypeEditorModal({
  open, onClose, companyId, mode, type, unit, onSaved, onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  mode: "new" | "edit";
  type: ServiceType | null;
  unit: "truck" | "trailer" | "both";
  onSaved: (fresh: ServiceType[], savedId: string) => void;
  onDeleted: (fresh: ServiceType[], deletedId: string) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ServiceType["interval_kind"]>("duration");
  const [value, setValue] = useState("");
  const [appliesTo, setAppliesTo] = useState<ServiceType["applies_to"]>("both");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmingDelete(false);
    setErr(null);
    if (mode === "edit" && type) {
      setName(type.name);
      setKind(type.interval_kind);
      setValue(type.interval_value != null ? String(type.interval_value) : "");
      setAppliesTo(type.applies_to);
    } else {
      setName("");
      setKind("duration");
      setValue("");
      setAppliesTo(unit === "truck" ? "truck" : unit === "trailer" ? "trailer" : "both");
    }
  }, [open, mode, type, unit]);

  async function save() {
    if (!name.trim()) { setErr("Enter a type name."); return; }
    setBusy(true);
    setErr(null);
    try {
      const patch = {
        name: name.trim(),
        interval_kind: kind,
        interval_value: kind === "none" ? null : Number(value) || null,
        applies_to: appliesTo,
      };
      let savedId: string;
      if (mode === "edit" && type) {
        const { error } = await supabase.from("service_types").update(patch).eq("service_type_id", type.service_type_id);
        if (error) throw error;
        savedId = type.service_type_id;
      } else {
        const { data, error } = await supabase.from("service_types").insert({ company_id: companyId, ...patch }).select("service_type_id").single();
        if (error) throw error;
        savedId = String((data as any).service_type_id);
      }
      const fresh = await fetchServiceTypes(companyId);
      onSaved(fresh, savedId);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save service type.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!type) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from("service_types").update({ is_active: false }).eq("service_type_id", type.service_type_id);
      if (error) throw error;
      const fresh = await fetchServiceTypes(companyId);
      onDeleted(fresh, type.service_type_id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete service type.");
      setBusy(false);
    }
  }

  return (
    <FullscreenModal open={open} onClose={onClose} title={mode === "edit" ? "Edit Service Type" : "New Service Type"} footer={null}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div>}

        {!confirmingDelete ? (
          <>
            <div>
              <label style={fieldLabel}>Type name</label>
              <input placeholder="e.g. Wet, Dry, Clean &amp; Purge" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={fieldLabel}>Interval</label>
              <CustomSelect
                value={kind}
                onChange={(v) => setKind(v as any)}
                options={[
                  // Trailers have no odometer and nothing records engine
                  // hours, so service is by date, or miles for trucks.
                  ...(appliesTo !== "trailer" ? [{ value: "miles", label: "Miles" }] : []),
                  { value: "duration", label: "Duration (days)" },
                  { value: "none", label: "None" },
                  ...(kind === "hours" ? [{ value: "hours", label: "Hours (not tracked)" }] : []),
                ]}
              />
              {kind === "hours" && (
                <div style={{ color: "#fbbf24", fontSize: 12, marginTop: 6 }}>
                  Hours aren't tracked, so this service never comes due. Pick Duration (days){appliesTo !== "trailer" ? " or Miles" : ""}.
                </div>
              )}
              {kind === "miles" && appliesTo !== "truck" && (
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 6 }}>
                  Miles are counted on the truck only. Trailers have no odometer.
                </div>
              )}
            </div>
            {kind !== "none" && (
              <div>
                {/* Label/placeholder are driven by the Interval selection
                    above -- "that selection determines the field type for
                    the value," per explicit direction. */}
                <label style={fieldLabel}>
                  {kind === "miles" ? "Every how many miles" : kind === "hours" ? "Every how many hours" : "Every how many days"}
                </label>
                <input
                  placeholder={kind === "miles" ? "e.g. 65000" : kind === "hours" ? "e.g. 500" : "e.g. 90"}
                  type="number" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}
                />
              </div>
            )}
            <div>
              <label style={fieldLabel}>Applies to</label>
              <CustomSelect
                value={appliesTo}
                onChange={(v) => {
                  setAppliesTo(v as any);
                  // A trailer-only service can't be by miles; don't reuse the mile number as days.
                  if (v === "trailer" && kind === "miles") { setKind("duration"); setValue(""); }
                }}
                options={[
                  { value: "both", label: "Truck & Trailer" },
                  { value: "truck", label: "Truck only" },
                  { value: "trailer", label: "Trailer only" },
                ]}
              />
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6, lineHeight: 1.5 }}>
                If logged on both units at once, the unit this doesn't apply to just shows it was done alongside the other one.
              </div>
            </div>

            <button type="button" onClick={save} disabled={busy} style={saveBtnStyle}>{busy ? "Saving…" : "Save"}</button>

            {mode === "edit" && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                style={{ width: "100%", padding: "12px 18px", borderRadius: 2, border: "1px solid rgba(220,60,60,0.4)", background: "rgba(180,40,40,0.12)", color: "#fca5a5", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
              >
                Delete type
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Delete &quot;{type?.name}&quot;?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              This only affects future entries -- it stops showing up when logging a new service. Existing records that already used it keep their history.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy}
                style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} disabled={busy}
                style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(220,60,60,0.5)", background: "rgba(180,40,40,0.25)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>
    </FullscreenModal>
  );
}

// ─── Manage service types only, no unit id required ────────────────────────
// For the new Add Truck/Trailer front page's "Service Schedule" button
// before the unit has been saved (isNew) -- SimpleServiceModal below (the
// existing "Log Service / Manage Service Types" flow ServiceSection uses
// once a real unit exists) needs a truck_id/trailer_id to log a record
// against, but service_types themselves are company-wide, not per-unit --
// so type management alone never actually needed one. This is that
// narrower "just the types" view, reusing the same
// ServiceTypeEditorModal/fetchServiceTypes pieces rather than a second
// copy of either.

export function ServiceTypeListModal({
  open, onClose, companyId, unit,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  unit: "truck" | "trailer";
}) {
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [typeEditor, setTypeEditor] = useState<{ mode: "new" | "edit"; type: ServiceType | null } | null>(null);

  async function reload() {
    setTypes(await fetchServiceTypes(companyId));
  }
  useEffect(() => { if (open && companyId) void reload(); }, [open, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applicable = types.filter((t) => t.is_active && (t.applies_to === "both" || t.applies_to === unit));

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)", cursor: "pointer",
  };

  return (
    <FullscreenModal open={open} onClose={onClose} title="Service Schedule" footer={null}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
          Types and intervals used to calculate when this {unit} is next due for service.
        </div>
        {applicable.length === 0 && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "8px 0" }}>No service types yet.</div>
        )}
        {applicable.map((t) => (
          <div key={t.service_type_id} style={rowStyle} onClick={() => setTypeEditor({ mode: "edit", type: t })}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{t.name}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {t.interval_kind === "none" ? "No interval" : `Every ${t.interval_value} ${t.interval_kind}`}
            </span>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setTypeEditor({ mode: "new", type: null })}
          style={{
            textAlign: "left" as const, padding: "12px 14px", borderRadius: 2,
            border: "1px dashed rgba(255,255,255,0.18)", background: "transparent",
            color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          + New type
        </button>
      </div>

      <ServiceTypeEditorModal
        open={!!typeEditor}
        onClose={() => setTypeEditor(null)}
        companyId={companyId}
        mode={typeEditor?.mode ?? "new"}
        type={typeEditor?.type ?? null}
        unit={unit}
        onSaved={(fresh) => { setTypes(fresh); setTypeEditor(null); }}
        onDeleted={(fresh) => { setTypes(fresh); setTypeEditor(null); }}
      />
    </FullscreenModal>
  );
}

// ─── Service type dropdown (adds a minus-to-edit affordance per option) ─────
// Can't reuse the generic CustomSelect here -- it needs a second interactive
// target (the minus button) inside each option row, which the generic
// component's plain {value,label} options don't support.

export function ServiceTypeSelect({
  value, onChange, types, onEditType, onNewType,
}: {
  value: string;
  onChange: (v: string) => void;
  types: ServiceType[];
  onEditType: (t: ServiceType) => void;
  onNewType: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hoverValue, setHoverValue] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const selectedLabel = value === "" ? "Select…" : types.find((t) => t.service_type_id === value)?.name ?? "";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...selectStyle, display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" as const, cursor: "pointer" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{selectedLabel}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 2,
          maxHeight: 280, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.55)", padding: 4,
        }}>
          <div
            onClick={() => { onChange(""); setOpen(false); }}
            onMouseEnter={() => setHoverValue("")}
            onMouseLeave={() => setHoverValue((v) => (v === "" ? null : v))}
            style={{ padding: "10px 12px", fontSize: 15, color: "#fff", cursor: "pointer", borderRadius: 2, background: hoverValue === "" ? "rgba(255,255,255,0.10)" : "transparent" }}
          >
            Select…
          </div>
          {types.map((t) => (
            <div
              key={t.service_type_id}
              style={{
                display: "flex", alignItems: "center", gap: 6, borderRadius: 2,
                background: hoverValue === t.service_type_id ? "rgba(255,255,255,0.10)" : t.service_type_id === value ? "rgba(255,255,255,0.05)" : "transparent",
              }}
              onMouseEnter={() => setHoverValue(t.service_type_id)}
              onMouseLeave={() => setHoverValue((v) => (v === t.service_type_id ? null : v))}
            >
              <div
                onClick={() => { onChange(t.service_type_id); setOpen(false); }}
                style={{ flex: 1, padding: "10px 12px", fontSize: 15, color: "#fff", cursor: "pointer" }}
              >
                {t.name}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onEditType(t); }}
                title={`Edit "${t.name}"`}
                style={{
                  width: 26, height: 26, marginRight: 6, flexShrink: 0, borderRadius: "50%",
                  border: "1px solid rgba(220,60,60,0.5)", background: "rgba(180,40,40,0.18)",
                  color: "#fca5a5", fontWeight: 900, fontSize: 15, lineHeight: 1, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                −
              </button>
            </div>
          ))}
          <div
            onClick={() => { setOpen(false); onNewType(); }}
            onMouseEnter={() => setHoverValue("__new__")}
            onMouseLeave={() => setHoverValue((v) => (v === "__new__" ? null : v))}
            style={{ padding: "10px 12px", fontSize: 15, color: "rgba(255,255,255,0.65)", cursor: "pointer", borderRadius: 2, background: hoverValue === "__new__" ? "rgba(255,255,255,0.10)" : "transparent" }}
          >
            + New type
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Log a service record against a truck and/or trailer ──────────────────

// ─── One unit's own type (+ reading) picker, used standalone or as one of
// two independent sub-sections when servicing both units together ─────────
// 2026-08-29: previously "Both" forced the SAME service_type_id onto both
// units' rows -- per explicit spec ("a user might put wet service for the
// truck and check and inspect for the trailer type"), each unit now picks
// its own type entirely independently.

function UnitServiceFields({
  unitLabel, types, typeId, onTypeIdChange, reading, onReadingChange, showReading, onEditType, onNewType,
}: {
  unitLabel: string;
  types: ServiceType[];
  typeId: string;
  onTypeIdChange: (v: string) => void;
  reading: string;
  onReadingChange: (v: string) => void;
  showReading: boolean;
  onEditType: (t: ServiceType) => void;
  onNewType: () => void;
}) {
  const selectedType = types.find((t) => t.service_type_id === typeId);
  const effectiveKind = selectedType?.interval_kind;
  const needsReading = showReading && (effectiveKind === "miles" || effectiveKind === "hours");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {unitLabel}
      </div>
      <div>
        <label style={fieldLabel}>Type</label>
        <ServiceTypeSelect
          value={typeId}
          onChange={onTypeIdChange}
          types={types}
          onEditType={onEditType}
          onNewType={onNewType}
        />
      </div>
      {selectedType && selectedType.interval_kind !== "none" && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          Interval: every {selectedType.interval_value} {selectedType.interval_kind}
        </div>
      )}
      {needsReading && (
        <div>
          <label style={fieldLabel}>{effectiveKind === "miles" ? "Odometer (miles) *" : "Engine hours *"}</label>
          <input type="number" value={reading} onChange={(e) => onReadingChange(e.target.value)} style={inputStyle} />
        </div>
      )}
    </div>
  );
}

export function SimpleServiceModal({
  open, onClose, companyId, authUserId, truckId, trailerId, truckName, trailerName, serviceTypes, onTypesChanged, onSaved,
}: {
  open: boolean; onClose: () => void; companyId: string; authUserId: string | null;
  truckId: string | null; trailerId: string | null; truckName?: string | null; trailerName?: string | null;
  serviceTypes: ServiceType[]; onTypesChanged: () => void; onSaved: () => void;
}) {
  const [unit, setUnit] = useState<"truck" | "trailer" | "both">("both");
  const [truckTypeId, setTruckTypeId] = useState("");
  const [truckReading, setTruckReading] = useState("");
  const [trailerTypeId, setTrailerTypeId] = useState("");
  const [typeEditor, setTypeEditor] = useState<{ mode: "new" | "edit"; type: ServiceType | null; target: "truck" | "trailer" } | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shopName, setShopName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUnit(truckId && trailerId ? "both" : trailerId ? "trailer" : "truck");
      setTruckTypeId("");
      setTruckReading("");
      setTrailerTypeId("");
      setDate(new Date().toISOString().slice(0, 10));
      setShopName("");
      setLocation("");
      setNotes("");
      setErr(null);
    }
  }, [open, truckId, trailerId]);

  // Each unit's own picker only ever shows types actually applicable to
  // it -- independent of the overall `unit` selection now, since Both no
  // longer means "one type for everyone."
  const truckTypes = useMemo(
    () => serviceTypes.filter((t) => t.is_active && (t.applies_to === "both" || t.applies_to === "truck")),
    [serviceTypes]
  );
  const trailerTypes = useMemo(
    () => serviceTypes.filter((t) => t.is_active && (t.applies_to === "both" || t.applies_to === "trailer")),
    [serviceTypes]
  );

  const showTruck = truckId && (unit === "both" || unit === "truck");
  const showTrailer = trailerId && (unit === "both" || unit === "trailer");

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const truckType = truckTypes.find((t) => t.service_type_id === truckTypeId);
      const truckNeedsReading = truckType && (truckType.interval_kind === "miles" || truckType.interval_kind === "hours");
      if (showTruck && truckNeedsReading && !truckReading.trim()) {
        throw new Error(truckType!.interval_kind === "miles" ? "Enter the truck's odometer reading." : "Enter the truck's engine hours.");
      }
      if (showTruck && !truckTypeId) throw new Error("Select a service type for the truck.");
      if (showTrailer && !trailerTypeId) throw new Error("Select a service type for the trailer.");

      const rows: any[] = [];
      if (showTruck) {
        rows.push({ company_id: companyId, truck_id: truckId, trailer_id: null, service_type_id: truckTypeId, date, shop_name: shopName || null, location: location || null, reading_value: truckReading ? Number(truckReading) : null, notes: notes || null, created_by: authUserId });
      }
      if (showTrailer) {
        // Trailers don't track mileage/engine-hours -- no reading field
        // for the trailer's own sub-section at all (see UnitServiceFields'
        // showReading prop below).
        rows.push({ company_id: companyId, truck_id: null, trailer_id: trailerId, service_type_id: trailerTypeId, date, shop_name: shopName || null, location: location || null, reading_value: null, notes: notes || null, created_by: authUserId });
      }
      if (!rows.length) throw new Error("No unit selected.");

      const { error } = await supabase.from("service_records").insert(rows);
      if (error) throw error;

      if (shopName.trim()) await supabase.from("service_shops").upsert({ company_id: companyId, name: shopName.trim() }, { onConflict: "company_id,name" });
      if (location.trim()) await supabase.from("service_locations").upsert({ company_id: companyId, name: location.trim() }, { onConflict: "company_id,name" });

      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save service record.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullscreenModal open={open} onClose={onClose} title="Service Record" footer={null}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div>}

        <div>
          <label style={fieldLabel}>Unit</label>
          <CustomSelect
            value={unit}
            onChange={(v) => setUnit(v as any)}
            options={[
              ...(truckId ? [{ value: "truck", label: `Truck only (${truckName})` }] : []),
              ...(trailerId ? [{ value: "trailer", label: `Trailer only (${trailerName})` }] : []),
              ...(truckId && trailerId ? [{ value: "both", label: "Both" }] : []),
            ]}
          />
        </div>

        {/* Servicing both together: an additional area for the trailer
            shows up below the truck's, each with its own type. */}
        {showTruck && (
          <UnitServiceFields
            unitLabel={unit === "both" ? `Truck${truckName ? ` · ${truckName}` : ""}` : "Type"}
            types={truckTypes}
            typeId={truckTypeId} onTypeIdChange={setTruckTypeId}
            reading={truckReading} onReadingChange={setTruckReading}
            showReading
            onEditType={(t) => setTypeEditor({ mode: "edit", type: t, target: "truck" })}
            onNewType={() => setTypeEditor({ mode: "new", type: null, target: "truck" })}
          />
        )}
        {showTrailer && (
          <UnitServiceFields
            unitLabel={unit === "both" ? `Trailer${trailerName ? ` · ${trailerName}` : ""}` : "Type"}
            types={trailerTypes}
            typeId={trailerTypeId} onTypeIdChange={setTrailerTypeId}
            reading="" onReadingChange={() => {}}
            showReading={false}
            onEditType={(t) => setTypeEditor({ mode: "edit", type: t, target: "trailer" })}
            onNewType={() => setTypeEditor({ mode: "new", type: null, target: "trailer" })}
          />
        )}

        <div>
          <label style={fieldLabel}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={fieldLabel}>Shop name</label>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={fieldLabel}>Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={fieldLabel}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 70, fontFamily: "inherit", resize: "vertical" as const }} />
        </div>

        <button type="button" onClick={save} disabled={busy} style={saveBtnStyle}>{busy ? "Saving…" : "Save"}</button>
      </div>

      <ServiceTypeEditorModal
        open={!!typeEditor}
        onClose={() => setTypeEditor(null)}
        companyId={companyId}
        mode={typeEditor?.mode ?? "new"}
        type={typeEditor?.type ?? null}
        unit={typeEditor?.target ?? "both"}
        onSaved={(_fresh, savedId) => {
          onTypesChanged(); setTypeEditor(null);
          if (typeEditor?.target === "trailer") setTrailerTypeId(savedId); else setTruckTypeId(savedId);
        }}
        onDeleted={(_fresh, deletedId) => {
          onTypesChanged(); setTypeEditor(null);
          if (typeEditor?.target === "trailer") setTrailerTypeId((cur) => (cur === deletedId ? "" : cur));
          else setTruckTypeId((cur) => (cur === deletedId ? "" : cur));
        }}
      />
    </FullscreenModal>
  );
}
