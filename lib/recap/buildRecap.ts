// lib/recap/buildRecap.ts
//
// The driver's pay-period recap: a record to compare against a settlement sheet or pay stub.
// Pure: the sender gathers trips, hours and purchases; this lines them up by day.

import type { DayHours } from "./dailyHours.ts";

export type RecapStop = { kind: "pickup" | "delivery"; name: string; arrivedAt: string | null; leftAt: string | null; note?: string | null };
export type RecapTrip = {
  tripId: string; orders: string[]; startedAt: string; completedAt: string | null;
  beginMiles: number | null; endMiles: number | null; gallons: number; stops: RecapStop[];
};
export type RecapPurchase = { at: string; store: string; place: string; gallons: number | null; kind: "personal_card" | "cash"; amount: number | null };

export type RecapInput = {
  driverName: string; period: { start: string; end: string }; tz: string;
  hours: DayHours[] | null; trips: RecapTrip[]; purchases: RecapPurchase[];
};

export type RecapDay = { date: string; driveMin: number | null; onDutyMin: number | null; miles: number; trips: number; spend: number };
export type Recap = {
  driverName: string; period: { start: string; end: string }; tz: string;
  days: RecapDay[]; trips: RecapTrip[]; purchases: RecapPurchase[];
  totals: { driveMin: number | null; onDutyMin: number | null; miles: number; trips: number; orders: number; gallons: number; spend: number };
  hasHours: boolean;
};

export function localDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function tripMiles(t: Pick<RecapTrip, "beginMiles" | "endMiles">): number {
  if (t.beginMiles == null || t.endMiles == null) return 0;
  const m = t.endMiles - t.beginMiles;
  return m > 0 && m < 3000 ? Math.round(m) : 0;
}

export function buildRecap(i: RecapInput): Recap {
  const hoursBy = new Map((i.hours ?? []).map((h) => [h.date, h]));
  const dates: string[] = [];
  for (let d = Date.parse(`${i.period.start}T12:00:00Z`); d <= Date.parse(`${i.period.end}T12:00:00Z`); d += 86400_000) dates.push(new Date(d).toISOString().slice(0, 10));
  const trips = [...i.trips].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const purchases = [...i.purchases].sort((a, b) => a.at.localeCompare(b.at));
  const days: RecapDay[] = dates.map((date) => {
    const h = hoursBy.get(date);
    const dayTrips = trips.filter((t) => localDate(t.startedAt, i.tz) === date);
    return {
      date,
      driveMin: h ? h.driveMin : null,
      onDutyMin: h ? h.driveMin + h.onDutyMin : null,
      miles: dayTrips.reduce((a, t) => a + tripMiles(t), 0),
      trips: dayTrips.length,
      spend: Math.round(purchases.filter((p) => localDate(p.at, i.tz) === date).reduce((a, p) => a + (p.amount ?? 0), 0) * 100) / 100,
    };
  });
  const hasHours = !!i.hours && i.hours.length > 0;
  return {
    driverName: i.driverName, period: i.period, tz: i.tz, days, trips, purchases, hasHours,
    totals: {
      driveMin: hasHours ? days.reduce((a, d) => a + (d.driveMin ?? 0), 0) : null,
      onDutyMin: hasHours ? days.reduce((a, d) => a + (d.onDutyMin ?? 0), 0) : null,
      miles: days.reduce((a, d) => a + d.miles, 0),
      trips: trips.length,
      orders: trips.reduce((a, t) => a + t.orders.length, 0),
      gallons: Math.round(trips.reduce((a, t) => a + t.gallons, 0)),
      spend: Math.round(purchases.reduce((a, p) => a + (p.amount ?? 0), 0) * 100) / 100,
    },
  };
}
