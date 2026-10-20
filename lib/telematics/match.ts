// lib/telematics/match.ts
//
// Pairs a provider's vehicles with the company's trucks: VIN first, then the
// unit number. Pure. Anything left over goes to the admin once.

import type { ProviderVehicle } from "./types.ts";

export type TruckLite = { truck_id: string; truck_name: string; vin_number?: string | null };
export type Pair = { vehicle: ProviderVehicle; truck: TruckLite; by: "vin" | "name" };

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function matchVehicles(vehicles: ProviderVehicle[], trucks: TruckLite[]) {
  const pairs: Pair[] = [];
  const usedTruck = new Set<string>();
  const usedVeh = new Set<string>();
  const take = (v: ProviderVehicle, t: TruckLite, by: Pair["by"]) => {
    pairs.push({ vehicle: v, truck: t, by });
    usedVeh.add(v.id); usedTruck.add(t.truck_id);
  };
  for (const v of vehicles) {
    const vin = norm(v.vin);
    if (vin.length < 11) continue;
    const t = trucks.find((x) => !usedTruck.has(x.truck_id) && norm(x.vin_number) === vin);
    if (t) take(v, t, "vin");
  }
  for (const v of vehicles) {
    if (usedVeh.has(v.id)) continue;
    const n = norm(v.name);
    if (!n) continue;
    const hits = trucks.filter((x) => !usedTruck.has(x.truck_id) && norm(x.truck_name) === n);
    if (hits.length === 1) take(v, hits[0], "name");
  }
  return {
    pairs,
    unmatchedVehicles: vehicles.filter((v) => !usedVeh.has(v.id)),
    unmatchedTrucks: trucks.filter((t) => !usedTruck.has(t.truck_id)),
  };
}
