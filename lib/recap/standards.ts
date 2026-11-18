// lib/recap/standards.ts
//
// What "standard pace" means. Each standard is the median of per-driver medians for a place (or lane) and
// time-of-day bucket, so no one driver sets it and every driver counts equally. A standard needs several distinct
// drivers and no one driver may supply more than a quarter of the samples; otherwise a wider standard is tried,
// then miles divided by average speed, then a plain default.

import type { LatLon, RecapSettings, Segment, SegType } from "./types.ts";
import { airMilesBetween } from "./segments.ts";
import { bucketOf, median } from "./time.ts";
import { lookupLane, type LaneBook } from "./laneStats.ts";

export type StandardRow = { key: string; minutes: number; drivers: number; samples: number };
export type Standards = {
  version: string;
  /** "type|key|bucket" and "type|key" -> row. */
  rows: Map<string, StandardRow>;
  /** How many visits each driver already made to each place ("userId|key"), for the learning allowance. */
  visits: Map<string, number>;
  /** Lane averages shared across companies (an estimate); filled in by the server when the table exists. */
  lanes?: LaneBook;
};

const usable = (g: Segment) => g.type !== "gray" && g.type !== "fuel" && g.key && g.minutes >= 1 && g.minutes < 12 * 60;
const keyOf = (type: SegType, key: string, bucket?: number) => (bucket == null ? `${type}|${key}` : `${type}|${key}|${bucket}`);

/** Medians of driver medians, from a set of past segments (a driver's own history is never what they are held to). */
export function buildStandards(history: Segment[], settings: RecapSettings, version: string): Standards {
  const groups = new Map<string, Map<string, number[]>>();
  const add = (k: string, user: string, m: number) => {
    const g = groups.get(k) ?? new Map<string, number[]>();
    const a = g.get(user) ?? []; a.push(m); g.set(user, a); groups.set(k, g);
  };
  for (const g of history.filter(usable)) {
    add(keyOf(g.type, g.key!, bucketOf(g.hour)), g.userId, g.minutes);
    add(keyOf(g.type, g.key!), g.userId, g.minutes);
  }
  const rows = new Map<string, StandardRow>();
  for (const [k, per] of groups) {
    const drivers = per.size;
    const samples = [...per.values()].reduce((n, a) => n + a.length, 0);
    if (drivers < settings.minDrivers) continue;
    const biggest = Math.max(...[...per.values()].map((a) => a.length));
    if (biggest / samples > settings.maxShare) continue;
    const m = median([...per.values()].map((a) => median(a) as number));
    if (m != null) rows.set(k, { key: k, minutes: m, drivers, samples });
  }
  const visits = new Map<string, number>();
  for (const g of [...history].filter(usable).sort((a, b) => a.startMs - b.startMs)) {
    if (g.type !== "rack" && g.type !== "drop") continue;
    const k = `${g.userId}|${g.key}`;
    visits.set(k, (visits.get(k) ?? 0) + 1);
  }
  return { version, rows, visits };
}

export type StandardFor = { minutes: number; basis: "history" | "history_any_hour" | "network" | "distance" | "default" };

export function standardFor(seg: Segment, std: Standards, settings: RecapSettings, coords: (key: string | null) => LatLon | null, visitIndex: number): StandardFor | null {
  if (seg.type === "gray" || seg.type === "fuel" || !seg.key) return null;
  let found: StandardFor | null = null;
  const exact = std.rows.get(keyOf(seg.type, seg.key, bucketOf(seg.hour)));
  const any = std.rows.get(keyOf(seg.type, seg.key));
  const isLeg = seg.type === "loaded_leg" || seg.type === "empty_leg";
  if (exact) found = { minutes: exact.minutes, basis: "history" };
  else if (any) found = { minutes: any.minutes, basis: "history_any_hour" };
  else if (isLeg) {
    const lane = lookupLane(std.lanes, seg.type, seg.fromKey, seg.toKey);
    const ca = coords(seg.fromKey), cb = coords(seg.toKey);
    if (lane) found = { minutes: Math.max(5, lane.minutes), basis: "network" };
    else if (ca && cb) found = { minutes: Math.max(5, (airMilesBetween(ca, cb) * settings.circuity / settings.avgMph) * 60), basis: "distance" };
    else found = { minutes: settings.defaultLegMin, basis: "default" };
  } else found = { minutes: seg.type === "rack" ? settings.defaultRackMin : settings.defaultDropMin, basis: "default" };
  // A new place gets a more forgiving standard for its first visits.
  if ((seg.type === "rack" || seg.type === "drop") && visitIndex < settings.learningVisits) found = { ...found, minutes: found.minutes * settings.learningMultiplier };
  return found;
}
