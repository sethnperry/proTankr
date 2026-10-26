"use client";
// app/planner/modals/loading/weight.ts
//
// Gross-weight threshold coloring.

export const LEGAL_GROSS_LBS = 80000;

// Shared threshold coloring for a gross-weight figure (live preview OR a
// completed load's real actual weight) against this combo's own target and
// the fixed federal legal limit: white under target, green between target
// and legal, red at/over legal. Same three-tier logic the Planner's own
// live-plan summary card already uses.
export function weightColor(gross: number | null | undefined, target: number | undefined): string {
  if (gross == null || !(Number(target) > 0)) return "#ffffff";
  if (gross >= LEGAL_GROSS_LBS) return "#ef4444";
  if (gross >= Number(target)) return "#4ade80";
  return "#ffffff";
}
