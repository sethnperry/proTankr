"use client";
// app/planner/dispatch/EnRouteSheet.tsx
//
// The En Route chip's window. Loads are grouped by where they're headed: a card per destination
// ("3 trk · Citgo, Tampa, FL"), under a "To load" / "To deliver" label. Tapping a destination opens
// every truck headed there, each as the same trip card its driver sees, with Edit and Cancel for
// dispatch. Changes go to the driver as a push notification (lib/dispatch/tripEdits.ts).

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { supabase } from "@/lib/supabase/client";
import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";
import { LocationPicker } from "../components/trip/LocationPicker";
import { locationPlace, locationTitle, type DeliveryLocation } from "@/lib/trips/deliveryLocations";
import { deliveryPlace, type Place } from "@/lib/trips/fleetProgress";
import { activePickup } from "@/lib/trips/tripFlow";
import { noLoadReasonLabel } from "@/lib/trips/terminalIssues";
import { arriveByDispatch, cancelLoadInProgress, parkByDispatch, requestPark, withdrawPark } from "@/lib/dispatch/tripEdits";
import { DispatchEditSheet } from "./DispatchEditSheet";
import type { FleetTrip } from "@/lib/trips/useFleetTrips";
import type { LiveRow } from "@/lib/dispatch/liveGroups";
import { busyProps } from "@/lib/ui/pending";

type TermRow = { terminal_id: string | number; terminal_name: string; city: string | null; state: string | null };
const STATUS: Record<string, string> = { draft: "Not loaded yet", loading: "Loading", in_transit: "In transit", delivering: "Delivering" };
const initials = (n?: string | null) => (n ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const tagOf = (truck: string | null, driver: string | null) => [String(truck ?? "").replace(/^truck\s*/i, "").trim(), initials(driver)].filter(Boolean).join("-");
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function EnRouteSheet({ open, rows, fleetTrips, locations, terminals, deliveryLocs, deliveryTanks, companyId, userId, destLabel, onLocationAdded, onChanged, onClose, onOpenTrip }: {
  open: boolean;
  rows: LiveRow[];
  fleetTrips: FleetTrip[];
  locations: Map<string, Place>;
  terminals: TermRow[];
  deliveryLocs: DeliveryLocation[];
  deliveryTanks: any[];
  companyId: string | null;
  userId: string | null;
  destLabel: (r: LiveRow) => string;
  onLocationAdded: () => void;
  onChanged: () => void;
  onClose: () => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const L = useDashLook();
  const [destKey, setDestKey] = useState<string | null>(null);
  const [editing, setEditingId] = useState<string | null>(null); // trip id
  const [editMode, setEditMode] = useState<"edit" | "cancel">("edit");
  const setEditing = (id: string | null, mode: "edit" | "cancel" = "edit") => { setEditMode(mode); setEditingId(id); };
  const kinds: ("to_rack" | "to_drop" | "parking")[] = ["to_rack", "to_drop", "parking"];
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; kind: "to_rack" | "to_drop" | "parking"; label: string; rows: LiveRow[] }>();
    for (const r of rows) {
      if (r.kind !== "to_rack" && r.kind !== "to_drop") continue;
      const parking = !!r.parking;
      const key = parking ? "parking|all" : `${r.kind}|${r.destId ?? r.where}`;
      const g = m.get(key) ?? { key, kind: (parking ? "parking" : r.kind) as "to_rack" | "to_drop" | "parking", label: parking ? "Parking it" : destLabel(r), rows: [] };
      g.rows.push(r);
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }, [rows, destLabel]);
  const sel = groups.find((g) => g.key === destKey) ?? null;
  const ftOf = (id: string) => fleetTrips.find((f) => f.trip.trip_id === id) ?? null;
  const editFt = editing ? ftOf(editing) : null;

  // One lookup for every trailer in the open destination.
  const hdr = useTrailerHeaderData((sel?.rows ?? []).map((r) => ftOf(r.tripId)?.trip.trailer_id));

  const tm = (id: string | number | null) => { const t = terminals.find((x) => String(x.terminal_id) === String(id)); return t ? `${t.terminal_name}${t.city ? `, ${t.city}` : ""}` : null; };

  return (
    <>
      <FullscreenModal open={open && !sel} title={`En route (${rows.length})`} onClose={onClose}>
        {groups.length === 0 && <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>Nothing here right now.</div>}
        {kinds.map((k) => {
          const list = groups.filter((g) => g.kind === k);
          if (!list.length) return null;
          return (
            <div key={k} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, margin: "2px 0 8px" }}>{k === "to_rack" ? "To load" : k === "to_drop" ? "To deliver" : "Parking"}</div>
              {list.map((g) => (
                <button key={g.key} type="button" className="dash-press" onClick={() => setDestKey(g.key)}
                  style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "11px 12px", marginBottom: 6, cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
                  {g.rows.length} trk <span style={{ fontWeight: 600 }}>· {g.label}</span>
                </button>
              ))}
            </div>
          );
        })}
      </FullscreenModal>

      <FullscreenModal open={open && !!sel} title={sel ? `${sel.rows.length} trk · ${sel.label}` : ""} onClose={() => setDestKey(null)}>
        {sel?.rows.map((r) => {
          const ft = ftOf(r.tripId);
          if (!ft) return null;
          return <TripCard key={r.tripId} ft={ft} row={r} locations={locations} deliveryLocs={deliveryLocs} hdr={hdr} tm={tm}
            actor={userId ?? ""} onChanged={onChanged} onEdit={() => setEditing(r.tripId, "edit")} onCancel={() => setEditing(r.tripId, "cancel")} onOpen={() => { setDestKey(null); onClose(); onOpenTrip(r.tripId); }} />;
        })}
      </FullscreenModal>

      {editFt && editMode === "edit" && (
        <DispatchEditSheet ft={editFt} terminals={terminals} locations={deliveryLocs} tanks={deliveryTanks} companyId={companyId} userId={userId}
          onLocationAdded={onLocationAdded} onDone={onChanged} onClose={() => setEditing(null)} />
      )}
      {editFt && editMode === "cancel" && (
        <CancelSheet ft={editFt} actor={userId ?? ""} onDone={onChanged} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function TripCard({ ft, row, locations, deliveryLocs, hdr, tm, actor, onChanged, onEdit, onCancel, onOpen }: {
  actor: string; onChanged: () => void; onCancel: () => void;
  ft: FleetTrip; row: LiveRow; locations: Map<string, Place>; deliveryLocs: DeliveryLocation[]; hdr: import("../components/TrailerViews").TrailerHeaderData;
  tm: (id: string | number | null) => string | null; onEdit: () => void; onOpen: () => void;
}) {
  const L = useDashLook();
  const muted = L.muted;
  const aboard = new Map(ft.compLoads.filter((c) => c.disposition === "loaded").map((c) => [c.comp_number, c.product_id]));
  const current = activePickup(ft.pickups.filter((p) => p.outcome !== "no_load"));
  const eta = row.etaMs;
  return (
    <div style={{ ...L.primary, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{tagOf(ft.truckName, ft.driverName)}</span>
        <span style={{ fontSize: 12, color: muted, flex: 1 }}>{ft.driverName ?? ""}{ft.trailerName ? ` · Trailer ${ft.trailerName}` : ""}</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{ft.orderNumbers[0] ? `Order ${ft.orderNumbers[0]}` : "No order #"}</span>
      </div>
      <div style={{ marginBottom: 8 }}><TrailerHeader variant="side" trailerId={ft.trip.trailer_id} loaded={Object.fromEntries(aboard)} data={hdr} height={12} /></div>
      <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        Current trip · {STATUS[ft.trip.status] ?? ft.trip.status}{eta ? ` · ETA ${clock(eta)}` : ""}
      </div>
      {(ft.trip.shipper || ft.trip.customer) && <div style={{ fontSize: 13, color: muted }}>{[ft.trip.shipper, ft.trip.customer].filter(Boolean).join(" → ")}</div>}
      {ft.pickups.map((p) => {
        const noLoad = p.outcome === "no_load";
        const loaded = p.outcome === "loaded" || (!!p.left_at && !!p.load_id);
        const label = noLoad ? "Tried" : loaded ? "Loaded" : p.arrived_at ? "Arrived" : "Pickup";
        const isCur = !loaded && !noLoad && current?.pickup_id === p.pickup_id;
        const place = [p.city, p.state].filter(Boolean).join(", ");
        return (
          <div key={p.pickup_id} style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ width: 66, flexShrink: 0, color: loaded ? "#4ade80" : p.arrived_at ? "#fff" : muted }}>{label}</span>
            <span style={{ flex: 1, minWidth: 0, color: isCur && !p.arrived_at ? "#fff" : muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place || "—"}</span>
            <span style={{ color: isCur && p.arrived_at ? "#fff" : muted, maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: noLoad ? "line-through" : undefined }}>{p.name ?? "Not set"}</span>
            {noLoad && <span style={{ color: "#f87171", fontSize: 13 }}>{noLoadReasonLabel(p.no_load_reason) || "Other"}</span>}
          </div>
        );
      })}
      {ft.deliveries.filter((d) => d.status !== "cancelled").map((d) => {
        const done = d.status === "complete";
        const loc = d.location_id ? deliveryLocs.find((l) => l.location_id === d.location_id) : null;
        const place = loc ? locationPlace(loc) : "";
        const name = loc ? locationTitle(loc) : deliveryPlace(d, locations).name ?? "Not set";
        return (
          <div key={d.delivery_id} style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ width: 66, flexShrink: 0, color: done ? "#4ade80" : d.arrived_at ? "#fff" : muted }}>{done ? "Delivered" : d.arrived_at ? "Arrived" : "Delivery"}</span>
            <span style={{ flex: 1, minWidth: 0, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place || "—"}</span>
            <span style={{ color: muted, maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          </div>
        );
      })}
      <ActionsMenu ft={ft} actor={actor} onChanged={onChanged} onEdit={onEdit} onCancel={onCancel} onOpen={onOpen} />
    </div>
  );
}

function ActionsMenu({ ft, actor, onChanged, onEdit, onCancel, onOpen }: { ft: FleetTrip; actor: string; onChanged: () => void; onEdit: () => void; onCancel: () => void; onOpen: () => void }) {
  const L = useDashLook();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const aboard = ft.compLoads.some((c) => c.disposition === "loaded");
  const requested = !!ft.trip.park_requested_at;
  const stop = ft.pickups.filter((p) => p.outcome !== "no_load" && !p.left_at).sort((a, b) => a.seq - b.seq)[0];
  const drop = ft.deliveries.filter((d) => d.status === "planned").sort((a, b) => a.seq - b.seq)[0];
  const canArrive = stop ? !stop.arrived_at : !!drop && !drop.arrived_at;
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true); setMsg(null);
    const err = await fn();
    setBusy(false);
    if (err) { setMsg(err); return; }
    setOpen(false); onChanged();
  };
  const item = { display: "block", width: "100%", textAlign: "left" as const, background: "none", border: "none", borderTop: `1px solid ${L.hairline}`, color: "#fff", fontSize: 14, padding: "11px 12px", cursor: "pointer", opacity: busy ? 0.5 : 1 };
  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" onClick={() => { setOpen((v) => !v); setMsg(null); }} aria-expanded={open}
        style={{ border: `1px solid ${L.hairline}`, background: "transparent", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", padding: "7px 12px", cursor: "pointer" }}>
        Actions {open ? "▴" : "▾"}
      </button>
      {open && (
        <div style={{ ...L.secondary, marginTop: 6 }}>
          {msg && <div style={{ fontSize: 12, color: "#f87171", padding: "8px 12px" }}>{msg}</div>}
          {requested
            ? <button type="button" disabled={busy} onClick={() => void run(() => parkByDispatch(ft, actor))} style={{ ...item, borderTop: "none" }}>Park (mark parked)</button>
            : canArrive && <button type="button" disabled={busy} onClick={() => void run(() => arriveByDispatch(ft, actor))} style={{ ...item, borderTop: "none" }}>Arrive</button>}
          <button type="button" disabled={busy} onClick={() => { setOpen(false); onEdit(); }} style={item}>{aboard ? "Correct trip…" : "Edit trip"}</button>
          {aboard && (requested
            ? <button type="button" disabled={busy} onClick={() => void run(() => withdrawPark(ft, actor))} style={item}>Don&apos;t park</button>
            : <button type="button" disabled={busy} onClick={() => void run(() => requestPark(ft, actor))} style={item}>Park preloaded</button>)}
          <button type="button" disabled={busy} onClick={() => { setOpen(false); onCancel(); }} style={{ ...item, color: "#f87171" }}>Cancel load…</button>
          <button type="button" disabled={busy} onClick={onOpen} style={{ ...item, color: L.muted }}>Open PTD ›</button>
        </div>
      )}
    </div>
  );
}

function CancelSheet({ ft, actor, onDone, onClose }: { ft: FleetTrip; actor: string; onDone: () => void; onClose: () => void }) {
  const L = useDashLook();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <FullscreenModal open title={`Cancel load · ${tagOf(ft.truckName, ft.driverName)}`} onClose={onClose}>
      {err && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 10 }}>{err}</div>}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the driver (optional)" maxLength={150}
        style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "10px 12px", borderRadius: 2, marginBottom: 10 }} />
      <button type="button" {...busyProps(busy)} onClick={async () => { setBusy(true); const e = await cancelLoadInProgress(ft, actor, note); setBusy(false); if (e) { setErr(e); return; } onDone(); onClose(); }}
        style={{ border: "none", background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "11px 14px", cursor: "pointer" }}>Cancel load and notify driver</button>
      <div style={{ fontSize: 12, color: L.faint, marginTop: 12 }}>The driver is notified. A load with product on board can&apos;t be cancelled; park or deliver it instead.</div>
    </FullscreenModal>
  );
}
