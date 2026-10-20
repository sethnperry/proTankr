// lib/dispatch/allocation.ts
//
// Supplier contract limits against what has loaded and what is booked.
// Loaded = a completed pickup on the supplier at the terminal; booked = a
// dispatched load, or a pickup in progress, not yet loaded. A day and a week
// are counted from the contract's reset time and reset day, in the terminal's
// time zone. Warn-only: nothing here blocks a load. Pure.

import { localParts } from "./forecast.ts";

export type AllocContract = {
  supplier_id: string; terminal_id: string;
  limit_basis: "loads" | "gallons"; per_day: number | null; per_week: number | null;
  reset_dow: number; reset_time: string; paused: boolean;
};

export type UsageItem = { kind: "loaded" | "booked"; supplierId: string; terminalId: string; atMs: number; gallons: number | null };

export type RawTrip = {
  status: string; planned_start_at: string | null; started_at: string | null;
  pickups: { pickup_id: string; terminal_id: string | null; supplier_id: string | null; arrived_at: string | null; left_at: string | null; outcome: string | null; seq: number }[];
  compLoads: { pickup_id: string | null; supplier_id: string | null; gross_gallons: number | null; disposition: string | null }[];
};

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function buildUsageItems(trips: RawTrip[]): UsageItem[] {
  const out: UsageItem[] = [];
  for (const t of trips) {
    if (t.status === "cancelled") continue;
    if (t.status === "dispatched") {
      const p = [...t.pickups].sort((a, b) => a.seq - b.seq)[0];
      const at = ms(t.planned_start_at);
      if (p?.terminal_id && p.supplier_id && Number.isFinite(at)) out.push({ kind: "booked", supplierId: p.supplier_id, terminalId: p.terminal_id, atMs: at, gallons: null });
      continue;
    }
    for (const p of t.pickups) {
      if (!p.terminal_id || p.outcome === "no_load") continue;
      const comps = t.compLoads.filter((c) => c.pickup_id === p.pickup_id && c.disposition !== "cancelled");
      const at = ms(p.left_at) || ms(p.arrived_at) || ms(t.started_at);
      if (!Number.isFinite(at)) continue;
      if (comps.length === 0) {
        // Chosen but not loaded yet: it will use the supplier's allocation.
        if (p.supplier_id && !p.left_at) out.push({ kind: "booked", supplierId: p.supplier_id, terminalId: p.terminal_id, atMs: at, gallons: null });
        continue;
      }
      const bySupplier = new Map<string, number>();
      for (const c of comps) {
        const sid = c.supplier_id ?? p.supplier_id;
        if (!sid) continue;
        bySupplier.set(sid, (bySupplier.get(sid) ?? 0) + (Number(c.gross_gallons) || 0));
      }
      for (const [sid, g] of bySupplier) out.push({ kind: "loaded", supplierId: sid, terminalId: p.terminal_id, atMs: at, gallons: g });
    }
  }
  return out;
}

const DAY = 86400000;

/** Start of the day window and week window containing `whenMs`. */
export function windows(whenMs: number, resetTime: string, resetDow: number, tz?: string | null): { dayStart: number; weekStart: number } {
  const [h, m] = resetTime.split(":").map(Number);
  const R = (h || 0) * 60 + (m || 0);
  const p = localParts(whenMs, tz);
  const delta = (p.minuteOfDay - R + 1440) % 1440;
  const dayStart = whenMs - delta * 60000;
  const dow = localParts(dayStart + 60000, tz).dow;
  const back = (dow - resetDow + 7) % 7;
  return { dayStart, weekStart: dayStart - back * DAY };
}

export type Level = "none" | "ok" | "near" | "full" | "over";
export type Span = { loaded: number; booked: number; limit: number | null; level: Level };
export type Usage = { day: Span; week: Span; level: Level; unit: "loads" | "gallons" };

const RANK: Record<Level, number> = { none: 0, ok: 1, near: 2, full: 3, over: 4 };
export function levelFor(total: number, limit: number | null): Level {
  if (limit == null || limit <= 0) return "none";
  if (total > limit) return "over";
  if (total === limit) return "full";
  return total / limit >= 0.75 ? "near" : "ok";
}
const worst = (a: Level, b: Level) => (RANK[a] >= RANK[b] ? a : b);

/** Median gallons of past loads on this supplier at this terminal (stands in for a booked load's size). */
export function typicalGallons(items: UsageItem[], supplierId: string, terminalId: string, fallback = 8000): number {
  const g = items.filter((i) => i.kind === "loaded" && i.supplierId === supplierId && i.terminalId === terminalId && (i.gallons ?? 0) > 0).map((i) => i.gallons as number).sort((a, b) => a - b);
  if (g.length === 0) return fallback;
  const m = g.length >> 1;
  return g.length % 2 ? g[m] : (g[m - 1] + g[m]) / 2;
}

export function contractUsage(c: AllocContract, items: UsageItem[], whenMs: number, tz?: string | null): Usage {
  const w = windows(whenMs, c.reset_time, c.reset_dow, tz);
  const mine = items.filter((i) => i.supplierId === c.supplier_id && i.terminalId === c.terminal_id);
  const typical = typicalGallons(items, c.supplier_id, c.terminal_id);
  const span = (from: number, to: number, limit: number | null): Span => {
    let loaded = 0, booked = 0;
    for (const i of mine) {
      if (i.atMs < from || i.atMs >= to) continue;
      const amount = c.limit_basis === "loads" ? 1 : (i.gallons ?? typical);
      if (i.kind === "loaded") loaded += amount; else booked += amount;
    }
    return { loaded, booked, limit, level: levelFor(loaded + booked, limit) };
  };
  const day = span(w.dayStart, w.dayStart + DAY, c.per_day);
  const week = span(w.weekStart, w.weekStart + 7 * DAY, c.per_week);
  return { day, week, level: worst(day.level, week.level), unit: c.limit_basis };
}

/** Would one more load (of `addAmount`) go past a limit? Returns the sentence, or null. */
export function wouldExceed(u: Usage, supplier: string, addAmount: number): string | null {
  const unit = u.unit === "loads" ? "load" : "gal";
  const fmt = (n: number) => Math.round(n).toLocaleString();
  for (const [label, s] of [["today", u.day], ["this week", u.week]] as const) {
    if (s.limit == null) continue;
    const total = s.loaded + s.booked;
    if (total + addAmount > s.limit) {
      return `${supplier} would be over its ${label === "today" ? "daily" : "weekly"} limit: ${fmt(total)} of ${fmt(s.limit)} ${unit}${u.unit === "loads" && s.limit !== 1 ? "s" : ""} already used or booked ${label}.`;
    }
  }
  return null;
}
