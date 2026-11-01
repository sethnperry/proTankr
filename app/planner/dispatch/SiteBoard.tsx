"use client";
// app/planner/dispatch/SiteBoard.tsx
//
// One terminal or one store, for dispatch: who is on the way, who is there now, and the last five. Our own
// trucks and other carriers' side by side (nothing secret: a company name, status, what is aboard). Every
// row is the same three columns: driver and truck, the trailer drawn sideways (empty compartments too), then
// the ETA (on the way), the time on site, or the date and time (finished).

import React, { useMemo } from "react";
import { TrailerHeader, useTrailerHeaderData } from "@/app/planner/components/TrailerViews";
import { CarrierStrip, initialsOf, runLabel } from "@/app/planner/components/trip/DashboardCards";
import { useOtherCarriers, useStoreDeliveries, useTerminalLoads, type StoreDelivery } from "@/app/planner/hooks/useDashboardCards";
import { activePickup, plannedDeliveries } from "@/lib/trips/tripFlow";
import { elapsed } from "@/lib/trips/fleetProgress";
import type { FleetTrip } from "@/lib/trips/useFleetTrips";
import type { BoardProduct } from "./FleetBoard";

const HAIR = "rgba(255,255,255,0.12)";
const MUTE = "rgba(255,255,255,0.52)";
const CAP: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE };

const shortWhen = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

type Row = { key: string; label: string; strip: React.ReactNode; right: string; rightColor?: string; onClick?: () => void };

function Section({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", paddingBottom: 6, marginBottom: 6, borderBottom: `1px solid ${HAIR}` }}>
        <span style={{ ...CAP, flex: 1 }}>{title}</span><span className="dash-num" style={{ fontSize: 12, color: MUTE }}>{rows.length}</span>
      </div>
      {rows.length === 0 ? <div style={{ fontSize: 13, color: MUTE, padding: "4px 0" }}>{empty}</div> : (
        <div style={{ background: "#0f0f10", border: `1px solid ${HAIR}` }}>
          {rows.map((r, i) => (
            <div key={r.key} role={r.onClick ? "button" : undefined} onClick={r.onClick}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: i ? `1px solid ${HAIR}` : "none", cursor: r.onClick ? "pointer" : "default" }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700 }}>{r.label}</span>
              <span style={{ minWidth: 0 }}>{r.strip}</span>
              <span className="dash-num" style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: r.rightColor ?? "#fff", whiteSpace: "nowrap" }}>{r.right}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteBoard({ kind, id, name, trips, product, now, etaFor, onOpenTrip, canOpen, hideName }: {
  kind: "terminal" | "location";
  id: string;
  name: string;
  /** Our company's live trips. */
  trips: FleetTrip[];
  product: (id: string | null) => BoardProduct;
  now: Date;
  /** When a truck on its way gets there (live position and straight-line time), or null. */
  etaFor: (tripId: string) => number | null;
  onOpenTrip: (tripId: string) => void;
  /** A driver can open only their own PTD. Default: every trip. */
  canOpen?: (tripId: string) => boolean;
  hideName?: boolean;
}) {
  const other = useOtherCarriers(kind, id);
  const terminalLoads = useTerminalLoads(kind === "terminal" ? id : null, id, 5);
  const storeDeliveries = useStoreDeliveries(kind === "location" ? id : null, id, 5);
  const previous: StoreDelivery[] = kind === "terminal" ? terminalLoads.items : storeDeliveries.items;
  const hdr = useTrailerHeaderData(trips.map((t) => t.trip.trailer_id));

  const own = useMemo(() => {
    const out: { ft: FleetTrip; arrivedAt: string | null; loaded: Record<number, string | null> }[] = [];
    for (const ft of trips) {
      if (ft.trip.status === "parked" || ft.trip.status === "dispatched") continue;
      const aboard = ft.compLoads.filter((c) => c.disposition === "loaded" || c.disposition === "retained");
      const loaded: Record<number, string | null> = {};
      if (kind === "terminal") {
        const p = activePickup(ft.pickups.filter((x) => x.outcome !== "no_load"));
        if (!p || String(p.terminal_id ?? "") !== id) continue;
        for (const c of p.planned_comps ?? []) if (c.product_id) loaded[c.comp_number] = c.product_id;
        out.push({ ft, arrivedAt: p.arrived_at ?? null, loaded });
      } else {
        const d = plannedDeliveries(ft.deliveries)[0];
        if (!d || d.location_id !== id) continue;
        for (const c of aboard) loaded[c.comp_number] = c.product_id;
        out.push({ ft, arrivedAt: d.arrived_at ?? null, loaded });
      }
    }
    return out;
  }, [trips, kind, id]);

  const ownRow = (o: (typeof own)[number], onSite: boolean): Row => ({
    key: o.ft.trip.trip_id,
    label: runLabel({ ownCompany: true, who: o.ft.driverName, truck: o.ft.truckName }),
    strip: <TrailerHeader variant="side" trailerId={o.ft.trip.trailer_id} loaded={o.loaded} data={hdr} height={12} />,
    right: onSite ? elapsed(o.arrivedAt, now) ?? "—" : (() => { const e = etaFor(o.ft.trip.trip_id); return e ? clock(e) : "—"; })(),
    onClick: !canOpen || canOpen(o.ft.trip.trip_id) ? () => onOpenTrip(o.ft.trip.trip_id) : undefined,
  });
  const otherRow = (x: (typeof other)[number], onSite: boolean): Row => ({
    key: `o-${x.tripId}`,
    label: runLabel({ ownCompany: false, who: x.who, truck: null }),
    strip: <CarrierStrip comps={x.comps} sizes={x.sizes} residue={x.residue} productInfo={product} />,
    right: onSite ? elapsed(x.arrivedAt, now) ?? "At site" : "—",
  });
  const enRoute = [...own.filter((o) => !o.arrivedAt).map((o) => ownRow(o, false)), ...other.filter((x) => !x.arrived).map((x) => otherRow(x, false))];
  const onSite = [...own.filter((o) => !!o.arrivedAt).map((o) => ownRow(o, true)), ...other.filter((x) => x.arrived).map((x) => otherRow(x, true))];
  const prevRows: Row[] = previous.slice(0, 5).map((d) => ({
    key: d.deliveryId,
    label: runLabel({ ownCompany: d.ownCompany, who: d.who, truck: d.truck }),
    strip: <CarrierStrip comps={d.comps} sizes={d.sizes} residue={{}} productInfo={product} />,
    right: shortWhen(d.leftAt),
    rightColor: MUTE,
    onClick: d.tripId && (!canOpen || canOpen(d.tripId)) ? () => onOpenTrip(d.tripId!) : undefined,
  }));
  void initialsOf;

  return (
    <div style={{ marginTop: hideName ? 0 : 16 }}>
      {!hideName && <div style={{ fontSize: 16, fontWeight: 800 }}>{name}</div>}
      <Section title="En route" rows={enRoute} empty="No trucks on the way." />
      <Section title="On site" rows={onSite} empty="Nobody there right now." />
      <Section title="Previous 5" rows={prevRows} empty="No history here yet." />
    </div>
  );
}
