// lib/trips/addPickupCheck.ts
//
// "Add another pickup" on a partly loaded trailer. A second pickup can only
// fill compartments that are still empty, and never once the trailer is
// already at or over the legal gross. Over (or close to) the company target
// is a warning, not a block: the Planner still plans the rest against it.

import type { TripCompartmentLoadRow } from "./types";

export const LEGAL_GROSS_LBS = 80000;
// Within this many lbs under the target counts as "close".
export const NEAR_TARGET_LBS = 500;

export type AddPickupLevel = "no_trailer" | "full" | "over_legal" | "over_target" | "near_target" | "ok";

export type AddPickupCheck = {
  emptyComps: number[];
  loadedComps: number[];
  gross: number | null;
  target: number | null;
  level: AddPickupLevel;
  canAdd: boolean;
  message: string;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function checkAddPickup(args: {
  compNumbers: number[];
  onBoard: Pick<TripCompartmentLoadRow, "comp_number">[];
  gross: number | null;
  target: number | null;
}): AddPickupCheck {
  const loaded = new Set(args.onBoard.map((c) => c.comp_number));
  const all = [...new Set(args.compNumbers)].sort((a, b) => a - b);
  const emptyComps = all.filter((n) => !loaded.has(n));
  const loadedComps = [...loaded].sort((a, b) => a - b);
  const { gross, target } = args;
  const base = { emptyComps, loadedComps, gross, target };

  if (all.length === 0) {
    return { ...base, level: "no_trailer", canAdd: false, message: "Couldn't read this trailer's compartments." };
  }
  if (emptyComps.length === 0) {
    return { ...base, level: "full", canAdd: false, message: "All compartments are already loaded." };
  }
  if (gross != null && gross >= LEGAL_GROSS_LBS) {
    return { ...base, level: "over_legal", canAdd: false, message: `Already at ${fmt(gross)} lbs, at or over the ${fmt(LEGAL_GROSS_LBS)} lb legal limit.` };
  }
  if (gross != null && target != null && target > 0) {
    if (gross >= target) {
      return { ...base, level: "over_target", canAdd: true, message: `Already ${fmt(gross - target)} lbs over your ${fmt(target)} lb target. Anything more goes over.` };
    }
    if (target - gross <= NEAR_TARGET_LBS) {
      return { ...base, level: "near_target", canAdd: true, message: `Only ${fmt(target - gross)} lbs left under your ${fmt(target)} lb target.` };
    }
    return { ...base, level: "ok", canAdd: true, message: `${fmt(target - gross)} lbs left under your ${fmt(target)} lb target.` };
  }
  return { ...base, level: "ok", canAdd: true, message: "" };
}

// The Planner's gross color: at/over legal red, at/over target green.
export function grossColor(gross: number | null, target: number | null): string {
  if (gross == null) return "#fff";
  if (gross >= LEGAL_GROSS_LBS) return "#ef4444";
  if (target != null && target > 0 && gross >= target) return "#4ade80";
  return "#fff";
}

export type PlannedComp = { comp_number: number; product_id: string };

// planned_comps as stored (jsonb), tolerating junk.
export function readPlannedComps(v: unknown): PlannedComp[] | null {
  if (!Array.isArray(v)) return null;
  const out: PlannedComp[] = [];
  for (const x of v) {
    const n = Number((x as any)?.comp_number);
    const p = (x as any)?.product_id;
    if (Number.isFinite(n) && n > 0 && typeof p === "string" && p) out.push({ comp_number: n, product_id: p });
  }
  return out.length ? out : null;
}
