// lib/dispatch/drops.ts
//
// A load with more than one drop: which compartments come off at each stop.
// The first drop gets whatever the later drops do not take. Compartment numbers, 1 = front.
export type ExtraDrop = { locationId: string; comps: number[] };

/** Compartments (filled ones) the first drop delivers: everything not kept for a later drop. */
export function firstDropComps(filled: number[], extra: ExtraDrop[]): number[] {
  const kept = new Set(extra.flatMap((e) => e.comps));
  return filled.filter((n) => !kept.has(n));
}

/** Null when the split works; otherwise what is wrong, in plain words. */
export function splitProblem(filled: number[], extra: ExtraDrop[]): string | null {
  const seen = new Set<number>();
  for (const e of extra) {
    if (e.comps.length === 0) return "Every drop needs at least one compartment.";
    for (const n of e.comps) { if (seen.has(n)) return "A compartment can only go to one drop."; seen.add(n); }
  }
  return firstDropComps(filled, extra).length === 0 ? "The first drop needs at least one compartment." : null;
}
