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

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

import type { PermitType, PermitRecord, UnitDetail, UnitKind } from "./binder/types";
import { UnitSection } from "./binder/UnitSection";
import { PermitTypeEditorModal } from "./binder/PermitTypeEditorModal";
import { AddPermitTypeModal } from "./binder/AddPermitTypeModal";

export default function BinderModal({
  open,
  onClose,
  companyId,
  truckId,
  trailerId,
  truckName,
  trailerName,
  myRole,
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
  const [typeEditor, setTypeEditor] = useState<{
    mode: "new" | "edit";
    type: PermitType | null;
    unit: UnitKind;
    initialName?: string;
  } | null>(null);
  const [addPicker, setAddPicker] = useState<UnitKind | null>(null);

  const detailCols = "year, make, model, vin_number, plate_number, notes, region, local_area";

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: r }, { data: td }, { data: trd }] = await Promise.all([
      supabase
        .from("permit_types")
        .select("permit_type_id, name, applies_to, is_active, terminal_id")
        .eq("company_id", companyId)
        .order("name"),
      (async () => {
        if (!truckId && !trailerId) return { data: [] as PermitRecord[] };
        const [{ data: tr }, { data: trr }] = await Promise.all([
          truckId
            ? supabase
                .from("equipment_permits")
                .select("equipment_permit_id, truck_id, trailer_id, permit_type_id, expiration_date, enforcement_date, notes")
                .eq("truck_id", truckId)
            : Promise.resolve({ data: [] as PermitRecord[] }),
          trailerId
            ? supabase
                .from("equipment_permits")
                .select("equipment_permit_id, truck_id, trailer_id, permit_type_id, expiration_date, enforcement_date, notes")
                .eq("trailer_id", trailerId)
            : Promise.resolve({ data: [] as PermitRecord[] }),
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
    truckId && !trailerId
      ? `Truck · ${truckName ?? "File"}`
      : trailerId && !truckId
        ? `Trailer · ${trailerName ?? "File"}`
        : "Equipment File";

  return (
    <>
      <FullscreenModal open={open} onClose={onClose} title={modalTitle} footer={null}>
        {loading && (
          <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "24px 0" }}>Loading…</div>
        )}
        {!loading && !truckId && !trailerId && (
          <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "24px 0" }}>
            Select equipment first.
          </div>
        )}
        {!loading && truckId && (
          <UnitSection
            unitKind="truck"
            unitId={truckId}
            unitName={truckName ?? "Truck"}
            companyId={companyId}
            types={types}
            records={records}
            detail={truckDetail}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
            onEditType={(t) => setTypeEditor({ mode: "edit", type: t, unit: "truck" })}
            onAddType={() => setAddPicker("truck")}
            onSaved={load}
            onClose={onClose}
            myRole={myRole}
          />
        )}
        {!loading && trailerId && (
          <UnitSection
            unitKind="trailer"
            unitId={trailerId}
            unitName={trailerName ?? "Trailer"}
            companyId={companyId}
            types={types}
            records={records}
            detail={trailerDetail}
            expandedId={expandedId}
            onToggleExpand={toggleExpand}
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
        onSaved={() => {
          setTypeEditor(null);
          void load();
        }}
        onDeleted={() => {
          setTypeEditor(null);
          void load();
        }}
      />
    </>
  );
}
