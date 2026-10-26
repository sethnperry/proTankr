"use client";
// app/planner/modals/solo/SimpleWashModal.tsx
//
// Minimal wash record modal.

import { saveBtnStyle } from "./styles";
import { S } from "./styles";
import { useTripStore } from "@/lib/trips/useTripStore";
import { markCompartmentsCleaned } from "@/lib/trips/tripFlow";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
// ─── Minimal Wash record modal (full spec §3 is a later pass) ──
// SimpleServiceModal/ServiceTypeSelect/ServiceTypeEditorModal moved to
// ServiceTypeManager.tsx 2026-08-07 so the fleet-tier equipment modal can
// share them too -- see that file's header comment.

export function SimpleWashModal({
  open,
  onClose,
  companyId,
  authUserId,
  truckId,
  trailerId,
  truckName,
  trailerName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  authUserId: string | null;
  truckId: string | null;
  trailerId: string | null;
  truckName?: string | null;
  trailerName?: string | null;
  onSaved: () => void;
}) {
  const [unit, setUnit] = useState<"truck" | "trailer" | "both">("both");
  const [location, setLocation] = useState("");
  const [washedAt, setWashedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Interior wash (trip workflow §3): the trailer's chosen compartments go
  // back to Cleaned & Purged. Exterior is the default and changes nothing.
  const [washType, setWashType] = useState<"exterior" | "interior">("exterior");
  const [compNumbers, setCompNumbers] = useState<number[]>([]);
  const [pickedComps, setPickedComps] = useState<Set<number>>(new Set());
  const { store: tripStore, syncNow } = useTripStore(authUserId);

  useEffect(() => {
    if (open) {
      setUnit(truckId && trailerId ? "both" : trailerId ? "trailer" : "truck");
      setLocation("");
      setWashedAt(new Date().toISOString().slice(0, 16));
      setNotes("");
      setErr(null);
      setWashType("exterior");
    }
  }, [open, truckId, trailerId]);

  useEffect(() => {
    if (!open || !trailerId) {
      setCompNumbers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("trailer_compartments").select("comp_number").eq("trailer_id", trailerId).order("comp_number");
      if (cancelled) return;
      const nums = ((data ?? []) as { comp_number: number }[]).map((r) => Number(r.comp_number)).filter((n) => n > 0);
      setCompNumbers(nums);
      setPickedComps(new Set(nums));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, trailerId]);

  const trailerIncluded = !!trailerId && (unit === "both" || unit === "trailer");
  const interior = trailerIncluded && washType === "interior";

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const rows: any[] = [];
      const ts = new Date(washedAt).toISOString();
      if ((unit === "both" || unit === "truck") && truckId)
        rows.push({
          company_id: companyId,
          truck_id: truckId,
          trailer_id: null,
          location: location || null,
          washed_at: ts,
          notes: notes || null,
          created_by: authUserId,
        });
      const allComps = compNumbers.length > 0 && compNumbers.every((n) => pickedComps.has(n));
      const chosen = compNumbers.filter((n) => pickedComps.has(n));
      if (interior && chosen.length === 0) throw new Error("Pick the compartments that were washed.");
      if ((unit === "both" || unit === "trailer") && trailerId)
        rows.push({
          company_id: companyId,
          truck_id: null,
          trailer_id: trailerId,
          location: location || null,
          washed_at: ts,
          notes: notes || null,
          created_by: authUserId,
          ...(interior ? { wash_type: "interior", interior_comp_numbers: allComps ? null : chosen } : {}),
        });
      if (!rows.length) throw new Error("No unit selected.");

      const { error } = await supabase.from("wash_records").insert(rows);
      if (error) throw error;

      if (interior && trailerId && authUserId && tripStore) {
        markCompartmentsCleaned(tripStore, { trailerId, companyId, userId: authUserId, compNumbers: chosen });
        void syncNow();
      }

      if (location.trim())
        await supabase
          .from("service_locations")
          .upsert({ company_id: companyId, name: location.trim() }, { onConflict: "company_id,name" });

      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save wash record.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FullscreenModal open={open} onClose={onClose} title="Wash Record" footer={null}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div>}
        <div>
          <label style={S.reportLabel}>Unit</label>
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
        {trailerIncluded && (
          <div>
            <label style={S.reportLabel}>Wash type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["exterior", "interior"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWashType(t)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 2,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    border: washType === t ? "1px solid #fff" : "1px solid rgba(255,255,255,0.14)",
                    background: washType === t ? "rgba(255,255,255,0.12)" : "transparent",
                    color: washType === t ? "#fff" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {t === "exterior" ? "Exterior" : "Interior (tanks)"}
                </button>
              ))}
            </div>
            {interior && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                  Washed compartments become Cleaned &amp; Purged.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                  {compNumbers.map((n) => {
                    const on = pickedComps.has(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          setPickedComps((p) => {
                            const next = new Set(p);
                            if (on) next.delete(n);
                            else next.add(n);
                            return next;
                          })
                        }
                        style={{
                          minWidth: 48,
                          padding: "8px 10px",
                          borderRadius: 2,
                          fontSize: 14,
                          fontWeight: 800,
                          cursor: "pointer",
                          border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.14)",
                          background: on ? "rgba(255,255,255,0.12)" : "transparent",
                          color: on ? "#fff" : "rgba(255,255,255,0.45)",
                        }}
                      >
                        C{n}
                      </button>
                    );
                  })}
                  {compNumbers.length === 0 && (
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>No compartments on file for this trailer.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div>
          <label style={S.reportLabel}>Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={S.reportLabel}>Date/time</label>
          <input type="datetime-local" value={washedAt} onChange={(e) => setWashedAt(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={S.reportLabel}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, minHeight: 70, fontFamily: "inherit", resize: "vertical" as const }}
          />
        </div>
        <button aria-busy={!!busy} type="button" onClick={save} disabled={busy} style={saveBtnStyle}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </FullscreenModal>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 2,
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.28)",
  color: "#fff",
  fontSize: 15,
  boxSizing: "border-box",
};
