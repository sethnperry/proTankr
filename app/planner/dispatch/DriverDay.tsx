"use client";
// app/planner/dispatch/DriverDay.tsx
//
// The selected driver's whole day on the Plan board: every trip in the run
// (finished, in progress, not begun), oldest first, each drawn as the same
// trip card the driver sees, plus the dispatcher's details (truck, trailer,
// start and ETA). A trip that is not finished can be sent through the same
// validation report as a trip built on this page.
import React from "react";
import { TrailerHeader, useTrailerHeaderData } from "@/app/planner/components/TrailerViews";
import { TripCardView } from "@/app/planner/components/trip/TripCardView";
import { deliveryRows, pickupRows } from "@/lib/trips/cardRows";
import { activePickup, onBoard, plannedDeliveries } from "@/lib/trips/tripFlow";
import { readPlannedMeta } from "@/lib/dispatch/compPlan";
import { driverDay, type DayItem } from "@/lib/dispatch/driverDay";
import { noLoadReasonLabel } from "@/lib/trips/terminalIssues";
import type { DriverTrip } from "./useDriverTrips";
import type { BoardProduct } from "./FleetBoard";

const muted = "rgba(255,255,255,0.5)";
const STATUS: Record<string, string> = {
  dispatched: "Dispatched", draft: "Not loaded yet", loading: "Loading", in_transit: "In transit",
  delivering: "Delivering", parked: "Parked preloaded", complete: "Complete",
};

type Item = DayItem & { t: DriverTrip };

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

/** "6:10 PM", with the weekday when it is not the same calendar day as `ref`. */
function stamp(ms: number, ref: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date(ref).toDateString() ? time : `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}

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
  const day = driverDay(toItems(p.trips), p.nowMs);
  const hdr = useTrailerHeaderData((day?.items ?? []).map((i) => i.t.trip.trailer_id));
  if (!day) return <div style={{ fontSize: 13, color: muted, margin: "8px 0" }}>No trips in this driver&rsquo;s current day.</div>;
  const n = day.items.length;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px" }}>
        Day · {stamp(day.startMs, day.startMs)} to {stamp(day.endMs, day.startMs)} · {n} trip{n === 1 ? "" : "s"}
      </div>
      {day.items.map((it, idx) => {
        const { trip, pickups, deliveries, compLoads } = it.t;
        const aboard = onBoard(compLoads).sort((a, b) => b.comp_number - a.comp_number);
        const loaded: Record<number, string | null> = Object.fromEntries(aboard.map((c) => [c.comp_number, c.product_id]));
        // The plan: what the dispatcher planned into the compartments, if anything.
        const pk = pickups.find((x) => !x.left_at && x.outcome !== "no_load" && x.planned_comps);
        const meta = pk ? readPlannedMeta(pk.planned_comps) : null;
        const planComps = meta && meta.size ? [...meta.entries()].sort((a, b) => b[0] - a[0]).map(([, m]) => { const pr = p.product(m.product_id); return { code: pr.code, color: pr.hex }; }) : null;
        const current = trip.status === "complete" ? null : activePickup(pickups);
        const headed = !current && aboard.length > 0 ? plannedDeliveries(deliveries)[0]?.delivery_id ?? null : null;
        const truck = p.truckName(trip.truck_id ?? trip.planned_truck_id ?? null);
        const trailer = p.trailerName(trip.trailer_id ?? trip.planned_trailer_id ?? null);
        const checking = p.checkingId === trip.trip_id;
        const dropEta = it.kind === "planned" && it.endMs ? it.endMs : null;
        return (
          <TripCardView key={trip.trip_id}
            style={{ marginBottom: 10, opacity: it.kind === "done" ? 0.65 : 1, borderColor: checking ? "rgba(147,197,253,0.6)" : undefined }}
            bar={Object.keys(loaded).length || trip.trailer_id ? <TrailerHeader variant="side" trailerId={trip.trailer_id} loaded={loaded} data={hdr} height={14} /> : null}
            heading={`Trip ${idx + 1} of ${n} · ${STATUS[trip.status] ?? trip.status}`}
            right={<span className="dash-num" style={{ fontSize: 12, color: muted }}>{stamp(it.startMs, day.startMs)}</span>}
            route={[trip.shipper, trip.customer].filter(Boolean).join(" → ") || null}
            plan={planComps ? { label: "Plan", comps: planComps } : null}
            pickups={pickupRows(pickups, { currentId: current?.pickup_id ?? null, noLoadReason: (c) => noLoadReasonLabel(c) ?? "", place: (x) => (x.terminal_id ? p.terminalPlace(x.terminal_id) : [x.city, x.state].filter(Boolean).join(", ")) })}
            deliveries={deliveryRows(deliveries, { headedId: headed, place: (d) => p.locationPlace(d.location_id), name: (d) => p.locationName(d.location_id) ?? d.one_off_name ?? "Delivery" })}
            extras={(
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: muted, display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
                <span>Truck {truck ?? "—"}</span>
                <span>Trailer {trailer ?? "—"}</span>
                {it.t.orderNumber && <span>Order {it.t.orderNumber}</span>}
                {it.kind === "planned" && <span>Starts {stamp(it.startMs, day.startMs)}</span>}
                {dropEta && <span>Drop ETA {stamp(dropEta, day.startMs)}</span>}
                {it.kind === "done" && it.endMs && <span>Finished {stamp(it.endMs, day.startMs)}</span>}
              </div>
            )}
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
      })}
    </div>
  );
}

const link: React.CSSProperties = { background: "none", border: "none", padding: 0, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
