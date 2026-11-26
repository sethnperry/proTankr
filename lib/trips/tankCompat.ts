// lib/trips/tankCompat.ts
//
// Products that are always acceptable in another product's store tank. A store without an E15 tank takes E15 into its
// regular (E10) gasoline tank. Pure, by product name, so a new pair is one line below.

type Named = { name?: string | null; code?: string | null } | null | undefined;

const text = (p: Named) => `${p?.name ?? ""} ${p?.code ?? ""}`;

const RULES: { from: RegExp; into: RegExp }[] = [
  // E15 into regular unleaded (E10 87).
  { from: /\bE15\b/i, into: /regular|\bE10\b|\b87\b/i },
];

/** True when `product` may go into a tank saved for `tankProduct` although they are different products. */
export function tankAccepts(product: Named, tankProduct: Named): boolean {
  if (!product || !tankProduct) return false;
  return RULES.some((r) => r.from.test(text(product)) && r.into.test(text(tankProduct)) && !r.from.test(text(tankProduct)));
}
