// lib/trips/tripSplash.ts
//
// The splash blend set up for a trip: compartment -> additive product and its share. Kept on the device per trip
// (like the plan the trip began with), so the first pickup can be staged and the top-off found later. Pure
// helpers plus a tolerant localStorage read.

import { stageGallons, validPct, type SplashSpec } from "./splash.ts";

export type TripSplash = Record<number, SplashSpec>;

const key = (userId: string, tripId: string) => `proTankr:u:${userId}:tripSplash:${tripId}`;

export function getTripSplash(userId: string | null, tripId: string | null): TripSplash {
  if (!userId || !tripId || typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(userId, tripId)) ?? "null");
    const out: TripSplash = {};
    for (const [k, v] of Object.entries((raw ?? {}) as Record<string, any>)) {
      const n = Number(k);
      if (Number.isFinite(n) && typeof v?.additiveProductId === "string" && v.additiveProductId && validPct(Number(v.pct))) {
        out[n] = { additiveProductId: v.additiveProductId, pct: Number(v.pct) };
      }
    }
    return out;
  } catch { return {}; }
}

export function setTripSplash(userId: string, tripId: string, splash: TripSplash) {
  try {
    if (!Object.keys(splash).length) window.localStorage.removeItem(key(userId, tripId));
    else window.localStorage.setItem(key(userId, tripId), JSON.stringify(splash));
  } catch { /* ignore */ }
}

export type StagedComp = { comp_number: number; product_id: string; splash?: { pct: number; aboard: number; add: number } };

/**
 * What the first loading pickup plans, from what its rack sells. A splash compartment loads the additive when the
 * rack has it (additive first), else the base when it has that; a straight compartment loads when the rack has its
 * product. `bases` is each compartment's planned (base) product, `sizes` its gallons.
 * Returns null when nothing here can be staged (no splash, or nothing the rack sells).
 */
export function stageFirstPickup(args: {
  splash: TripSplash;
  bases: Record<number, string>;
  sizes: Record<number, number>;
  rackProductIds: string[];
}): StagedComp[] | null {
  const rack = new Set(args.rackProductIds);
  if (!Object.keys(args.splash).length) return null;
  const out: StagedComp[] = [];
  for (const [k, base] of Object.entries(args.bases)) {
    const n = Number(k);
    const sp = args.splash[n];
    if (!sp) {
      if (rack.has(base)) out.push({ comp_number: n, product_id: base });
      continue;
    }
    const st = stageGallons({ volume: args.sizes[n] ?? 0, pct: sp.pct });
    if (rack.has(sp.additiveProductId)) out.push({ comp_number: n, product_id: sp.additiveProductId, splash: { pct: sp.pct, aboard: 0, add: st.additive } });
    else if (rack.has(base)) out.push({ comp_number: n, product_id: base, splash: { pct: sp.pct, aboard: 0, add: st.base } });
  }
  out.sort((a, b) => a.comp_number - b.comp_number);
  return out.length && out.some((c) => c.splash) ? out : null;
}

/** Compartments set up for a splash that have only their first load aboard: they still need the top-off. */
export function pendingTopOffs(args: {
  splash: TripSplash;
  aboard: Record<number, { product_id: string | null; gallons: number | null; rows?: number }>;
}): number[] {
  return Object.keys(args.splash).map(Number).filter((n) => {
    const a = args.aboard[n];
    return !!a && (a.rows ?? 1) === 1 && (a.gallons ?? 0) > 0;
  }).sort((a, b) => a - b);
}
