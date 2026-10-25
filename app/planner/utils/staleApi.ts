// app/planner/utils/staleApi.ts
//
// The stale-API decision, pulled out of PlannerHost so it can be tested.
// A planned product is "stale" when its last reading at this terminal is older
// than the limit (or has no timestamp). The driver then picks Safest / Safe /
// Ignore, each of which yields one API per product.

export type StaleCandidate = {
  last_api: number | null | undefined;
  last_api_updated_at: string | null | undefined;
};

/** True when the last reading is too old to trust. A product that has never
 *  been loaded here is NOT stale: its density already defaults to the
 *  published heaviest, so there is nothing for the driver to decide. */
export function isStaleReading(info: StaleCandidate | undefined, staleDays: number, nowMs: number): boolean {
  const lastApi = info?.last_api;
  if (lastApi == null || !Number.isFinite(Number(lastApi))) return false;
  const ts = info?.last_api_updated_at;
  // A reading with no timestamp is unknown-age, not fresh.
  if (!ts) return true;
  const t = new Date(ts).getTime();
  return !Number.isNaN(t) && nowMs - t > staleDays * 86400000;
}

export type StalePickProduct = {
  api_min?: number | null;
  api_60?: number | null;
  min_api_observed?: number | null;
  last_api?: number | null;
  last_temp_f?: number | null;
  alpha_per_f?: number | null;
};

const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

/** Safest: the published heaviest (api_min, else api_60). */
export function pickSafest(p: StalePickProduct): number | null {
  return num(p.api_min) ?? num(p.api_60);
}

/** Safe: the heaviest this terminal has seen (lowest of min observed and the
 *  last reading); product min only when the terminal has no history at all. */
export function pickSafe(p: StalePickProduct): number | null {
  const observed = [num(p.min_api_observed), num(p.last_api)].filter((v): v is number => v != null);
  if (observed.length > 0) return Math.min(...observed);
  return pickSafest(p);
}

/** Ignore: go on the last reading, pinned explicitly (past the limit the
 *  default basis would otherwise be the terminal min). Needs alpha to bring
 *  the reading back to 60 F. */
export function pickIgnore(p: StalePickProduct, backCorrectTo60: (api: number, tempF: number, alpha: number) => number): number | null {
  const api = num(p.last_api), alpha = num(p.alpha_per_f);
  if (api == null || alpha == null) return null;
  return backCorrectTo60(api, num(p.last_temp_f) ?? 60, alpha);
}
