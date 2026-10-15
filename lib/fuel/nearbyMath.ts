// lib/fuel/nearbyMath.ts
//
// Pure distance math for nearby fuel stores (no imports, so it's testable).

export type Pos = { lat: number; lon: number };
export type NearbyStore = { store_name: string; store_number: string | null; city: string | null; state: string | null; lat: number; lon: number; miles: number };

export const STORE_RANGE_MI = 1.5;

export function milesBetween(a: Pos, b: Pos): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Row = { store_name: string | null; store_number: string | null; city: string | null; state: string | null; lat: number | null; lon: number | null };

// Pure: dedupe saved stores, keep those in range, nearest first.
export function pickNearby(rows: Row[], pos: Pos, rangeMi = STORE_RANGE_MI, max = 5): NearbyStore[] {
  const best = new Map<string, NearbyStore>();
  for (const r of rows) {
    if (!r.store_name?.trim() || r.lat == null || r.lon == null) continue;
    const miles = milesBetween(pos, { lat: Number(r.lat), lon: Number(r.lon) });
    if (miles > rangeMi) continue;
    const k = `${r.store_name.trim()}|${r.store_number ?? ""}`.toLowerCase();
    const prev = best.get(k);
    if (!prev || miles < prev.miles) {
      best.set(k, { store_name: r.store_name.trim(), store_number: r.store_number, city: r.city, state: r.state, lat: Number(r.lat), lon: Number(r.lon), miles });
    }
  }
  return [...best.values()].sort((a, b) => a.miles - b.miles).slice(0, max);
}

