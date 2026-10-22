"use client";
// lib/telematics/useTruckReading.ts
//
// The truck's live odometer and position from the company's telematics
// connection. Fetches each time `active` turns on. Returns null when there is
// no connection, no match or the provider is down, so callers just keep typing.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type TruckReading = { odometerMi: number | null; fuelLevelPct?: number | null; engineHours?: number | null; trailerId?: string | null; trailerName?: string | null; trailerKnown?: boolean; city: string | null; state: string | null; lat: number | null; lon: number | null; speedMph?: number | null; at: string | null; driverName?: string | null; heldByName?: string | null;
  bearingDeg?: number | null; isDriving?: boolean | null;
  shipments?: { documentNumber: string; shipperName: string | null; commodity: string | null; activeFrom: string | null }[];
  geotabTrailers?: { name: string; comment: string | null; ours: boolean }[];
  lastDriver?: { name: string; at: string } | null;
  hos?: { driveLeftMin: number | null; dutyLeftMin: number | null; cycleLeftMin: number | null; status: string | null; statusSince?: string | null; offSince?: string | null; at: string } | null };

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

export function useTruckReading(truckId: string | null, active: boolean, pollMs?: number): TruckReading | null {
  const [reading, setReading] = useState<TruckReading | null>(null);
  useEffect(() => {
    if (!active || !truckId) { setReading(null); return; }
    let cancelled = false;
    let timer: number | undefined;
    const run = () => {
      if (pollMs && document.visibilityState === "hidden") { timer = window.setTimeout(run, pollMs); return; }
      void fetchTruckReading(truckId).then((r) => {
        if (cancelled) return;
        setReading(r);
        if (pollMs && r) timer = window.setTimeout(run, pollMs); // no telematics: stop asking
      });
    };
    run();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [truckId, active, pollMs]);
  return reading;
}
