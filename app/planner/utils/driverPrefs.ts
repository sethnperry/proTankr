// app/planner/utils/driverPrefs.ts
//
// What follows the driver, not the equipment: the cap they set per compartment number and where they like the CG. The
// trailer's own safety cap (trailer_compartments.cap_gallons) stays with the trailer and always limits these. Kept on the
// phone and in user_plan_slots (slot 26, a sentinel combo), so a different truck, trailer or phone starts from the same
// numbers.

export const DEFAULT_CG = 0.5;

export type DriverPrefs = { caps: Record<number, number>; cg: number | null; savedAt: number };

export const emptyPrefs = (): DriverPrefs => ({ caps: {}, cg: null, savedAt: 0 });
const key = (userId: string) => `proTankr:u:${userId}:driverPrefs`;

export function cleanPrefs(raw: any): DriverPrefs {
  const caps: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw?.caps ?? {})) { const n = Number(v); if (Number.isFinite(n) && n > 0) caps[Number(k)] = n; }
  const cg = Number(raw?.cg);
  return { caps, cg: Number.isFinite(cg) ? cg : null, savedAt: Number(raw?.savedAt) || 0 };
}

export function readPrefs(userId: string): DriverPrefs {
  try { return cleanPrefs(JSON.parse(localStorage.getItem(key(userId)) ?? "null")); } catch { return emptyPrefs(); }
}
export function writePrefsLocal(userId: string, p: DriverPrefs) {
  try { localStorage.setItem(key(userId), JSON.stringify(p)); } catch { /* private mode */ }
}

/** Fills compartments that have no cap of their own from the driver's caps, never above the trailer's own limit. Returns the same object when nothing changed. */
export function applyCaps<T extends { empty?: boolean; productId?: string; capOverride?: number | null }>(
  plan: Record<number, T>, prefs: DriverPrefs, limits: Record<number, number>,
): Record<number, T> {
  let next: Record<number, T> | null = null;
  for (const [k, v] of Object.entries(plan)) {
    const n = Number(k), want = prefs.caps[n];
    if (!want || !v || v.empty || !v.productId || v.capOverride != null) continue;
    const lim = limits[n];
    const cap = Math.round(lim && lim > 0 ? Math.min(want, lim) : want);
    (next ??= { ...plan })[n] = { ...v, capOverride: cap };
  }
  return next ?? plan;
}

/** The prefs after the plan's caps and CG. A cap below the driver's own that is only the trailer's limit talking is not remembered. */
export function mergePrefs(prev: DriverPrefs, plan: Record<number, { capOverride?: number | null }>, cg: number, now: number, limits: Record<number, number> = {}): DriverPrefs {
  const caps = { ...prev.caps };
  for (const [k, v] of Object.entries(plan)) {
    const n = Number(k), c = v?.capOverride;
    if (typeof c !== "number" || !(c > 0)) continue;
    const had = prev.caps[n], lim = limits[n];
    if (had && lim && lim < had && Math.round(c) === Math.round(lim)) continue; // the trailer's cap, not a new choice
    caps[n] = Math.round(c);
  }
  const g = Math.round(cg * 1000) / 1000;
  return { caps, cg: Number.isFinite(g) ? g : prev.cg, savedAt: now };
}

/** The prefs without one compartment's cap (the driver cleared it). */
export function dropCap(prev: DriverPrefs, comp: number, now: number): DriverPrefs {
  const caps = { ...prev.caps };
  delete caps[comp];
  return { ...prev, caps, savedAt: now };
}

export function sameCaps(a: DriverPrefs, b: DriverPrefs): boolean {
  const ka = Object.keys(a.caps), kb = Object.keys(b.caps);
  return ka.length === kb.length && ka.every((k) => a.caps[Number(k)] === b.caps[Number(k)]) && a.cg === b.cg;
}
