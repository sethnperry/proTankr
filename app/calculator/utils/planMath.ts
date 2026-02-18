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

// ─── Density math ─────────────────────────────────────────────────────────────

/**
 * Compute lbs/gallon at a given temperature using API gravity + thermal expansion.
 * Uses the standard ASTM D1250 approximation.
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
