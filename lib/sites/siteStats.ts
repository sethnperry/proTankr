// lib/sites/siteStats.ts
//
// The average time at a site, from timestamps the app already records: arrived to left. Pure.

export const MIN_VISITS = 3;
const MAX_MIN = 6 * 60; // a visit longer than this is a forgotten tap, not a load

export type Visit = { arrivedAt: string | null; leftAt: string | null };

/** Whole minutes, or null until there are enough past visits. */
export function averageMinutes(visits: Visit[]): number | null {
  const mins = visits.flatMap((v) => {
    const a = v.arrivedAt ? Date.parse(v.arrivedAt) : NaN, b = v.leftAt ? Date.parse(v.leftAt) : NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return [];
    const m = (b - a) / 60_000;
    return m >= 1 && m <= MAX_MIN ? [m] : [];
  });
  if (mins.length < MIN_VISITS) return null;
  return Math.round(mins.reduce((s, m) => s + m, 0) / mins.length);
}

export const DEFAULT_SOP_TERMINAL = "Tap Begin just before you enter the rack.";
export const DEFAULT_SOP_DROP = "Tap Begin just before any connections are made.";
