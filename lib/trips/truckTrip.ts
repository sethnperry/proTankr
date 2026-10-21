// lib/trips/truckTrip.ts
//
// What to show when you look up a truck: the load it's on, where it is on that
// load, what it's hauling and when it should get to the next stop and the last.
// Distances are straight-line (the same rough drive time the dispatch board uses),
// so the times are estimates. Pure.

import { buildTripRoute, type Place } from "./fleetProgress.ts";
import type { LatLon } from "./deliveryLocations.ts";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripPickupRow, TripRow } from "./types.ts";
import { DROP_STOP_MIN, LOAD_STOP_MIN, remainingDriveMin } from "../telematics/progress.ts";
import { airMiles } from "./deliveryLocations.ts";

export type TruckTripInput = {
  trip: TripRow;
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  compLoads: TripCompartmentLoadRow[];
  locations: Map<string, Place>;
  terminalLL: (terminalId: string) => LatLon | null;
  locationLL: (locationId: string) => LatLon | null;
  pos: LatLon | null;
  nowMs: number;
};

export type TruckTripSummary = {
  status: string;                              // "En route to Store 708", "Loading at Marathon", "Dispatched, not begun"
  next: { label: string; miles: number | null; etaMs: number | null; here: boolean } | null;
  last: { label: string; etaMs: number } | null; // the final stop, when it isn't the next one
  products: { comp: number; productId: string | null; gallons: number | null }[];
};

export function summarizeTruckTrip(i: TruckTripInput): TruckTripSummary {
  const t = i.trip;
  const products = i.compLoads
    .filter((c) => c.disposition === "loaded" || c.disposition === "retained")
    .sort((a, b) => b.comp_number - a.comp_number)
    .map((c) => ({ comp: c.comp_number, productId: c.product_id ?? null, gallons: c.gross_gallons != null ? Number(c.gross_gallons) : null }));

  if (t.status === "dispatched") {
    const d = i.deliveries.find((x) => x.status !== "cancelled");
    const where = d?.location_id ? i.locations.get(d.location_id) : null;
    return { status: "Dispatched, not begun", next: where ? { label: where.name ?? where.city ?? "Delivery", miles: null, etaMs: null, here: false } : null, last: null, products };
  }

  const route = buildTripRoute(t, i.pickups, i.deliveries, i.locations, null);
  const llOf = (key: string): LatLon | null => {
    const p = i.pickups.find((x) => x.pickup_id === key);
    if (p) return p.terminal_id ? i.terminalLL(String(p.terminal_id)) : null;
    const d = i.deliveries.find((x) => x.delivery_id === key);
    return d?.location_id ? i.locationLL(d.location_id) : null;
  };
  const ahead = route.nodes.slice(route.position.at).filter((n) => n.kind !== "start" && n.state !== "skipped" && n.state !== "done");
  const nextNode = ahead[0];
  const here = !!nextNode && !route.position.enRoute;
  const nextLL = nextNode ? llOf(nextNode.key) : null;
  const label = (n: { sub: string | null; label: string }) => n.sub ?? n.label;

  let next: TruckTripSummary["next"] = null;
  if (nextNode) {
    const miles = i.pos && nextLL ? airMiles(i.pos, nextLL) : null;
    const etaMs = here ? i.nowMs : i.pos && nextLL ? i.nowMs + remainingDriveMin(i.pos, [nextLL]) * 60000 : null;
    next = { label: label(nextNode), miles: miles == null ? null : Math.round(miles), etaMs, here };
  }
  let last: TruckTripSummary["last"] = null;
  const lastNode = ahead[ahead.length - 1];
  if (nextNode && lastNode && lastNode.key !== nextNode.key && i.pos) {
    const lls = ahead.map((n) => llOf(n.key));
    const dwell = ahead.slice(0, -1).reduce((m, n) => m + (n.kind === "pickup" ? LOAD_STOP_MIN : DROP_STOP_MIN), 0);
    if (lls.some((x) => x)) last = { label: label(lastNode), etaMs: i.nowMs + (remainingDriveMin(i.pos, lls) + dwell) * 60000 };
  }
  return { status: route.status, next, last, products };
}
