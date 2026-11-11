// lib/trips/splashRows.ts
//
// Splash blending as the trip card shows it: the plan's E0 compartments get a second pickup (the ethanol terminal).
// The two pickups carry planned_comps: the base pickup every compartment of the plan, the splash pickup only the
// splash compartments with the additive. Splash entries carry the gallons to load; the first stop's come from the
// planned volume (with the cushion), the second stop's are the adjuster, worked out from what is really aboard.

import { stageGallons, topOffPlan, validPct, type SplashSpec } from "./splash.ts";

export type PlanComp = { n: number; size: number; base: string };
export type StagedPlanned = { comp_number: number; product_id: string; splash?: { pct: number; aboard: number; add: number } };

/** Base products that can take a splash: ethanol-free gasoline (E0) and RBOB blendstock. */
export function isSplashable(productName: string | null | undefined): boolean {
  return /\bE0\b|\bRBOB\b/i.test(productName ?? "");
}

/** Share of the splash compartments' volume the weight allows (1 = all of it). Other compartments load full. */
function weightScale(args: { comps: PlanComp[]; splash: Record<number, SplashSpec>; roomLbs?: number | null; lbsPerGal?: (productId: string | null) => number }): number {
  const d = args.lbsPerGal;
  if (args.roomLbs == null || !d) return 1;
  let fixed = 0, wanted = 0;
  for (const c of args.comps) {
    const sp = args.splash[c.n];
    if (!sp || !validPct(sp.pct)) { fixed += c.size * d(c.base); continue; }
    const total = stageGallons({ volume: c.size, pct: sp.pct }).total;
    wanted += total * ((1 - sp.pct / 100) * d(c.base) + (sp.pct / 100) * d(sp.additiveProductId));
  }
  if (wanted <= 0) return 1;
  return Math.max(0, Math.min(1, (args.roomLbs - fixed) / wanted));
}

/**
 * Both pickups' planned_comps. `baseFirst`: the base terminal loads first (its splash compartments take the base
 * share of the planned volume, the ethanol stop adjusts); otherwise the ethanol stop goes first and the base stop adjusts.
 */
export function splashPickupPlans(args: {
  comps: PlanComp[]; splash: Record<number, SplashSpec>;
  /** Weight the whole load may add (legal gross less the empty rig), with a density per product. When the planned volumes
   *  would go over it, the splash compartments are staged smaller so the blend still fits; omitted, volume rules. */
  roomLbs?: number | null; lbsPerGal?: (productId: string | null) => number;
}): { base: StagedPlanned[]; splash: StagedPlanned[] } {
  const base: StagedPlanned[] = [];
  const splash: StagedPlanned[] = [];
  const scale = weightScale(args);
  for (const c of [...args.comps].sort((a, b) => a.n - b.n)) {
    const sp = args.splash[c.n];
    if (!sp || !validPct(sp.pct)) { base.push({ comp_number: c.n, product_id: c.base }); continue; }
    const st = stageGallons({ volume: Math.floor(c.size * scale), pct: sp.pct });
    base.push({ comp_number: c.n, product_id: c.base, splash: { pct: sp.pct, aboard: 0, add: Math.max(1, st.base) } });
    splash.push({ comp_number: c.n, product_id: sp.additiveProductId, splash: { pct: sp.pct, aboard: 0, add: Math.max(1, st.additive) } });
  }
  return { base, splash };
}

/**
 * The second stop's splash compartments re-worked from what the first stop put aboard, held to the room left in each
 * compartment and the weight room. Returns the new planned_comps, or null when nothing changed.
 */
export function refineSecondStop(args: {
  planned: StagedPlanned[];
  aboard: Record<number, { product_id: string | null; gallons: number }>;
  splash: Record<number, SplashSpec>;
  sizes: Record<number, number>;
  roomLbs: number | null;
  lbsPerGal: (productId: string | null) => number;
}): StagedPlanned[] | null {
  const comps = args.planned.filter((p) => p.splash && args.aboard[p.comp_number]?.gallons > 0 && args.splash[p.comp_number]);
  if (!comps.length) return null;
  const plan = topOffPlan(comps.map((p) => ({
    n: p.comp_number, aboardProductId: args.aboard[p.comp_number].product_id, aboardGallons: args.aboard[p.comp_number].gallons,
    max: args.sizes[p.comp_number] || 0, pct: args.splash[p.comp_number].pct, additiveProductId: args.splash[p.comp_number].additiveProductId,
    topProductId: p.product_id,
  })), args.roomLbs, args.lbsPerGal);
  let changed = false;
  const next = args.planned.map((p) => {
    const t = plan.get(p.comp_number);
    if (!p.splash || !t || t.add <= 0) return p;
    const aboard = args.aboard[p.comp_number].gallons;
    if (p.splash.add === t.add && p.splash.aboard === aboard) return p;
    changed = true;
    return { ...p, splash: { ...p.splash, aboard, add: t.add } };
  });
  return changed ? next : null;
}
