"use client";
// app/planner/components/locations/LocationsHub.tsx
//
// The Locations tool, shared by the Driver and Dispatch dashboards. Tapping it asks what kind of location
// (Terminals, Deliveries; yards and maintenance facilities will be more rows here), then opens the shared
// modal for that kind. Terminals keep everything about one terminal together: training and the company letter,
// gauging time, racks and products, suppliers, and terminal cards. Dispatch, lead and admin get the editing parts; drivers see suppliers.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "@/app/planner/home/dashLook";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { useDeliveryLocationList } from "@/lib/trips/useTripData";
import { DeliveryLocationsModal } from "../trip/DeliveryLocationsModal";
import EditTerminalModal from "@/app/planner/modals/EditTerminalModal";
import { SuppliersModal } from "@/app/planner/dispatch/SuppliersModal";
import type { TerminalOption } from "@/app/planner/dispatch/PlanLoadCard";
import FleetCardsModal from "@/app/admin/FleetCardsModal";
import { TerminalTrainingSection } from "./TerminalTrainingSection";
import { GaugingAskSheet } from "../trip/GaugingAskSheet";
import type { ToolItem } from "@/app/planner/home/DashboardChrome";
import type { DeliveryLocation, LatLon } from "@/lib/trips/deliveryLocations";
import { AreaChooser } from "../trip/AreaChooser";
import { areaLabel, inArea, type AreaPick } from "@/lib/trips/areaTree";

/** The grid tile. */
export const locationsTool = (onClick: () => void): ToolItem => ({ icon: "store", label: "Locations", sub: "Terminals & deliveries", onClick });

type Kind = "terminals" | "deliveries";
const KINDS: { kind: Kind; label: string; sub: string }[] = [
  { kind: "terminals", label: "Terminals", sub: "Training, gauging, racks, suppliers, cards" },
  { kind: "deliveries", label: "Deliveries", sub: "Stores and customer sites" },
];

export function LocationsHub(props: { open: boolean; onClose: () => void; companyId: string | null; userId: string | null; role: string | null; isSuperAdmin: boolean; origin?: LatLon | null }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const close = () => { setKind(null); props.onClose(); };
  const L = useDashLook();
  return (
    <>
      <FullscreenModal open={props.open && !kind} title="Locations" onClose={close} footer={null}>
        <div style={{ fontSize: 13, color: L.muted, marginBottom: 10 }}>What kind of location?</div>
        {KINDS.map((k) => (
          <button key={k.kind} type="button" className="dash-press" onClick={() => setKind(k.kind)}
            style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "14px 14px", marginBottom: 8, cursor: "pointer" }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{k.label} ›</div>
            <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{k.sub}</div>
          </button>
        ))}
      </FullscreenModal>
      {props.open && kind === "deliveries" && <DeliveriesBody {...props} onClose={() => setKind(null)} />}
      {props.open && kind === "terminals" && <TerminalsBody {...props} onClose={() => setKind(null)} />}
    </>
  );
}

function DeliveriesBody({ onClose, companyId, userId, origin }: { onClose: () => void; companyId: string | null; userId: string | null; origin?: LatLon | null }) {
  const list = useDeliveryLocationList(companyId, userId);
  return <DeliveryLocationsModal open onClose={onClose} locations={list.locations} tanks={list.tanks} companyId={companyId} userId={userId} origin={origin} onChanged={() => void list.reload()} />;
}

function TerminalsBody({ onClose, companyId, userId, role, isSuperAdmin }: { onClose: () => void; companyId: string | null; userId: string | null; role: string | null; isSuperAdmin: boolean }) {
  const L = useDashLook();
  const catalog = useTerminalsCatalog().data;
  const [q, setQ] = useState("");
  const [tid, setTid] = useState<string | null>(null);
  const [sub, setSub] = useState<null | "racks" | "suppliers" | "cards">(null);
  // Same state / city Change window as the delivery locations (no county for terminals).
  const [area, setArea] = useState<AreaPick>({ state: "", county: "", city: "" });
  const [areaOpen, setAreaOpen] = useState(false);
  const [limit, setLimit] = useState(60);
  const staff = isSuperAdmin || role === "admin" || role === "dispatch" || role === "lead";
  const manager = isSuperAdmin || role === "admin" || role === "dispatch";
  const options = useMemo<TerminalOption[]>(() => catalog.map((t) => ({
    id: String(t.terminal_id), name: t.terminal_name ?? "Terminal", used: false,
    place: t.city ? `${t.city}${t.state ? `, ${t.state}` : ""}` : null, city: t.city ?? null, state: t.state ?? null,
  })), [catalog]);
  // The terminals as location-shaped rows, so the area chooser and filter are the delivery ones.
  const asLocs = useMemo(() => options.map((t) => ({ location_id: t.id, city: t.city, state: t.state, county: null, is_active: true } as unknown as DeliveryLocation)), [options]);
  const searching = !!q.trim();
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return options.filter((t) => `${t.name} ${t.place ?? ""}`.toLowerCase().includes(s));
    const ids = new Set(inArea(asLocs, area).map((l) => l.location_id));
    return options.filter((t) => ids.has(t.id));
  }, [options, asLocs, area, q]);
  const picked = options.find((t) => t.id === tid) ?? null;
  const [gaugeOpen, setGaugeOpen] = useState(false);
  const pickedRow = catalog.find((t) => String(t.terminal_id) === tid) ?? null;
  const gaugeText = (() => {
    const c = pickedRow?.gauging_cutoff, m = pickedRow?.gauging_minutes;
    if (!c || m == null) return "Not known yet";
    const end = (Number(c.slice(0, 2)) * 60 + Number(c.slice(3)) + m) % 1440;
    return `${c} to ${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")} terminal time`;
  })();
  const row = { ...L.secondary, display: "flex", width: "100%", textAlign: "left" as const, color: "#fff", padding: "12px 14px", marginBottom: 8, cursor: "pointer", justifyContent: "space-between", gap: 8, fontSize: 15, fontWeight: 700 };
  return (
    <>
      <FullscreenModal open={!sub} title={picked ? picked.name : "Terminals"} onClose={() => (picked ? setTid(null) : onClose())} footer={null}>
        {!picked ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>
              <span>{searching ? "Search results" : <>Showing <span style={{ color: "#fff" }}>{areaLabel(area)}</span></>}</span>
              <button type="button" onClick={() => setAreaOpen(true)}
                style={{ flexShrink: 0, border: "none", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>Change</button>
            </div>
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} placeholder="Search terminal or city"
              style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "11px 12px", borderRadius: 2, marginBottom: 10 }} />
            {hits.length === 0 && <div style={{ fontSize: 14, color: L.muted }}>{searching ? "No matches." : "No terminals here."}</div>}
            {hits.slice(0, limit).map((t) => (
              <button key={t.id} type="button" className="dash-press" onClick={() => setTid(t.id)} style={row}>
                <span>{t.name}</span><span style={{ color: L.muted, fontWeight: 600 }}>{t.place ?? ""}</span>
              </button>
            ))}
            {hits.length > limit && (
              <button type="button" onClick={() => setLimit((n) => n + 60)}
                style={{ width: "100%", marginTop: 6, padding: "10px 0", border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Show {Math.min(60, hits.length - limit)} more ▼
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: L.muted, marginBottom: 10 }}>{picked.place ?? ""}</div>
            <TerminalTrainingSection terminalId={picked.id} terminalName={picked.name} userId={userId} companyId={companyId} staff={staff} />
            <button type="button" className="dash-press" onClick={() => setGaugeOpen(true)} style={row}><span>Gauging<span style={{ display: "block", fontSize: 12, fontWeight: 500, color: L.muted }}>{gaugeText}</span></span><span style={{ color: L.muted }}>Edit ›</span></button>
            {staff && <button type="button" className="dash-press" onClick={() => setSub("racks")} style={row}><span>Racks &amp; products</span><span style={{ color: L.muted }}>›</span></button>}
            <button type="button" className="dash-press" onClick={() => setSub("suppliers")} style={row}><span>Suppliers</span><span style={{ color: L.muted }}>›</span></button>
            {manager && <button type="button" className="dash-press" onClick={() => setSub("cards")} style={row}><span>Terminal cards</span><span style={{ color: L.muted }}>›</span></button>}
          </>
        )}
      </FullscreenModal>
      <AreaChooser open={areaOpen && !picked} noCounty locations={asLocs} value={area} onPick={(p) => { setArea(p); setLimit(60); setQ(""); }} onClose={() => setAreaOpen(false)} />
      {picked && gaugeOpen && <GaugingAskSheet terminalId={picked.id} terminalName={picked.name} initial={{ cutoff: pickedRow?.gauging_cutoff ?? null, minutes: pickedRow?.gauging_minutes ?? null }} onClose={() => setGaugeOpen(false)} />}
      {picked && sub === "racks" && <EditTerminalModal open onClose={() => setSub(null)} terminalId={picked.id} terminalName={picked.name} onChanged={() => {}} />}
      {picked && sub === "suppliers" && companyId && userId && (
        <SuppliersModal open onClose={() => setSub(null)} companyId={companyId} userId={userId} canManage={manager} terminals={options} initialTerminalId={picked.id} />
      )}
      {picked && sub === "cards" && companyId && <FleetCardsModal open onClose={() => setSub(null)} companyId={companyId} initialTerminalId={picked.id} />}
    </>
  );
}
