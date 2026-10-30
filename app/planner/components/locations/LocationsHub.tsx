"use client";
// app/planner/components/locations/LocationsHub.tsx
//
// The Locations tool, shared by the Driver and Dispatch dashboards. Tapping it asks what kind of location
// (Terminals, Deliveries; yards and maintenance facilities will be more rows here), then opens the shared
// modal for that kind. Terminals keep everything about one terminal together: racks and products,
// suppliers, and terminal cards. Dispatch, lead and admin get the editing parts; drivers see suppliers.

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
import type { ToolItem } from "@/app/planner/home/DashboardChrome";
import type { LatLon } from "@/lib/trips/deliveryLocations";

/** The grid tile. */
export const locationsTool = (onClick: () => void): ToolItem => ({ icon: "store", label: "Locations", sub: "Terminals & deliveries", onClick });

type Kind = "terminals" | "deliveries";
const KINDS: { kind: Kind; label: string; sub: string }[] = [
  { kind: "terminals", label: "Terminals", sub: "Racks, suppliers and cards" },
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
  const staff = isSuperAdmin || role === "admin" || role === "dispatch" || role === "lead";
  const manager = isSuperAdmin || role === "admin" || role === "dispatch";
  const options = useMemo<TerminalOption[]>(() => catalog.map((t) => ({
    id: String(t.terminal_id), name: t.terminal_name ?? "Terminal", used: false,
    place: t.city ? `${t.city}${t.state ? `, ${t.state}` : ""}` : null, city: t.city ?? null, state: t.state ?? null,
  })), [catalog]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((t) => !s || `${t.name} ${t.place ?? ""}`.toLowerCase().includes(s)).slice(0, 50);
  }, [options, q]);
  const picked = options.find((t) => t.id === tid) ?? null;
  const row = { ...L.secondary, display: "flex", width: "100%", textAlign: "left" as const, color: "#fff", padding: "12px 14px", marginBottom: 8, cursor: "pointer", justifyContent: "space-between", gap: 8, fontSize: 15, fontWeight: 700 };
  return (
    <>
      <FullscreenModal open={!sub} title={picked ? picked.name : "Terminals"} onClose={() => (picked ? setTid(null) : onClose())} footer={null}>
        {!picked ? (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terminal or city" autoFocus
              style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "11px 12px", borderRadius: 2, marginBottom: 10 }} />
            {hits.map((t) => (
              <button key={t.id} type="button" className="dash-press" onClick={() => setTid(t.id)} style={row}>
                <span>{t.name}</span><span style={{ color: L.muted, fontWeight: 600 }}>{t.place ?? ""}</span>
              </button>
            ))}
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: L.muted, marginBottom: 10 }}>{picked.place ?? ""}</div>
            {staff && <button type="button" className="dash-press" onClick={() => setSub("racks")} style={row}><span>Racks &amp; products</span><span style={{ color: L.muted }}>›</span></button>}
            <button type="button" className="dash-press" onClick={() => setSub("suppliers")} style={row}><span>Suppliers</span><span style={{ color: L.muted }}>›</span></button>
            {manager && <button type="button" className="dash-press" onClick={() => setSub("cards")} style={row}><span>Terminal cards</span><span style={{ color: L.muted }}>›</span></button>}
          </>
        )}
      </FullscreenModal>
      {picked && sub === "racks" && <EditTerminalModal open onClose={() => setSub(null)} terminalId={picked.id} terminalName={picked.name} onChanged={() => {}} />}
      {picked && sub === "suppliers" && companyId && userId && (
        <SuppliersModal open onClose={() => setSub(null)} companyId={companyId} userId={userId} canManage={manager} terminals={options} initialTerminalId={picked.id} />
      )}
      {picked && sub === "cards" && companyId && <FleetCardsModal open onClose={() => setSub(null)} companyId={companyId} initialTerminalId={picked.id} />}
    </>
  );
}
