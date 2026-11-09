"use client";
// app/planner/dispatch/DriverDay.tsx
//
// The selected driver's whole day on the Plan board: every trip in the run
// (finished, in progress, not begun), oldest first, each drawn as the same
// trip card the driver sees, plus the dispatcher's details (truck, trailer,
// start and ETA). A trip that is not finished can be sent through the same
// validation report as a trip built on this page.
import React, { useState } from "react";
import { TripCardView } from "@/app/planner/components/trip/TripCardView";
import { deliveryRows, pickupRows } from "@/lib/trips/cardRows";
import { activePickup, onBoard, plannedDeliveries } from "@/lib/trips/tripFlow";
import { readPlannedMeta } from "@/lib/dispatch/compPlan";
import { driverDays, type DayItem } from "@/lib/dispatch/driverDay";
import { noLoadReasonLabel } from "@/lib/trips/terminalIssues";
import type { DriverTrip } from "./useDriverTrips";
import type { BoardProduct } from "./FleetBoard";

const muted = "rgba(255,255,255,0.5)";
const STATUS: Record<string, string> = {
  dispatched: "Dispatched", draft: "Not loaded yet", loading: "Loading", in_transit: "In transit",
  delivering: "Delivering", parked: "Parked preloaded", complete: "Complete",
};

type Item = DayItem & { t: DriverTrip };

const WK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Sun 11/08 3:02pm */
export function stamp(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${WK[d.getDay()]} ${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${h}:${p2(d.getMinutes())}${d.getHours() < 12 ? "am" : "pm"}`;
}

export function toItems(trips: DriverTrip[]): Item[] {
  return trips.flatMap((t) => {
    const s = t.trip.status;
    const startIso = s === "dispatched" ? t.trip.planned_start_at : t.trip.started_at ?? t.trip.planned_start_at;
    if (!startIso) return [];
    const startMs = Date.parse(startIso);
    const endIso = s === "complete" ? t.trip.completed_at : s === "dispatched" ? t.trip.planned_end_at : null;
    return [{ id: t.trip.trip_id, kind: s === "complete" ? "done" : s === "dispatched" ? "planned" : "live", startMs, endMs: endIso ? Date.parse(endIso) : null, t } as Item];
  });
}

const COUNT = (n: number) => `${n} Trip${n === 1 ? "" : "s"}`;

export function DriverDay(p: {
  trips: DriverTrip[];
  nowMs: number;
  truckName: (id: string | null) => string | null;
  trailerName: (id: string | null) => string | null;
  terminalPlace: (id: string | null) => string;
  locationPlace: (id: string | null) => string;
  locationName: (id: string | null) => string | null;
  product: (id: string | null) => BoardProduct;
  checkingId: string | null;
  onCheck: (tripId: string | null) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const days = driverDays(toItems(p.trips), p.nowMs);
  const [open, setOpen] = useState<Record<string, boolean>>({ Today: true });
  if (days.length === 0) return <div style={{ fontSize: 13, color: muted, margin: "4px 0" }}>No trips yesterday, today or tomorrow.</div>;
  return (
    <div>
      {days.map((day) => {
        const isOpen = open[day.label] ?? false;
        const n = day.items.length;
        // The day's end: the last finish known, actual or estimated. A live trip with no estimate has none yet.
        const ends = day.items.map((i) => finishOf(i)).filter((x): x is number => x != null);
        const end = ends.length ? Math.max(...ends) : null;
        return (
          <div key={day.label} style={{ marginBottom: 12 }}>
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [day.label]: !isOpen }))}
              style={{ display: "flex", gap: 8, width: "100%", background: "none", border: "none", padding: "2px 0 8px", cursor: "pointer", textAlign: "left", color: muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <span style={{ width: 10 }}>{isOpen ? "▾" : "▸"}</span>
              <span>{day.label} - {COUNT(n)} - {stamp(day.startMs)}{end != null ? ` to ${stamp(end)}` : " · in progress"}</span>
            </button>
            {isOpen && day.items.map((it, idx) => <TripRow key={it.id} it={it} idx={idx} n={n} p={p} />)}
            {isOpen && day.resetAtMs != null && (
              <div className="dash-num" style={{ fontSize: 12, color: muted, textAlign: "center", padding: "2px 0" }}>
                Reset - {stamp(day.resetAtMs)} - In {((day.resetAtMs - p.nowMs) / 3600000).toFixed(2)}hr
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** When the trip finished or is estimated to: actual once complete, else the planned end. */
function finishOf(it: Item): number | null {
  const t = it.t.trip;
  const iso = it.kind === "done" ? t.completed_at : t.planned_end_at;
  return iso ? Date.parse(iso) : null;
}

function TripRow({ it, idx, n, p }: { it: Item; idx: number; n: number; p: Parameters<typeof DriverDay>[0] }) {
  const { trip, pickups, deliveries, compLoads } = it.t;
  const aboard = onBoard(compLoads);
  // The product plan, highest compartment first like the driver's card: what dispatch planned, else what is on board.
  const pk = pickups.find((x) => !x.left_at && x.outcome !== "no_load" && x.planned_comps);
  const meta = pk ? readPlannedMeta(pk.planned_comps) : null;
  const ids: (string | null)[] = meta && meta.size
    ? [...meta.entries()].sort((a, b) => b[0] - a[0]).map(([, m]) => m.product_id)
    : [...aboard].sort((a, b) => b.comp_number - a.comp_number).map((c) => c.product_id);
  const planComps = ids.length ? ids.map((id) => { const pr = p.product(id); return { code: pr.code, color: pr.hex }; }) : null;
  const current = trip.status === "complete" ? null : activePickup(pickups);
  const headed = !current && aboard.length > 0 ? plannedDeliveries(deliveries)[0]?.delivery_id ?? null : null;
  const truck = p.truckName(trip.truck_id ?? trip.planned_truck_id ?? null);
  const trailer = p.trailerName(trip.trailer_id ?? trip.planned_trailer_id ?? null);
  const checking = p.checkingId === trip.trip_id;
  const begun = it.kind !== "planned";
  const fin = finishOf(it);
  return (
    <TripCardView
      style={{ marginBottom: 10, opacity: it.kind === "done" ? 0.65 : 1, borderColor: checking ? "rgba(147,197,253,0.6)" : undefined }}
      bar={(
        <div className="dash-num" style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, fontWeight: 700 }}>
          <span>Truck {truck ?? "—"} · Trailer {trailer ?? "—"}</span>
          {it.t.orderNumber && <span style={{ color: muted }}>Order {it.t.orderNumber}</span>}
        </div>
      )}
      heading={`Trip ${idx + 1} of ${n} · ${STATUS[trip.status] ?? trip.status}`}
      right={<span className="dash-num" style={{ fontSize: 12, color: muted, whiteSpace: "nowrap" }}>{begun ? "Start" : "Est. Start"} {stamp(it.startMs)}</span>}
      route={[trip.shipper, trip.customer].filter(Boolean).join(" → ") || null}
      plan={planComps ? { label: "", comps: planComps } : null}
      pickups={pickupRows(pickups, { currentId: current?.pickup_id ?? null, noLoadReason: (c) => noLoadReasonLabel(c) ?? "", place: (x) => (x.terminal_id ? p.terminalPlace(x.terminal_id) : [x.city, x.state].filter(Boolean).join(", ")) })}
      deliveries={deliveryRows(deliveries, { headedId: headed, place: (d) => p.locationPlace(d.location_id), name: (d) => p.locationName(d.location_id) ?? d.one_off_name ?? "Delivery" })}
      extras={fin != null ? (
        <div className="dash-num" style={{ marginTop: 6, fontSize: 12, color: muted, textAlign: "right", whiteSpace: "nowrap" }}>
          {it.kind === "done" ? "Finish" : "Est. Finish"} {stamp(fin)}
        </div>
      ) : null}
      footer={(
        <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
          <button type="button" onClick={() => p.onOpenTrip(trip.trip_id)} style={link}>Open trip ›</button>
          {it.kind !== "done" && (
            <button type="button" onClick={() => p.onCheck(checking ? null : trip.trip_id)} style={{ ...link, color: "#93c5fd", marginLeft: "auto" }}>
              {checking ? "Close report" : "Check this trip ›"}
            </button>
          )}
        </div>
      )}
    />
  );
}

const link: React.CSSProperties = { background: "none", border: "none", padding: 0, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
