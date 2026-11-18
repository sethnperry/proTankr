// lib/recap/time.ts
// Local-time helpers (no libraries): the local date, hour and weekday of an instant in a time zone.

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = cache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short" }); cache.set(tz, f); }
  return f;
}
const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function localParts(ms: number, tz: string): { date: string; hour: number; dow: number } {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, dow: DOW[p.weekday] ?? 0 };
}

/** The five time-of-day buckets standards are kept in. */
export function bucketOf(hour: number): 0 | 1 | 2 | 3 | 4 {
  if (hour < 6) return 0;
  if (hour < 9) return 1;
  if (hour < 15) return 2;
  if (hour < 19) return 3;
  return 4;
}
export const BUCKET_LABEL = ["before 6", "6-9", "9-15", "15-19", "after 19"];

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
