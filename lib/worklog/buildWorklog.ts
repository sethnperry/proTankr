// lib/worklog/buildWorklog.ts
//
// The work log: what a driver did in a period, set up to compare against a pay stub or
// settlement (hours, loads, gallons, miles) and to keep as a record. Pure.
//
// Where things are counted:
//  - Hours and miles are split at local midnight. A trip that crosses midnight appears on both
//    days; its miles are split in proportion to the time on each side.
//  - Loads and gallons are counted once, on the day the load was picked up. The continuation row
//    shows time and miles only.

import { computeOvertime, type OtRule } from "./overtime.ts";
import { addDays, clock, localDateOf, localMidnightMs, shortDate, weekday } from "./time.ts";

export type WlStop = { kind: "pickup" | "delivery"; name: string; number?: string | null; city?: string | null; state?: string | null; arrivedAt?: string | null; leftAt?: string | null; noLoad?: boolean };
export type WlLoad = { comp: number; code: string; name: string; gross: number; net: number };
export type WlTrip = {
  tripId: string; orders: string[]; startedAt: string; endedAt: string | null;
  beginMiles: number | null; endMiles: number | null; loadedMiles: number | null;
  compCount: number; loadCount: number; loads: WlLoad[]; stops: WlStop[];
};
export type WlPurchase = { at: string; store: string; place: string; gallons: number | null; kind: "personal_card" | "cash"; amount: number | null };

export type WlInput = {
  driverName: string; range: { start: string; end: string }; tz: string; title: string;
  trips: WlTrip[]; purchases: WlPurchase[];
  /** Hours on duty per local date from the electronic log; null/absent = not known. */
  dutyHours?: Record<string, number> | null;
  overtimeRule?: OtRule;
};

export type WlRow = {
  tripId: string; orders: string[]; route: string; products: string; timeFrom: string; timeTo: string;
  hours: number; miles: number; gross: number | null; net: number | null; loads: number;
  continues: boolean; continued: boolean;
};
export type WlDay = {
  date: string; label: string; from: string; to: string; hours: number; miles: number; loads: number; gross: number; net: number;
  rows: WlRow[]; midnightAfter: boolean;
  /** On duty before, between and after trips (needs the electronic log); null = not known. */
  nonRev: number | null; worked: number;
  /** Trip hours beyond the electronic log's on-duty time that day (off duty or no log during a trip). */
  tripOverDuty: number;
};
export type WlSummary = {
  daysWorked: number; hours: number; loads: number; gross: number; net: number;
  byProduct: { code: string; name: string; gross: number; net: number }[];
  miles: { total: number; loaded: number | null; empty: number | null; partial: boolean };
  spend: number;
  /** Trip hours + non-revenue hours. */
  worked: number; nonRev: number | null; tripHours: number;
  regular: number; overtime: number; double: number; otRule: OtRule;
};
export type WlMonth = { month: string; days: number; hours: number; loads: number; gross: number; net: number; miles: number };
export type Worklog = {
  driverName: string; range: { start: string; end: string }; tz: string; title: string;
  summary: WlSummary; days: WlDay[]; months: WlMonth[]; purchases: WlPurchase[];
  /** Payload utilization for the period (gallon-weighted over eligible loads); filled in by the server builder. */
  utilization?: { pct: number | null; loads: number; excluded: number };
};

export function tripMiles(t: { beginMiles: number | null; endMiles: number | null }): number {
  if (t.beginMiles == null || t.endMiles == null) return 0;
  const m = t.endMiles - t.beginMiles;
  return m > 0 && m < 3000 ? m : 0;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function place(s: WlStop): string {
  if (s.kind === "pickup") return [s.name, s.city].filter(Boolean).join("/");
  return [s.name, s.number].filter(Boolean).join(" ");
}

function routeOf(t: WlTrip): string {
  const picks = t.stops.filter((s) => s.kind === "pickup" && !s.noLoad);
  const drops = t.stops.filter((s) => s.kind === "delivery");
  const from = picks.length ? picks.map(place).join(" + ") : "";
  const to = drops.length ? drops.map(place).join(" + ") : "";
  return [from, to].filter(Boolean).join(" to ") || "Trip";
}

function productsOf(t: WlTrip): string {
  const byComp = new Map(t.loads.map((l) => [l.comp, l.code]));
  const n = Math.max(t.compCount, ...t.loads.map((l) => l.comp), 0);
  return Array.from({ length: n }, (_, i) => byComp.get(i + 1) ?? "MT").join("/");
}

function tripEnd(t: WlTrip): number {
  const start = Date.parse(t.startedAt);
  const stamps = [t.endedAt, ...t.stops.map((s) => s.leftAt ?? s.arrivedAt)].filter(Boolean).map((x) => Date.parse(x as string)).filter((n) => Number.isFinite(n));
  return Math.max(start, ...stamps);
}

function countedDate(t: WlTrip, tz: string): string {
  const firstLoaded = t.stops.find((s) => s.kind === "pickup" && !s.noLoad && (s.leftAt || s.arrivedAt));
  const at = firstLoaded ? Date.parse((firstLoaded.leftAt ?? firstLoaded.arrivedAt) as string) : Date.parse(t.startedAt);
  return localDateOf(at, tz);
}

export function buildWorklog(i: WlInput): Worklog {
  const { tz } = i;
  const dayMap = new Map<string, WlDay>();
  const dayOf = (date: string): WlDay => {
    let d = dayMap.get(date);
    if (!d) { d = { date, label: `${weekday(date)} ${shortDate(date)}`, from: "", to: "", hours: 0, miles: 0, loads: 0, gross: 0, net: 0, rows: [], midnightAfter: false, nonRev: null, worked: 0, tripOverDuty: 0 }; dayMap.set(date, d); }
    return d;
  };
  const windows = new Map<string, { from: number; to: number }>();

  const inRange = (date: string) => date >= i.range.start && date <= i.range.end;
  let loadedKnown = 0, emptyKnown = 0, totalMiles = 0, anyUnknown = false;
  const product = new Map<string, { code: string; name: string; gross: number; net: number }>();
  let loads = 0, gross = 0, net = 0;

  const trips = [...i.trips].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const t of trips) {
    const start = Date.parse(t.startedAt), end = tripEnd(t);
    if (!Number.isFinite(start)) continue;
    const miles = tripMiles(t);
    const dur = Math.max(1, end - start);
    const counted = countedDate(t, tz);
    const tripGross = t.loads.reduce((a, l) => a + l.gross, 0);
    const tripNet = t.loads.reduce((a, l) => a + l.net, 0);
    const firstDate = localDateOf(start, tz);
    const lastDate = localDateOf(Math.max(start, end - 1), tz);
    const segs: { date: string; from: number; to: number }[] = [];
    for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
      segs.push({ date, from: Math.max(start, localMidnightMs(date, tz)), to: Math.min(end, localMidnightMs(addDays(date, 1), tz)) });
    }
    if (!segs.length) segs.push({ date: firstDate, from: start, to: end });
    const route = routeOf(t), prods = productsOf(t);
    segs.forEach((sg, idx) => {
      if (!inRange(sg.date)) return;
      const d = dayOf(sg.date);
      const share = (sg.to - sg.from) / dur;
      const isCounted = sg.date === counted || (idx === 0 && !segs.some((x) => x.date === counted));
      const hrs = (sg.to - sg.from) / 3600000;
      d.rows.push({
        tripId: t.tripId, orders: t.orders, route, products: prods,
        timeFrom: clock(sg.from, tz), timeTo: sg.to >= end && idx === segs.length - 1 ? clock(end, tz) : "12:00a",
        hours: hrs, miles: miles * share, gross: isCounted ? tripGross : null, net: isCounted ? tripNet : null,
        loads: isCounted ? t.loadCount : 0, continues: idx < segs.length - 1, continued: idx > 0,
      });
      d.hours += hrs; d.miles += miles * share;
      if (isCounted) { d.loads += t.loadCount; d.gross += tripGross; d.net += tripNet; }
      const w = windows.get(sg.date);
      windows.set(sg.date, { from: Math.min(w?.from ?? Infinity, sg.from), to: Math.max(w?.to ?? 0, sg.to) });
    });
    if (inRange(counted)) {
      loads += t.loadCount; gross += tripGross; net += tripNet;
      for (const l of t.loads) {
        const p = product.get(l.code) ?? { code: l.code, name: l.name, gross: 0, net: 0 };
        p.gross += l.gross; p.net += l.net; product.set(l.code, p);
      }
    }
    if (inRange(firstDate)) {
      totalMiles += miles;
      if (t.loadedMiles != null && miles > 0) { loadedKnown += Math.min(t.loadedMiles, miles); emptyKnown += Math.max(0, miles - t.loadedMiles); } else if (miles > 0) anyUnknown = true;
    }
  }

  // On-duty time with no trip around it still counts as worked: add those days.
  const duty = i.dutyHours ?? null;
  if (duty) for (const [date, h] of Object.entries(duty)) if (inRange(date) && h >= 0.25 && !dayMap.has(date)) dayOf(date);
  const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) {
    const w = windows.get(d.date);
    if (w) { d.from = clock(w.from, tz); d.to = w.to >= localMidnightMs(addDays(d.date, 1), tz) ? "12:00a" : clock(w.to, tz); }
    d.hours = r1(d.hours); d.miles = Math.round(d.miles);
    d.nonRev = duty ? r1(Math.max(0, (duty[d.date] ?? 0) - d.hours)) : null;
    // With the electronic log, the day's on-duty total is the hours worked (all on-duty time is paid);
    // trips only split it into trip time and non-rev. No log for that day: trip time stands.
    const onDuty = duty?.[d.date] ?? 0;
    d.worked = duty ? r1(onDuty) : r1(d.hours);
    d.tripOverDuty = duty ? r1(Math.max(0, d.hours - onDuty)) : 0;
    d.midnightAfter = d.rows.some((r) => r.continues);
    for (const r of d.rows) { r.hours = r1(r.hours); r.miles = Math.round(r.miles); }
  }

  const purchases = i.purchases.filter((p) => inRange(localDateOf(Date.parse(p.at), tz))).sort((a, b) => a.at.localeCompare(b.at));
  const monthMap = new Map<string, WlMonth>();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    const m = monthMap.get(key) ?? { month: key, days: 0, hours: 0, loads: 0, gross: 0, net: 0, miles: 0 };
    m.days += 1; m.hours += d.hours; m.loads += d.loads; m.gross += d.gross; m.net += d.net; m.miles += d.miles;
    monthMap.set(key, m);
  }
  const rule = i.overtimeRule ?? "federal";
  const ot = computeOvertime(days.map((d) => ({ date: d.date, hours: d.worked })), rule, i.range.start);
  const hasLoaded = loadedKnown + emptyKnown > 0;
  return {
    driverName: i.driverName, range: i.range, tz, title: i.title, days, purchases,
    months: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, hours: r1(m.hours), miles: Math.round(m.miles) })),
    summary: {
      daysWorked: days.length, hours: r1(days.reduce((a, d) => a + d.hours, 0)), loads,
      gross: Math.round(gross), net: Math.round(net),
      byProduct: [...product.values()].sort((a, b) => b.gross - a.gross).map((p) => ({ ...p, gross: Math.round(p.gross), net: Math.round(p.net) })),
      miles: { total: Math.round(totalMiles), loaded: hasLoaded ? Math.round(loadedKnown) : null, empty: hasLoaded ? Math.round(emptyKnown) : null, partial: hasLoaded && anyUnknown },
      spend: Math.round(purchases.reduce((a, p) => a + (p.amount ?? 0), 0) * 100) / 100,
      worked: r1(days.reduce((a, d) => a + d.worked, 0)), tripHours: r1(days.reduce((a, d) => a + d.hours, 0)),
      nonRev: duty ? r1(days.reduce((a, d) => a + (d.nonRev ?? 0), 0)) : null,
      regular: r1(ot.regular), overtime: r1(ot.overtime), double: r1(ot.double), otRule: rule,
    },
  };
}
