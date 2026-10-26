"use client";
// app/planner/modals/serviceTypes/SimpleServiceModal.tsx
//
// Part of ServiceTypeManager.tsx.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { fetchTruckReading } from "@/lib/telematics/useTruckReading";

import type { ServiceType } from "./types";
import { fieldLabel, inputStyle, saveBtnStyle } from "./helpers";
import { ServiceTypeEditorModal } from "./ServiceTypeEditorModal";
import { UnitServiceFields } from "./UnitServiceFields";

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

  // A miles or engine-hours service fills the reading from the truck's telematics when linked.
  const truckKind = serviceTypes.find((t) => t.service_type_id === truckTypeId)?.interval_kind;
  useEffect(() => {
    if (!open || !truckId || (truckKind !== "miles" && truckKind !== "hours")) return;
    let off = false;
    void fetchTruckReading(truckId).then((r) => {
      const v = truckKind === "hours" ? r?.engineHours : r?.odometerMi;
      if (!off && v != null) setTruckReading((cur) => (cur.trim() ? cur : String(v)));
    });
    return () => { off = true; };
  }, [open, truckId, truckKind]);

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

        <button aria-busy={!!(busy)} type="button" onClick={save} disabled={busy} style={saveBtnStyle}>{busy ? "Saving…" : "Save"}</button>
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
