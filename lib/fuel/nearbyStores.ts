"use client";
// lib/fuel/nearbyStores.ts
//
// Fuel stores near the phone. Saved stores are the company's past fuel stops
// that have a store name and a position (stamped from the phone when the stop
// was saved). Only the ones within range show, nearest first, so the list
// never grows with every place a driver has fueled.

import { supabase } from "@/lib/supabase/client";

import { pickNearby, type NearbyStore, type Pos, type Row } from "./nearbyMath";
export { STORE_RANGE_MI, milesBetween, pickNearby, type NearbyStore, type Pos } from "./nearbyMath";

// The phone's position, or null (no permission, no fix in 10s).
export function devicePosition(): Promise<Pos | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 2 * 60 * 1000, enableHighAccuracy: true },
    ),
  );
}

export async function nearbyStores(companyId: string, pos: Pos): Promise<NearbyStore[]> {
  // A rough box first (about 0.1° ≈ 7 mi) so the query stays small.
  const { data } = await supabase.from("fuel_purchases").select("store_name,store_number,city,state,lat,lon")
    .eq("company_id", companyId).not("store_name", "is", null)
    .gte("lat", pos.lat - 0.1).lte("lat", pos.lat + 0.1).gte("lon", pos.lon - 0.1).lte("lon", pos.lon + 0.1)
    .order("started_at", { ascending: false }).limit(200);
  return pickNearby((data ?? []) as Row[], pos);
}
