// lib/equipment/parkedNearby.ts
//
// What Begin Trip offers when the driver confirms equipment: free pairs parked near where they are now, then their own
// last truck. A pair is a truck with the trailer coupled to it (parking keeps pairs together). Each unit has one pin
// (equipment_parks), left when a shift ended; pins don't age out. Pure.

import { airMiles } from "../trips/deliveryLocations.ts";
import { equipmentState, type ComboLite, type EqState, type LastEq } from "./lastEquipment.ts";

export type ParkPin = { unit_kind: "truck" | "trailer"; unit_id: string; lat: number; lon: number; place_label: string | null; parked_by: string | null; parked_at: string | null };

export type Candidate = {
  key: string;
  truckId: string;
  trailerId: string | null;
  comboId: string | null;
  /** Something active holds one of these units, so a coupling has to take it (force) rather than start fresh. */
  touchesActive: boolean;
  pin: { lat: number; lon: number; label: string | null; parkedBy: string | null; parkedAt: string | null } | null;
  distanceMi: number | null;
  isLast: boolean;
  state: EqState;
};

export const NEARBY_MILES = 0.5;

export function buildCandidates(o: {
  pins: ParkPin[];
  activeCombos: ComboLite[];
  me: string;
  myPos: { lat: number; lon: number } | null;
  last: LastEq | null;
  radiusMi?: number;
}): Candidate[] {
  const radius = o.radiusMi ?? NEARBY_MILES;
  const pin = new Map(o.pins.map((p) => [`${p.unit_kind}:${p.unit_id}`, p]));
  const pinFor = (truckId: string | null, trailerId: string | null) => {
    const p = (truckId && pin.get(`truck:${truckId}`)) || (trailerId && pin.get(`trailer:${trailerId}`)) || null;
    return p ? { lat: p.lat, lon: p.lon, label: p.place_label, parkedBy: p.parked_by, parkedAt: p.parked_at } : null;
  };
  const dist = (p: { lat: number; lon: number } | null) => (p && o.myPos ? airMiles(o.myPos, p) : null);
  const touches = (truckId: string | null, trailerId: string | null) =>
    o.activeCombos.some((c) => c.active && ((truckId && c.truck_id === truckId) || (trailerId && c.trailer_id === trailerId)));

  const out = new Map<string, Candidate>();
  const add = (truckId: string, trailerId: string | null, comboId: string | null, isLast: boolean) => {
    if (out.has(truckId)) { if (isLast) out.get(truckId)!.isLast = true; return; }
    const p = pinFor(truckId, trailerId);
    out.set(truckId, {
      key: truckId, truckId, trailerId, comboId, touchesActive: touches(truckId, trailerId),
      pin: p, distanceMi: dist(p), isLast,
      state: equipmentState({ truckId, trailerId }, o.activeCombos, o.me),
    });
  };

  // Free pairings parked within reach. Anything claimed is in use and has no pin to find.
  for (const c of o.activeCombos) {
    if (!c.active || !c.truck_id || c.claimed_by) continue;
    const p = pinFor(c.truck_id, c.trailer_id);
    const d = dist(p);
    if (p && d != null && d <= radius) add(c.truck_id, c.trailer_id, c.combo_id ?? null, false);
  }
  // A truck parked on its own (not in any active pairing).
  for (const p of o.pins) {
    if (p.unit_kind !== "truck" || out.has(p.unit_id) || touches(p.unit_id, null)) continue;
    const d = o.myPos ? airMiles(o.myPos, p) : null;
    if (d != null && d <= radius) add(p.unit_id, null, null, false);
  }
  if (o.last) {
    const combo = o.activeCombos.find((c) => c.active && c.truck_id === o.last!.truckId && c.trailer_id === o.last!.trailerId);
    add(o.last.truckId, o.last.trailerId, combo?.combo_id ?? null, true);
  }
  // Parked here first, nearest first; the driver's last truck after those unless it is right here too.
  return [...out.values()].sort((a, b) => {
    const na = a.distanceMi != null && a.distanceMi <= radius, nb = b.distanceMi != null && b.distanceMi <= radius;
    if (na !== nb) return na ? -1 : 1;
    if (na && nb) return (a.distanceMi as number) - (b.distanceMi as number) || (a.isLast ? -1 : 1);
    return a.isLast ? -1 : b.isLast ? 1 : 0;
  });
}

/** Google Maps at a point. */
export const mapsUrl = (lat: number, lon: number) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
export const latLonText = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
