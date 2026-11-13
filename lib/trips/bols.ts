// lib/trips/bols.ts
//
// The BOLs on a trip. A split load can carry several BOL numbers (a different supplier per product, or loads from
// more than one terminal), and each needs its own scan. A scan is saved against its BOL number so the package
// can say which paper belongs to which number, and which numbers have no scan yet. Pure.

import type { TripCompartmentLoadRow, TripPickupRow } from "./types.ts";

export type BolGroup = {
  /** Normalised number (trimmed, upper case), or null for compartments with no BOL number entered. */
  bol: string | null;
  supplier: string | null;
  products: string[];
  comps: number[];
  pickup: string | null;
};

export const normBol = (n: string | null | undefined): string | null => {
  const t = String(n ?? "").trim().toUpperCase();
  return t || null;
};

/** What a scan's `ref_type` says: "bol:759277". */
export const bolRef = (bol: string) => `bol:${bol}`;
export const parseBolRef = (refType: string | null | undefined): string | null => (refType && refType.startsWith("bol:") ? refType.slice(4) || null : null);

export function bolGroups(loads: TripCompartmentLoadRow[], pickups: TripPickupRow[], productName: (id: string | null) => string): BolGroup[] {
  const pick = new Map(pickups.map((p) => [p.pickup_id, p.name ?? null]));
  const out = new Map<string, BolGroup>();
  for (const c of loads) {
    if (c.disposition === "cancelled") continue;
    const bol = normBol(c.bol_number);
    const key = bol ?? "";
    const g = out.get(key) ?? { bol, supplier: null, products: [], comps: [], pickup: null };
    if (!g.supplier && c.supplier) g.supplier = c.supplier;
    const pn = productName(c.product_id);
    if (!g.products.includes(pn)) g.products.push(pn);
    if (!g.comps.includes(c.comp_number)) g.comps.push(c.comp_number);
    if (!g.pickup) g.pickup = (c.pickup_id && pick.get(c.pickup_id)) || null;
    out.set(key, g);
  }
  return [...out.values()].map((g) => ({ ...g, comps: g.comps.sort((a, b) => a - b) })).sort((a, b) => (a.bol == null ? 1 : 0) - (b.bol == null ? 1 : 0) || (a.bol ?? "").localeCompare(b.bol ?? "", undefined, { numeric: true }));
}

/** Pages scanned per BOL number, from the captures' ref types and photo counts. */
export function pagesByBol(rows: { ref_type: string | null; file_paths: string[] | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const b = parseBolRef(r.ref_type);
    if (b) out[b] = (out[b] ?? 0) + (r.file_paths?.length ?? 0);
  }
  return out;
}

/** BOL numbers with no scan yet (numbers only: a compartment with no number can't be scanned against anything). */
export const unscanned = (groups: BolGroup[], pages: Record<string, number>): BolGroup[] => groups.filter((g) => g.bol && !(pages[g.bol] > 0));
