// lib/standby/coverage.ts
//
// What the dispatcher's Standby board draws: who offered which windows, narrowed by region and local area, and how
// many drivers cover each stretch of time against what a market wants. Pure.

export type SignupLite = { signup_id: string; user_id: string; start_at: string; end_at: string; withdrawn_at?: string | null };
export type DriverLite = { user_id: string; name: string; region: string | null; local_area: string | null };
export type MarketLite = { market_id: string; name: string; local_areas: string[]; required_count: number; is_active: boolean };

export const normArea = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

export type Filter = { region: string | null; areas: Set<string> | null /* normalized; null = every area */ };

export function driverPasses(d: DriverLite | undefined, f: Filter): boolean {
  if (!d) return false;
  if (f.region && normArea(d.region) !== normArea(f.region)) return false;
  if (f.areas && !f.areas.has(normArea(d.local_area))) return false;
  return true;
}

/** Live signups of drivers that pass the filter, still running or in the future, soonest first. */
export function filterSignups(signups: SignupLite[], drivers: Map<string, DriverLite>, f: Filter, nowMs: number): SignupLite[] {
  return signups
    .filter((s) => !s.withdrawn_at && Date.parse(s.end_at) > nowMs && driverPasses(drivers.get(s.user_id), f))
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
}

export type Level = "none" | "empty" | "short" | "full";
export type Bucket = { fromMs: number; count: number; level: Level };

export function levelFor(count: number, required: number | null): Level {
  if (required == null || required <= 0) return "none";
  return count <= 0 ? "empty" : count < required ? "short" : "full";
}

/** Drivers (counted once each) covering any part of each bucket. */
export function coverage(signups: SignupLite[], fromMs: number, hours: number, bucketHours: number, required: number | null): Bucket[] {
  const out: Bucket[] = [];
  const step = bucketHours * 3600_000;
  for (let t = fromMs; t < fromMs + hours * 3600_000; t += step) {
    const who = new Set<string>();
    for (const s of signups) if (Date.parse(s.start_at) < t + step && Date.parse(s.end_at) > t) who.add(s.user_id);
    out.push({ fromMs: t, count: who.size, level: levelFor(who.size, required) });
  }
  return out;
}

/** A bar's left and width as fractions (0..1) of the chart, clipped to it; null when it's outside. */
export function barBox(s: { start_at: string; end_at: string }, fromMs: number, hours: number): { left: number; width: number } | null {
  const span = hours * 3600_000;
  const a = Math.max(Date.parse(s.start_at), fromMs);
  const b = Math.min(Date.parse(s.end_at), fromMs + span);
  if (b <= a) return null;
  return { left: (a - fromMs) / span, width: (b - a) / span };
}

/** Local areas present among the drivers (optionally within a region), sorted, with display names as first seen. */
export function areasOf(drivers: DriverLite[], region: string | null): { key: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const d of drivers) {
    if (!normArea(d.local_area)) continue;
    if (region && normArea(d.region) !== normArea(region)) continue;
    if (!seen.has(normArea(d.local_area))) seen.set(normArea(d.local_area), String(d.local_area).trim());
  }
  return [...seen].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
}
