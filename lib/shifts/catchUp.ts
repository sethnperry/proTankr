// lib/shifts/catchUp.ts
//
// The end-of-shift catch-up: what the truck did that the app has no record of. Drives and trailer drops come from
// the tracker; anything a trip, an existing empty move or a fuel stop already covers is left out. Pure.

import type { Drive } from "./trailStops.ts";
import { miles } from "./trailStops.ts";

export type TrailerEv = { type: "hook" | "drop"; at: string; trailerId: string; trailerName: string; lat: number | null; lon: number | null };
export type Place = { id: string; name: string; lat: number | null; lon: number | null; kinds: string[] };
export type Window = { from: string; to: string };

export type LegKind = "empty_return" | "bobtail" | "reposition" | "personal" | "part_of_trip";
export type DropWhere = "maintenance" | "available" | "customer";

export type LegCard = {
  type: "leg"; id: string; startAt: string; endAt: string; minutes: number; miles: number;
  fromLabel: string; toLabel: string; fromPlaceId: string | null; toPlaceId: string | null; toLat: number; toLon: number;
  trailerOn: boolean; trailerName: string | null; suggested: LegKind; toKinds: string[];
};
export type DropCard = { type: "drop"; id: string; at: string; trailerId: string; trailerName: string; lat: number | null; lon: number | null; placeId: string | null; placeLabel: string; suggested: DropWhere };
export type HookCard = { type: "hook"; id: string; at: string; trailerId: string; trailerName: string; placeLabel: string };
export type CatchUpCard = LegCard | DropCard | HookCard;

export const NEAR_PLACE_MI = 0.3;
export function nearestPlace(lat: number | null, lon: number | null, places: Place[]): Place | null {
  if (lat == null || lon == null) return null;
  let best: Place | null = null, bd = NEAR_PLACE_MI;
  for (const p of places) {
    if (p.lat == null || p.lon == null) continue;
    const d = miles({ lat, lon }, { lat: p.lat, lon: p.lon });
    if (d <= bd) { bd = d; best = p; }
  }
  return best;
}
const coordLabel = (lat: number | null, lon: number | null) => (lat == null || lon == null ? "an unknown place" : `${lat.toFixed(3)}, ${lon.toFixed(3)}`);
const ms = (iso: string) => Date.parse(iso);

/** How much of [a,b] is inside the windows, 0..1. */
export function coveredShare(a: number, b: number, windows: Window[]): number {
  const len = b - a;
  if (len <= 0) return 1;
  let covered = 0;
  const spans = windows.map((w) => [Math.max(a, ms(w.from)), Math.min(b, ms(w.to))] as const).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]);
  let cursor = a;
  for (const [x, y] of spans) { const lo = Math.max(x, cursor); if (y > lo) { covered += y - lo; cursor = y; } }
  return covered / len;
}

/**
 * `accounted` are the windows the app already knows (trip pickup arrive to delivery leave, empty moves, fuel stops).
 * `trailerAtStart` is whether a trailer was hooked when the window began (null when unknown).
 */
export function buildCatchUp(o: { drives: Drive[]; events: TrailerEv[]; accounted: Window[]; places: Place[]; trailerAtStart: boolean | null; minMiles?: number; minMinutes?: number }): CatchUpCard[] {
  const minMi = o.minMiles ?? 0.5, minMin = o.minMinutes ?? 3;
  const events = [...o.events].sort((a, b) => a.at.localeCompare(b.at));
  const trailerOnAt = (t: number): { on: boolean; name: string | null } => {
    let on = o.trailerAtStart ?? false, name: string | null = null;
    for (const e of events) { if (ms(e.at) > t) break; on = e.type === "hook"; name = e.trailerName; }
    return { on, name };
  };
  const cards: CatchUpCard[] = [];
  for (const d of o.drives) {
    if (d.miles < minMi || d.minutes < minMin) continue;
    if (coveredShare(ms(d.startAt), ms(d.endAt), o.accounted) >= 0.6) continue;
    const from = nearestPlace(d.from.lat, d.from.lon, o.places), to = nearestPlace(d.to.lat, d.to.lon, o.places);
    const tr = trailerOnAt((ms(d.startAt) + ms(d.endAt)) / 2);
    cards.push({
      type: "leg", id: `leg:${d.startAt}`, startAt: d.startAt, endAt: d.endAt, minutes: d.minutes, miles: d.miles,
      fromLabel: from?.name ?? coordLabel(d.from.lat, d.from.lon), toLabel: to?.name ?? coordLabel(d.to.lat, d.to.lon),
      fromPlaceId: from?.id ?? null, toPlaceId: to?.id ?? null, toLat: d.to.lat, toLon: d.to.lon,
      trailerOn: tr.on, trailerName: tr.name, suggested: tr.on ? "empty_return" : "bobtail", toKinds: to?.kinds ?? [],
    });
  }
  for (const e of events) {
    // A hook or drop during a trip stop is part of that trip; only ask about the ones outside it.
    const t = ms(e.at);
    if (coveredShare(t - 20 * 60_000, t + 20 * 60_000, o.accounted) >= 0.5) continue;
    const pl = nearestPlace(e.lat, e.lon, o.places);
    const label = pl?.name ?? coordLabel(e.lat, e.lon);
    if (e.type === "drop") {
      const shop = !!pl?.kinds.includes("maintenance");
      cards.push({ type: "drop", id: `drop:${e.at}:${e.trailerId}`, at: e.at, trailerId: e.trailerId, trailerName: e.trailerName, lat: e.lat, lon: e.lon, placeId: pl?.id ?? null, placeLabel: label, suggested: shop ? "maintenance" : pl?.kinds.includes("store") ? "customer" : "available" });
    } else cards.push({ type: "hook", id: `hook:${e.at}:${e.trailerId}`, at: e.at, trailerId: e.trailerId, trailerName: e.trailerName, placeLabel: label });
  }
  return cards.sort((a, b) => (a.type === "leg" ? a.startAt : a.at).localeCompare(b.type === "leg" ? b.startAt : b.at));
}

/** Spread the window's odometer change across the confirmed drives by distance, so each move gets begin and end miles. */
export function allocateOdometer(legs: { id: string; miles: number }[], span: { firstMi: number; lastMi: number } | null, endOdo: number | null): Record<string, { begin: number; end: number }> {
  const total = legs.reduce((s, l) => s + l.miles, 0);
  const out: Record<string, { begin: number; end: number }> = {};
  if (!legs.length) return out;
  const last = endOdo ?? span?.lastMi ?? null;
  if (last == null) return out;
  let cursor = last - total;
  for (const l of legs) { out[l.id] = { begin: Math.round(cursor * 10) / 10, end: Math.round((cursor + l.miles) * 10) / 10 }; cursor += l.miles; }
  return out;
}
