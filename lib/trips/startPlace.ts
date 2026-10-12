"use client";
// lib/trips/startPlace.ts
//
// Start Load's "Starting from" prefill. In order:
//   1. Where this truck's last finished trip ended (its last delivery's city).
//   2. The phone's location, turned into the nearest city.
// Either can come back empty; the field stays editable.

import { supabase } from "@/lib/supabase/client";

export type StartPlace = { city: string; state: string | null };

// The city of this truck's most recent completed delivery.
export async function truckLastDeliveryCity(truckId: string | null): Promise<StartPlace | null> {
  if (!truckId) return null;
  try {
    const t = await supabase.from("trips").select("trip_id").eq("truck_id", truckId).eq("status", "complete")
      .order("completed_at", { ascending: false }).limit(5);
    const ids = ((t.data ?? []) as { trip_id: string }[]).map((x) => x.trip_id);
    if (!ids.length) return null;
    const d = await supabase.from("trip_deliveries").select("location_id, left_at").in("trip_id", ids)
      .eq("status", "complete").not("location_id", "is", null).order("left_at", { ascending: false, nullsFirst: false }).limit(1);
    const locId = ((d.data ?? []) as { location_id: string }[])[0]?.location_id;
    if (!locId) return null;
    const l = await supabase.from("delivery_locations").select("city, state").eq("location_id", locId).maybeSingle();
    const city = (l.data as { city?: string | null } | null)?.city?.trim();
    return city ? { city, state: (l.data as { state?: string | null }).state ?? null } : null;
  } catch {
    return null;
  }
}

// The phone's current city (asks for location permission).
export async function currentCity(): Promise<StartPlace | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  const pos = await new Promise<GeolocationPosition | null>((resolve) =>
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 10000, maximumAge: 10 * 60 * 1000 }),
  );
  if (!pos) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`/api/geocode?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { city?: string; state?: string | null };
    return j.city ? { city: j.city, state: j.state ?? null } : null;
  } catch {
    return null;
  }
}
