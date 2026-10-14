// lib/trips/dashboardCards.ts
//
// Who else is headed where I'm headed, for the Driver Dashboard's
// conditional cards. Pure: takes the company's live trips (useFleetTrips)
// and returns only what's worth showing, so a card renders nothing when the
// list is empty.

import { activePickup, onBoard, plannedDeliveries } from "./tripFlow.ts";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripPickupRow, TripRow } from "./types.ts";

export type FleetTripLike = {
  trip: TripRow;
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  compLoads: TripCompartmentLoadRow[];
  driverName: string | null;
  truckName: string | null;
  trailerName: string | null;
};

export type HeadingToTerminal = {
  tripId: string;
  driverName: string | null;
  truckName: string | null;
  arrived: boolean;
  // Products picked for the pickup (a second pickup on a partly loaded
  // trailer). Empty when unknown: a driver's plan isn't readable by others.
  productIds: string[];
};

export type HeadingToDelivery = {
  tripId: string;
  driverName: string | null;
  truckName: string | null;
  arrived: boolean;
  aboard: { productId: string | null; gallons: number }[];
};

// Other drivers whose next pickup is this terminal (en route or arrived,
// not yet left).
export function headingToTerminal(trips: FleetTripLike[], terminalId: string | null, myUserId: string | null): HeadingToTerminal[] {
  if (!terminalId) return [];
  const out: HeadingToTerminal[] = [];
  for (const f of trips) {
    if (f.trip.driver_id === myUserId || f.trip.status === "parked") continue;
    const p = activePickup(f.pickups.filter((x) => x.outcome !== "no_load"));
    if (!p || String(p.terminal_id ?? "") !== String(terminalId)) continue;
    out.push({
      tripId: f.trip.trip_id,
      driverName: f.driverName,
      truckName: f.truckName,
      arrived: !!p.arrived_at,
      productIds: [...new Set((p.planned_comps ?? []).map((c) => c.product_id).filter(Boolean))],
    });
  }
  return out.sort((a, b) => Number(b.arrived) - Number(a.arrived));
}

// Other loaded trucks whose next stop is the same delivery location.
export function headingToDelivery(trips: FleetTripLike[], locationId: string | null, myUserId: string | null): HeadingToDelivery[] {
  if (!locationId) return [];
  const out: HeadingToDelivery[] = [];
  for (const f of trips) {
    if (f.trip.driver_id === myUserId || f.trip.status === "parked") continue;
    const next = plannedDeliveries(f.deliveries)[0];
    if (!next || next.location_id !== locationId) continue;
    const loaded = onBoard(f.compLoads);
    if (loaded.length === 0) continue;
    const byProduct = new Map<string | null, number>();
    for (const c of loaded) byProduct.set(c.product_id, (byProduct.get(c.product_id) ?? 0) + Number(c.gross_gallons ?? 0));
    out.push({
      tripId: f.trip.trip_id,
      driverName: f.driverName,
      truckName: f.truckName,
      arrived: !!next.arrived_at,
      aboard: [...byProduct].map(([productId, gallons]) => ({ productId, gallons })),
    });
  }
  return out.sort((a, b) => Number(b.arrived) - Number(a.arrived));
}

// Parked preloaded trailers in the company, newest first. The one on the
// trailer I hold already shows on my own trip card.
export function parkedPreloads(trips: FleetTripLike[], myTrailerId: string | null): FleetTripLike[] {
  return trips
    .filter((f) => f.trip.status === "parked" && f.trip.trailer_id !== myTrailerId && onBoard(f.compLoads).length > 0)
    .sort((a, b) => String(b.trip.parked_at ?? "").localeCompare(String(a.trip.parked_at ?? "")));
}
