// lib/position/phoneReading.ts
//
// The phone's own position as a reading, for arrival and departure detection. Same shape the tracker readings had
// (lat, lon, at, speedMph), so the geofence code in lib/telematics/geofence.ts works on it unchanged. Speed comes from
// the phone when it gives one, else from the distance between two fixes. A fix that is too vague is dropped.

import { airMiles } from "../trips/deliveryLocations.ts";

export type PhoneReading = { lat: number; lon: number; at: string; speedMph: number | null; accuracyM: number | null };
export type Fix = { lat: number; lon: number; atMs: number; speedMps: number | null; accuracyM: number | null };

export const MAX_ACCURACY_M = 250;
const MAX_GAP_MS = 5 * 60_000;
const MIN_GAP_MS = 5_000;

/** Speed in mph: the phone's own when given, else worked out from the last fix. Null when neither can be trusted. */
export function speedMph(prev: Fix | null, cur: Fix): number | null {
  if (cur.speedMps != null && Number.isFinite(cur.speedMps) && cur.speedMps >= 0) return cur.speedMps * 2.23694;
  if (!prev) return null;
  const dt = cur.atMs - prev.atMs;
  if (dt < MIN_GAP_MS || dt > MAX_GAP_MS) return null;
  return airMiles({ lat: prev.lat, lon: prev.lon }, { lat: cur.lat, lon: cur.lon }) / (dt / 3_600_000);
}

/** A reading from a fix, or null when the fix is too vague to place a truck at a stop. */
export function toReading(prev: Fix | null, cur: Fix): PhoneReading | null {
  if (cur.accuracyM != null && cur.accuracyM > MAX_ACCURACY_M) return null;
  return { lat: cur.lat, lon: cur.lon, at: new Date(cur.atMs).toISOString(), speedMph: speedMph(prev, cur), accuracyM: cur.accuracyM };
}
