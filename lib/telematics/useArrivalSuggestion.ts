"use client";
// lib/telematics/useArrivalSuggestion.ts
//
// Arrival detection for the Driver Dashboard. While the trip's next step is
// "Arrive" at a terminal or store and the company has a telematics link, the
// truck's position is checked each minute against that stop's geofence. When it
// has come to rest inside, `suggest` carries the time it first did, and the
// dashboard offers the driver an Arrive tap back-dated to then. Never stamps on
// its own. Also exports `recordArrivalPoint`, which teaches the geofence where
// trucks really stop.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { LatLon } from "@/lib/trips/deliveryLocations";
import { fenceFor, inside, NEW_WATCH, plausiblePoint, stepWatch, type Watch } from "./geofence";
import { fetchTruckReading } from "./useTruckReading";

export type ArrivalTarget = { kind: "terminal" | "location"; refId: string; name: string; catalog: LatLon | null };

const POLL_MS = 60_000;
const FRESH_MS = 10 * 60_000;

export async function learnedPoints(companyId: string, t: ArrivalTarget): Promise<LatLon[]> {
  try {
    const { data } = await supabase.from("stop_arrival_points").select("lat, lon").eq("company_id", companyId).eq("kind", t.kind).eq("ref_id", t.refId)
      .order("created_at", { ascending: false }).limit(12);
    return ((data ?? []) as { lat: number; lon: number }[]).map((r) => ({ lat: Number(r.lat), lon: Number(r.lon) }));
  } catch {
    return [];
  }
}

/** Remember where the truck is right now as an arrival point for this stop. */
export async function recordArrivalPoint(o: { companyId: string; userId: string; truckId: string | null; target: ArrivalTarget }): Promise<void> {
  try {
    const r = await fetchTruckReading(o.truckId);
    if (!r || r.lat == null || r.lon == null) return;
    if (r.at && Date.now() - Date.parse(r.at) > FRESH_MS) return;
    const p = { lat: r.lat, lon: r.lon };
    if (!plausiblePoint(p, o.target.catalog)) return;
    await supabase.from("stop_arrival_points").insert({ company_id: o.companyId, kind: o.target.kind, ref_id: o.target.refId, lat: p.lat, lon: p.lon, recorded_by: o.userId });
  } catch { /* learning is best effort */ }
}

export function useArrivalSuggestion(o: { companyId: string | null; truckId: string | null; target: ArrivalTarget | null; enabled: boolean }) {
  const { companyId, truckId, target, enabled } = o;
  const key = target ? `${target.kind}:${target.refId}` : "";
  const [sinceMs, setSinceMs] = useState<number | null>(null);
  const [learned, setLearned] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const watch = useRef<Watch>(NEW_WATCH);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    watch.current = NEW_WATCH;
    setSinceMs(null);
    if (!enabled || !companyId || !truckId || !key) return;
    let off = false;
    let timer: number | undefined;
    let fence: ReturnType<typeof fenceFor> | undefined;
    const tick = async () => {
      if (off) return;
      const t = targetRef.current;
      if (t && document.visibilityState !== "hidden") {
        try {
          if (fence === undefined) { fence = fenceFor(await learnedPoints(companyId, t), t.catalog); setLearned(!!fence?.learned); }
          const r = await fetchTruckReading(truckId);
          if (off) return;
          if (!r) return; // no telematics: stop checking
          if (fence && r.lat != null && r.lon != null && r.at && Date.now() - Date.parse(r.at) <= FRESH_MS) {
            watch.current = stepWatch(watch.current, { inside: inside({ lat: r.lat, lon: r.lon }, fence), speedMph: r.speedMph ?? null, nowMs: Date.now() });
            setSinceMs(watch.current.confirmedAtMs);
          }
        } catch { /* try again next minute */ }
      }
      if (!off) timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [enabled, companyId, truckId, key]);

  const snooze = useCallback((min = 20) => setSnoozedUntil(Date.now() + min * 60_000), []);
  const suggest = sinceMs != null && Date.now() >= snoozedUntil ? { sinceMs } : null;
  return { suggest, snooze, learned };
}
