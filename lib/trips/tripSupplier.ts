"use client";
// lib/trips/tripSupplier.ts
//
// The supplier picked on Begin Trip (the one dispatch named). Kept on the
// phone per trip, like the trip's plan (tripPlan.ts). The Planner uses it as
// the preset pick at every rack on the trip, so a rack hop or a later visit
// starts with the same supplier. Changing the supplier in the Planner updates
// it here too.

import { ANY_PRODUCT, writePicks, type SupplierPick } from "../suppliers/picks.ts";

export type TripSupplier = { supplier_id: string | null; name: string };

const key = (userId: string, tripId: string) => `proTankr:u:${userId}:tripSupplier:${tripId}`;

export function getTripSupplier(userId: string | null, tripId: string | null): TripSupplier | null {
  if (!userId || !tripId || typeof window === "undefined") return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(key(userId, tripId)) ?? "null");
    return v && typeof v.name === "string" && v.name.trim() ? { supplier_id: v.supplier_id ?? null, name: v.name } : null;
  } catch {
    return null;
  }
}

export function setTripSupplier(userId: string, tripId: string, s: TripSupplier | null): void {
  try {
    if (!s) window.localStorage.removeItem(key(userId, tripId));
    else window.localStorage.setItem(key(userId, tripId), JSON.stringify(s));
  } catch {
    // storage blocked: the Planner just asks again at the rack
  }
}

/** Same supplier? (by id when both have one, else by name) */
export function sameSupplier(a: TripSupplier | null, b: TripSupplier | null): boolean {
  if (!a || !b) return a === b;
  if (a.supplier_id && b.supplier_id) return a.supplier_id === b.supplier_id;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

/** Picks the Planner should start with at a terminal: the trip supplier for every product. */
export function tripSupplierPicks(s: TripSupplier): SupplierPick[] {
  return [{ product_id: ANY_PRODUCT, supplier_id: s.supplier_id, name: s.name }];
}

/** Sets the trip supplier as this terminal's pick on the phone. */
export function seedTerminalPicks(userId: string, terminalId: string, s: TripSupplier): void {
  writePicks(userId, terminalId, { at: Date.now(), picks: tripSupplierPicks(s) });
}
