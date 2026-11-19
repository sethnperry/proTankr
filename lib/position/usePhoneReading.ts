"use client";
// lib/position/usePhoneReading.ts
//
// getPhoneReading(): one fix from the phone now (a minute old at most), as a reading. Remembers the last fix so speed
// can be worked out when the phone gives none. Stops asking for the rest of the session once the driver has refused
// location. Pure parts: phoneReading.ts.

import { toReading, type Fix, type PhoneReading } from "./phoneReading";

let last: Fix | null = null;
let denied = false;

export const phoneLocationDenied = () => denied;

export function getPhoneReading(): Promise<PhoneReading | null> {
  if (denied || typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(null), 9000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        window.clearTimeout(t);
        const cur: Fix = { lat: p.coords.latitude, lon: p.coords.longitude, atMs: p.timestamp || Date.now(), speedMps: p.coords.speed, accuracyM: p.coords.accuracy };
        const r = toReading(last, cur);
        last = cur;
        resolve(r);
      },
      (e) => { window.clearTimeout(t); if (e.code === 1) denied = true; resolve(null); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 20_000 },
    );
  });
}
