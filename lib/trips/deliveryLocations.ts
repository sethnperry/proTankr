// lib/trips/deliveryLocations.ts
//
// Delivery location picker logic (docs/trip-workflow-design.md §4): Near Me
// opens on everything within 150 air miles of the current pickup terminal;
// starred locations always show; search by number, name or city.

import type { DeliveryType } from "./types.ts";

export const NEAR_ME_MILES = 150;

export type DeliveryLocation = {
  location_id: string;
  company_id?: string;
  name: string;
  location_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
  lat: number | null;
  lon: number | null;
  delivery_type: DeliveryType;
  notes: string | null;
  is_active?: boolean;
  starred: boolean;
};

export type LocationTank = {
  tank_id: string;
  location_id: string;
  tank_number: string;
  product_id: string | null;
  capacity_gallons: number | null;
  is_active: boolean;
};

export type LatLon = { lat: number; lon: number };

// Great-circle distance, statute miles.
export function airMiles(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function hasCoords(l: { lat: number | null; lon: number | null }): l is { lat: number; lon: number } {
  return l.lat != null && l.lon != null && Number.isFinite(l.lat) && Number.isFinite(l.lon);
}

export type PickedLocation = DeliveryLocation & { miles: number | null };

// The picker's list. `nearMe` with an origin keeps locations within the
// radius plus every starred one; a location with no coordinates only shows in
// Near Me when starred. Search (number, name, city) applies to both modes.
// Starred first, then nearest, then name.
export function filterLocations(
  locations: DeliveryLocation[],
  opts: { origin: LatLon | null; nearMe: boolean; query: string; radiusMiles?: number },
): PickedLocation[] {
  const radius = opts.radiusMiles ?? NEAR_ME_MILES;
  const q = opts.query.trim().toLowerCase();
  const out: PickedLocation[] = [];
  for (const l of locations) {
    if (l.is_active === false) continue;
    const miles = opts.origin && hasCoords(l) ? airMiles(opts.origin, l) : null;
    if (opts.nearMe && opts.origin && !l.starred && (miles == null || miles > radius)) continue;
    if (q) {
      const hay = [l.location_number, l.name, l.city].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push({ ...l, miles });
  }
  out.sort((a, b) =>
    Number(b.starred) - Number(a.starred)
    || (a.miles ?? Infinity) - (b.miles ?? Infinity)
    || a.name.localeCompare(b.name));
  return out;
}

export function locationTitle(l: Pick<DeliveryLocation, "name" | "location_number">): string {
  return `${l.location_number ? `#${l.location_number} ` : ""}${l.name}`;
}

export function locationPlace(l: Pick<DeliveryLocation, "city" | "state">): string {
  return [l.city, l.state].filter(Boolean).join(", ");
}
