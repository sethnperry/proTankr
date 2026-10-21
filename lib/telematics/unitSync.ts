// lib/telematics/unitSync.ts
//
// What to write onto a truck from its Geotab vehicle. Pure. A new truck gets every ticked field;
// a truck we already have gets them according to the mode: "fill" only where ours is blank,
// "overwrite" wherever Geotab has a value that differs.

import type { VinInfo } from "./vinDecode";

export type SyncFields = { vin: boolean; plate: boolean; vehicle: boolean; region: boolean };
export type ExistingMode = "skip" | "fill" | "overwrite";
export type SyncOpts = { fields: SyncFields; existing: ExistingMode; regionGroup: string; regionName: string };

export const DEFAULT_OPTS: SyncOpts = { fields: { vin: true, plate: true, vehicle: true, region: false }, existing: "skip", regionGroup: "", regionName: "" };

export type TruckRow = { truck_id: string; truck_name: string; vin_number: string | null; plate_number: string | null; make: string | null; model: string | null; year: number | null; region: string | null };

export function parseOpts(raw: any): SyncOpts {
  const f = raw?.fields ?? {};
  return {
    fields: { vin: f.vin !== false, plate: f.plate !== false, vehicle: f.vehicle !== false, region: f.region === true },
    existing: raw?.existing === "fill" || raw?.existing === "overwrite" ? raw.existing : "skip",
    regionGroup: typeof raw?.regionGroup === "string" ? raw.regionGroup : "",
    regionName: typeof raw?.regionName === "string" ? raw.regionName.trim() : "",
  };
}

/** The region a unit gets: the chosen name, when it sits in the chosen Geotab group. */
export function regionFor(groups: string[], o: SyncOpts): string | null {
  if (!o.fields.region || !o.regionGroup) return null;
  return groups.includes(o.regionGroup) ? (o.regionName || o.regionGroup) : null;
}

const blank = (v: unknown) => v == null || String(v).trim() === "";

export function truckPatch(
  ours: TruckRow | null,
  geo: { vin: string | null; plate: string | null },
  info: VinInfo | undefined,
  region: string | null,
  o: SyncOpts,
): Record<string, unknown> {
  const want: Record<string, unknown> = {};
  if (o.fields.vin && geo.vin) want.vin_number = geo.vin;
  if (o.fields.plate && geo.plate) want.plate_number = geo.plate;
  if (o.fields.vehicle && info) {
    if (info.make) want.make = info.make;
    if (info.model) want.model = info.model;
    if (info.year) want.year = info.year;
  }
  if (region) want.region = region;
  if (!ours) return want;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(want)) {
    const cur = (ours as any)[k];
    if (o.existing === "overwrite" ? String(cur ?? "") !== String(v) : blank(cur)) patch[k] = v;
  }
  return patch;
}
