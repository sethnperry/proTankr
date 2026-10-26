"use client";
// app/planner/modals/editTerminal/helpers.ts
//
// Part of EditTerminalModal.tsx.




export const GROUPS: { label: string; test: (name: string) => boolean }[] = [
  { label: "Diesel", test: (n) => /diesel|heating oil|marine gas oil|hvo|\bkerosene\b/i.test(n) },
  { label: "Biodiesel Blends", test: (n) => /biodiesel/i.test(n) },
  { label: "Gasoline", test: (n) => /unleaded|recreation fuel/i.test(n) },
  { label: "Ethanol & Flex Fuel", test: (n) => /ethanol|flex fuel|e\d{2}\b/i.test(n) },
  { label: "Aviation & Jet", test: (n) => /aviation|jet fuel|jp-\d/i.test(n) },
  { label: "Blendstocks & Components", test: (n) => /blendstock|alkylate|reformate|isomerate|naphtha|natural gasoline|butane|additive/i.test(n) },
];

export function groupFor(name: string): string {
  for (const g of GROUPS) if (g.test(name)) return g.label;
  return "Other / Off-Spec";
}
