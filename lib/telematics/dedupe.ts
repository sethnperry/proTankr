// lib/telematics/dedupe.ts
//
// Geotab can hold several records with the same unit name (an old and a new device, a re-added
// asset). For the import list we keep one per name: the most complete, then the most recently
// activated. Retired vehicles (an end date in the past) are dropped first. Pure.

import type { ProviderVehicle } from "./types";

const SENTINEL_YEAR = 2040; // Geotab uses 2050-01-01 for "never ends"

export function isRetired(v: { activeTo?: string | null }, now = Date.now()): boolean {
  if (!v.activeTo) return false;
  const t = Date.parse(v.activeTo);
  return Number.isFinite(t) && t < now && new Date(t).getUTCFullYear() < SENTINEL_YEAR;
}

/** How many useful fields a vehicle record carries. */
export function completeness(v: { vin?: string | null; plate?: string | null; groupIds?: string[]; groups?: string[] }): number {
  return (v.vin ? 1 : 0) + (v.plate ? 1 : 0) + ((v.groupIds?.length ?? v.groups?.length ?? 0) > 0 ? 1 : 0);
}

type Rankable = { name: string; vin?: string | null; plate?: string | null; groupIds?: string[]; groups?: string[]; activeFrom?: string | null };

/** One record per name (case-insensitive), best first; keeps the input order of the winners. */
export function bestPerName<T extends Rankable>(items: T[]): T[] {
  const best = new Map<string, T>();
  const better = (a: T, b: T) => {
    const ca = completeness(a), cb = completeness(b);
    if (ca !== cb) return ca > cb;
    return (Date.parse(a.activeFrom ?? "") || 0) > (Date.parse(b.activeFrom ?? "") || 0);
  };
  for (const it of items) {
    const k = it.name.trim().toLowerCase();
    const cur = best.get(k);
    if (!cur || better(it, cur)) best.set(k, it);
  }
  const keep = new Set(best.values());
  return items.filter((i) => keep.has(i));
}

/** Vehicles worth offering: not retired, one per name. */
export function importableVehicles(vs: ProviderVehicle[], now = Date.now()): ProviderVehicle[] {
  return bestPerName(vs.filter((v) => !isRetired(v, now)));
}
