// lib/trips/planMatch.ts
//
// A plan has two parts. The LAYOUT is which product goes in which compartment;
// dispatch sends it and the trailer owns it. The TUNING is the driver's own
// caps and CG. Two plans for one trailer never share a layout, so a layout
// from dispatch either matches one of the driver's saved plans (and their
// tuning applies) or it doesn't (and they choose Customize or Quick load).
//
// Layouts are compared as a list of product ids, highest compartment number
// first (the Planner's right-to-left order), null for an empty compartment.

export type Layout = (string | null)[];

/** A stable string for a layout. Empty compartments count, so C1 ULSD + C2 empty differs from C1 empty + C2 ULSD. */
export function layoutKey(layout: Layout): string {
  return layout.map((p) => (p ? String(p) : "-")).join("|");
}

/** True when the layout has at least one product. */
export function layoutHasProduct(layout: Layout): boolean {
  return layout.some((p) => !!p);
}

export function sameLayout(a: Layout, b: Layout): boolean {
  return layoutKey(a) === layoutKey(b);
}

/** The saved plan whose layout equals this one (first by slot), or null. */
export function findMatchingPlan<T extends { slot: number; comps: Layout }>(plans: T[], layout: Layout): T | null {
  if (!layoutHasProduct(layout)) return null;
  const key = layoutKey(layout);
  return [...plans].sort((x, y) => x.slot - y.slot).find((p) => layoutKey(p.comps) === key) ?? null;
}

/** Turns {compNumber: productId} into a Layout over the trailer's compartments. */
export function layoutFromProducts(products: Record<number, string | null | undefined>, compNumbers: number[]): Layout {
  const nums = compNumbers.length ? [...compNumbers] : Object.keys(products).map(Number);
  return nums.sort((a, b) => b - a).map((n) => (products[n] ? String(products[n]) : null));
}
