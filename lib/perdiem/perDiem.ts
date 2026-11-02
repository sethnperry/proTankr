// lib/perdiem/perDiem.ts
//
// Per diem, the rules only: which days were away from home base, what to suggest for each, and how the driver's
// list reads. The source ladder is Geotab (the truck's GPS), then the app (cities on the driver's trips), then
// the driver telling us. Every suggestion is only a suggestion; the driver claims the day. Pure.

import { addDays, localDateOf, localMidnightMs } from "../worklog/time.ts";

export type Source = "geotab" | "app" | "manual";
export type Home = { city: string; state: string; lat: number | null; lon: number | null; radiusMiles: number };
export type Point = { lat: number; lon: number; at: string };

const R_MI = 3958.8;
export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The last `n` local days ending today, newest first. */
export function recentDays(nowMs: number, tz: string, n: number): string[] {
  const today = localDateOf(nowMs, tz);
  return Array.from({ length: n }, (_, i) => addDays(today, -i));
}

/** ISO bounds of one local day. */
export function dayBounds(day: string, tz: string): { fromIso: string; toIso: string } {
  return { fromIso: new Date(localMidnightMs(day, tz)).toISOString(), toIso: new Date(localMidnightMs(addDays(day, 1), tz)).toISOString() };
}

export type GpsDay = { away: boolean; farthestMi: number; last: Point | null; farthest: Point | null };

/** Was the truck beyond the home radius at any point in the day? Where it ended the day is the place to suggest. */
export function classifyTrail(trail: Point[], home: { lat: number; lon: number; radiusMiles: number }): GpsDay {
  let farthestMi = 0;
  let farthest: Point | null = null;
  for (const p of trail) {
    const d = miles(home, p);
    if (d > farthestMi) { farthestMi = d; farthest = p; }
  }
  const last = trail.length ? trail[trail.length - 1] : null;
  return { away: farthestMi > home.radiusMiles, farthestMi: Math.round(farthestMi), last, farthest };
}

export type TripStop = { city: string | null; state: string | null; at: string | null };
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Without GPS: the day was away if a stop was in a city other than home; suggest where the last stop of the day was. */
export function classifyStops(stops: TripStop[], home: { city: string; state: string }): { away: boolean; city: string | null; state: string | null } {
  const known = stops.filter((s) => s.city && s.at).sort((a, b) => (a.at as string).localeCompare(b.at as string));
  const away = known.filter((s) => !(norm(s.city) === norm(home.city) && norm(s.state) === norm(home.state)));
  if (!away.length) return { away: false, city: null, state: null };
  const last = away[away.length - 1];
  return { away: true, city: last.city, state: last.state?.toUpperCase() ?? null };
}

export type DaySuggestion = { day: string; away: boolean; city: string | null; state: string | null; source: Source | null; detail: string | null };

export type ClaimedDay = { day: string; city: string; state: string; source: Source; status: "claimed" | "withdrawn" };

export type DayCard =
  | { day: string; kind: "claimed"; city: string; state: string; source: Source }
  | { day: string; kind: "suggested"; city: string | null; state: string | null; source: Source; detail: string | null }
  | { day: string; kind: "home" }
  | { day: string; kind: "unknown" };

/** One card per day for the driver's list: claimed, suggested (away), home, or nothing known. */
export function dayCards(days: string[], claimed: ClaimedDay[], suggestions: DaySuggestion[]): DayCard[] {
  const mine = new Map(claimed.filter((c) => c.status === "claimed").map((c) => [c.day, c]));
  const sug = new Map(suggestions.map((s) => [s.day, s]));
  return days.map((day): DayCard => {
    const c = mine.get(day);
    if (c) return { day, kind: "claimed", city: c.city, state: c.state, source: c.source };
    const s = sug.get(day);
    if (s?.away) return { day, kind: "suggested", city: s.city, state: s.state, source: s.source ?? "app", detail: s.detail };
    if (s && s.source) return { day, kind: "home" };
    return { day, kind: "unknown" };
  });
}

export function claimProblem(city: string, state: string): string | null {
  if (!city.trim()) return "Enter the city.";
  if (!/^[A-Za-z]{2}$/.test(state.trim())) return "Enter the two-letter state or province.";
  return null;
}

export const homeProblem = (city: string, state: string, radius: number): string | null =>
  claimProblem(city, state) ?? (Number.isFinite(radius) && radius >= 5 && radius <= 500 ? null : "Radius must be between 5 and 500 miles.");

export const sourceLabel = (s: Source) => (s === "geotab" ? "From the truck's GPS" : s === "app" ? "From your trips" : "You entered it");

// ── The admin list: days per driver and period ─────────────────────────────────────────────────────────────────
import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";
export type PerDiemRow = { user_id: string; day: string; city: string; state: string; source: Source; status: "claimed" | "withdrawn" };
const mdy = (d: string) => { const [y, m, dd] = d.split("-"); return `${Number(m)}/${Number(dd)}/${y.slice(2)}`; };

export const claimedOnly = (rows: PerDiemRow[]) => rows.filter((r) => r.status === "claimed");

export function perDiemColumns(nameOf: (id: string) => string): ShellColumn<PerDiemRow>[] {
  return [
    { key: "day", label: "Day", get: (r) => mdy(r.day), weight: 0.8 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.user_id), weight: 1.3 },
    { key: "place", label: "Where", get: (r) => `${r.city}, ${r.state}`, weight: 1.5 },
    { key: "source", label: "Source", get: (r) => (r.source === "geotab" ? "GPS" : r.source === "app" ? "Trips" : "Entered"), weight: 0.7 },
  ];
}

export function perDiemFilters(nameOf: (id: string) => string): ShellFilter<PerDiemRow>[] {
  return [
    { id: "driver", label: "Driver", of: (r) => r.user_id, show: nameOf },
    { id: "state", label: "State", of: (r) => r.state.toUpperCase() },
  ];
}

/** Days per driver, for the summary line. */
export function daysPerDriver(rows: PerDiemRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of claimedOnly(rows)) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
  return m;
}
