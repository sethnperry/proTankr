// lib/suppliers/picks.ts
//
// Which supplier each planned product is pulling from at this terminal (the
// supplier name from dispatch). Kept on the phone per terminal, for the
// current visit: picks older than PICK_TTL_MS are dropped so the next visit
// asks again. Pure helpers plus a small storage wrapper.

export type SupplierPick = { product_id: string; supplier_id: string | null; name: string };

export type StoredPicks = { at: number; picks: SupplierPick[]; skipped?: boolean };

export const PICK_TTL_MS = 14 * 60 * 60 * 1000;

export function picksKey(userId: string, terminalId: string): string {
  return `proTankr:u:${userId}:supplierPicks:${terminalId}`;
}

export function readPicks(userId: string | null, terminalId: string | null, now = Date.now()): StoredPicks | null {
  if (!userId || !terminalId) return null;
  try {
    const raw = localStorage.getItem(picksKey(userId, terminalId));
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredPicks;
    if (!v || typeof v.at !== "number" || now - v.at > PICK_TTL_MS) return null;
    return { at: v.at, picks: Array.isArray(v.picks) ? v.picks : [], skipped: !!v.skipped };
  } catch {
    return null;
  }
}

export function writePicks(userId: string | null, terminalId: string | null, value: StoredPicks | null): void {
  if (!userId || !terminalId) return;
  try {
    if (!value) localStorage.removeItem(picksKey(userId, terminalId));
    else localStorage.setItem(picksKey(userId, terminalId), JSON.stringify(value));
  } catch {
    // storage blocked: picks just won't survive a reload
  }
}

/** Set one supplier for the given products (or every planned product when
 * `productIds` is omitted), keeping other products' picks. Result follows
 * `plannedProductIds` order; products no longer planned are dropped. */
export function applyPick(
  current: SupplierPick[],
  plannedProductIds: string[],
  supplier: { supplier_id: string | null; name: string },
  productIds?: string[],
): SupplierPick[] {
  const target = new Set(productIds ?? plannedProductIds);
  const byProduct = new Map(current.map((p) => [p.product_id, p]));
  return plannedProductIds
    .map((pid) => (target.has(pid) ? { product_id: pid, ...supplier } : byProduct.get(pid)))
    .filter((p): p is SupplierPick => !!p);
}

/** Picks grouped by supplier, in first-seen order. */
export function groupPicks(picks: SupplierPick[]): { supplier_id: string | null; name: string; productIds: string[] }[] {
  const out: { supplier_id: string | null; name: string; productIds: string[] }[] = [];
  for (const p of picks) {
    const g = out.find((x) => (x.supplier_id ?? x.name) === (p.supplier_id ?? p.name));
    if (g) g.productIds.push(p.product_id);
    else out.push({ supplier_id: p.supplier_id, name: p.name, productIds: [p.product_id] });
  }
  return out;
}

/** Planned products with no supplier picked yet. */
export function unpickedProducts(picks: SupplierPick[], plannedProductIds: string[]): string[] {
  const have = new Set(picks.map((p) => p.product_id));
  return plannedProductIds.filter((pid) => !have.has(pid));
}

/** Before any product is planned, a pick is stored for ANY_PRODUCT and every
 * product planned later inherits it. */
export const ANY_PRODUCT = "*";

/** The picks to show and use: one per planned product (its own pick, else the
 * ANY_PRODUCT pick), or just the ANY_PRODUCT pick when nothing is planned. */
export function resolvePicks(stored: SupplierPick[], plannedProductIds: string[]): SupplierPick[] {
  const any = stored.find((p) => p.product_id === ANY_PRODUCT) ?? null;
  if (plannedProductIds.length === 0) return any ? [any] : [];
  const own = new Map(stored.map((p) => [p.product_id, p]));
  return plannedProductIds
    .map((pid) => own.get(pid) ?? (any ? { ...any, product_id: pid } : null))
    .filter((p): p is SupplierPick => !!p);
}
