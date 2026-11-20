// lib/telematics/odometerSync.ts
//
// Is an odometer value the one the truck's tracker reported? The screens that prefill the odometer from Geotab show a
// green check beside it while the value still matches (type a different number and the check goes away). Pure.

/** The tracker's reading rounded to a whole mile, or null when there is none. */
export const trackerMiles = (live: number | null | undefined): number | null =>
  live != null && Number.isFinite(live) && live > 0 ? Math.round(live) : null;

/** True when `value` (what is in the field) is the tracker's reading. */
export function matchesTracker(value: string | number | null | undefined, live: number | null | undefined): boolean {
  const t = trackerMiles(live);
  if (t == null || value == null) return false;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && Math.round(n) === t;
}
