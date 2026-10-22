// lib/telematics/readoutLayout.ts
//
// How a truck's live telematics data is laid out. Pure: takes a reading and returns the gauge
// tiles in order, each with a plain value and a tone, so the screen is just drawing them and a
// different provider (or a provider that reports fewer fields) only changes what comes back.

import { compass } from "../equipment/trackFormat.ts";

export type ReadoutInput = {
  odometerMi?: number | null; engineHours?: number | null; fuelLevelPct?: number | null;
  speedMph?: number | null; bearingDeg?: number | null; isDriving?: boolean | null;
};
export type Tone = "normal" | "good" | "warn" | "bad" | "muted";
export type Tile = { key: string; label: string; value: string; unit?: string; sub?: string; tone: Tone; bar?: number };

const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);
const fmt = (v: number, digits = 0) => v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Fuel: red under 15%, amber under 30%. */
export function fuelTone(pct: number): Tone {
  return pct < 15 ? "bad" : pct < 30 ? "warn" : "good";
}

export function gaugeTiles(r: ReadoutInput): Tile[] {
  const odo = n(r.odometerMi), hrs = n(r.engineHours), fuel = n(r.fuelLevelPct), spd = n(r.speedMph);
  const dir = compass(r.bearingDeg ?? null);
  const moving = spd != null && spd > 2;
  return [
    { key: "odometer", label: "Odometer", value: odo != null ? fmt(odo) : "—", unit: odo != null ? "mi" : undefined, tone: odo != null ? "normal" : "muted" },
    { key: "engine", label: "Engine hours", value: hrs != null ? fmt(hrs, 1) : "—", unit: hrs != null ? "h" : undefined, tone: hrs != null ? "normal" : "muted" },
    { key: "fuel", label: "Fuel level", value: fuel != null ? fmt(fuel) : "—", unit: fuel != null ? "%" : undefined, tone: fuel != null ? fuelTone(fuel) : "muted", bar: fuel != null ? Math.max(0, Math.min(100, fuel)) : undefined },
    {
      key: "motion", label: "Movement",
      value: spd == null ? "—" : moving ? fmt(spd) : "Stopped", unit: moving ? "mph" : undefined,
      sub: moving && dir ? `heading ${dir}` : r.isDriving ? "ignition on" : undefined,
      tone: spd == null ? "muted" : moving ? "good" : "normal",
    },
  ];
}
