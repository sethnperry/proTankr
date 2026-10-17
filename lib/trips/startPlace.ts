"use client";
// lib/trips/startPlace.ts
//
// Begin Trip's "Starting from" prefill. In order:
//   1. Where this truck was last known to be (truckLastKnownPlace).
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

type Candidate = StartPlace & { at: string };

// Where this truck was last known to be: the newest of its last finished
// delivery, its last fuel stop, and its last finished load (the terminal).
// Pickup and fuel cities come straight off those records.
export async function truckLastKnownPlace(truckId: string | null): Promise<StartPlace | null> {
  if (!truckId) return null;
  const found: Candidate[] = [];
  const keep = (city: unknown, state: unknown, at: unknown) => {
    const c = typeof city === "string" ? city.trim() : "";
    if (c && typeof at === "string" && at) found.push({ city: c, state: typeof state === "string" && state.trim() ? state.trim() : null, at });
  };
  await Promise.all([
    // Last delivery dropped on a trip with this truck.
    (async () => {
      try {
        const t = await supabase.from("trips").select("trip_id").eq("truck_id", truckId)
          .order("started_at", { ascending: false }).limit(10);
        const ids = ((t.data ?? []) as { trip_id: string }[]).map((x) => x.trip_id);
        if (!ids.length) return;
        const d = await supabase.from("trip_deliveries").select("location_id, left_at").in("trip_id", ids)
          .eq("status", "complete").not("location_id", "is", null).not("left_at", "is", null)
          .order("left_at", { ascending: false }).limit(1);
        const row = ((d.data ?? []) as { location_id: string; left_at: string }[])[0];
        if (!row) return;
        const l = await supabase.from("delivery_locations").select("city, state").eq("location_id", row.location_id).maybeSingle();
        keep((l.data as any)?.city, (l.data as any)?.state, row.left_at);
      } catch {}
    })(),
    // Last fuel stop.
    (async () => {
      try {
        const f = await supabase.from("fuel_purchases").select("city, state, finished_at, started_at").eq("truck_id", truckId)
          .not("city", "is", null).order("started_at", { ascending: false }).limit(1);
        const r = ((f.data ?? []) as any[])[0];
        if (r) keep(r.city, r.state, r.finished_at ?? r.started_at);
      } catch {}
    })(),
    // Last finished load: the terminal it loaded at.
    (async () => {
      try {
        const c = await supabase.from("equipment_combos").select("combo_id").eq("truck_id", truckId);
        const combos = ((c.data ?? []) as { combo_id: string }[]).map((x) => x.combo_id);
        if (!combos.length) return;
        const l = await supabase.from("load_log").select("terminal_id, completed_at").in("combo_id", combos)
          .eq("status", "loaded").not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1);
        const r = ((l.data ?? []) as any[])[0];
        if (!r?.terminal_id) return;
        const t = await supabase.from("terminals").select("city, state").eq("terminal_id", r.terminal_id).maybeSingle();
        keep((t.data as any)?.city, (t.data as any)?.state, r.completed_at);
      } catch {}
    })(),
  ]);
  if (!found.length) return null;
  found.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { city: found[0].city, state: found[0].state };
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
