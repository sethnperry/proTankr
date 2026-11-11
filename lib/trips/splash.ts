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

/** The top-off for a compartment from what is aboard. With the plan's additive known, which product went first follows
 *  from the product aboard; without it, what is aboard is taken to be the product the percent belongs to. */
export function topOffFor(args: { aboardProductId: string | null; aboardGallons: number; max: number; pct: number; additiveProductId?: string | null; maxByWeight?: number | null }) {
  const firstIsAdditive = args.additiveProductId ? args.aboardProductId === args.additiveProductId : true;
  return { firstIsAdditive, ...topOff({ firstIsAdditive, aboard: args.aboardGallons, pct: args.pct, max: args.max, maxByWeight: args.maxByWeight }) };
}

/** A conservative lbs/gal for a product when its real reading isn't known yet (the second stop's API and temp are
 *  unknown at the time of planning). Rounded toward the heavy side so the weight check errs safe. */
export function roughLbsPerGal(name: string): number {
  const n = name.toLowerCase();
  if (/eth|e85|alcohol/.test(n)) return 6.7;
  if (/diesel|d2|ulsd|dyed|b\d+|kero|jet|heating/.test(n)) return 7.2;
  return 6.4;
}

export type TopOffInput = { n: number; aboardProductId: string | null; aboardGallons: number; max: number; pct: number; additiveProductId?: string | null; topProductId: string | null };

/** Top-offs for several compartments sharing one weight allowance: `roomLbs` (legal gross less what is aboard) is
 *  handed out compartment by compartment, so the last one is the adjuster that gives way first. */
export function topOffPlan(comps: TopOffInput[], roomLbs: number | null, lbsPerGal: (productId: string | null) => number) {
  let left = roomLbs;
  const out = new Map<number, ReturnType<typeof topOffFor> & { lbs: number }>();
  for (const c of [...comps].sort((a, b) => a.n - b.n)) {
    const d = lbsPerGal(c.topProductId);
    const r = topOffFor({ aboardProductId: c.aboardProductId, aboardGallons: c.aboardGallons, max: c.max, pct: c.pct, additiveProductId: c.additiveProductId, maxByWeight: left == null ? null : Math.max(0, Math.floor(left / d)) });
    if (left != null) left = Math.max(0, left - r.add * d);
    out.set(c.n, { ...r, lbs: r.add * d });
  }
  return out;
}

export type BlendableRow = { compartment_load_id: string; comp_number: number; product_id: string | null; gross_gallons: number | null };

/** A compartment loaded twice (a splash blend) is one blended compartment at the drop: the larger load stands in for
 *  it with the gallons summed and the blend label ("E10") from the actual additive share. `hidden` maps the stand-in
 *  to the other rows, which are delivered with it. */
export function mergeBlendRows<T extends BlendableRow & { bio_blend?: string | null }>(rows: T[], additiveByComp: Record<number, string | undefined> = {}) {
  const byComp = new Map<number, T[]>();
  for (const r of rows) byComp.set(r.comp_number, [...(byComp.get(r.comp_number) ?? []), r]);
  const merged: T[] = [];
  const hidden: Record<string, string[]> = {};
  for (const list of byComp.values()) {
    if (list.length < 2) { merged.push(...list); continue; }
    const sorted = [...list].sort((a, b) => (b.gross_gallons ?? 0) - (a.gross_gallons ?? 0));
    const rep = sorted[0];
    const known = additiveByComp[rep.comp_number];
    const additive = sorted.find((r) => known && r.product_id === known) ?? sorted[sorted.length - 1];
    const addGal = additive.gross_gallons ?? 0;
    const total = sorted.reduce((s, r) => s + (r.gross_gallons ?? 0), 0);
    const pct = blendPct(addGal, total - addGal);
    // The stand-in carries the base product so it matches the store's tank; the additive row follows it.
    const base = sorted.find((r) => r !== additive) ?? rep;
    merged.push({ ...base, gross_gallons: total, bio_blend: pct != null ? blendLabel(pct) : base.bio_blend ?? null });
    hidden[base.compartment_load_id] = sorted.filter((r) => r !== base).map((r) => r.compartment_load_id);
  }
  return { rows: merged, hidden };
}
