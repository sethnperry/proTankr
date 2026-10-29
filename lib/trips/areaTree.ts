// lib/trips/areaTree.ts
//
// Narrowing delivery locations by area: state, then county (or borough), then city. Each level lists
// what is left with a count. A location with no county yet falls under "No county".

import type { DeliveryLocation } from "./deliveryLocations.ts";

export type AreaPick = { state: string; county: string; city: string }; // "" = all at that level
export const NO_COUNTY = "__none__";

export type AreaOption = { value: string; label: string; count: number };

const live = (ls: DeliveryLocation[]) => ls.filter((l) => l.is_active !== false);
const stateOf = (l: DeliveryLocation) => (l.state ?? "").trim().toUpperCase();
const countyOf = (l: DeliveryLocation) => (l.county ?? "").trim();
const cityOf = (l: DeliveryLocation) => (l.city ?? "").trim();
const count = (xs: string[]): AreaOption[] => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, n]) => ({ value, label: value, count: n }));
};

export function stateOptions(ls: DeliveryLocation[]): AreaOption[] {
  return count(live(ls).map(stateOf).filter(Boolean));
}
export function countyOptions(ls: DeliveryLocation[], state: string): AreaOption[] {
  const inState = live(ls).filter((l) => !state || stateOf(l) === state);
  const opts = count(inState.map(countyOf).filter(Boolean));
  const none = inState.filter((l) => !countyOf(l)).length;
  return none ? [...opts, { value: NO_COUNTY, label: "No county", count: none }] : opts;
}
export function cityOptions(ls: DeliveryLocation[], state: string, county: string): AreaOption[] {
  return count(inArea(ls, { state, county, city: "" }).map(cityOf).filter(Boolean));
}

/** Locations inside a pick; "" at a level means everything at that level. */
export function inArea(ls: DeliveryLocation[], p: AreaPick): DeliveryLocation[] {
  return live(ls).filter((l) =>
    (!p.state || stateOf(l) === p.state)
    && (!p.county || (p.county === NO_COUNTY ? !countyOf(l) : countyOf(l).toLowerCase() === p.county.toLowerCase()))
    && (!p.city || cityOf(l).toLowerCase() === p.city.toLowerCase()));
}

export function areaLabel(p: AreaPick): string {
  if (!p.state && !p.county && !p.city) return "all locations";
  const county = p.county === NO_COUNTY ? "No county" : p.county;
  return [p.city || county || "", p.state].filter(Boolean).join(", ") || "all locations";
}
