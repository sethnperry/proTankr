"use client";
// app/planner/components/equipment/ComboDetailSheet.tsx
//
// The pop-out for a tapped combo. Truck first (unit, year/make/model, VIN, plate, anything
// expiring, a link to the file, service due), then the trailer (the same plus its compartment
// sizes). Three buttons at the bottom: Drop/Swap, STUD, + New Doc. The buttons are the host's
// to wire, since what they do depends on where the board is opened.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { useUnitAlerts } from "../../hooks/useDashboardCards";
import { computeUnitServiceDue, type ServiceRecordLite } from "../../modals/SoloEquipmentModal";
import type { ServiceType } from "../../modals/ServiceTypeManager";
import { DARK_EXP_COLOR } from "../../cards/cardTheme";
import type { TrackUnit } from "@/lib/equipment/trackList";
import { PRIMARY_BTN as primaryBtn, SECONDARY_BTN as secondaryBtn } from "@/lib/ui/look";

const MUTED = "rgba(255,255,255,0.5)";
const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.14)", padding: 14, marginBottom: 12 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED };

type Info = {
  year: number | null; make: string | null; model: string | null; vin: string | null; plate: string | null;
  comps: { comp: number; max: number | null; cap: number | null }[];
  service: string | null;
};

function useUnitInfo(kind: "truck" | "trailer", id: string, companyId: string): Info | null {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    let alive = true;
    setInfo(null);
    void (async () => {
      try {
        const table = kind === "truck" ? "trucks" : "trailers";
        const col = `${kind}_id`;
        const [u, comps, recs, types] = await Promise.all([
          supabase.from(table).select("year, make, model, vin_number, plate_number").eq(col, id).maybeSingle(),
          kind === "trailer"
            ? supabase.from("trailer_compartments").select("comp_number, max_gallons, cap_gallons").eq("trailer_id", id).order("comp_number")
            : Promise.resolve({ data: [] as unknown[] }),
          supabase.from("service_records").select("service_type_id, date, reading_value, created_at").eq(col, id),
          supabase.from("service_types").select("service_type_id, name, interval_kind, interval_value, applies_to, is_active").eq("company_id", companyId),
        ]);
        const r = (u.data ?? {}) as Record<string, any>;
        const due = computeUnitServiceDue(kind === "truck" ? "Truck" : "Trailer", (recs.data ?? []) as ServiceRecordLite[], (types.data ?? []) as ServiceType[]);
        const service = due.typeName ? `${due.typeName} · ${due.display}` : null;
        if (alive) setInfo({
          year: r.year ?? null, make: r.make ?? null, model: r.model ?? null, vin: r.vin_number ?? null, plate: r.plate_number ?? null,
          comps: ((comps.data ?? []) as { comp_number: number; max_gallons: number | null; cap_gallons: number | null }[])
            .map((c) => ({ comp: Number(c.comp_number), max: c.max_gallons == null ? null : Number(c.max_gallons), cap: c.cap_gallons == null ? null : Number(c.cap_gallons) })),
          service,
        });
      } catch { if (alive) setInfo({ year: null, make: null, model: null, vin: null, plate: null, comps: [], service: null }); }
    })();
    return () => { alive = false; };
  }, [kind, id, companyId]);
  return info;
}

function UnitSection({ kind, unit, companyId, onOpenFile }: { kind: "truck" | "trailer"; unit: TrackUnit; companyId: string; onOpenFile: () => void }) {
  const info = useUnitInfo(kind, unit.id, companyId);
  const alerts = useUnitAlerts(kind, unit.id, companyId);
  const permits = alerts.alerts.filter((a) => a.kind === "permit");
  const ymm = info ? [info.year, info.make, info.model].filter(Boolean).join(" ") : "";
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", fontSize: 14 }}>
      <span style={{ color: MUTED }}>{k}</span><span style={{ fontWeight: 700, textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );
  return (
    <div style={card}>
      <div style={label}>{kind === "truck" ? "Truck" : "Trailer"}</div>
      <div style={{ fontSize: 24, fontWeight: 900, margin: "6px 0 8px" }}>{unit.name}</div>
      {!info ? <div style={{ fontSize: 13, color: MUTED }}>Loading…</div> : (
        <>
          {row("Year / make / model", ymm || <span style={{ color: MUTED }}>Not on file</span>)}
          {row("VIN", info.vin || <span style={{ color: MUTED }}>Not on file</span>)}
          {row("Plate", info.plate || <span style={{ color: MUTED }}>Not on file</span>)}
          {kind === "trailer" && row("Compartments", info.comps.length
            ? info.comps.map((c) => `C${c.comp} ${c.max != null ? c.max.toLocaleString() : "?"}${c.cap != null && c.cap !== c.max ? ` (cap ${c.cap.toLocaleString()})` : ""}`).join(" · ")
            : <span style={{ color: MUTED }}>None set</span>)}
          {row("Service", info.service || <span style={{ color: MUTED }}>No service recorded</span>)}
        </>
      )}
      <div style={{ ...label, marginTop: 10 }}>Expiring</div>
      {permits.length === 0 ? (
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>Nothing expiring in the next 30 days.</div>
      ) : permits.map((a, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", fontSize: 14, color: DARK_EXP_COLOR[a.state] }}>
          <span style={{ fontWeight: 800 }}>{a.name}</span><span>{a.detail}</span>
        </div>
      ))}
      <button type="button" onClick={onOpenFile} style={{ background: "none", border: "none", padding: "10px 0 0", color: "#93c5fd", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
        Open {kind} file ›
      </button>
    </div>
  );
}

export function ComboDetailSheet({ open, onClose, companyId, truck, trailer, holderLabel, onOpenFile, onDropSwap, onStud, onNewDoc, primaryLabel = "Drop / Swap" }: {
  open: boolean; onClose: () => void; companyId: string;
  /** A combo passes both; a loose unit passes just its own. */
  truck: TrackUnit | null; trailer: TrackUnit | null;
  primaryLabel?: string;
  /** "In use by Seth Perry", or null when nobody holds it. */
  holderLabel: string | null;
  onOpenFile: (kind: "truck" | "trailer") => void;
  onDropSwap: () => void; onStud: () => void; onNewDoc: () => void;
}) {
  return (
    <FullscreenModal open={open} onClose={onClose} title={[truck?.name, trailer?.name].filter(Boolean).join(" / ")} footer={null}>
      {holderLabel && <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>{holderLabel}</div>}
      {truck && <UnitSection kind="truck" unit={truck} companyId={companyId} onOpenFile={() => onOpenFile("truck")} />}
      {trailer && <UnitSection kind="trailer" unit={trailer} companyId={companyId} onOpenFile={() => onOpenFile("trailer")} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onDropSwap} style={{ ...primaryBtn, padding: "14px 4px", fontSize: 13 }}>{primaryLabel}</button>
        <button type="button" onClick={onStud} style={{ ...secondaryBtn, padding: "14px 4px", fontSize: 13 }}>STUD</button>
        <button type="button" onClick={onNewDoc} style={{ ...secondaryBtn, padding: "14px 4px", fontSize: 13 }}>+ New Doc</button>
      </div>
      <button type="button" onClick={onClose} style={{ ...secondaryBtn, width: "100%", marginTop: 10 }}>Close</button>
    </FullscreenModal>
  );
}
