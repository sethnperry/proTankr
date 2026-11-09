// lib/dispatch/driverPlans.ts
//
// A driver's saved plans (A-E) as dispatch reads and writes them. Same snapshot
// shape the Planner saves (app/planner/hooks/planSlots), so the driver sees what
// dispatch built. Pure; the database calls are in driverPlansIO.ts.
import type { PresetSummary } from "../trips/tripPlan.ts";

export const UNIVERSAL = "__universal__";
export const SLOTS = [1, 2, 3, 4, 5];
export const CG_CENTER = 0.5;

export type CompPlanLite = Record<number, { empty: boolean; productId: string; capOverride?: number | null }>;

/** The first plan slot with nothing in it, or null when all five are used. */
export function nextFreeSlot(presets: Pick<PresetSummary, "slot">[]): number | null {
  const used = new Set(presets.map((p) => p.slot));
  return SLOTS.find((s) => !used.has(s)) ?? null;
}

/** What the Planner stores per slot. An existing plan keeps its own CG and name when it is replaced. */
export function planSnapshot(
  compPlan: CompPlanLite,
  existing?: { cgSlider?: number; name?: string } | null,
  now = Date.now(),
) {
  const name = existing?.name?.trim();
  return {
    v: 1, savedAt: now, terminalId: UNIVERSAL, tempF: 60,
    cgSlider: typeof existing?.cgSlider === "number" ? existing.cgSlider : CG_CENTER,
    compPlan,
    ...(name ? { name } : {}),
  };
}

/** Plain words for a failed write: the access policy is the likely cause until it is applied. */
export function saveErrorText(message: string): string {
  return /row-level security|permission|not allowed/i.test(message)
    ? "Dispatch can't change this driver's plans yet: the access rule for it hasn't been applied."
    : message;
}
