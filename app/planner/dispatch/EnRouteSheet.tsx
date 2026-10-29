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
import { CompartmentStrip, type StripSlot } from "../components/trip/CompartmentStrip";
import { LocationPicker } from "../components/trip/LocationPicker";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { productColorFor } from "../utils/productColor";
import { locationPlace, locationTitle, type DeliveryLocation } from "@/lib/trips/deliveryLocations";
import { deliveryPlace, type Place } from "@/lib/trips/fleetProgress";
import { activePickup } from "@/lib/trips/tripFlow";
import { noLoadReasonLabel } from "@/lib/trips/terminalIssues";
import { cancelLoadInProgress, changeDeliveryLocation, changeOrderNumber, changePickupTerminal } from "@/lib/dispatch/tripEdits";
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
  const [editing, setEditing] = useState<string | null>(null); // trip id
  const kinds: ("to_rack" | "to_drop")[] = ["to_rack", "to_drop"];
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; kind: "to_rack" | "to_drop"; label: string; rows: LiveRow[] }>();
    for (const r of rows) {
      if (r.kind !== "to_rack" && r.kind !== "to_drop") continue;
      const key = `${r.kind}|${r.destId ?? r.where}`;
      const g = m.get(key) ?? { key, kind: r.kind, label: destLabel(r), rows: [] };
      g.rows.push(r);
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }, [rows, destLabel]);
  const sel = groups.find((g) => g.key === destKey) ?? null;
  const ftOf = (id: string) => fleetTrips.find((f) => f.trip.trip_id === id) ?? null;
  const editFt = editing ? ftOf(editing) : null;

  // Compartment sizes for the trailers in the open destination.
  const trailerIds = useMemo(() => [...new Set((sel?.rows ?? []).map((r) => ftOf(r.tripId)?.trip.trailer_id).filter((x): x is string => !!x))], [sel, fleetTrips]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sizes, setSizes] = useState<Map<string, Map<number, number>>>(new Map());
  useEffect(() => {
    if (!trailerIds.length) return;
    let off = false;
    void supabase.from("trailer_compartments").select("trailer_id, comp_number, max_gallons").in("trailer_id", trailerIds).then(({ data }) => {
      if (off) return;
      const m = new Map<string, Map<number, number>>();
      for (const r of (data ?? []) as any[]) { const c = m.get(r.trailer_id) ?? new Map<number, number>(); c.set(Number(r.comp_number), Number(r.max_gallons) || 1); m.set(r.trailer_id, c); }
      setSizes(m);
    });
    return () => { off = true; };
  }, [trailerIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const products = useProductsCatalog().data;
  const colorOf = (id: string | null) => { const p = id ? products.find((x: any) => x.product_id === id) : null; return p ? (p.hex_code?.trim() || productColorFor(p.display_name ?? p.product_name)) : null; };

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
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, margin: "2px 0 8px" }}>{k === "to_rack" ? "To load" : "To deliver"}</div>
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
          return <TripCard key={r.tripId} ft={ft} row={r} locations={locations} deliveryLocs={deliveryLocs} sizes={sizes.get(ft.trip.trailer_id ?? "")} colorOf={colorOf} tm={tm}
            onEdit={() => setEditing(r.tripId)} onOpen={() => { setDestKey(null); onClose(); onOpenTrip(r.tripId); }} />;
        })}
      </FullscreenModal>

      {editFt && (
        <EditSheet ft={editFt} terminals={terminals} deliveryLocs={deliveryLocs} deliveryTanks={deliveryTanks} companyId={companyId} userId={userId}
          onLocationAdded={onLocationAdded} onDone={() => { onChanged(); }} onClose={() => setEditing(null)} tm={tm} />
      )}
    </>
  );
}

function TripCard({ ft, row, locations, deliveryLocs, sizes, colorOf, tm, onEdit, onOpen }: {
  ft: FleetTrip; row: LiveRow; locations: Map<string, Place>; deliveryLocs: DeliveryLocation[]; sizes?: Map<number, number>;
  colorOf: (id: string | null) => string | null; tm: (id: string | number | null) => string | null; onEdit: () => void; onOpen: () => void;
}) {
  const L = useDashLook();
  const muted = L.muted;
  const aboard = new Map(ft.compLoads.filter((c) => c.disposition === "loaded").map((c) => [c.comp_number, c.product_id]));
  const slots: StripSlot[] = [...new Set([...(sizes?.keys() ?? []), ...aboard.keys()])].map((n) => ({ comp: n, size: sizes?.get(n) ?? 1, color: colorOf(aboard.get(n) ?? null) }));
  const current = activePickup(ft.pickups.filter((p) => p.outcome !== "no_load"));
  const eta = row.etaMs;
  return (
    <div style={{ ...L.primary, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{tagOf(ft.truckName, ft.driverName)}</span>
        <span style={{ fontSize: 12, color: muted, flex: 1 }}>{ft.driverName ?? ""}{ft.trailerName ? ` · Trailer ${ft.trailerName}` : ""}</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{ft.orderNumbers[0] ? `Order ${ft.orderNumbers[0]}` : "No order #"}</span>
      </div>
      {slots.length > 0 && <div style={{ marginBottom: 8 }}><CompartmentStrip slots={slots} /></div>}
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
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        <button type="button" onClick={onEdit} style={{ background: "none", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 }}>Edit trip</button>
        <button type="button" onClick={onOpen} style={{ background: "none", border: "none", color: muted, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>Open PTD ›</button>
      </div>
    </div>
  );
}

function EditSheet({ ft, terminals, deliveryLocs, deliveryTanks, companyId, userId, tm, onLocationAdded, onDone, onClose }: {
  ft: FleetTrip; terminals: TermRow[]; deliveryLocs: DeliveryLocation[]; deliveryTanks: any[]; companyId: string | null; userId: string | null;
  tm: (id: string | number | null) => string | null; onLocationAdded: () => void; onDone: () => void; onClose: () => void;
}) {
  const L = useDashLook();
  const [order, setOrder] = useState(ft.orderNumbers[0] ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [termFor, setTermFor] = useState<string | null>(null); // pickup id
  const [q, setQ] = useState("");
  const [locFor, setLocFor] = useState<string | null>(null);   // delivery id
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [note, setNote] = useState("");
  const actor = userId ?? "";
  const run = async (fn: () => Promise<string | null>, ok: string, after?: () => void) => {
    setBusy(true); setMsg(null);
    const err = await fn();
    setBusy(false);
    if (err) { setMsg({ ok: false, text: err }); return; }
    setMsg({ ok: true, text: `${ok} The driver was notified.` });
    onDone(); after?.();
  };
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return terminals.filter((t) => !s || `${t.terminal_name} ${t.city ?? ""} ${t.state ?? ""}`.toLowerCase().includes(s)).slice(0, 40);
  }, [terminals, q]);
  const row = { ...L.secondary, display: "flex", width: "100%", textAlign: "left" as const, color: "#fff", padding: "11px 12px", marginBottom: 6, cursor: "pointer", fontSize: 14, justifyContent: "space-between", gap: 8 };
  const open = ft.pickups.filter((p) => !p.arrived_at && !p.left_at && p.outcome !== "no_load");
  const openDrops = ft.deliveries.filter((d) => !d.arrived_at && !d.left_at && d.status === "planned");
  const head = { fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: L.muted, margin: "14px 0 6px" };
  return (
    <>
      <FullscreenModal open={!termFor} title={`Edit trip · ${tagOf(ft.truckName, ft.driverName)}`} onClose={onClose}>
        {msg && <div style={{ fontSize: 13, color: msg.ok ? "#4ade80" : "#f87171", marginBottom: 10 }}>{msg.text}</div>}
        <div style={{ ...head, marginTop: 0 }}>Order number</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={order} onChange={(e) => setOrder(e.target.value)} style={{ flex: 1, minWidth: 0, background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "10px 12px", borderRadius: 2 }} />
          <button type="button" disabled={busy || order.trim() === (ft.orderNumbers[0] ?? "")} onClick={() => void run(() => changeOrderNumber(ft, order, actor), "Order changed.")}
            style={{ border: "none", background: "#fff", color: "#000", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 14px", cursor: "pointer", opacity: busy ? 0.5 : 1 }}>Save</button>
        </div>
        {open.length > 0 && <div style={head}>Pickup</div>}
        {open.map((p) => (
          <button key={p.pickup_id} type="button" className="dash-press" onClick={() => { setQ(""); setTermFor(p.pickup_id); }} style={row}>
            <span>{p.name ?? "Not set"}{p.city ? `, ${p.city}` : ""}</span><span style={{ color: L.muted }}>Change ›</span>
          </button>
        ))}
        {openDrops.length > 0 && <div style={head}>Delivery</div>}
        {openDrops.map((d) => {
          const loc = d.location_id ? deliveryLocs.find((l) => l.location_id === d.location_id) : null;
          return (
            <button key={d.delivery_id} type="button" className="dash-press" onClick={() => setLocFor(d.delivery_id)} style={row}>
              <span>{loc ? `${locationTitle(loc)}, ${locationPlace(loc)}` : d.one_off_name ?? "Not set"}</span><span style={{ color: L.muted }}>Change ›</span>
            </button>
          );
        })}
        <div style={head}>Cancel this load</div>
        {!confirmCancel ? (
          <button type="button" className="dash-press" onClick={() => setConfirmCancel(true)} style={{ ...row, borderColor: "rgba(248,113,113,0.5)", color: "#f87171", fontWeight: 800 }}>Cancel load…</button>
        ) : (
          <div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the driver (optional)" maxLength={150}
              style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "10px 12px", borderRadius: 2, marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" {...busyProps(busy)} onClick={() => void run(() => cancelLoadInProgress(ft, actor, note), "Load cancelled.", () => onClose())}
                style={{ border: "none", background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 14px", cursor: "pointer" }}>Cancel load and notify driver</button>
              <button type="button" onClick={() => setConfirmCancel(false)} style={{ border: `1px solid ${L.hairline}`, background: "transparent", color: L.muted, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 12px", cursor: "pointer" }}>Keep</button>
            </div>
          </div>
        )}
        <div style={{ fontSize: 12, color: L.faint, marginTop: 14 }}>Every change is sent to the driver as a notification.</div>
      </FullscreenModal>

      <FullscreenModal open={!!termFor} title="New pickup terminal" onClose={() => setTermFor(null)}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terminal or city" autoFocus
          style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "11px 12px", borderRadius: 2, marginBottom: 10 }} />
        {hits.map((t) => (
          <button key={String(t.terminal_id)} type="button" className="dash-press"
            onClick={() => { const id = termFor!; setTermFor(null); void run(() => changePickupTerminal(ft, id, { terminalId: String(t.terminal_id), name: t.terminal_name, city: t.city, state: t.state }, actor), "Pickup changed."); }} style={row}>
            <span>{t.terminal_name}</span><span style={{ color: L.muted }}>{[t.city, t.state].filter(Boolean).join(", ")}</span>
          </button>
        ))}
      </FullscreenModal>

      <LocationPicker open={!!locFor} title="New delivery location" origin={null} locations={deliveryLocs} tanks={deliveryTanks} companyId={companyId} userId={userId}
        onLocationAdded={onLocationAdded}
        onPick={(to) => { const id = locFor!; setLocFor(null); if (!to.locationId) return; const l = deliveryLocs.find((x) => x.location_id === to.locationId); void run(() => changeDeliveryLocation(ft, id, { locationId: to.locationId!, label: l ? `${locationTitle(l)}, ${locationPlace(l)}` : "a new store" }, actor), "Delivery changed."); }}
        onClose={() => setLocFor(null)} />
    </>
  );
}
