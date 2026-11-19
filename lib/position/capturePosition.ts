"use client";
// Browser side of position capture (see captures.ts). capturePosition() is the one call sites use.

import { supabase } from "@/lib/supabase/client";
import { DISABLED_MS, isMissingTable, parseQueue, queueKey, trimQueue, shouldCaptureWake, type Capture, type CaptureCause } from "./captures";

const gps = () => new Promise<{ lat: number; lon: number } | null>((resolve) => {
  if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
  const t = window.setTimeout(() => resolve(null), 7000);
  navigator.geolocation.getCurrentPosition((p) => { window.clearTimeout(t); resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); }, () => { window.clearTimeout(t); resolve(null); }, { timeout: 6000, maximumAge: 60_000 });
});

let disabledUntil = 0;
let flushing = false;
const lastWakeKey = (u: string) => `proTankr:u:${u}:posLastWake`;

export async function flushCaptures(userId: string): Promise<void> {
  if (flushing || Date.now() < disabledUntil || typeof localStorage === "undefined") return;
  flushing = true;
  try {
    const q = parseQueue(localStorage.getItem(queueKey(userId)));
    if (!q.length) return;
    const { error } = await supabase.from("position_captures").upsert(q, { onConflict: "capture_id", ignoreDuplicates: true });
    if (!error) { localStorage.setItem(queueKey(userId), "[]"); return; }
    if (isMissingTable(error)) disabledUntil = Date.now() + DISABLED_MS;
    // Anything else (no signal, a server hiccup): keep the queue and try again on the next capture or wake.
  } catch { /* offline */ } finally { flushing = false; }
}

/** Capture where the unit is now. Pass lat/lon when the caller already has a fix (the odometer pop-out does). */
export async function capturePosition(o: {
  userId: string | null | undefined; companyId: string | null | undefined; truckId: string | null | undefined; trailerId: string | null | undefined;
  cause: CaptureCause; odometer?: number | null; lat?: number | null; lon?: number | null; at?: string;
}): Promise<void> {
  try {
    if (!o.userId || !o.companyId || (!o.truckId && !o.trailerId) || typeof localStorage === "undefined") return;
    if (o.cause === "open" || o.cause === "wake") {
      const last = Number(localStorage.getItem(lastWakeKey(o.userId)) || 0) || null;
      if (!shouldCaptureWake(last, Date.now())) return;
      localStorage.setItem(lastWakeKey(o.userId), String(Date.now()));
    }
    let lat = o.lat ?? null, lon = o.lon ?? null;
    if (lat == null || lon == null) { const g = await gps(); if (!g) return; lat = g.lat; lon = g.lon; }
    const row: Capture = {
      capture_id: crypto.randomUUID(), company_id: o.companyId, user_id: o.userId, truck_id: o.truckId ?? null, trailer_id: o.trailerId ?? null,
      lat, lon, odometer: o.odometer != null && Number.isFinite(o.odometer) ? o.odometer : null, cause: o.cause, captured_at: o.at ?? new Date().toISOString(),
    };
    const q = trimQueue([...parseQueue(localStorage.getItem(queueKey(o.userId))), row]);
    localStorage.setItem(queueKey(o.userId), JSON.stringify(q));
    void flushCaptures(o.userId);
  } catch { /* a capture never gets in the way */ }
}
