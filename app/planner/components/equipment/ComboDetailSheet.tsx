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
import { CameraButton } from "./AddDocumentSheet";
import { TelematicsLink } from "./TelematicsPanel";
import { fleetStatusColor, fleetStatusLabel } from "../../modals/EquipmentStatusModal";
import { storyLine } from "@/lib/equipment/statusStoryLogic";
import { fetchTruckReading, type TruckReading } from "@/lib/telematics/useTruckReading";
import { ageText } from "@/lib/equipment/trackFormat";

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

type NowInfo = { driver: string | null; driverAt: string | null; openTrip: string | null };
const OPEN_TRIP: Record<string, string> = { draft: "On a trip, not started loading", loading: "Loading", in_transit: "En route", delivering: "Delivering", parked: "Parked preloaded" };

/** What the unit is doing now and who last had it: the open trip on it, else who parked it, else the newest trip. */
function useUnitNow(kind: "truck" | "trailer", id: string): NowInfo | null {
  const [now, setNow] = useState<NowInfo | null>(null);
  useEffect(() => {
    let alive = true;
    setNow(null);
    void (async () => {
      try {
        const col = kind === "truck" ? "truck_id" : "trailer_id";
        const [park, trips] = await Promise.all([
          supabase.from("equipment_parks").select("parked_by, parked_at").eq("unit_kind", kind).eq("unit_id", id).maybeSingle(),
          supabase.from("trips").select("driver_id, status, started_at").eq(col, id).order("started_at", { ascending: false }).limit(5),
        ]);
        const rows = (trips.data ?? []) as { driver_id: string | null; status: string; started_at: string | null }[];
        const open = rows.find((r) => OPEN_TRIP[r.status]);
        const p = park.data as { parked_by: string | null; parked_at: string | null } | null;
        const last = rows[0];
        const who = open?.driver_id ?? p?.parked_by ?? last?.driver_id ?? null;
        const at = open ? open.started_at : p?.parked_by ? p.parked_at : last?.started_at ?? null;
        let driver: string | null = null;
        if (who) {
          const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: [who] });
          driver = ((data ?? []) as { display_name: string | null }[])[0]?.display_name ?? null;
        }
        if (alive) setNow({ driver, driverAt: at, openTrip: open ? OPEN_TRIP[open.status] : null });
      } catch { if (alive) setNow({ driver: null, driverAt: null, openTrip: null }); }
    })();
    return () => { alive = false; };
  }, [kind, id]);
  return now;
}

function RightNow({ kind, unit, partnerName }: { kind: "truck" | "trailer"; unit: TrackUnit; partnerName?: string | null }) {
  const now = useUnitNow(kind, unit.id);
  // For a truck, Geotab is the source of truth for where it is, who last drove it and what is hooked to it.
  const [geo, setGeo] = useState<TruckReading | null>(null);
  useEffect(() => {
    if (kind !== "truck") return;
    let alive = true;
    setGeo(null);
    void fetchTruckReading(unit.id).then((r) => { if (alive) setGeo(r); });
    return () => { alive = false; };
  }, [kind, unit.id]);
  const geoDriver = geo ? (geo.driverName ?? geo.lastDriver?.name ?? null) : null;
  const geoPlace = geo ? [geo.city, geo.state].filter(Boolean).join(", ") : "";
  const hooked = geo?.geotabTrailers ?? [];
  const mismatch = !!(geo && partnerName && geo.trailerKnown !== false && !hooked.some((t) => t.name.trim().toLowerCase() === partnerName.trim().toLowerCase()));
  const label = unit.statusCode ? fleetStatusLabel(unit.statusCode) || unit.statusCode : "No status set";
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "10px 0", marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>Right now</div>
      <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4, color: unit.statusCode ? fleetStatusColor(unit.statusCode) : "#fff" }}>
        ● {label}{unit.subStatus ? ` · ${unit.subStatus}` : ""}
      </div>
      {now?.openTrip && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{now.openTrip}</div>}
      {unit.statusLocation && <div style={{ fontSize: 13, marginTop: 4 }}>At <b>{unit.statusLocation}</b>{unit.statusUpdatedAt ? <span style={{ color: MUTED }}> · {storyLine("", { byName: null, at: unit.statusUpdatedAt, source: null })}</span> : null}</div>}
      {unit.statusNotes && <div style={{ fontSize: 13, marginTop: 4, color: "rgba(255,255,255,0.75)" }}>{unit.statusNotes}</div>}
      {geo && (geoPlace || geo.lat != null) && <div style={{ fontSize: 13, marginTop: 4 }}>Now: <b>{geoPlace || "Position found"}</b><span style={{ color: MUTED }}> · Geotab {ageText(geo.at)}</span></div>}
      {kind === "truck" && geo?.trailerKnown && hooked.length === 0 && <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: "#60a5fa" }}>Bobtail <span style={{ fontSize: 12, fontWeight: 500, color: MUTED }}>· Geotab shows no trailer hooked{partnerName ? `; ProTankr has it paired with ${partnerName}` : ""}</span></div>}
      {mismatch && hooked.length > 0 && <div style={{ fontSize: 12, color: "#fb923c", marginTop: 4 }}>Geotab shows {hooked.map((t) => t.name).join(", ")} hooked to this truck, not {partnerName}.</div>}
      <div style={{ fontSize: 13, marginTop: 6, color: MUTED }}>
        {geoDriver
          ? <>{geo?.driverName ? "Driver" : "Last driver"}: <b style={{ color: "#fff" }}>{geoDriver}</b> · Geotab</>
          : now == null ? "Looking up the last driver…" : now.driver ? <>{now.openTrip ? "Driver" : "Last driver"}: <b style={{ color: "#fff" }}>{now.driver}</b>{now.driverAt ? ` · ${new Date(now.driverAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}` : ""}</> : "No driver on record."}
      </div>
    </div>
  );
}

function UnitSection({ kind, unit, companyId, onOpenFile, partnerName }: { kind: "truck" | "trailer"; unit: TrackUnit; companyId: string; onOpenFile: () => void; partnerName?: string | null }) {
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
      <RightNow kind={kind} unit={unit} partnerName={partnerName} />
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={onOpenFile} style={{ background: "none", border: "none", padding: "10px 0 0", color: "#93c5fd", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          Open {kind} file ›
        </button>
        {kind === "truck" && <TelematicsLink companyId={companyId} truckId={unit.id} truckName={unit.name} />}
      </div>
    </div>
  );
}

export function ComboDetailSheet({ open, onClose, companyId, truck, trailer, holderLabel, onOpenFile, onDropSwap, onStud, onDocCaptured, primaryLabel = "Drop / Swap", secondSeat }: {
  /** Attach as the second seat of a truck someone else is driving (shown only then). */
  secondSeat?: () => void;
  open: boolean; onClose: () => void; companyId: string;
  /** A combo passes both; a loose unit passes just its own. */
  truck: TrackUnit | null; trailer: TrackUnit | null;
  primaryLabel?: string;
  /** "In use by Seth Perry", or null when nobody holds it. */
  holderLabel: string | null;
  onOpenFile: (kind: "truck" | "trailer") => void;
  onDropSwap: () => void; onStud: () => void;
  /** + New Doc opens the camera straight away; this gets the photos and which unit they are for. */
  onDocCaptured: (kind: "truck" | "trailer", files: File[]) => void;
}) {
  const [chooseUnit, setChooseUnit] = useState(false);
  const docBtn = { ...secondaryBtn, padding: "14px 4px", fontSize: 13, display: "block", textAlign: "center" as const, boxSizing: "border-box" as const };
  return (
    <FullscreenModal open={open} onClose={onClose} title={[truck?.name, trailer?.name].filter(Boolean).join(" / ")} footer={null}>
      {holderLabel && <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>{holderLabel}</div>}
      {truck && <UnitSection kind="truck" unit={truck} companyId={companyId} onOpenFile={() => onOpenFile("truck")} partnerName={trailer?.name ?? null} />}
      {trailer && <UnitSection kind="trailer" unit={trailer} companyId={companyId} onOpenFile={() => onOpenFile("trailer")} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onDropSwap} style={{ ...primaryBtn, padding: "14px 4px", fontSize: 13 }}>{primaryLabel}</button>
        <button type="button" onClick={onStud} style={{ ...secondaryBtn, padding: "14px 4px", fontSize: 13 }}>STUD</button>
        {truck && trailer ? (
          <button type="button" onClick={() => setChooseUnit(true)} style={{ ...secondaryBtn, padding: "14px 4px", fontSize: 13 }}>+ New Doc</button>
        ) : (
          <CameraButton onFile={(f) => onDocCaptured(truck ? "truck" : "trailer", f)} style={docBtn}>+ New Doc</CameraButton>
        )}
      </div>
      {secondSeat && <button type="button" onClick={secondSeat} style={{ ...secondaryBtn, width: "100%", marginTop: 10 }}>Join as second seat</button>}
      <button type="button" onClick={onClose} style={{ ...secondaryBtn, width: "100%", marginTop: 10 }}>Close</button>
      {chooseUnit && truck && trailer && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", padding: 20, maxWidth: 360, width: "100%" }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>Document for which unit?</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 16 }}>Pick one and the camera opens.</div>
            <CameraButton onFile={(f) => { setChooseUnit(false); onDocCaptured("truck", f); }} style={{ ...docBtn, textAlign: "left", padding: "16px 18px", fontSize: 16, marginBottom: 10 }}>Truck · {truck.name}</CameraButton>
            <CameraButton onFile={(f) => { setChooseUnit(false); onDocCaptured("trailer", f); }} style={{ ...docBtn, textAlign: "left", padding: "16px 18px", fontSize: 16, marginBottom: 10 }}>Trailer · {trailer.name}</CameraButton>
            <button type="button" onClick={() => setChooseUnit(false)} style={{ ...secondaryBtn, width: "100%" }}>Cancel</button>
          </div>
        </div>
      )}
    </FullscreenModal>
  );
}
