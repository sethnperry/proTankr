// lib/telematics/geofence.ts
//
// Arrival detection by geofence. Catalog coordinates are often only city-level,
// so the center is learned: the median of where trucks were when drivers tapped
// Arrive. With two or more such points the fence is tight; before that it falls
// back to the catalog point with a wide radius. Pure.

import { airMiles, type LatLon } from "../trips/deliveryLocations.ts";

export type Fence = { center: LatLon; radiusMi: number; learned: boolean };

export const LEARNED_RADIUS_MI = 0.3;
export const FALLBACK_RADIUS_MI = 0.6;
export const STOPPED_MPH = 8;
export const CONFIRM_MS = 50_000; // inside and stopped on two readings at least this far apart

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function fenceFor(points: LatLon[], catalog: LatLon | null): Fence | null {
  if (points.length >= 2) {
    return { center: { lat: median(points.map((p) => p.lat)), lon: median(points.map((p) => p.lon)) }, radiusMi: LEARNED_RADIUS_MI, learned: true };
  }
  return catalog ? { center: catalog, radiusMi: FALLBACK_RADIUS_MI, learned: false } : null;
}

export const inside = (p: LatLon, f: Fence) => airMiles(p, f.center) <= f.radiusMi;

/** A truck only counts as having left a stop once it is at least this far from where it sat there. */
export const DEPART_MIN_MI = 0.25;

/** Still at the stop: inside the fence, or less than DEPART_MIN_MI from where the truck sat when watching began
 * (moving the truck within a rack or yard is not leaving). */
export const stillAtStop = (p: LatLon, f: Fence, anchor: LatLon | null) =>
  inside(p, f) || (anchor != null && airMiles(p, anchor) < DEPART_MIN_MI);

/** A point is worth keeping only if it's near where the catalog says the stop
 * is (or there's no catalog point): a driver who tapped Arrive far too early
 * would otherwise teach us a wrong center. */
export function plausiblePoint(p: LatLon, catalog: LatLon | null, maxMi = 5): boolean {
  return !catalog || airMiles(p, catalog) <= maxMi;
}

export type Watch = { sinceMs: number | null; confirmedAtMs: number | null };
export const NEW_WATCH: Watch = { sinceMs: null, confirmedAtMs: null };

/** Feed one reading. `confirmedAtMs` is set (to when the truck first came to
 * rest inside the fence) once it has stayed inside and stopped across readings
 * CONFIRM_MS apart. Leaving the fence or moving resets it. */
export function stepWatch(w: Watch, o: { inside: boolean; speedMph: number | null; nowMs: number }): Watch {
  const stopped = o.speedMph == null || o.speedMph < STOPPED_MPH;
  if (!o.inside || !stopped) return NEW_WATCH;
  const since = w.sinceMs ?? o.nowMs;
  const confirmed = w.confirmedAtMs ?? (o.nowMs - since >= CONFIRM_MS ? since : null);
  return { sinceMs: since, confirmedAtMs: confirmed };
}

export type ExitWatch = { outsideSinceMs: number | null; confirmedAtMs: number | null };
export const NEW_EXIT: ExitWatch = { outsideSinceMs: null, confirmedAtMs: null };

/** Departure: the truck is outside the fence and moving on readings CONFIRM_MS
 * apart. `confirmedAtMs` is when it first left. Coming back inside resets it. */
export function stepExit(w: ExitWatch, o: { inside: boolean; speedMph: number | null; nowMs: number }): ExitWatch {
  if (o.inside) return NEW_EXIT;
  if (w.confirmedAtMs != null) return w;
  const moving = o.speedMph != null && o.speedMph >= STOPPED_MPH;
  const since = w.outsideSinceMs ?? o.nowMs;
  if (!moving && w.outsideSinceMs == null) return w; // just outside, not moving yet: wait
  return { outsideSinceMs: since, confirmedAtMs: o.nowMs - since >= CONFIRM_MS ? since : null };
}
