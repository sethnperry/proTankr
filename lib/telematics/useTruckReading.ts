"use client";
// lib/telematics/useTruckReading.ts
//
// The truck's live odometer and position from the company's telematics
// connection. Fetches each time `active` turns on. Returns null when there is
// no connection, no match or the provider is down, so callers just keep typing.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type TruckReading = { odometerMi: number | null; fuelLevelPct?: number | null; engineHours?: number | null; trailerId?: string | null; trailerName?: string | null; trailerKnown?: boolean; city: string | null; state: string | null; lat: number | null; lon: number | null; speedMph?: number | null; at: string | null; driverName?: string | null; heldByName?: string | null;
  bearingDeg?: number | null; isDriving?: boolean | null; communicating?: boolean | null;
  shipments?: { documentNumber: string; shipperName: string | null; commodity: string | null; activeFrom: string | null }[];
  geotabTrailers?: { name: string; comment: string | null; ours: boolean }[];
  lastDriver?: { name: string; at: string } | null;
  hos?: { driveLeftMin: number | null; dutyLeftMin: number | null; cycleLeftMin: number | null; status: string | null; statusSince?: string | null; offSince?: string | null; at: string } | null };

/** The truck's reading, and whether asking failed (provider down, server hiccup) as opposed to "no connection". */
export async function fetchTruckReadingResult(truckId: string | null): Promise<{ reading: TruckReading | null; failed: boolean }> {
  if (!truckId) return { reading: null, failed: false };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { reading: null, failed: false };
    const r = await fetch(`/api/telematics/vehicle?truckId=${encodeURIComponent(truckId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
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

/** Why a vehicle has no position (Geotab's own answers), fetched on request. */
export async function fetchPositionDebug(companyId: string, truckId: string | null, vehicleId: string | null): Promise<string[]> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const qs = truckId ? `truckId=${encodeURIComponent(truckId)}` : `companyId=${encodeURIComponent(companyId)}&vehicleId=${encodeURIComponent(vehicleId ?? "")}`;
    const r = await fetch(`/api/telematics/vehicle?${qs}&debug=position`, { headers: { Authorization: `Bearer ${token ?? ""}` }, cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    return j?.lines ?? ["Geotab didn't answer. Try again in a minute."];
  } catch { return ["Couldn't reach the server."]; }
}

/** A Geotab vehicle that isn't a ProTankr truck, by its provider id. */
export async function fetchVehicleReading(companyId: string, vehicleId: string): Promise<TruckReading | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch(`/api/telematics/vehicle?companyId=${encodeURIComponent(companyId)}&vehicleId=${encodeURIComponent(vehicleId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
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
    let failures = 0;
    const run = () => {
      if (pollMs && document.visibilityState === "hidden") { timer = window.setTimeout(run, pollMs); return; }
      void fetchTruckReadingResult(truckId).then(({ reading: r, failed }) => {
        if (cancelled) return;
        if (failed) {
          // Keep the last reading and ask again soon, a few times, instead of going quiet for good.
          failures += 1;
          if (failures <= 5) timer = window.setTimeout(run, pollMs ?? 30_000);
          return;
        }
        failures = 0;
        setReading(r);
        if (pollMs && r) timer = window.setTimeout(run, pollMs); // no telematics: stop asking
      });
    };
    run();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [truckId, active, pollMs]);
  return reading;
}

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
    const r = await fetch(`/api/telematics/shipments?truckId=${encodeURIComponent(truckId)}&since=${encodeURIComponent(sinceIso)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return j?.connected ? (j.shipments ?? []) : [];
  } catch { return []; } finally { clearTimeout(timer); }
}
