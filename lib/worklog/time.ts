// lib/worklog/time.ts
//
// Local-time helpers for the work log: dates, midnights and short clock labels in a time zone.

function parts(ms: number, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second") };
}

export function localDateOf(ms: number, tz: string): string {
  const { y, m, d } = parts(ms, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The instant a local calendar date (YYYY-MM-DD) begins in `tz`. */
export function localMidnightMs(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const p = parts(guess, tz);
  const asLocal = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return guess - (asLocal - guess);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "3:00p", "12:00a". */
export function clock(ms: number, tz: string): string {
  const { h, mi } = parts(ms, tz);
  const ap = h >= 12 ? "p" : "a";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, "0")}${ap}`;
}

/** "10/25". */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

export function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
