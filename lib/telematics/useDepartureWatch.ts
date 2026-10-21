"use client";
// lib/telematics/useDepartureWatch.ts
//
// While the truck is at a stop (arrived, not yet left), watch for it leaving
// the stop's geofence. The first time it is outside and moving, that time is
// kept on the phone (geoDepartures) and becomes the default Depart / Finished
// time, so the record shows when the truck really left, not when the driver
// got to the screen.

import { useEffect, useRef } from "react";
import { fenceFor, inside, NEW_EXIT, stepExit, type ExitWatch } from "./geofence";
import { writeGeoDeparture } from "./geoDepartures";
import { learnedPoints, type ArrivalTarget } from "./useArrivalSuggestion";
import { fetchTruckReading } from "./useTruckReading";

const POLL_MS = 60_000;
const FRESH_MS = 10 * 60_000;

export function useDepartureWatch(o: { companyId: string | null; truckId: string | null; stopKey: string | null; target: ArrivalTarget | null; enabled: boolean }) {
  const { companyId, truckId, stopKey, target, enabled } = o;
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    if (!enabled || !companyId || !truckId || !stopKey || !targetRef.current) return;
    let off = false;
    let timer: number | undefined;
    let w: ExitWatch = NEW_EXIT;
    let fence: ReturnType<typeof fenceFor> | undefined;
    const tick = async () => {
      if (off) return;
      const t = targetRef.current;
      if (t && document.visibilityState !== "hidden") {
        try {
          if (fence === undefined) fence = fenceFor(await learnedPoints(companyId, t), t.catalog);
          const r = await fetchTruckReading(truckId);
          if (off || !r) return; // no telematics: stop checking
          if (fence && r.lat != null && r.lon != null && r.at && Date.now() - Date.parse(r.at) <= FRESH_MS) {
            w = stepExit(w, { inside: inside({ lat: r.lat, lon: r.lon }, fence), speedMph: r.speedMph ?? null, nowMs: Date.now() });
            if (w.confirmedAtMs != null) { writeGeoDeparture(stopKey, new Date(w.confirmedAtMs).toISOString()); return; }
          }
        } catch { /* try again next minute */ }
      }
      if (!off) timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [enabled, companyId, truckId, stopKey]);
}
