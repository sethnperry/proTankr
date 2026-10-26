"use client";
// app/planner/modals/serviceTypes/ServiceTypeEditorModal.tsx
//
// Part of ServiceTypeManager.tsx.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";

import type { ServiceType } from "./types";
import { fieldLabel, inputStyle, saveBtnStyle, fetchServiceTypes } from "./helpers";

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
                  // Trailers have no odometer or hour meter, so service is by
                  // date; trucks can also go by miles or engine hours.
                  ...(appliesTo !== "trailer" ? [{ value: "miles", label: "Miles" }, { value: "hours", label: "Engine hours" }] : []),
                  { value: "duration", label: "Duration (days)" },
                  { value: "none", label: "None" },
                ]}
              />
              {kind === "hours" && appliesTo === "trailer" && (
                <div style={{ color: "#fbbf24", fontSize: 12, marginTop: 6 }}>
                  Trailers have no hour meter, so this service never comes due. Pick Duration (days).
                </div>
              )}
              {kind === "hours" && appliesTo !== "trailer" && (
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 6 }}>
                  Counted on the truck from its engine hours, which need the Geotab link. Without it this service doesn't come due.
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

            <button aria-busy={!!(busy)} type="button" onClick={save} disabled={busy} style={saveBtnStyle}>{busy ? "Saving…" : "Save"}</button>

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
              <button aria-busy={!!(busy)} type="button" onClick={confirmDelete} disabled={busy}
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
