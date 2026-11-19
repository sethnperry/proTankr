"use client";
// lib/telematics/useTruckReading.ts
//
// The truck's live odometer and position from the company's telematics
// connection. Fetches each time `active` turns on. Returns null when there is
// no connection, no match or the provider is down, so callers just keep typing.

import { tfetch } from "./switch";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type TruckReading = { odometerMi: number | null; fuelLevelPct?: number | null; engineHours?: number | null; trailerId?: string | null; trailerName?: string | null; trailerKnown?: boolean; city: string | null; state: string | null; lat: number | null; lon: number | null; speedMph?: number | null; at: string | null; driverName?: string | null; heldByName?: string | null;
  geotabUrl?: string | null;
  bearingDeg?: number | null; isDriving?: boolean | null; communicating?: boolean | null;
  shipments?: { documentNumber: string; shipperName: string | null; commodity: string | null; activeFrom: string | null }[];
  geotabTrailers?: { name: string; comment: string | null; ours: boolean }[];
  lastDriver?: { name: string; at: string; outAt?: string | null } | null;
  hos?: { driveLeftMin: number | null; dutyLeftMin: number | null; cycleLeftMin: number | null; status: string | null; statusSince?: string | null; offSince?: string | null; at: string } | null };

/** The truck's reading, and whether asking failed (provider down, server hiccup) as opposed to "no connection". */
export async function fetchTruckReadingResult(truckId: string | null, o?: { slim?: boolean; fresh?: boolean }): Promise<{ reading: TruckReading | null; failed: boolean }> {
  if (!truckId) return { reading: null, failed: false };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { reading: null, failed: false };
    const r = await tfetch(`/api/telematics/vehicle?truckId=${encodeURIComponent(truckId)}${o?.slim ? "&slim=1" : ""}${o?.fresh ? "&fresh=1" : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) return { reading: null, failed: true };
    const j = await r.json();
    return { reading: j?.connected ? (j as TruckReading) : null, failed: false };
  } catch {
    return { reading: null, failed: true };
  }
}

export async function fetchTruckReading(truckId: string | null): Promise<TruckReading | null> {
  return (await fetchTruckReadingResult(truckId)).reading;
}

export function useTruckReading(truckId: string | null, active: boolean, pollMs?: number, fresh = false): TruckReading | null {
  return useTruckReadingState(truckId, active, pollMs, fresh).reading;
}

/** Same as useTruckReading, plus whether the last ask failed outright (provider down, server hiccup). */
export function useTruckReadingState(truckId: string | null, active: boolean, pollMs?: number, fresh = false): { reading: TruckReading | null; failed: boolean } {
  const [reading, setReading] = useState<TruckReading | null>(null);
  const [failedNow, setFailedNow] = useState(false);
  useEffect(() => {
    if (!active || !truckId) { setReading(null); setFailedNow(false); return; }
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    const run = () => {
      if (pollMs && document.visibilityState === "hidden") { timer = window.setTimeout(run, pollMs); return; }
      void fetchTruckReadingResult(truckId, { fresh }).then(({ reading: r, failed }) => {
        if (cancelled) return;
        if (failed) {
          // Keep the last reading and ask again soon, a few times, instead of going quiet for good.
          failures += 1;
          setFailedNow(true);
          if (failures <= 5) timer = window.setTimeout(run, pollMs ?? 30_000);
          return;
        }
        failures = 0;
        setFailedNow(false);
        setReading(r);
        if (pollMs && r) timer = window.setTimeout(run, pollMs); // no telematics: stop asking
      });
    };
    run();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [truckId, active, pollMs, fresh]);
  return { reading, failed: failedNow };
}

export { odometerStatus } from "./odometerStatus";

/** Shipment numbers entered in the telematics app on a truck since a time. Empty when there's no connection. */
export async function fetchTruckShipments(truckId: string | null, sinceIso: string): Promise<{ documentNumber: string; start: string | null; shipperName: string | null; commodity: string | null }[]> {
  if (!truckId) return [];
  // Never holds the driver up: gives up after 6 seconds and the app carries on without a suggestion.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return [];
    const r = await tfetch(`/api/telematics/shipments?truckId=${encodeURIComponent(truckId)}&since=${encodeURIComponent(sinceIso)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return j?.connected ? (j.shipments ?? []) : [];
  } catch { return []; } finally { clearTimeout(timer); }
}
