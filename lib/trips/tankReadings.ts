// lib/trips/tankReadings.ts
//
// Finish Delivery tank readings, per product: the before and after reading of
// EVERY store tank holding that product, not just the ones dropped into,
// because manifolded tanks level out between the drop and the after receipt.
// The total rise is compared to what was delivered. Customers pump during the
// drop, so some gap is normal: over 25 gal shows orange, over 100 red.
// Inches (a stuck tank) can't be compared; dispatch converts with the chart.
// Water is always inches. Pure, no React.

export type ReadingUnit = "gallons" | "inches";

export const WARN_GALLONS = 25;
export const BAD_GALLONS = 100;

export type TankPair = { before: number | null; after: number | null };

export type Discrepancy = {
  rise: number; // total change across the product's tanks
  delivered: number;
  diff: number; // rise - delivered (negative = tanks show less than delivered)
  level: "ok" | "warn" | "bad";
};

// Null until every tank of the product has both readings, in gallons.
export function tankDiscrepancy(delivered: number, tanks: TankPair[], unit: ReadingUnit): Discrepancy | null {
  if (unit !== "gallons" || tanks.length === 0 || !Number.isFinite(delivered)) return null;
  let rise = 0;
  for (const t of tanks) {
    if (t.before == null || t.after == null || !Number.isFinite(t.before) || !Number.isFinite(t.after)) return null;
    rise += t.after - t.before;
  }
  const diff = rise - delivered;
  const gap = Math.abs(diff);
  return { rise, delivered, diff, level: gap > BAD_GALLONS ? "bad" : gap > WARN_GALLONS ? "warn" : "ok" };
}

export const DISCREPANCY_COLOR: Record<Discrepancy["level"], string> = {
  ok: "#4ade80",
  warn: "#f59e0b",
  bad: "#f87171",
};

export function fmtSignedGallons(n: number): string {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toLocaleString("en-US")} gal`;
}

// The tanks a product's readings cover: the location's saved tanks for that
// product, then any tank already read or typed for it, numeric order.
export function tanksForProduct(
  productId: string | null,
  locationTanks: { tank_number: string; product_id: string | null; is_active?: boolean }[],
  extra: { tank_number: string; product_id: string | null }[],
): string[] {
  const out: string[] = [];
  const add = (n: string) => { const t = n.trim(); if (t && !out.includes(t)) out.push(t); };
  for (const t of locationTanks) if (t.is_active !== false && productId && t.product_id === productId) add(t.tank_number);
  for (const t of extra) if (t.product_id === productId) add(t.tank_number);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
