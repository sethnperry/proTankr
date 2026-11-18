// lib/recap/laneStats.ts
//
// Lane statistics shared across companies. A lane is "from here to there": terminal -> store (place level) or
// city -> city (city level). Each completed leg adds its minutes (and its road miles when an odometer reading was
// taken at both ends) to the lane's running average, so a lane nobody at this company has driven much can still get a
// sensible standard from trips run elsewhere. Only the city level is truly shared: store and terminal ids belong to the
// company that saved them. Pure functions here; the database side is in laneServer.ts.

import type { RecapSpan, RecapTrip, SegType } from "./types.ts";

export const MIN_LANE_TRIPS = 3;
const MIN_LEG_MIN = 3, MAX_LEG_MIN = 6 * 60, MAX_LEG_MILES = 1500;

export type LaneKind = "loaded" | "empty";
export type LaneLevel = "place" | "city";
export type LaneStat = { level: LaneLevel; key: string; kind: LaneKind; trips: number; meanMin: number; sdMin: number; miles: number | null; milesN: number };

export type LaneLeg = {
  legId: string; kind: LaneKind;
  fromKey: string; toKey: string; fromLabel: string; toLabel: string;
  fromCity: string | null; toCity: string | null;
  minutes: number; miles: number | null;
};

/** "tampa|fl" from a city and state; null when either is missing. */
export function cityKey(city: string | null | undefined, state: string | null | undefined): string | null {
  const c = (city ?? "").trim().toLowerCase().replace(/\s+/g, " "), s = (state ?? "").trim().toLowerCase();
  return c && s ? `${c}|${s}` : null;
}
export const laneKey = (from: string, to: string) => `${from}>${to}`;
export const laneKindOf = (t: SegType | string): LaneKind | null => (t === "loaded_leg" ? "loaded" : t === "empty_leg" ? "empty" : null);

type StopInfo = { name: string; city: string | null };

/** The usable legs of a trip: stop to stop, nothing in between that split the time (a fuel stop, an empty move). */
export function extractLaneLegs(trip: RecapTrip, spans: RecapSpan[], stopInfo: (key: string) => StopInfo): LaneLeg[] {
  const ms = (s: string | null) => (s ? Date.parse(s) : NaN);
  type Stop = { kind: "rack" | "drop"; key: string; id: string; at: number; left: number; odo: number | null };
  const stops: Stop[] = [];
  for (const p of trip.pickups) {
    const at = ms(p.arrivedAt), left = ms(p.leftAt);
    if (Number.isFinite(at)) stops.push({ kind: "rack", key: `t:${p.terminalId ?? p.pickupId}`, id: p.pickupId, at, left: Number.isFinite(left) ? left : at, odo: p.odometer ?? null });
  }
  for (const d of trip.deliveries) {
    const at = ms(d.arrivedAt), left = ms(d.leftAt);
    if (Number.isFinite(at)) stops.push({ kind: "drop", key: `l:${d.locationId ?? d.deliveryId}`, id: d.deliveryId, at, left: Number.isFinite(left) ? left : at, odo: d.odometer ?? null });
  }
  stops.sort((a, b) => a.at - b.at);
  const mine = spans.filter((s) => s.userId === trip.userId).map((s) => [Date.parse(s.from), Date.parse(s.to)] as const);
  const out: LaneLeg[] = [];
  let loaded = false;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i], prev = i > 0 ? stops[i - 1] : null;
    if (prev) {
      const lastLeft = prev.left;
      const delay = trip.delays.filter((d) => (d.leg === "to_rack" || d.leg === "to_drop") && (d.pickupId === s.id || d.deliveryId === s.id)).reduce((n, d) => n + d.minutes, 0);
      const minutes = (s.at - lastLeft) / 60_000 - delay;
      const split = mine.some(([a, b]) => a < s.at && b > lastLeft);
      if (!split && minutes >= MIN_LEG_MIN && minutes <= MAX_LEG_MIN) {
        let miles: number | null = prev.odo != null && s.odo != null ? s.odo - prev.odo : null;
        if (miles != null) {
          const mph = miles / (minutes / 60);
          if (!(miles > 0 && miles <= MAX_LEG_MILES && mph >= 10 && mph <= 80)) miles = null;
        }
        const a = stopInfo(prev.key), b = stopInfo(s.key);
        out.push({ legId: `${trip.tripId}|${i}`, kind: loaded ? "loaded" : "empty", fromKey: prev.key, toKey: s.key, fromLabel: a.name, toLabel: b.name, fromCity: a.city, toCity: b.city, minutes, miles });
      }
    }
    if (s.kind === "rack") {
      const p = trip.pickups.find((x) => x.pickupId === s.id);
      if (p && p.outcome !== "no_load") loaded = true;
    }
  }
  return out;
}

export type LaneBook = {
  /** "level|kind|laneKey" -> stat */
  stats: Map<string, LaneStat>;
  /** Stop key ("t:<id>" / "l:<id>") -> its city key, so a place lane can fall back to its city lane. */
  cityOf: (stopKey: string | null) => string | null;
};
export const statKey = (level: LaneLevel, kind: LaneKind, key: string) => `${level}|${kind}|${key}`;

export type LaneHit = { minutes: number; scope: LaneLevel; trips: number };

/** The best lane estimate for a leg: the exact place pair if it has enough trips, else its city pair. */
export function lookupLane(book: LaneBook | undefined, type: SegType, fromKey: string | null, toKey: string | null): LaneHit | null {
  const kind = laneKindOf(type);
  if (!book || !kind || !fromKey || !toKey) return null;
  const place = book.stats.get(statKey("place", kind, laneKey(fromKey, toKey)));
  if (place && place.trips >= MIN_LANE_TRIPS) return { minutes: place.meanMin, scope: "place", trips: place.trips };
  const a = book.cityOf(fromKey), b = book.cityOf(toKey);
  if (a && b) {
    const city = book.stats.get(statKey("city", kind, laneKey(a, b)));
    if (city && city.trips >= MIN_LANE_TRIPS) return { minutes: city.meanMin, scope: "city", trips: city.trips };
  }
  return null;
}

/** The lane keys a set of legs needs looked up (both levels). */
export function laneKeysFor(legs: { fromKey: string; toKey: string; fromCity: string | null; toCity: string | null }[]): { place: string[]; city: string[] } {
  const place = new Set<string>(), city = new Set<string>();
  for (const l of legs) {
    place.add(laneKey(l.fromKey, l.toKey));
    if (l.fromCity && l.toCity) city.add(laneKey(l.fromCity, l.toCity));
  }
  return { place: [...place], city: [...city] };
}
