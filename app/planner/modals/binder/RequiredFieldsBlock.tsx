"use client";
// app/planner/modals/binder/RequiredFieldsBlock.tsx
//
// Part of the Binder (equipment file) dialog.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { RequiredEquipmentFields } from "@/lib/ui/driver/RequiredEquipmentFields";

import type { UnitDetail, UnitKind } from "./types";
import { saveBtnStyle } from "./styles";

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
export function RequiredFieldsBlock({
  unitKind,
  unitId,
  unitName,
  companyId,
  detail,
  onSaved,
  myRole,
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
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  async function save() {
    if (!name.trim()) {
      setErr("Unit # is required.");
      return;
    }
    if (!region.trim()) {
      setErr("Region is required.");
      return;
    }
    if (!localArea.trim()) {
      setErr("Local area is required.");
      return;
    }
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
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: 0.5,
          textTransform: "uppercase" as const,
          marginBottom: 10,
        }}
      >
        {unitKind === "truck" ? "Truck" : "Trailer"}
      </div>
      {err && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <RequiredEquipmentFields
        kind={unitKind}
        companyId={companyId}
        editable={canEditRestricted}
        name={name}
        onNameChange={markDirty(setName)}
        year={year}
        onYearChange={markDirty(setYear)}
        make={make}
        onMakeChange={markDirty(setMake)}
        model={model}
        onModelChange={markDirty(setModel)}
        region={region}
        onRegionChange={markDirty(setRegion)}
        localArea={localArea}
        onLocalAreaChange={markDirty(setLocalArea)}
      />
      {dirty && (
        <button aria-busy={!!busy} type="button" onClick={save} disabled={busy} style={{ ...saveBtnStyle, marginTop: 12 }}>
          {busy ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}

// ─── VIN / Plate / Notes -- "the rest," collapsed then edit ────────────────
