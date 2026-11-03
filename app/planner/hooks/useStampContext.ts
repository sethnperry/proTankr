"use client";
// app/planner/hooks/useStampContext.ts
//
// What the odometer pop-out knows while it opens: the truck's odometer when the tracker answers (a guess the driver
// confirms), and where the truck is. Place order: the terminal the driver was at, then the phone's GPS, then the
// tracker, then blank. Nothing here can block the driver: every source can fail.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { fetchTruckReadingResult } from "@/lib/telematics/useTruckReading";
import { placeFor, type StampSource } from "@/lib/moves/emptyMoves";
import type { DeliveryLocation } from "@/lib/trips/deliveryLocations";

export type StampContext = {
  loading: boolean; guess: number | null; lat: number | null; lon: number | null;
  placeId: string | null; placeText: string | null; source: StampSource;
};
const EMPTY: StampContext = { loading: false, guess: null, lat: null, lon: null, placeId: null, placeText: null, source: "none" };

const gps = () => new Promise<{ lat: number; lon: number } | null>((resolve) => {
  if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
  const t = window.setTimeout(() => resolve(null), 7000);
  navigator.geolocation.getCurrentPosition((p) => { window.clearTimeout(t); resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); }, () => { window.clearTimeout(t); resolve(null); }, { timeout: 6000, maximumAge: 120_000 });
});

async function cityAt(pos: { lat: number; lon: number }): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch(`/api/geocode?lat=${pos.lat}&lon=${pos.lon}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j = (await r.json()) as { city?: string; state?: string | null };
    return j.city ? [j.city, j.state].filter(Boolean).join(", ") : null;
  } catch { return null; }
}

export function useStampContext(o: { active: boolean; truckId: string | null; locations: DeliveryLocation[]; terminalPlaceId?: string | null; terminalText?: string | null }) {
  const { active, truckId, locations, terminalPlaceId, terminalText } = o;
  const [ctx, setCtx] = useState<StampContext>(EMPTY);

  useEffect(() => {
    if (!active) { setCtx(EMPTY); return; }
    let alive = true;
    setCtx({ ...EMPTY, loading: true });
    void (async () => {
      const [reading, pos] = await Promise.all([truckId ? fetchTruckReadingResult(truckId, { slim: true, fresh: true }).then((r) => r.reading) : Promise.resolve(null), gps()]);
      let place: { id: string | null; text: string | null } = { id: null, text: null };
      let source: StampSource = "none";
      let at = pos;
      if (terminalPlaceId || terminalText) { place = { id: terminalPlaceId ?? null, text: terminalPlaceId ? null : terminalText ?? null }; source = "terminal"; }
      else if (pos) { place = placeFor(locations, pos, await cityAt(pos)); source = place.id || place.text ? "gps" : "none"; }
      if (source === "none" && reading?.lat != null && reading?.lon != null) {
        at = { lat: reading.lat, lon: reading.lon };
        place = placeFor(locations, at, [reading.city, reading.state].filter(Boolean).join(", ") || null);
        source = place.id || place.text ? "geotab" : "none";
      }
      if (alive) setCtx({ loading: false, guess: reading?.odometerMi != null ? Math.round(reading.odometerMi) : null, lat: at?.lat ?? null, lon: at?.lon ?? null, placeId: place.id, placeText: place.text, source });
    })();
    return () => { alive = false; };
  }, [active, truckId, terminalPlaceId, terminalText]); // eslint-disable-line react-hooks/exhaustive-deps
  return ctx;
}
