// lib/eod/eod.ts
//
// The End of Day report's numbers and cover lines. Pure: the server loads the rows, this decides who is in the
// report (drivers who ended their shift before midnight), what each load line says, and the summary (loads and
// gallons per product, man hours, and the grey zone: shift time nothing explains).

import type { ShiftEventRow } from "../trips/types.ts";
import { deriveShifts, type Shift } from "../shifts/shiftLogic.ts";

export type EodDriver = { userId: string; name: string; region: string | null; area: string | null };
export type EodTrip = {
  tripId: string;
  userId: string;
  truck: string | null;
  trailer: string | null;
  fromCity: string | null;
  to: string;
  /** One entry per compartment in order, the product code or null for an empty one ("D2/--/D2"). */
  slots: (string | null)[];
  gallons: number;
  minutes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  products: { name: string; gallons: number }[];
};
export type Span = { userId: string; from: string; to: string };

/** The shifts that ended on this local day, before midnight and by the driver (not closed by the system). */
export function eodShifts(events: ShiftEventRow[], userIds: string[], dayStartMs: number, dayEndMs: number, now: string): Shift[] {
  const out: Shift[] = [];
  for (const u of userIds) {
    for (const s of deriveShifts(events, u, now)) {
      if (s.open || s.unconfirmed || !s.endedAt) continue;
      const end = Date.parse(s.endedAt);
      if (end >= dayStartMs && end < dayEndMs) out.push(s);
    }
  }
  return out;
}

/** Minutes of [from,to] not covered by any of the spans (merged first so overlaps count once). */
export function uncoveredMinutes(from: string, to: string, spans: { from: string; to: string }[]): number {
  const a = Date.parse(from), b = Date.parse(to);
  if (!(b > a)) return 0;
  const clipped = spans.map((s) => [Math.max(a, Date.parse(s.from)), Math.min(b, Date.parse(s.to))] as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && y > x).sort((p, q) => p[0] - q[0]);
  let covered = 0, curS = -1, curE = -1;
  for (const [x, y] of clipped) {
    if (x > curE) { if (curE > curS) covered += curE - curS; curS = x; curE = y; } else curE = Math.max(curE, y);
  }
  if (curE > curS) covered += curE - curS;
  return Math.max(0, Math.round((b - a - covered) / 60_000));
}

export const hm = (minutes: number | null): string => (minutes == null ? "-" : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`);
export const hours1 = (minutes: number): string => (Math.round(minutes / 6) / 10).toFixed(1);

/** "Seth Perry (25184/3151) * Fort Lauderdale -> Love's 495 * D2/--/D2 * 7,850g * 7h 45m" */
export function loadLine(name: string, t: EodTrip): string {
  const equip = [t.truck, t.trailer].filter(Boolean).join("/");
  const slots = t.slots.length ? t.slots.map((s) => s ?? "--").join("/") : "-";
  return [`${name}${equip ? ` (${equip})` : ""}`, `${t.fromCity ?? "?"} -> ${t.to}`, slots, `${Math.round(t.gallons).toLocaleString("en-US")}g`, hm(t.minutes)].join(" * ");
}

export type EodGroup = { title: string; rows: { driver: string; lines: string[] }[] };
export type EodSummary = {
  loads: number;
  byProduct: { name: string; loads: number; gallons: number }[];
  manMinutes: number;
  greyMinutes: number;
  perDriver: { name: string; shiftMinutes: number; loads: number; greyMinutes: number }[];
};

export function buildEod(o: { drivers: EodDriver[]; shifts: Shift[]; trips: EodTrip[]; other: Span[] }): { groups: EodGroup[]; summary: EodSummary } {
  const byUser = new Map(o.drivers.map((d) => [d.userId, d]));
  const active = o.drivers.filter((d) => o.shifts.some((s) => s.userId === d.userId));
  const areaOf = (d: EodDriver) => [d.region, d.area].filter(Boolean).join(" / ") || "No area set";
  const titles = [...new Set(active.map(areaOf))].sort((a, b) => (a === "No area set" ? 1 : b === "No area set" ? -1 : a.localeCompare(b)));
  const groups: EodGroup[] = titles.map((title) => ({
    title,
    rows: active.filter((d) => areaOf(d) === title).sort((a, b) => a.name.localeCompare(b.name)).map((d) => {
      const trips = o.trips.filter((t) => t.userId === d.userId).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
      return { driver: d.name, lines: trips.length ? trips.map((t) => loadLine(d.name, t)) : [`${d.name} * no loads`] };
    }),
  }));

  const prod = new Map<string, { loads: number; gallons: number }>();
  for (const t of o.trips) for (const p of t.products) {
    const e = prod.get(p.name) ?? { loads: 0, gallons: 0 };
    e.loads += 1; e.gallons += p.gallons; prod.set(p.name, e);
  }
  const perDriver = active.map((d) => {
    const mine = o.shifts.filter((s) => s.userId === d.userId);
    const shiftMinutes = mine.reduce((n, s) => n + Math.round(s.hours * 60), 0);
    const spans = [...o.trips.filter((t) => t.userId === d.userId && t.startedAt && t.completedAt).map((t) => ({ from: t.startedAt!, to: t.completedAt! })), ...o.other.filter((x) => x.userId === d.userId)];
    const grey = mine.reduce((n, s) => n + uncoveredMinutes(s.startedAt, s.endedAt!, spans), 0);
    return { name: byUser.get(d.userId)!.name, shiftMinutes, loads: o.trips.filter((t) => t.userId === d.userId).length, greyMinutes: grey };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return {
    groups,
    summary: {
      loads: o.trips.length,
      byProduct: [...prod.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.gallons - a.gallons),
      manMinutes: perDriver.reduce((n, d) => n + d.shiftMinutes, 0),
      greyMinutes: perDriver.reduce((n, d) => n + d.greyMinutes, 0),
      perDriver,
    },
  };
}
