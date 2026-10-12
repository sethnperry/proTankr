// lib/trips/fleetProgress.ts
//
// The route line on the Dispatch Dashboard's loads-in-progress board. A trip
// is drawn as a U: start on the top left, racks along the top to the right,
// then a turn down and back left along the bottom through the deliveries, so
// the last delivery sits under the start (tank trucks usually load out and
// deliver back toward home).
//
//   Start ●────────────● Rack
//                        │
//   Store ●──────────────╯
//
// Pure: positions are fractions (0 = left, 1 = right), rows are "top" or
// "bottom". The page turns them into SVG.

import type { TripDeliveryRow, TripPickupRow, TripRow } from "./types.ts";

export type NodeState = "done" | "current" | "next" | "upcoming" | "skipped";

export type RouteNode = {
  key: string;
  kind: "start" | "pickup" | "delivery";
  label: string; // city, or a name when no city is known
  sub: string | null; // terminal / store name
  row: "top" | "bottom";
  x: number; // 0..1
  state: NodeState;
};

export type RoutePosition = {
  // Where the truck dot goes: a node index, or between two nodes (en route).
  at: number; // node index the truck is at or headed to
  enRoute: boolean;
};

export type TripRoute = {
  nodes: RouteNode[];
  position: RoutePosition;
  status: string; // "At Marathon · loading", "En route to Store 12", ...
  since: string | null; // ISO time the current status started
};

export type Place = { name: string | null; city: string | null; state: string | null };

const cityOf = (p: Place | null | undefined) =>
  p?.city ? p.city : null;

// A delivery's place: its saved location, else the one-off name.
export function deliveryPlace(d: TripDeliveryRow, locations: Map<string, Place>): Place {
  const loc = d.location_id ? locations.get(d.location_id) : null;
  if (loc) return loc;
  return { name: d.one_off_name, city: null, state: null };
}

export function buildTripRoute(
  trip: TripRow,
  pickups: TripPickupRow[],
  deliveries: TripDeliveryRow[],
  locations: Map<string, Place>,
  start: Place | null,
): TripRoute {
  const ps = [...pickups].sort((a, b) => a.seq - b.seq);
  const ds = deliveries.filter((d) => d.status !== "cancelled").sort((a, b) => a.seq - b.seq);

  const nodes: RouteNode[] = [];
  nodes.push({
    key: "start", kind: "start", row: "top", x: 0, state: "done",
    label: cityOf(start) ?? "Start", sub: start?.name ?? null,
  });
  ps.forEach((p, i) => {
    const noLoad = p.outcome === "no_load";
    nodes.push({
      key: p.pickup_id, kind: "pickup", row: "top", x: (i + 1) / ps.length,
      label: p.city ?? p.name ?? "Rack", sub: p.city ? p.name : null,
      state: noLoad ? "skipped" : p.left_at ? "done" : "upcoming",
    });
  });
  if (ps.length === 0) {
    nodes.push({ key: "pickup", kind: "pickup", row: "top", x: 1, label: "Rack", sub: null, state: "upcoming" });
  }
  ds.forEach((d, i) => {
    const place = deliveryPlace(d, locations);
    nodes.push({
      key: d.delivery_id, kind: "delivery", row: "bottom", x: 1 - (i + 1) / ds.length,
      label: place.city ?? place.name ?? "Delivery", sub: place.city ? place.name : null,
      state: d.status === "complete" ? "done" : "upcoming",
    });
  });
  if (ds.length === 0) {
    nodes.push({ key: "delivery", kind: "delivery", row: "bottom", x: 0, label: "Not set", sub: null, state: "upcoming" });
  }

  // Current position: the first stop that isn't done (or skipped).
  let at = nodes.findIndex((n, i) => i > 0 && n.state !== "done" && n.state !== "skipped");
  if (at < 0) at = nodes.length - 1;
  const n = nodes[at];
  const pickupRow = ps.find((p) => p.pickup_id === n.key);
  const deliveryRow = ds.find((d) => d.delivery_id === n.key);
  const arrived = !!(pickupRow?.arrived_at || deliveryRow?.arrived_at);
  if (n.state !== "done") n.state = arrived ? "current" : "next";

  const where = n.sub ?? n.label;
  let status: string;
  let since: string | null = null;
  if (trip.status === "parked") {
    status = `Parked${trip.parked_where ? ` at ${trip.parked_where}` : ""}`;
    since = trip.parked_at ?? null;
  } else if (pickupRow && arrived) {
    status = pickupRow.load_id || pickupRow.begin_at ? `Loading at ${where}` : `Waiting at ${where}`;
    since = pickupRow.begin_at ?? pickupRow.arrived_at;
  } else if (deliveryRow && arrived) {
    status = deliveryRow.begin_at ? `Delivering at ${where}` : `Arrived at ${where}`;
    since = deliveryRow.begin_at ?? deliveryRow.arrived_at;
  } else if (n.kind === "delivery" && n.key === "delivery") {
    status = "Loaded · no delivery set";
    since = lastLeft(ps);
  } else {
    status = `En route to ${where}`;
    since = n.kind === "delivery" ? lastLeftOrDone(ps, ds) : lastLeft(ps) ?? trip.started_at ?? null;
  }

  return { nodes, position: { at, enRoute: !arrived }, status, since };
}

function lastLeft(ps: TripPickupRow[]): string | null {
  const times = ps.map((p) => p.left_at).filter((t): t is string => !!t).sort();
  return times[times.length - 1] ?? null;
}

function lastLeftOrDone(ps: TripPickupRow[], ds: TripDeliveryRow[]): string | null {
  const times = [...ps.map((p) => p.left_at), ...ds.filter((d) => d.status === "complete").map((d) => d.left_at)]
    .filter((t): t is string => !!t)
    .sort();
  return times[times.length - 1] ?? null;
}

// "42m", "3h 10m", "2d 4h".
export function elapsed(since: string | null, now: Date): string | null {
  if (!since) return null;
  const ms = now.getTime() - Date.parse(since);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Where a truck started this trip: the last delivery of its previous
// completed trip. Inputs are the truck's completed deliveries (any trip).
export function truckStartPlace(
  completedDeliveries: { left_at: string | null; place: Place }[],
  before: string | null,
): Place | null {
  const cut = before ? Date.parse(before) : Infinity;
  const prior = completedDeliveries
    .filter((d) => d.left_at && Date.parse(d.left_at) <= cut)
    .sort((a, b) => String(b.left_at).localeCompare(String(a.left_at)));
  return prior[0]?.place ?? null;
}
