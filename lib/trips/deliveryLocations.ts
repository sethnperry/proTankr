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
  // The county (or borough), looked up from the coordinates (20261029030000). Optional: missing before that migration.
  county?: string | null;
  // One of the company's regions (20261022010000). Optional: missing before that migration.
  region?: string | null;
  // One of that region's local areas (20261031000000). Optional: missing before that migration.
  local_area?: string | null;
  lat: number | null;
  lon: number | null;
  delivery_type: DeliveryType;
  notes: string | null;
  // Feet (20261019000000). Optional: missing before that migration.
  is_active?: boolean;
  starred: boolean;
};

export type LocationTank = {
  tank_id: string;
  location_id: string;
  tank_number: string;
  product_id: string | null;
  capacity_gallons: number | null;
  hose_length_ft?: number | null;
  sort_order?: number | null;
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

// ── City-grouped picker (matches the terminal picker) ─────────────────────

export type LocationCity = { city: string; state: string; key: string; count: number };

export function cityKeyOf(l: Pick<DeliveryLocation, "city" | "state">): string {
  return `${(l.city ?? "").trim().toLowerCase()}|${(l.state ?? "").trim().toUpperCase()}`;
}

// Every city with an active location, alphabetical. A location with no city
// falls in a "" city (shown as "No city").
export function locationCities(locations: DeliveryLocation[]): LocationCity[] {
  const map = new Map<string, LocationCity>();
  for (const l of locations) {
    if (l.is_active === false) continue;
    const key = cityKeyOf(l);
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { city: (l.city ?? "").trim(), state: (l.state ?? "").trim().toUpperCase(), key, count: 1 });
  }
  return [...map.values()].sort((a, b) =>
    Number(a.city === "") - Number(b.city === "") || a.city.localeCompare(b.city) || a.state.localeCompare(b.state));
}

// Store number (numeric-aware), then name. Locations without a number last.
export function byNumberThenName(a: Pick<DeliveryLocation, "location_number" | "name">, b: Pick<DeliveryLocation, "location_number" | "name">): number {
  const an = (a.location_number ?? "").trim();
  const bn = (b.location_number ?? "").trim();
  if (an && !bn) return -1;
  if (!an && bn) return 1;
  if (an && bn) {
    const c = an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
    if (c) return c;
  }
  return a.name.localeCompare(b.name);
}

// One city's locations, starred first, each group by number then name.
export function locationsInCity(locations: DeliveryLocation[], key: string): { starred: DeliveryLocation[]; others: DeliveryLocation[] } {
  const inCity = locations.filter((l) => l.is_active !== false && cityKeyOf(l) === key);
  return {
    starred: inCity.filter((l) => l.starred).sort(byNumberThenName),
    others: inCity.filter((l) => !l.starred).sort(byNumberThenName),
  };
}

// Which city the picker opens on: the selected location's, else the
// nearest location to the pickup, else a starred location's, else the first.
export function defaultLocationCity(
  locations: DeliveryLocation[],
  opts: { selectedId?: string | null; origin?: LatLon | null },
): string | null {
  const active = locations.filter((l) => l.is_active !== false);
  if (active.length === 0) return null;
  const sel = opts.selectedId ? active.find((l) => l.location_id === opts.selectedId) : null;
  if (sel) return cityKeyOf(sel);
  if (opts.origin) {
    let best: { l: DeliveryLocation; d: number } | null = null;
    for (const l of active) {
      if (!hasCoords(l)) continue;
      const d = airMiles(opts.origin, l);
      if (!best || d < best.d) best = { l, d };
    }
    if (best) return cityKeyOf(best.l);
  }
  return cityKeyOf(active.find((l) => l.starred) ?? active[0]);
}

/** The region a delivery location is in: the one set on it, else the region
 *  most of the company's other locations in the same city (then state) have. */
export function destinationRegion(loc: DeliveryLocation | null | undefined, all: DeliveryLocation[]): string | null {
  if (!loc) return null;
  const own = loc.region?.trim();
  if (own) return own;
  const norm = (x: string | null | undefined) => (x ?? "").trim().toLowerCase();
  const pick = (pool: DeliveryLocation[]) => {
    const n = new Map<string, number>();
    for (const l of pool) { const r = l.region?.trim(); if (r) n.set(r, (n.get(r) ?? 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const others = all.filter((l) => l.location_id !== loc.location_id && norm(l.state) === norm(loc.state));
  return pick(others.filter((l) => norm(l.city) === norm(loc.city))) ?? pick(others);
}

// ── Browse mode (dispatch): filter by region / local area / city, or search ──

export type BrowseFilter = { region: string; area: string; cityKey: string; query: string };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// Starred locations always lead, whatever the filters say. A search looks across
// every location instead of the filters. Each group by store number, then name.
export function browseLocations(locations: DeliveryLocation[], f: BrowseFilter): { starred: DeliveryLocation[]; others: DeliveryLocation[] } {
  const live = locations.filter((l) => l.is_active !== false);
  const q = norm(f.query);
  const starred = live.filter((l) => l.starred).sort(byNumberThenName);
  let others: DeliveryLocation[];
  if (q) {
    const hit = (l: DeliveryLocation) => [l.location_number, l.name, l.city, l.address].some((x) => norm(x).includes(q));
    return { starred: starred.filter(hit), others: live.filter((l) => !l.starred && hit(l)).sort(byNumberThenName) };
  }
  others = live.filter((l) => !l.starred
    && (!f.region || norm(l.region) === norm(f.region))
    && (!f.area || norm(l.local_area) === norm(f.area))
    && (!f.cityKey || cityKeyOf(l) === f.cityKey)).sort(byNumberThenName);
  return { starred, others };
}

// Options for the filter row, narrowed by the filters chosen above them.
export function browseOptions(locations: DeliveryLocation[], f: Pick<BrowseFilter, "region" | "area">): { regions: string[]; areas: string[]; cities: LocationCity[] } {
  const live = locations.filter((l) => l.is_active !== false);
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const inRegion = live.filter((l) => !f.region || norm(l.region) === norm(f.region));
  const inArea = inRegion.filter((l) => !f.area || norm(l.local_area) === norm(f.area));
  return { regions: uniq(live.map((l) => l.region)), areas: uniq(inRegion.map((l) => l.local_area)), cities: locationCities(inArea) };
}
