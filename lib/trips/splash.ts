// lib/trips/splash.ts
//
// Splash blending: product is loaded on top of another in the same compartment (ethanol first at one
// terminal, regular on top at the next). The blend percent is the first product's share of the finished
// compartment, so how much goes on top follows from what is already aboard:
//   total = aboard / pct,  on top = total - aboard,  held to the room the compartment has left.
// Pure.

export type SplashPlan = {
  /** Gallons already in the compartment. */
  aboard: number;
  /** Gallons of room left in it. */
  room: number;
  /** Gallons to load on top (the amount needed, held to the room). */
  add: number;
  /** True when the room is short of what the percent needs. */
  short: boolean;
  /** The first product's share of the compartment once `add` is loaded, in percent. Null when nothing is aboard. */
  blend: number | null;
  /** The finished compartment, gallons. */
  total: number;
};

/** The usual blend choices (E10, E15). */
export const BLEND_CHOICES = [10, 15] as const;

export function validPct(pct: number): boolean {
  return Number.isFinite(pct) && pct > 0 && pct < 100;
}

export function splashPlan(args: { max: number; aboard: number; pct: number }): SplashPlan {
  const max = Math.max(0, args.max);
  const aboard = Math.max(0, args.aboard);
  const room = Math.max(0, max - aboard);
  if (!validPct(args.pct) || aboard <= 0) {
    return { aboard, room, add: 0, short: false, blend: aboard > 0 ? 100 : null, total: aboard };
  }
  const need = (aboard * (100 - args.pct)) / args.pct;
  const add = Math.floor(Math.min(need, room));
  return {
    aboard, room, add, short: need > room + 0.5,
    blend: aboard / (aboard + add) * 100,
    total: aboard + add,
  };
}

/** What a compartment may take on top of its load: loaded, with room, and not already blended. */
export function canSplashInto(args: { max: number; aboard: number | null; rows: number }): boolean {
  return args.rows === 1 && args.aboard != null && args.aboard > 0 && args.max - args.aboard >= 1;
}

// ── Splash plan: a compartment planned as two products ──────────────────────────────────────────────
// The percent belongs to the named additive (ethanol 10%), so it never depends on which product loads first.
// Whichever product loads first gets its share of the planned volume; the second is the adjuster and fills
// what the weight and the room allow, worked out from what was actually loaded (see topOff).

/** A compartment's splash: the base product (in the plan's own product slot), the additive and its share. */
export type SplashSpec = { additiveProductId: string; pct: number };

/** Weight cushion on the planned volume, so the first load is slightly conservative. */
export const CUSHION = 0.01;
/** A finished blend more than this many points from its target is warned about. */
export const TOLERANCE_PTS = 1;

/** The first load's amounts from the planned volume V: both stages at plan time. */
export function stageGallons(args: { volume: number; pct: number; cushion?: number }): { total: number; additive: number; base: number } {
  const total = Math.max(0, Math.floor(args.volume * (1 - (args.cushion ?? CUSHION))));
  if (!validPct(args.pct)) return { total, additive: 0, base: total };
  const additive = Math.floor((total * args.pct) / 100);
  return { total, additive, base: total - additive };
}

/**
 * The second load, from what the first actually put in. `firstIsAdditive`: the additive went in first, so the
 * base goes on top (and the other way round). Held to the room left in the compartment and to `maxByWeight`
 * (the gallons the weight allows at the second product's real density, when known).
 */
export function topOff(args: { firstIsAdditive: boolean; aboard: number; pct: number; max: number; maxByWeight?: number | null }): {
  add: number; room: number; blend: number | null; limitedBy: "none" | "room" | "weight";
} {
  const aboard = Math.max(0, args.aboard);
  const room = Math.max(0, Math.floor(args.max - aboard));
  if (!validPct(args.pct) || aboard <= 0) return { add: 0, room, blend: null, limitedBy: "none" };
  const need = args.firstIsAdditive ? (aboard * (100 - args.pct)) / args.pct : (aboard * args.pct) / (100 - args.pct);
  let add = Math.floor(need);
  let limitedBy: "none" | "room" | "weight" = "none";
  if (add > room) { add = room; limitedBy = "room"; }
  if (args.maxByWeight != null && add > args.maxByWeight) { add = Math.max(0, Math.floor(args.maxByWeight)); limitedBy = "weight"; }
  const additive = args.firstIsAdditive ? aboard : add;
  return { add, room, blend: (additive / (aboard + add)) * 100, limitedBy };
}

/** The finished blend's additive share, from the gallons actually loaded of each. */
export function blendPct(additiveGallons: number, baseGallons: number): number | null {
  const t = additiveGallons + baseGallons;
  return t > 0 ? (additiveGallons / t) * 100 : null;
}

/** "E10", "E15": the actual share rounded to a whole percent. */
export function blendLabel(pct: number, prefix = "E"): string {
  return `${prefix}${Math.round(pct)}`;
}

/** True when the blend is farther from its target than the tolerance. */
export function offTarget(actual: number, target: number): boolean {
  return Math.abs(actual - target) > TOLERANCE_PTS;
}

/**
 * The two stop layouts of a plan: the additive stop (each splash compartment holds the additive) and the base
 * stop (every compartment that holds a base product, splash or straight). Compartments left empty are in neither.
 */
export function stopLayouts(plan: Record<number, { empty?: boolean; productId: string; splash?: SplashSpec | null }>): {
  additive: Record<number, string>;
  base: Record<number, string>;
} {
  const additive: Record<number, string> = {};
  const base: Record<number, string> = {};
  for (const [k, v] of Object.entries(plan)) {
    const n = Number(k);
    if (!Number.isFinite(n) || v.empty || !v.productId) continue;
    base[n] = v.productId;
    if (v.splash && v.splash.additiveProductId && validPct(v.splash.pct)) additive[n] = v.splash.additiveProductId;
  }
  return { additive, base };
}
