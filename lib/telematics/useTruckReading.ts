"use client";
// lib/telematics/useTruckReading.ts
//
// The truck's live odometer and position from the company's telematics
// connection. Fetches each time `active` turns on. Returns null when there is
// no connection, no match or the provider is down, so callers just keep typing.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type TruckReading = { odometerMi: number | null; fuelLevelPct?: number | null; trailerId?: string | null; trailerName?: string | null; trailerKnown?: boolean; city: string | null; state: string | null; lat: number | null; lon: number | null; speedMph?: number | null; at: string | null };

export async function fetchTruckReading(truckId: string | null): Promise<TruckReading | null> {
  if (!truckId) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch(`/api/telematics/vehicle?truckId=${encodeURIComponent(truckId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.connected ? (j as TruckReading) : null;
  } catch {
    return null;
  }
}

export function useTruckReading(truckId: string | null, active: boolean): TruckReading | null {
  const [reading, setReading] = useState<TruckReading | null>(null);
  useEffect(() => {
    if (!active || !truckId) { setReading(null); return; }
    let cancelled = false;
    void fetchTruckReading(truckId).then((r) => { if (!cancelled) setReading(r); });
    return () => { cancelled = true; };
  }, [truckId, active]);
  return reading;
}
