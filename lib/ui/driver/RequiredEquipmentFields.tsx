"use client";
// lib/ui/driver/RequiredEquipmentFields.tsx
//
// The "front page" identity block for adding/editing a truck or trailer --
// Unit #, Year, Make, Model, Region, Local Area. Per the 2026-08-29
// equipment-modal-rework note: these are the only fields required to get
// a unit on file; everything else (VIN, plate, permits, notes) lives
// behind a separate "Details" screen. Shared by TruckModal/TrailerModal's
// new front page (lib/ui/driver/EquipmentDetails.tsx) and BinderModal's
// per-unit header (app/planner/modals/BinderModal.tsx) -- one component
// so the two never drift, matching this codebase's own established
// "duplicating this is how the bug creeps back in" precedent
// (CustomSelect.tsx, ServiceTypeManager.tsx).
//
// Region/Local Area are managed catalogs (equipment_regions/
// equipment_local_areas, migration 20260829010000) -- this component only
// ever PICKS from the catalog, or creates a brand-new entry inline (so a
// fresh company isn't blocked on finding a separate management screen
// just to get its first truck on file). Renaming/removing existing
// catalog entries is deliberately NOT done here -- that's the Filter
// button's job (RegionLocalAreaFilterModal, gated to admin/dispatch/lead),
// kept in one place rather than two editors that could disagree.
//
// Deliberately self-styled (own inline style constants, not the host
// file's own css tokens) so it looks identical everywhere it's mounted,
// regardless of which file's styling conventions surround it.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 4, display: "block",
};
const fieldInput: React.CSSProperties = {
  width: "100%", borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.3)", padding: "10px 11px", fontSize: 15, fontWeight: 600,
  color: "#fff", boxSizing: "border-box" as const,
};
const lockedInput: React.CSSProperties = { opacity: 0.55, cursor: "not-allowed" as const };

export type CatalogRow = { id: string; name: string };

// ─── One catalog-backed picker (Region or Local Area) ──────────────────────
// Exported so other equipment-status surfaces (e.g. EquipmentStatusModal.tsx's
// "where is it now" fields) can reuse the exact same region-then-scoped-
// local-area picker instead of a third copy -- same "duplicating this is
// how the bug creeps back in" precedent this file's own header comment
// already cites.

export function CatalogPicker({
  label, placeholder, value, onChange, table, idCol, companyId, editable, filterByRegionName,
  matchColumns, insertColumns,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  table: "equipment_regions" | "equipment_local_areas" | "equipment_sub_statuses";
  idCol: "region_id" | "local_area_id" | "sub_status_id";
  companyId: string;
  editable: boolean;
  /** Local Area only -- scopes the list to this region's local areas
   *  (region_id, migration 20260918000000). Local areas belong to
   *  regions now, so a region must be picked first; a falsy value here
   *  means "nothing chosen yet," not "show everything." */
  filterByRegionName?: string;
  /** Additional membership filters, e.g. { unit_kind: ["truck", "both"],
   *  status_scope: ["deadline", "both"] } -- each becomes a `.in(column,
   *  values)` clause. Used by the sub-status catalog to scope its list by
   *  unit kind and by which top-level status it applies under. Compared
   *  by content (JSON.stringify) in the reload effect, not by reference,
   *  so callers can pass a fresh object literal every render without
   *  needing to memoize it themselves. */
  matchColumns?: Record<string, string[]>;
  /** Column values stamped on a newly-created entry (e.g. { unit_kind:
   *  "truck", status_scope: "deadline" }) -- so "+ Add new" while a
   *  specific context is active tags the new entry with that same
   *  context instead of defaulting to "both". */
  insertColumns?: Record<string, string>;
}) {
  const scoped = idCol === "local_area_id";
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Resolved once per region, reused by both load() and createNew() so a
  // freshly-added local area is tagged with the same region_id the list
  // was just scoped to.
  const [regionId, setRegionId] = useState<string | null>(null);
  const matchColumnsKey = JSON.stringify(matchColumns ?? null);

  function applyMatchColumns(query: any) {
    if (!matchColumns) return query;
    let q = query;
    for (const [col, vals] of Object.entries(matchColumns)) {
      q = q.in(col, vals);
    }
    return q;
  }

  async function load() {
    if (!companyId) return;
    if (scoped) {
      if (!filterByRegionName) { setRows([]); setRegionId(null); return; }
      const { data: regionRow } = await supabase
        .from("equipment_regions")
        .select("region_id")
        .eq("company_id", companyId)
        .eq("name", filterByRegionName)
        .eq("is_active", true)
        .maybeSingle();
      const rid = (regionRow as any)?.region_id ? String((regionRow as any).region_id) : null;
      setRegionId(rid);
      if (!rid) { setRows([]); return; }
      const { data } = await applyMatchColumns(
        supabase
          .from(table)
          .select(`${idCol}, name`)
          .eq("company_id", companyId)
          .eq("is_active", true)
          .eq("region_id", rid)
      ).order("name");
      setRows(((data ?? []) as any[]).map((r) => ({ id: String(r[idCol]), name: r.name as string })));
      return;
    }
    const { data } = await applyMatchColumns(
      supabase
        .from(table)
        .select(`${idCol}, name`)
        .eq("company_id", companyId)
        .eq("is_active", true)
    ).order("name");
    setRows(((data ?? []) as any[]).map((r) => ({ id: String(r[idCol]), name: r.name as string })));
  }
  useEffect(() => { void load(); }, [companyId, filterByRegionName, matchColumnsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createNew() {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = { company_id: companyId, name: newName.trim(), ...insertColumns };
      if (scoped) payload.region_id = regionId;
      const { error } = await supabase
        .from(table)
        .insert(payload)
        .select(idCol)
        .single();
      if (error) throw error;
      onChange(newName.trim());
      setNewName("");
      setAdding(false);
      setOpen(false);
      void load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add.");
    } finally {
      setBusy(false);
    }
  }

  // A region must be picked before a local area can be -- local areas
  // belong to regions now, so there's nothing meaningful to scope to yet.
  const needsRegionFirst = scoped && !filterByRegionName;
  const reallyEditable = editable && !needsRegionFirst;
  const lockedStyle = reallyEditable ? {} : lockedInput;

  return (
    <div style={{ position: "relative" as const }}>
      <label style={fieldLabel}>{label}</label>
      <button
        type="button"
        disabled={!reallyEditable}
        onClick={() => setOpen((v) => !v)}
        style={{
          ...fieldInput, ...lockedStyle, textAlign: "left" as const, cursor: reallyEditable ? "pointer" : "not-allowed",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: value ? "#fff" : "rgba(255,255,255,0.35)" }}>
          {needsRegionFirst ? "Select a region first" : (value || placeholder)}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", flexShrink: 0, marginLeft: 6 }}>▾</span>
      </button>

      {open && reallyEditable && (
        <div
          style={{
            position: "absolute" as const, top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
            background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 6,
            maxHeight: 240, overflowY: "auto" as const, boxShadow: "0 8px 24px rgba(0,0,0,0.55)", padding: 4,
          }}
        >
          {err && <div style={{ color: "#fca5a5", fontSize: 11, padding: "4px 8px" }}>{err}</div>}
          <div
            onClick={() => { onChange(""); setOpen(false); }}
            style={{ padding: "9px 10px", fontSize: 13, color: "rgba(255,255,255,0.5)", cursor: "pointer", borderRadius: 6 }}
          >
            — None —
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              onClick={() => { onChange(r.name); setOpen(false); }}
              style={{
                padding: "9px 10px", fontSize: 13, color: "#fff", cursor: "pointer", borderRadius: 6,
                background: r.name === value ? "rgba(255,255,255,0.08)" : "transparent",
              }}
            >
              {r.name}
            </div>
          ))}
          {!adding ? (
            <div
              onClick={() => setAdding(true)}
              style={{ padding: "9px 10px", fontSize: 13, color: "rgba(255,255,255,0.65)", cursor: "pointer", borderRadius: 6, borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 2 }}
            >
              + Add new
            </div>
          ) : (
            <div style={{ display: "flex", gap: 4, padding: 6 }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void createNew(); }}
                placeholder={placeholder}
                style={{ ...fieldInput, fontSize: 13, padding: "7px 9px" }}
              />
              <button type="button" onClick={createNew} disabled={busy || !newName.trim()}
                style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 700, fontSize: 12, padding: "0 12px", cursor: "pointer" }}>
                {busy ? "…" : "Add"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Required fields block ──────────────────────────────────────────────────

export function RequiredEquipmentFields({
  kind, companyId, editable = true,
  name, onNameChange,
  year, onYearChange,
  make, onMakeChange,
  model, onModelChange,
  region, onRegionChange,
  localArea, onLocalAreaChange,
}: {
  kind: "truck" | "trailer";
  companyId: string;
  editable?: boolean;
  name: string; onNameChange: (v: string) => void;
  year: string; onYearChange: (v: string) => void;
  make: string; onMakeChange: (v: string) => void;
  model: string; onModelChange: (v: string) => void;
  region: string; onRegionChange: (v: string) => void;
  localArea: string; onLocalAreaChange: (v: string) => void;
}) {
  const namePh = kind === "truck" ? "e.g. T-101" : "e.g. 3151";
  const makePh = kind === "truck" ? "e.g. Kenworth" : "e.g. Polar";
  const modelPh = kind === "truck" ? "e.g. T680" : "e.g. Tank";
  const yearPh = kind === "truck" ? "2022" : "2020";
  const lockedStyle = editable ? {} : lockedInput;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <label style={fieldLabel}>Unit #</label>
        <input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={namePh} disabled={!editable}
          style={{ ...fieldInput, ...lockedStyle, fontSize: 18, fontWeight: 800 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={fieldLabel}>Year</label>
          <input type="number" value={year} onChange={(e) => onYearChange(e.target.value)} placeholder={yearPh} disabled={!editable}
            style={{ ...fieldInput, ...lockedStyle }} />
        </div>
        <div>
          <label style={fieldLabel}>Make</label>
          <input value={make} onChange={(e) => onMakeChange(e.target.value)} placeholder={makePh} disabled={!editable}
            style={{ ...fieldInput, ...lockedStyle }} />
        </div>
      </div>
      <div>
        <label style={fieldLabel}>Model</label>
        <input value={model} onChange={(e) => onModelChange(e.target.value)} placeholder={modelPh} disabled={!editable}
          style={{ ...fieldInput, ...lockedStyle }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <CatalogPicker
          label="Region" placeholder="Select region"
          value={region}
          // Local areas belong to regions -- changing the region out from
          // under an already-picked local area would leave a value on
          // screen that no longer belongs to it, so clear it here rather
          // than leaving a stale, now-unscoped selection behind.
          onChange={(v) => { onRegionChange(v); if (v !== region) onLocalAreaChange(""); }}
          table="equipment_regions" idCol="region_id" companyId={companyId} editable={editable}
        />
        <CatalogPicker
          label="Local Area" placeholder="Select area" value={localArea} onChange={onLocalAreaChange}
          table="equipment_local_areas" idCol="local_area_id" companyId={companyId} editable={editable}
          filterByRegionName={region}
        />
      </div>
    </div>
  );
}
