// lib/dispatch/forecast.ts
//
// Dispatch timeline: when a planned load will reach the terminal, finish
// loading, reach the store and finish the drop, forecast from the company's own
// trip history. Times of day matter, so each leg is estimated from past trips
// at a similar hour (and weekday/weekend, and season) when there are enough;
// otherwise from all of them; otherwise from distance. Pure.

import { airMiles, type LatLon } from "../trips/deliveryLocations.ts";

export type HistTrip = {
  driver_id: string;
  started_at: string | null;
  pickups: { terminal_id: string | null; arrived_at: string | null; left_at: string | null; outcome: string | null; seq: number }[];
  deliveries: { location_id: string | null; arrived_at: string | null; left_at: string | null; seq: number }[];
};

export type Basis = { kind: "history" | "distance" | "default"; n: number; note: string };
export type SegKey = "to_terminal" | "gauging" | "loading" | "to_delivery" | "drop";
export type Seg = { key: SegKey; label: string; startMs: number; endMs: number; minutes: number; basis: Basis | null };
export type Flag = { kind: "gauging" | "shift" | "dot14" | "driving" | "estimate"; severity: "info" | "warn" | "bad"; text: string };

export type TimelineSettings = { maxShiftHours: number; gaugingCutoff: string; gaugingMinutes: number };
export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = { maxShiftHours: 12, gaugingCutoff: "00:00", gaugingMinutes: 60 };

const MIN = 60000;
const DEFAULTS = { to_terminal: 30, loading: 60, to_delivery: 60, drop: 45 };

// ── time of day ─────────────────────────────────────────────────────────────
export function localParts(ms: number, tz?: string | null): { minuteOfDay: number; dow: number; month: number; dateKey: string } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { minuteOfDay: Number(p.hour) * 60 + Number(p.minute), dow, month: Number(p.month), dateKey: `${p.year}-${p.month}-${p.day}` };
}
const weekend = (dow: number) => dow === 0 || dow === 6;
const hourGap = (a: number, b: number) => { const d = Math.abs(a - b) % 1440; return Math.min(d, 1440 - d); };
const monthGap = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, 12 - d); };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Sample = { atMs: number; minutes: number };

/** Median of the samples most like the planned moment: same hour (+-2h) and
 *  weekday/weekend and season (+-1 month) if at least 3; else drop the season;
 *  else all; else whatever few exist. */
export function pickMinutes(samples: Sample[], whenMs: number, tz?: string | null): { minutes: number; n: number; stage: "similar" | "hour" | "all" | "few" } | null {
  if (samples.length === 0) return null;
  const w = localParts(whenMs, tz);
  const tagged = samples.map((s) => ({ ...s, p: localParts(s.atMs, tz) }));
  const hour = tagged.filter((s) => hourGap(s.p.minuteOfDay, w.minuteOfDay) <= 120 && weekend(s.p.dow) === weekend(w.dow));
  const similar = hour.filter((s) => monthGap(s.p.month, w.month) <= 1);
  if (similar.length >= 3) return { minutes: median(similar.map((s) => s.minutes)), n: similar.length, stage: "similar" };
  if (hour.length >= 3) return { minutes: median(hour.map((s) => s.minutes)), n: hour.length, stage: "hour" };
  if (samples.length >= 3) return { minutes: median(samples.map((s) => s.minutes)), n: samples.length, stage: "all" };
  return { minutes: median(samples.map((s) => s.minutes)), n: samples.length, stage: "few" };
}

// ── samples from history ────────────────────────────────────────────────────
const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
const mins = (a: string | null, b: string | null) => (ms(b) - ms(a)) / MIN;
const ok = (m: number, lo: number, hi: number) => Number.isFinite(m) && m >= lo && m <= hi;

export function loadingSamples(h: HistTrip[], terminalId: string): Sample[] {
  const out: Sample[] = [];
  for (const t of h) for (const p of t.pickups) {
    if (p.terminal_id !== terminalId || p.outcome === "no_load") continue;
    const m = mins(p.arrived_at, p.left_at);
    if (ok(m, 10, 360)) out.push({ atMs: ms(p.arrived_at), minutes: m });
  }
  return out;
}
export function toTerminalSamples(h: HistTrip[], terminalId: string): Sample[] {
  const out: Sample[] = [];
  for (const t of h) {
    const first = [...t.pickups].sort((a, b) => a.seq - b.seq)[0];
    if (!first || first.terminal_id !== terminalId) continue;
    const m = mins(t.started_at, first.arrived_at);
    if (ok(m, 5, 600)) out.push({ atMs: ms(t.started_at), minutes: m });
  }
  return out;
}
export function toDeliverySamples(h: HistTrip[], terminalId: string, locationId: string): Sample[] {
  const out: Sample[] = [];
  for (const t of h) {
    const loaded = t.pickups.filter((p) => p.outcome !== "no_load" && p.left_at).sort((a, b) => a.seq - b.seq);
    const last = loaded[loaded.length - 1];
    const d = [...t.deliveries].sort((a, b) => a.seq - b.seq)[0];
    if (!last || last.terminal_id !== terminalId || !d || d.location_id !== locationId) continue;
    const m = mins(last.left_at, d.arrived_at);
    if (ok(m, 5, 900)) out.push({ atMs: ms(last.left_at), minutes: m });
  }
  return out;
}
export function dropSamples(h: HistTrip[], locationId: string): Sample[] {
  const out: Sample[] = [];
  for (const t of h) for (const d of t.deliveries) {
    if (d.location_id !== locationId) continue;
    const m = mins(d.arrived_at, d.left_at);
    if (ok(m, 5, 240)) out.push({ atMs: ms(d.arrived_at), minutes: m });
  }
  return out;
}

/** A driver's usual start of day (local minutes after midnight): the median
 *  first-trip start over recent days, or null with fewer than 3 days. */
export function typicalStartMinutes(h: HistTrip[], driverId: string, tz?: string | null): number | null {
  const firstByDay = new Map<string, number>();
  for (const t of h) {
    if (t.driver_id !== driverId || !t.started_at) continue;
    const p = localParts(ms(t.started_at), tz);
    const prev = firstByDay.get(p.dateKey);
    if (prev == null || p.minuteOfDay < prev) firstByDay.set(p.dateKey, p.minuteOfDay);
  }
  return firstByDay.size >= 3 ? Math.round(median([...firstByDay.values()])) : null;
}

// ── distance fallback ───────────────────────────────────────────────────────
export function driveMinutesByDistance(a: LatLon, b: LatLon): number {
  return Math.max(10, Math.round((airMiles(a, b) * 1.25 / 45) * 60));
}

function basisFor(pick: ReturnType<typeof pickMinutes>): Basis {
  if (!pick) return { kind: "default", n: 0, note: "no history, standard allowance" };
  const when = pick.stage === "similar" ? "similar hour and season" : pick.stage === "hour" ? "similar hour" : pick.stage === "all" ? "all times of day" : "very few trips";
  return { kind: "history", n: pick.n, note: `${pick.n} past trip${pick.n === 1 ? "" : "s"}, ${when}` };
}

const parseHM = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

export type ForecastInput = {
  startMs: number;
  startFrom: LatLon | null;            // a chained load starts where the last one dropped
  terminal: { id: string; name: string; tz: string | null; ll: LatLon | null };
  location: { id: string; name: string; ll: LatLon | null };
  history: HistTrip[];
  settings?: TimelineSettings;
  dutyStartMs?: number;                // start of the driver's day (default: this load's start)
  drivingMinSoFar?: number;            // drive time already used earlier in the day
};

export type Forecast = { segments: Seg[]; endMs: number; driveMinutes: number; flags: Flag[] };

export function forecastLoad(i: ForecastInput): Forecast {
  const set = i.settings ?? DEFAULT_TIMELINE_SETTINGS;
  const segs: Seg[] = [];
  const push = (key: SegKey, label: string, startMs: number, minutes: number, basis: Basis | null): number => {
    const endMs = startMs + Math.round(minutes * MIN);
    segs.push({ key, label, startMs, endMs, minutes: Math.round(minutes), basis });
    return endMs;
  };

  // Start -> terminal
  let toTerm: { minutes: number; basis: Basis };
  if (i.startFrom && i.terminal.ll) {
    toTerm = { minutes: driveMinutesByDistance(i.startFrom, i.terminal.ll), basis: { kind: "distance", n: 0, note: "estimated from distance" } };
  } else {
    const p = pickMinutes(toTerminalSamples(i.history, i.terminal.id), i.startMs, i.terminal.tz);
    toTerm = { minutes: p?.minutes ?? DEFAULTS.to_terminal, basis: basisFor(p) };
  }
  let t = push("to_terminal", `Drive to ${i.terminal.name}`, i.startMs, toTerm.minutes, toTerm.basis);
  const arriveTerminalMs = t;

  // Loading, held back if it runs into the terminal's gauging window.
  const lp = pickMinutes(loadingSamples(i.history, i.terminal.id), t, i.terminal.tz);
  const loadMin = lp?.minutes ?? DEFAULTS.loading;
  const flags: Flag[] = [];
  const cutoff = parseHM(set.gaugingCutoff);
  const a = localParts(t, i.terminal.tz).minuteOfDay;
  const d = ((a - cutoff + 720 + 1440) % 1440) - 720; // minutes after the cutoff (negative = before)
  if (set.gaugingMinutes > 0 && d >= -loadMin && d < set.gaugingMinutes) {
    const delay = set.gaugingMinutes - d;
    t = push("gauging", "Terminal gauging", t, delay, { kind: "default", n: 0, note: `terminal gauges at ${set.gaugingCutoff === "00:00" ? "midnight" : set.gaugingCutoff} for ${set.gaugingMinutes} min` });
    flags.push({ kind: "gauging", severity: "warn", text: `Arrives about ${clock(arriveTerminalMs, i.terminal.tz)}, near gauging. Loading would start about ${clock(t, i.terminal.tz)} (${Math.round(delay)} min later).` });
  }
  t = push("loading", `Load at ${i.terminal.name}`, t, loadMin, basisFor(lp));

  // Terminal -> store
  let toDel: { minutes: number; basis: Basis };
  const dp = pickMinutes(toDeliverySamples(i.history, i.terminal.id, i.location.id), t, i.terminal.tz);
  if (dp) toDel = { minutes: dp.minutes, basis: basisFor(dp) };
  else if (i.terminal.ll && i.location.ll) toDel = { minutes: driveMinutesByDistance(i.terminal.ll, i.location.ll), basis: { kind: "distance", n: 0, note: "estimated from distance" } };
  else toDel = { minutes: DEFAULTS.to_delivery, basis: basisFor(null) };
  t = push("to_delivery", `Drive to ${i.location.name}`, t, toDel.minutes, toDel.basis);

  // Drop
  const dr = pickMinutes(dropSamples(i.history, i.location.id), t, null);
  t = push("drop", `Deliver at ${i.location.name}`, t, dr?.minutes ?? DEFAULTS.drop, basisFor(dr));

  const driveMinutes = toTerm.minutes + toDel.minutes;
  const duty = i.dutyStartMs ?? i.startMs;
  const shiftH = (t - duty) / 3600000;
  if (shiftH > 14) flags.push({ kind: "dot14", severity: "bad", text: `Delivery finishes ${shiftH.toFixed(1)} h into the day, past the 14-hour driving window.` });
  else if (shiftH > set.maxShiftHours) flags.push({ kind: "shift", severity: "warn", text: `Delivery finishes ${shiftH.toFixed(1)} h into the day (company limit ${set.maxShiftHours} h).` });
  const driveH = ((i.drivingMinSoFar ?? 0) + driveMinutes) / 60;
  if (driveH > 11) flags.push({ kind: "driving", severity: "bad", text: `${driveH.toFixed(1)} h of driving today, past the 11-hour limit.` });
  if (segs.some((s) => s.basis && s.basis.kind !== "history")) {
    flags.push({ kind: "estimate", severity: "info", text: "Some legs are estimates (distance or a standard allowance); they sharpen as trips are completed." });
  }
  return { segments: segs, endMs: t, driveMinutes, flags };
}

export function clock(ms: number, tz?: string | null): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}
export function durationText(minutes: number): string {
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
