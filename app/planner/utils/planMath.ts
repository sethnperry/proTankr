// utils/planMath.ts
// Pure planning math — no React, no Supabase. Easy to unit test.

import type { PlanCalcRow, PlanRow } from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const CG_NEUTRAL = 0.5;
export const CG_FRONT_MAX = 0.9;
export const CG_REAR_MAX = 0.0;
export const PLOW_BIAS_MAX = 2.5;
export const CG_CURVE = 1.8;
export const TILT_GAIN = 0.85;

// ─── API gravity helpers ──────────────────────────────────────────────────────

/**
 * Back-correct an observed API reading at a known temperature to API at 60°F.
 *
 * In the DB:
 *   terminal_products.last_api     = API observed by the driver at last_temp_f
 *   terminal_products.last_temp_f  = the temperature at which last_api was observed
 *   products.api_60                = the manufacturer/reference API at 60°F
 *
 * The driver's observed API is more accurate than the static reference because
 * it reflects the actual product in that tank on that day. We back-correct it
 * to 60°F so we can compare apples-to-apples and forward-correct to any load temp.
 *
 * Formula: API_60 = API_observed + alpha * (T_observed - 60)
 */
export function backCorrectApiTo60(
  lastApi: number,       // observed API at lastTempF
  lastTempF: number,     // temperature at which lastApi was observed
  alphaPerF: number      // thermal expansion coefficient (from products table)
): number {
  return lastApi + alphaPerF * (lastTempF - 60);
}

/**
 * Compute lbs/gallon at a given load temperature using API gravity + thermal expansion.
 *
 * Inputs:
 *   api60     — API gravity at 60°F (either from products.api_60, or back-corrected
 *               from terminal_products.last_api using backCorrectApiTo60)
 *   alphaPerF — thermal expansion coefficient (from products.alpha_per_f)
 *   tempF     — the load temperature set by the driver on the slider
 *
 * Formula (ASTM D1250 approximation):
 *   SG_60  = 141.5 / (API_60 + 131.5)
 *   rho_60 = SG_60 * 8.345404          (lbs/gal at 60°F, water = 8.345404)
 *   rho_T  = rho_60 / (1 + alpha * (T - 60))
 */
export function lbsPerGallonAtTemp(
  api60: number,
  alphaPerF: number,
  tempF: number
): number {
  const sg60 = 141.5 / (api60 + 131.5);
  const rho60 = sg60 * 8.345404; // lbs/gal at 60°F
  const rhoT = rho60 / (1 + alphaPerF * (tempF - 60));
  return rhoT;
}

/**
 * Best-available lbs/gal for a product at a given load temperature.
 *
 * Priority:
 *   1. If the terminal has a driver-observed API (last_api + last_temp_f),
 *      back-correct it to API_60 and use that — most accurate.
 *   2. Fall back to the static products.api_60 reference value.
 *
 * This is the function page.tsx should call instead of lbsPerGallonAtTemp directly.
 */
export function bestLbsPerGallon(
  api60Ref: number,          // products.api_60  (static reference)
  alphaPerF: number,         // products.alpha_per_f
  tempF: number,             // driver's current load temp slider
  lastApi?: number | null,   // terminal_products.last_api  (observed, nullable)
  lastTempF?: number | null  // terminal_products.last_temp_f (nullable)
): number {
  // Use driver-observed API if we have both fields and they're valid numbers
  if (
    lastApi != null && Number.isFinite(lastApi) &&
    lastTempF != null && Number.isFinite(lastTempF)
  ) {
    const api60Effective = backCorrectApiTo60(lastApi, lastTempF, alphaPerF);
    return lbsPerGallonAtTemp(api60Effective, alphaPerF, tempF);
  }
  // Fallback to static reference
  return lbsPerGallonAtTemp(api60Ref, alphaPerF, tempF);
}

/**
 * Actual weight for one compartment/line, given the driver-entered (or
 * BOL-corrected) API and temperature at load time.
 *
 * Extracted verbatim from useLoadWorkflow.ts's own submission-time math
 * (previously inlined there) so the Loading modal's live weight preview
 * and the final complete_load submission can never drift apart — same
 * function, one call site each. Back-corrects the entered API to 60°F
 * first (same as bestLbsPerGallon) before re-deriving density at tempF,
 * matching how planning's own density calc works so plan vs. actual use
 * the same effective API_60 and never show a phantom diff from that alone.
 */
export function computeActualLbsForLine(
  gallons: number,
  api: number,
  tempF: number,
  alphaPerF: number
): number {
  const api60 = api + alphaPerF * (tempF - 60);
  const lpg = lbsPerGallonAtTemp(api60, alphaPerF, tempF);
  return gallons * lpg;
}

// ─── Per-compartment actual-reading resolution ─────────────────────────────────

export type CompartmentActualReading = {
  comp: number;
  productId: string;
  gallons: number;
  api: number;
  tempF: number;
  alphaPerF: number | null;
};

export type ResolvedProductReading = {
  productId: string;
  api: number;
  tempF: number;
  comp: number;
};

/**
 * Given one driver-entered {gallons, api, tempF} reading per compartment
 * (from the per-compartment "Log the Load" sequence), pick the single
 * reading per product that should feed the shared terminal "last observed"
 * data for the next driver.
 *
 * Rule: "colder and heavier" wins -- i.e. highest density. Scored via
 * computeActualLbsForLine(1, api, tempF, alphaPerF), which is exactly bare
 * lbs/gal, so "colder and heavier" collapses into one criterion (density
 * strictly increases as temp drops and as API drops, for a fixed alpha).
 * When a product has no alphaPerF configured, density can't be computed --
 * fall back to "coldest wins," the same manual heuristic drivers already
 * use today, not a new invented rule.
 *
 * A compartment with gallons <= 0 (driver zeroed it out) never competes --
 * it wasn't really loaded. A product with zero valid candidates is simply
 * absent from the output; never fabricate a reading for it.
 */
export function resolveDensestReadingPerProduct(
  entries: CompartmentActualReading[]
): ResolvedProductReading[] {
  const byProduct = new Map<string, CompartmentActualReading[]>();
  for (const e of entries) {
    if (!(e.gallons > 0)) continue;
    if (!e.productId) continue;
    if (!Number.isFinite(e.api) || !Number.isFinite(e.tempF)) continue;
    const list = byProduct.get(e.productId);
    if (list) list.push(e);
    else byProduct.set(e.productId, [e]);
  }

  const out: ResolvedProductReading[] = [];
  for (const [productId, list] of byProduct) {
    let best: CompartmentActualReading | null = null;
    let bestScore = -Infinity;
    for (const e of list) {
      const score =
        e.alphaPerF != null && Number.isFinite(e.alphaPerF)
          ? computeActualLbsForLine(1, e.api, e.tempF, e.alphaPerF)
          : -e.tempF;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) out.push({ productId, api: best.api, tempF: best.tempF, comp: best.comp });
  }
  return out;
}

// ─── CG bias ──────────────────────────────────────────────────────────────────

/**
 * Map a 0–1 slider value to a signed CG bias.
 * - 0.5 = neutral (0)
 * - <0.5 = rear (negative)
 * - >0.5 = front (positive, up to PLOW_BIAS_MAX)
 */
export function cgSliderToBias(slider: number): number {
  const s = Math.max(0, Math.min(1, Number(slider) || 0));

  if (s < CG_NEUTRAL) {
    const t = (CG_NEUTRAL - s) / (CG_NEUTRAL - CG_REAR_MAX);
    return -Math.pow(Math.max(0, Math.min(1, t)), CG_CURVE);
  }

  if (s <= CG_FRONT_MAX) {
    const t = (s - CG_NEUTRAL) / (CG_FRONT_MAX - CG_NEUTRAL);
    return Math.pow(Math.max(0, Math.min(1, t)), CG_CURVE);
  }

  const t2 = (s - CG_FRONT_MAX) / (1 - CG_FRONT_MAX);
  return 1 + Math.pow(Math.max(0, Math.min(1, t2)), CG_CURVE) * (PLOW_BIAS_MAX - 1);
}

/**
 * Inverse of cgSliderToBias -- recovers the 0-1 slider position from a
 * stored bias value (e.g. load_log.cg_bias, written via cgSliderToBias at
 * begin_load time). Needed anywhere a load's real CG needs to be restored
 * onto the slider (see CLAUDE.md "recap / recall last load") -- feeding
 * the bias straight into the slider is a unit mismatch (bias ranges
 * roughly -1..2.5 on a nonlinear curve, the slider is a plain 0-1), which
 * is exactly what sent the slider to a clamped, "way off to unstable
 * land" position before this existed.
 */
export function biasToCgSlider(bias: number): number {
  const b = Math.max(-1, Math.min(PLOW_BIAS_MAX, Number(bias) || 0));

  if (b < 0) {
    const t = Math.pow(-b, 1 / CG_CURVE);
    return CG_NEUTRAL - t * (CG_NEUTRAL - CG_REAR_MAX);
  }

  if (b <= 1) {
    const t = Math.pow(b, 1 / CG_CURVE);
    return CG_NEUTRAL + t * (CG_FRONT_MAX - CG_NEUTRAL);
  }

  const t2 = Math.pow((b - 1) / (PLOW_BIAS_MAX - 1), 1 / CG_CURVE);
  return CG_FRONT_MAX + t2 * (1 - CG_FRONT_MAX);
}

// ─── Allocation ───────────────────────────────────────────────────────────────

type AllocComp = {
  compNumber: number;
  maxGallons: number;
  position: number;
  lbsPerGal: number;
  productId: string;
  weight: number;
};

/**
 * Water-fill style allocation:
 * Distributes totalGallons across compartments proportionally to weight,
 * respecting per-compartment max caps. Iterates until all gallons are placed
 * or all compartments are full.
 */
export function allocateWithCaps(
  totalGallons: number,
  comps: AllocComp[]
): Array<PlanRow & { lbsPerGal: number; position: number; productId: string }> {
  let remaining = Math.max(0, totalGallons);

  const rows = comps.map((c) => ({
    comp_number: c.compNumber,
    max_gallons: c.maxGallons,
    planned_gallons: 0,
    lbsPerGal: c.lbsPerGal,
    position: c.position,
    productId: c.productId,
    weight: c.weight,
  }));

  let active = rows.filter((r) => r.max_gallons > 0);

  for (let guard = 0; guard < 20; guard++) {
    if (remaining <= 1e-6) break;
    if (active.length === 0) break;

    const denom = active.reduce((s, r) => s + r.weight, 0);
    if (!(denom > 0)) break;

    const k = remaining / denom;

    for (const r of active) {
      const want = k * r.weight;
      const room = r.max_gallons - r.planned_gallons;
      r.planned_gallons += Math.max(0, Math.min(room, want));
    }

    const plannedNow = rows.reduce((s, r) => s + r.planned_gallons, 0);
    remaining = Math.max(0, totalGallons - plannedNow);

    const nextActive = active.filter((r) => r.planned_gallons < r.max_gallons - 1e-6);
    const anyCapped = nextActive.length !== active.length;
    active = nextActive;
    if (!anyCapped) break;
  }

  return rows;
}

/**
 * Given a target gallon total, distribute across compartments using CG bias.
 * Returns rows sorted by comp_number.
 */
export function planForGallons(
  totalGallons: number,
  comps: {
    compNumber: number;
    maxGallons: number;
    position: number;
    lbsPerGal: number;
    productId: string;
  }[],
  bias: number
): PlanCalcRow[] {
  const b = Math.max(-1, Math.min(PLOW_BIAS_MAX, Number(bias) || 0));

  const withWeights = comps.map((c) => {
    const raw = 1 + b * c.position * TILT_GAIN;
    const shape = Math.max(0.05, raw);
    return { ...c, weight: shape * c.maxGallons };
  });

  const rows = allocateWithCaps(totalGallons, withWeights);
  rows.sort((a, b) => a.comp_number - b.comp_number);
  return rows;
}

/**
 * Largest gallon total that keeps the CG-biased allocation at or under a weight
 * ceiling, respecting every compartment's own cap.
 *
 * Extracted verbatim from usePlanRows.ts's inline binary search so the Planner
 * and the payload-utilization engine (lib/capacity/computeAvailableCapacity.ts)
 * share one solver rather than growing a second copy -- the same reasoning
 * behind computeActualLbsForLine's extraction above, and the reason the
 * incentive redesign needed no new payload math at all.
 *
 * `plan` is injectable only because usePlanRows already receives planForGallons
 * as a prop; every real call site passes the one implementation.
 */
export function solveMaxGallons(
  totalCapacityGallons: number,
  comps: {
    compNumber: number;
    maxGallons: number;
    position: number;
    lbsPerGal: number;
    productId: string;
  }[],
  allowedLbs: number,
  bias: number,
  plan: (gallons: number, comps: any[], bias: number) => Array<{ planned_gallons: number; lbsPerGal: number }> = planForGallons,
  iterations = 22,
): number {
  let lo = 0;
  let hi = Math.max(0, totalCapacityGallons);
  if (!(hi > 0)) return 0;

  // Exact answer for the volume-limited case, checked before searching.
  // A bisection that only ever raises `lo` converges from BELOW and can never
  // actually land on its upper bound -- 22 iterations over a 100 gal range
  // stops at 99.99997. That is invisible after rounding, but it means a load
  // that genuinely fills every compartment never reports as exactly full, and
  // downstream that reads as a phantom fraction of a gallon left unused (and a
  // utilization of 100.00002%). When the tanks fit under the weight ceiling,
  // total volume IS the true maximum, so return it rather than approach it.
  const fullRows = plan(hi, comps, bias);
  const fullLbs = fullRows.reduce((s, r) => s + r.planned_gallons * r.lbsPerGal, 0);
  if (fullLbs <= allowedLbs + 1e-6) return hi;

  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const rows = plan(mid, comps, bias);
    const lbs = rows.reduce((s, r) => s + r.planned_gallons * r.lbsPerGal, 0);
    if (lbs <= allowedLbs + 1e-6) lo = mid;
    else hi = mid;
  }
  return lo;
}
