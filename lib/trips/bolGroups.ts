// lib/trips/bolGroups.ts
//
// Finish Loading is entered per product, not per compartment: one window per
// product with the BOL, supplier, API, temp, gross and net off that product's
// BOL. When one product came on more than one BOL (two suppliers, say), Split
// Load assigns its compartments to BOL groups and each group gets its own
// window. The gross and net typed for a group are translated onto its
// compartments (allocateBolGallons below), so every compartment still gets a row.
// Pure, no React.

export type GroupLine = { comp: number; productId: string; gallons: number };

export type BolGroup = {
  productId: string;
  // 1-based BOL number within this product.
  bolIndex: number;
  // How many BOL groups this product has.
  bolCount: number;
  comps: number[];
  plannedGallons: number;
};

// Compartment -> BOL group number (1-based) within its product. Missing = 1.
export type BolAssignment = Record<number, number>;

// Groups in the order the driver walks them: products by their first
// compartment in `lines`, then BOL 1, 2, ... Group numbers are renumbered so
// they're always 1..n with no gaps.
export function buildBolGroups(lines: GroupLine[], assign: BolAssignment): BolGroup[] {
  const productOrder: string[] = [];
  const byProduct = new Map<string, Map<number, GroupLine[]>>();
  for (const l of lines) {
    if (!byProduct.has(l.productId)) { byProduct.set(l.productId, new Map()); productOrder.push(l.productId); }
    const g = Math.max(1, Math.floor(assign[l.comp] ?? 1));
    const m = byProduct.get(l.productId)!;
    if (!m.has(g)) m.set(g, []);
    m.get(g)!.push(l);
  }
  const out: BolGroup[] = [];
  for (const pid of productOrder) {
    const m = byProduct.get(pid)!;
    const keys = [...m.keys()].sort((a, b) => a - b);
    keys.forEach((k, i) => {
      const ls = m.get(k)!;
      out.push({
        productId: pid,
        bolIndex: i + 1,
        bolCount: keys.length,
        comps: ls.map((l) => l.comp),
        plannedGallons: ls.reduce((t, l) => t + (Number.isFinite(l.gallons) ? l.gallons : 0), 0),
      });
    });
  }
  return out;
}

// Starting assignment: compartments of a product that already carry
// different BOL numbers (editing a logged load) start in different groups.
export function initialBolAssignment(lines: GroupLine[], bolByComp: Record<number, string | null | undefined>): BolAssignment {
  const out: BolAssignment = {};
  const seen = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const bol = (bolByComp[l.comp] ?? "").trim().toUpperCase();
    if (!seen.has(l.productId)) seen.set(l.productId, new Map());
    const m = seen.get(l.productId)!;
    if (!bol) { out[l.comp] = 1; continue; }
    if (!m.has(bol)) m.set(bol, m.size + 1);
    out[l.comp] = m.get(bol)!;
  }
  // A product whose only BOL'd compartments sit in group 2+ while blanks are
  // in group 1 is fine; buildBolGroups renumbers anyway.
  return out;
}

// Whole gallons that sum exactly to round(total), spread by `weights`
// (largest remainder). All-zero weights spread evenly.
export function distributeWhole(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const T = Math.round(Math.max(0, total));
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const shares = sum > 0 ? w.map((x) => (T * x) / sum) : w.map(() => T / n);
  const base = shares.map((x) => Math.floor(x));
  let left = T - base.reduce((a, b) => a + b, 0);
  const order = shares
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) base[order[k].i] += 1;
  return base;
}

export type SpreadComp = {
  /** What the plan put in this compartment (or, editing a logged load, what was logged). */
  planned: number;
  /** The most it is planned to take: the driver's own cap or the safety cap, whichever is lower. Null when unknown. */
  cap: number | null;
};

/**
 * Translate a BOL total onto the compartments it covers. The BOL is always right, so this never refuses a total.
 * A compartment planned right at its cap loaded to that cap (a known quantity); the total's difference from the plan
 * lands on the compartments that were not capped (the ones the plan flexes). With nothing capped, or everything capped,
 * or a total smaller than the capped compartments alone, it falls back to spreading the total by planned gallons.
 * Whole gallons that sum exactly to round(total).
 */
export function allocateBolGallons(total: number, comps: SpreadComp[]): number[] {
  const weights = comps.map((c) => (Number.isFinite(c.planned) && c.planned > 0 ? c.planned : 0));
  const T = Math.round(Math.max(0, Number.isFinite(total) ? total : 0));
  const capped = comps.map((c, i) => c.cap != null && Number.isFinite(c.cap) && weights[i] > 0 && weights[i] >= c.cap - 0.5);
  const nCapped = capped.filter(Boolean).length;
  if (nCapped === 0 || nCapped === comps.length) return distributeWhole(T, weights);
  const cappedSum = comps.reduce((t, _c, i) => t + (capped[i] ? Math.round(weights[i]) : 0), 0);
  const remaining = T - cappedSum;
  if (remaining < 0) return distributeWhole(T, weights); // the BOL holds less than the capped compartments alone
  const freeIdx = comps.map((_c, i) => i).filter((i) => !capped[i]);
  const freeShares = distributeWhole(remaining, freeIdx.map((i) => weights[i]));
  const out = comps.map((_c, i) => (capped[i] ? Math.round(weights[i]) : 0));
  freeIdx.forEach((i, k) => { out[i] = freeShares[k]; });
  return out;
}
