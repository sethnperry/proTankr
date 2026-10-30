"use client";
// app/planner/dispatch/FleetBoard.tsx
//
// Dispatch Dashboard: every load in progress with its route line, then every
// parked load. Presentational only (data comes from useFleetTrips), so it can
// be rendered without a browser.
//
// The route line is one row (lib/trips/fleetProgress.ts): origin on the left, the
// loading terminal(s) in the middle, the destination on the right. A dot shows where the truck is.

import React, { useState } from "react";
import { SideView, BirdTab, segsFor, useTrailerSizes } from "@/app/planner/components/TrailerViews";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { driveMinutesByDistance } from "@/lib/dispatch/forecast";
import { CardBusy, busyProps } from "@/lib/ui/pending";
import { buildTripRoute, elapsed, type Place, type TripRoute } from "@/lib/trips/fleetProgress";
import type { FleetTrip } from "@/lib/trips/useFleetTrips";
import { PARK_FOR_LABEL } from "@/lib/trips/tripFlow";
import { productColorFor } from "@/app/planner/utils/productColor";
import { cancelReasonLabel, reasonCounts } from "@/lib/trips/cancelReasons";
import type { CancelledTrip } from "@/lib/trips/useCancelledTrips";
import { terminalIssueLabel } from "@/lib/trips/terminalIssues";
import { fractionAlong, hosText, liveLine, pointAlong, pointsUpTo, remainingDriveMin, type LivePos } from "@/lib/telematics/progress";
import type { HosAvailability } from "@/lib/telematics/types";
import type { GeoState } from "@/lib/dispatch/useGeofenceWatch";
import type { LatLon } from "@/lib/trips/deliveryLocations";

export type BoardProduct = { name: string; code: string; hex: string | null };

const muted = "rgba(255,255,255,0.5)";
const card: React.CSSProperties = {
  borderRadius: 2, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)",
  padding: "12px 14px", marginBottom: 10, cursor: "pointer", textAlign: "left", width: "100%", color: "#fff",
  display: "block", position: "relative",
};
const sectionLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "4px 0 8px",
};

const MOVING = "#4ade80";
const PARKED = "#93c5fd";

// Horizontal layout: fractions 0..1 map to LEFT..RIGHT percent of the width.
const LEFT = 5;
const RIGHT = 95;
const px = (x: number) => LEFT + (RIGHT - LEFT) * x;
const TOP_Y = 10;
const HEIGHT = 44;

function RouteLine({ route, parked, live }: { route: TripRoute; parked: boolean; live?: number | null }) {
  const { nodes, position } = route;
  const dotColor = parked ? PARKED : MOVING;
  const y = (row: "top" | "bottom") => TOP_Y;

  // Segments between consecutive nodes. The top→bottom hop goes down the
  // right edge first, then left.
  type Seg = { pts: [number, number][]; i: number };
  const segs: Seg[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const pts: [number, number][] = a.row === b.row
      ? [[px(a.x), y(a.row)], [px(b.x), y(b.row)]]
      : [[px(a.x), y(a.row)], [RIGHT, y(a.row)], [RIGHT, y(b.row)], [px(b.x), y(b.row)]];
    segs.push({ pts, i });
  }
  const travelled = (i: number) => i + 1 < position.at || (i + 1 === position.at && !position.enRoute);
  const enRouteSeg = position.enRoute ? segs.find((s) => s.i + 1 === position.at) : null;

  // Midpoint of the last straight leg of the en-route segment.
  let dot: [number, number];
  if (enRouteSeg) {
    const p = enRouteSeg.pts;
    const [x1, y1] = p[p.length - 2], [x2, y2] = p[p.length - 1];
    dot = live != null ? pointAlong(p, live) : [(x1 + x2) / 2, (y1 + y2) / 2];
  } else {
    const n = nodes[position.at];
    dot = [px(n.x), y(n.row)];
  }

  const line = (pts: [number, number][], stroke: string, w: number, key: string) =>
    pts.slice(1).map((p, k) => (
      <line key={`${key}-${k}`} x1={`${pts[k][0]}%`} y1={pts[k][1]} x2={`${p[0]}%`} y2={p[1]}
        stroke={stroke} strokeWidth={w} strokeLinecap="round" />
    ));

  return (
    <div style={{ position: "relative", height: HEIGHT, marginTop: 6 }}>
      <svg width="100%" height={HEIGHT} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {segs.map((s) => line(s.pts, travelled(s.i) ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.15)", 2, `s${s.i}`))}
        {enRouteSeg && (() => {
          // Brighten everything before the dot on the en-route segment.
          const p = enRouteSeg.pts;
          const head = live != null ? ([...pointsUpTo(p, live), dot] as [number, number][]) : ([...p.slice(0, p.length - 1), dot] as [number, number][]);
          return line(head, "rgba(255,255,255,0.85)", 2, "head");
        })()}
        {nodes.map((n, i) => {
          const cx = `${px(n.x)}%`, cy = y(n.row);
          if (n.state === "skipped") {
            return <circle key={n.key} cx={cx} cy={cy} r={4} fill="#0b0b0b" stroke="rgba(248,113,113,0.7)" strokeWidth={1.5} />;
          }
          const done = n.state === "done" || i < position.at;
          return <circle key={n.key} cx={cx} cy={cy} r={4.5} fill={done ? "#fff" : "#0b0b0b"}
            stroke={done ? "#fff" : "rgba(255,255,255,0.4)"} strokeWidth={1.5} />;
        })}
        <circle cx={`${dot[0]}%`} cy={dot[1]} r={8} fill={dotColor} opacity={0.25} />
        <circle cx={`${dot[0]}%`} cy={dot[1]} r={5} fill={dotColor} />
      </svg>
      {nodes.map((n, i) => {
        const left = px(n.x);
        const atLeft = n.x === 0;
        const atRight = n.x === 1;
        const isHere = i === position.at;
        return (
          <div key={`l-${n.key}`} style={{
            position: "absolute",
            top: TOP_Y + 10,
            left: atRight ? undefined : `${left}%`,
            right: atRight ? `${100 - left}%` : undefined,
            transform: atLeft ? "translateX(-6px)" : atRight ? "translateX(6px)" : "translateX(-50%)",
            textAlign: atLeft ? "left" : atRight ? "right" : "center",
            maxWidth: `${Math.min(42, 90 / Math.max(1, nodes.length - 1))}%`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            fontSize: 12, lineHeight: "15px",
            fontWeight: isHere ? 800 : 600,
            color: n.state === "skipped" ? "rgba(248,113,113,0.8)" : isHere ? "#fff" : "rgba(255,255,255,0.65)",
            textDecoration: n.state === "skipped" ? "line-through" : undefined,
          }}>
            {n.label}
          </div>
        );
      })}
    </div>
  );
}

function ProductChips({ ft, product, sizes }: { ft: FleetTrip; product: (id: string | null) => BoardProduct; sizes: Record<string, { comp: number; size: number | null }[]> }) {
  const aboard = ft.compLoads
    .filter((c) => c.disposition === "loaded" || c.disposition === "retained")
    .sort((a, b) => b.comp_number - a.comp_number);
  if (aboard.length === 0) return null;
  const loaded: Record<number, string | null> = {};
  for (const c of aboard) { const p = product(c.product_id); loaded[c.comp_number] = p.hex ?? productColorFor(p.name); }
  return (
    <div style={{ marginTop: 6 }}>
      <SideView segs={segsFor(ft.trip.trailer_id ? sizes[ft.trip.trailer_id] : undefined, loaded)} height={12} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 5 }}>
        {aboard.map((c) => {
          const p = product(c.product_id);
          const g = c.gross_gallons != null ? Math.round(Number(c.gross_gallons)).toLocaleString("en-US") : null;
          return (
            <span key={c.compartment_load_id} style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
              C{c.comp_number} {p.code}{g ? ` · ${g}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const unitLabel = (ft: FleetTrip) =>
  [ft.truckName ? `Truck ${ft.truckName}` : null, ft.trailerName ? `Trailer ${ft.trailerName}` : null].filter(Boolean).join(" · ");

const CANCELLED = "#f87171";
const fmtWhen = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const fmtSpan = (from: string | null | undefined, to: string | null | undefined) => {
  if (!from || !to) return null;
  const m = Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
  if (!Number.isFinite(m) || m < 0) return null;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

function CancelledSection({ cancelled, days, onOpenTrip, openingId, onDismiss, onDismissAll, onReassign }: {
  onReassign?: (ct: CancelledTrip) => void;
  onDismiss?: (tripId: string) => void;
  onDismissAll?: () => void;
  openingId?: string | null;
  cancelled: CancelledTrip[];
  days: number;
  onOpenTrip: (tripId: string) => void;
}) {
  const [all, setAll] = useState(false);
  const counts = reasonCounts(cancelled);
  const shown = all ? cancelled : cancelled.slice(0, 5);
  // Nothing left (all dismissed): the section goes away.
  if (cancelled.length === 0) return null;
  return (
    <>
      <div style={{ ...sectionLabel, marginTop: 14, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ flex: 1 }}>Cancelled loads · last {days} days ({cancelled.length})</span>
        {onDismissAll && (
          <button type="button" onClick={onDismissAll}
            style={{ border: "none", background: "transparent", color: muted, fontSize: 11, fontWeight: 800, cursor: "pointer", padding: 0, textTransform: "none", letterSpacing: 0 }}>
            Dismiss all
          </button>
        )}
      </div>
      {counts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {counts.map((c) => (
            <span key={c.code} style={{ fontSize: 12, fontWeight: 700, padding: "4px 8px", borderRadius: 2, border: "1px solid rgba(248,113,113,0.35)", color: "rgba(255,255,255,0.85)" }}>
              {cancelReasonLabel(c.code)} ×{c.count}
            </span>
          ))}
        </div>
      )}
      {shown.map((ct) => {
        const t = ct.trip;
        const reasons = t.cancel_reasons ?? [];
        const racks = ct.pickups.filter((p) => p.arrived_at || p.outcome);
        const span = fmtSpan(t.started_at, t.cancelled_at);
        return (
          <div key={t.trip_id}>
          <button type="button" style={{ ...card, borderColor: "rgba(248,113,113,0.3)", marginBottom: (onDismiss || onReassign) ? 0 : card.marginBottom }} onClick={() => onOpenTrip(t.trip_id)} {...busyProps(openingId === t.trip_id)}>
            <CardBusy on={openingId === t.trip_id} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ct.driverName ?? "Driver"}
              </span>
              <span style={{ fontSize: 12, color: muted, whiteSpace: "nowrap" }}>{fmtWhen(t.cancelled_at ?? t.started_at)}</span>
            </div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
              {[ct.truckName ? `Truck ${ct.truckName}` : null, ct.orderNumbers.length ? `Order ${ct.orderNumbers.join(", ")}` : null, span ? `${span} on the load` : null]
                .filter(Boolean).join(" · ")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
              {reasons.length === 0
                ? <span style={{ fontSize: 13, color: muted }}>No reason given</span>
                : reasons.map((r, i) => (
                  <span key={r} style={{ fontSize: 13, color: CANCELLED, fontWeight: 700 }}>
                    {i > 0 ? "→ " : ""}{cancelReasonLabel(r)}
                  </span>
                ))}
            </div>
            {racks.length > 0 && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                Racks: {racks.map((p) => {
                  const why = p.outcome === "no_load" ? terminalIssueLabel(p.no_load_reason) : null;
                  return `${p.name ?? "Rack"}${why ? ` (${why})` : ""}`;
                }).join(" → ")}
              </div>
            )}
            {t.cancel_note && <div style={{ fontSize: 13, marginTop: 4 }}>&ldquo;{t.cancel_note}&rdquo;</div>}
            {t.cancel_returned_to && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Headed to {t.cancel_returned_to}</div>}
          </button>
          {(onDismiss || onReassign) && (
            <div style={{ textAlign: "right", marginBottom: 10, display: "flex", justifyContent: "flex-end", gap: 14 }}>
              {onReassign && (
                <button type="button" onClick={() => onReassign(ct)}
                  style={{ border: "none", background: "transparent", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", padding: "4px 0" }}>
                  Reassign
                </button>
              )}
              {onDismiss && <button type="button" onClick={() => onDismiss(t.trip_id)}
                style={{ border: "none", background: "transparent", color: muted, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 0" }}>
                Dismiss
              </button>}
            </div>
          )}
          </div>
        );
      })}
      {cancelled.length > 5 && (
        <button type="button" onClick={() => setAll((v) => !v)}
          style={{ border: "none", background: "transparent", color: muted, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "4px 0" }}>
          {all ? "Show fewer" : `Show all ${cancelled.length}`}
        </button>
      )}
    </>
  );
}

export type BoardSection = "live" | "parked" | "cancelled";

// Where this load's truck is, from its telematics position: the dot's place on
// the en-route leg, and a status line (speed, miles to the next stop, age).
function liveFor(ft: FleetTrip, route: TripRoute, pos: LivePos | undefined, terminalLL?: (id: string) => LatLon | null, locationLL?: (id: string) => LatLon | null, now: Date = new Date()) {
  if (!pos) return null;
  const llOf = (key: string): LatLon | null => {
    const p = ft.pickups.find((x) => x.pickup_id === key);
    if (p) return p.terminal_id && terminalLL ? terminalLL(String(p.terminal_id)) : null;
    const d = ft.deliveries.find((x) => x.delivery_id === key);
    return d?.location_id && locationLL ? locationLL(d.location_id) : null;
  };
  const at = route.position.at;
  const next = route.nodes[at];
  const nextLL = next ? llOf(next.key) : null;
  const line = liveLine(pos, next?.sub ?? next?.label ?? null, route.position.enRoute ? nextLL : null, now);
  let fraction: number | null = null;
  if (route.position.enRoute && !line.stale && at > 0) {
    const prevNode = route.nodes[at - 1];
    fraction = fractionAlong(prevNode.kind === "start" ? null : llOf(prevNode.key), { lat: pos.lat, lon: pos.lon }, nextLL);
  }
  // Stops still ahead, in order, for the drive-time check.
  const ahead = route.nodes.slice(at).map((n) => llOf(n.key));
  const etaMs = route.position.enRoute && !line.stale && nextLL ? now.getTime() + driveMinutesByDistance({ lat: pos.lat, lon: pos.lon }, nextLL) * 60000 : null;
  return { ...line, fraction, etaMs, remainingDriveMin: remainingDriveMin({ lat: pos.lat, lon: pos.lon }, ahead) };
}

export function FleetBoard({ trips, locations, product, now, onOpenTrip, cancelled, cancelledDays = 30, openingId, sections, onDismissCancelled, onDismissAllCancelled, onReassignCancelled, positions, hos, geo, terminalLL, locationLL }: {
  positions?: Map<string, LivePos>;            // truck id -> live position
  hos?: Map<string, HosAvailability>;          // driver user id -> clocks
  geo?: Map<string, GeoState>;                 // trip id -> truck is at its next stop's geofence
  terminalLL?: (terminalId: string) => LatLon | null;
  locationLL?: (locationId: string) => LatLon | null;
  onDismissCancelled?: (tripId: string) => void;
  onReassignCancelled?: (ct: CancelledTrip) => void;
  onDismissAllCancelled?: () => void;
  // Which lists to show (default all). The Dispatch Dashboard shows loads in
  // progress in LIVE mode and parked + cancelled in PLAN mode.
  sections?: BoardSection[];
  openingId?: string | null; // trip whose PTD is opening (card dims + spinner)
  cancelled?: CancelledTrip[];
  cancelledDays?: number;
  trips: FleetTrip[];
  locations: Map<string, Place>;
  product: (id: string | null) => BoardProduct;
  now: Date;
  onOpenTrip: (tripId: string) => void; // opens the PTD in progress
}) {
  const sizes = useTrailerSizes(trips.map((t) => t.trip.trailer_id));
  const live = trips.filter((t) => t.trip.status !== "parked");
  const parked = trips.filter((t) => t.trip.status === "parked");
  const show = (x: BoardSection) => !sections || sections.includes(x);
  // Hundreds of loads: cards start collapsed, and the list can be narrowed by origin, terminal or destination.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [pick, setPick] = useState<null | "kind" | "origin" | "terminal" | "destination">(null);
  const [filter, setFilter] = useState<null | { kind: "origin" | "terminal" | "destination"; label: string }>(null);
  const routed = live.map((ft) => ({ ft, route: buildTripRoute(ft.trip, ft.pickups, ft.deliveries, locations, ft.start) }));
  const keysOf = (r: TripRoute, kind: "origin" | "terminal" | "destination"): string[] =>
    kind === "origin" ? [r.nodes[0].label]
      : kind === "terminal" ? r.nodes.filter((n) => n.kind === "pickup").map((n) => n.label)
      : r.nodes.filter((n) => n.kind === "delivery").map((n) => n.label);
  const values = (kind: "origin" | "terminal" | "destination"): [string, number][] => {
    const m = new Map<string, number>();
    for (const x of routed) for (const k of new Set(keysOf(x.route, kind))) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const shown = filter ? routed.filter((x) => keysOf(x.route, filter.kind).includes(filter.label)) : routed;

  return (
    <div style={{ marginBottom: 18 }}>
      {show("live") && <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 8px" }}>
        <div style={{ ...sectionLabel, margin: 0, flex: 1 }}>Loads in progress ({shown.length}{filter ? ` of ${live.length}` : ""})</div>
        <button type="button" onClick={() => (filter ? setFilter(null) : setPick("kind"))}
          style={filter
            ? { border: "none", background: "#fff", color: "#000", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 12px", cursor: "pointer" }
            : { border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 12px", cursor: "pointer" }}>
          {filter ? `Reset · ${filter.label}` : "Search"}
        </button>
      </div>
      {live.length === 0 && <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>No loads in progress.</div>}
      {live.length > 0 && shown.length === 0 && <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>No loads match.</div>}
      {shown.map(({ ft, route }) => {
        const since = elapsed(route.since, now);
        const lv = liveFor(ft, route, ft.trip.truck_id ? positions?.get(ft.trip.truck_id) : undefined, terminalLL, locationLL, now);
        const id = ft.trip.trip_id;
        const isOpen = expanded.has(id);
        const loaded: Record<number, string | null> = {};
        for (const c of ft.compLoads.filter((x) => x.disposition === "loaded" || x.disposition === "retained")) { const pr = product(c.product_id); loaded[c.comp_number] = pr.hex ?? productColorFor(pr.name); }
        const segs = segsFor(ft.trip.trailer_id ? sizes[ft.trip.trailer_id] : undefined, loaded);
        const eta = lv?.etaMs ? new Date(lv.etaMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
        return (
          <div key={id} style={{ ...card, cursor: "default", display: "flex", alignItems: "stretch", padding: "9px 0 9px 12px", marginBottom: 6 }}>
            <CardBusy on={openingId === id} />
            <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
              <button type="button" onClick={() => toggle(id)} aria-expanded={isOpen}
                style={{ display: "block", width: "100%", background: "none", border: "none", padding: 0, color: "#fff", textAlign: "left", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ft.driverName ?? "Driver"}{ft.truckName ? ` - ${ft.truckName}` : ""}
                  </span>
                  {eta && <span className="dash-num" style={{ fontSize: 12, color: muted, whiteSpace: "nowrap" }}>ETA {eta}</span>}
                </div>
              </button>
              <RouteLine route={route} parked={false} live={lv?.fraction ?? null} />
              {isOpen && (
                <>
                  {since && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{since}</div>}
                  {lv && <div style={{ fontSize: 12, marginTop: 4, color: lv.stale ? muted : MOVING }}>● Live · {lv.text}</div>}
                  {(() => {
                    const pos = ft.trip.truck_id ? positions?.get(ft.trip.truck_id) : undefined;
                    // Geotab's hooked trailer vs the one the trip says (only when both are known and linked).
                    if (!pos?.trailerId || !ft.trip.trailer_id || pos.trailerId === ft.trip.trailer_id) return null;
                    return <div style={{ fontSize: 12, marginTop: 3, color: "#fb923c", fontWeight: 700 }}>⚠ Geotab shows a different trailer hooked than the trip's{ft.trailerName ? ` (${ft.trailerName})` : ""}</div>;
                  })()}
                  {(() => {
                    const g = geo?.get(id);
                    if (!g) return null;
                    const mins = Math.max(0, Math.round((now.getTime() - g.sinceMs) / 60000));
                    return (
                      <div style={{ fontSize: 12, marginTop: 3, color: g.overdue ? "#fb923c" : MOVING, fontWeight: g.overdue ? 700 : 400 }}>
                        ◎ At {g.stopName} · {mins} min{g.overdue ? " · driver hasn't tapped Arrive" : ""}
                      </div>
                    );
                  })()}
                  {(() => {
                    const h = ft.trip.driver_id ? hos?.get(ft.trip.driver_id) : undefined;
                    if (!h) return null;
                    const t = hosText(h, now.getTime());
                    // Won't make the remaining stops on the drive time left (a rough, optimistic estimate).
                    const short = lv && !lv.stale && h.driveLeftMin != null && lv.remainingDriveMin > h.driveLeftMin;
                    return (
                      <div className="dash-num" style={{ fontSize: 12, marginTop: 3, color: t.color }}>
                        Hours · {t.text}
                        {short && <span style={{ color: "#f87171", fontWeight: 700 }}> · about {(lv!.remainingDriveMin / 60).toFixed(1)} h of driving left to run, {(Math.max(0, h.driveLeftMin!) / 60).toFixed(1)} h on the clock</span>}
                      </div>
                    );
                  })()}
                  <button type="button" onClick={() => onOpenTrip(id)} {...busyProps(openingId === id)}
                    style={{ background: "none", border: "none", color: muted, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0 0" }}>Open PTD ›</button>
                </>
              )}
            </div>
            <BirdTab segs={segs} />
          </div>
        );
      })}

      <FullscreenModal open={pick === "kind"} title="Search loads by" onClose={() => setPick(null)}>
        {(["origin", "terminal", "destination"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setPick(k)}
            style={{ display: "block", width: "100%", textAlign: "left", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 15, fontWeight: 700, padding: "13px 14px", marginBottom: 6, borderRadius: 2, cursor: "pointer" }}>
            {k === "origin" ? "Origin" : k === "terminal" ? "Terminal" : "Destination"} ›
          </button>
        ))}
      </FullscreenModal>
      <FullscreenModal open={pick === "origin" || pick === "terminal" || pick === "destination"} title={pick === "origin" ? "Origins" : pick === "terminal" ? "Terminals" : "Destinations"} onClose={() => setPick(null)}>
        {pick && pick !== "kind" && values(pick).map(([label, n]) => (
          <button key={label} type="button" onClick={() => { setFilter({ kind: pick, label }); setPick(null); }}
            style={{ display: "flex", justifyContent: "space-between", width: "100%", textAlign: "left", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 14, fontWeight: 700, padding: "11px 14px", marginBottom: 6, borderRadius: 2, cursor: "pointer" }}>
            <span>{label}</span><span style={{ color: muted }}>{n}</span>
          </button>
        ))}
      </FullscreenModal>

      </>}

      {show("parked") && <>
      <div style={{ ...sectionLabel, marginTop: show("live") ? 14 : 4 }}>Parked loads ({parked.length})</div>
      {parked.length === 0 && <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>No parked loads.</div>}
      {parked.map((ft) => {
        const t = ft.trip;
        const since = elapsed(t.parked_at ?? null, now);
        return (
          <button key={t.trip_id} type="button" style={{ ...card, borderColor: "rgba(147,197,253,0.35)" }} onClick={() => onOpenTrip(t.trip_id)} {...busyProps(openingId === t.trip_id)}>
            <CardBusy on={openingId === t.trip_id} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{ft.trailerName ? `Trailer ${ft.trailerName}` : "Trailer"}</span>
              <span style={{ fontSize: 12, color: PARKED, fontWeight: 700, whiteSpace: "nowrap" }}>
                {t.parked_for ? PARK_FOR_LABEL[t.parked_for] : "Parked"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
              {t.parked_where ? `At ${t.parked_where}` : "Location not given"}
              {since ? <span style={{ color: muted }}> · {since}</span> : null}
            </div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
              Parked by {ft.parkedByName ?? ft.driverName ?? "a driver"}
              {ft.orderNumbers.length > 0 ? ` · Order ${ft.orderNumbers.join(", ")}` : ""}
            </div>
            {t.parked_note && <div style={{ fontSize: 13, marginTop: 4 }}>&ldquo;{t.parked_note}&rdquo;</div>}
            <ProductChips ft={ft} product={product} sizes={sizes} />
          </button>
        );
      })}

      </>}

      {cancelled && show("cancelled") && <CancelledSection cancelled={cancelled} days={cancelledDays} onOpenTrip={onOpenTrip} openingId={openingId} onDismiss={onDismissCancelled} onDismissAll={onDismissAllCancelled} onReassign={onReassignCancelled} />}
    </div>
  );
}
