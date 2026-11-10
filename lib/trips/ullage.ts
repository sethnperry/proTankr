// lib/trips/ullage.ts
//
// Room in a store's tanks, for the drop site screen: what each tank holds now against its capacity, and whether
// the load fits. Ullage is counted at full capacity and at 90% (the usual fill limit). Tanks with no capacity or
// no volume entered are left out and counted, not guessed. Pure.

export type UllageTank = { capacity: number | null; volume: number | null };
export type Fit = "fits" | "tight" | "no";
export type Ullage = {
  counted: number;      // tanks with both a capacity and a volume
  missing: number;      // tanks that could not be counted
  room100: number;      // gallons of room at 100% of capacity
  room90: number;       // gallons of room at 90% of capacity
  fit: Fit | null;      // null when nothing could be counted
  shortBy: number;      // gallons that will not fit at 100% (0 unless fit is "no")
};

export function ullage(tanks: UllageTank[], loadGallons: number): Ullage {
  let counted = 0, missing = 0, room100 = 0, room90 = 0;
  for (const t of tanks) {
    if (t.capacity == null || t.capacity <= 0 || t.volume == null) { missing++; continue; }
    counted++;
    room100 += Math.max(0, t.capacity - t.volume);
    room90 += Math.max(0, t.capacity * 0.9 - t.volume);
  }
  const fit: Fit | null = counted === 0 ? null : loadGallons <= room90 ? "fits" : loadGallons <= room100 ? "tight" : "no";
  return { counted, missing, room100: Math.round(room100), room90: Math.round(room90), fit, shortBy: fit === "no" ? Math.round(loadGallons - room100) : 0 };
}
