// lib/trips/planDetour.ts
//
// Begin / Edit Trip sends the driver to the Planner to make or change a plan, then brings them
// back. The sheet's values are kept in sessionStorage while they're away; the Planner marks the
// trip as "in a detour" so Close, Save Plan and the plan builder return to the sheet instead of
// the dashboard, and hands back which plan slot to use.

import type { StartLoadValues } from "@/app/planner/components/startLoad/types";

const DRAFT = "proTankr:tripDraft";
const DETOUR = "proTankr:planDetour";

type Draft = { userId: string; v: StartLoadValues };
type Detour = { slot: number | null };

const read = <T,>(k: string): T | null => {
  try { const s = sessionStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
};
const write = (k: string, v: unknown | null) => {
  try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ }
};

export const saveTripDraft = (userId: string, v: StartLoadValues) => write(DRAFT, { userId, v } satisfies Draft);
export function takeTripDraft(userId: string): StartLoadValues | null {
  const d = read<Draft>(DRAFT);
  write(DRAFT, null);
  return d && d.userId === userId ? d.v : null;
}

/** The Planner marks that it was opened from the trip sheet. */
export const startDetour = () => write(DETOUR, { slot: null } satisfies Detour);
export const detourActive = () => read<Detour>(DETOUR) != null;
/** Records the plan slot to hand back (the Planner then navigates home). */
export const finishDetour = (slot: number | null) => write(DETOUR, { slot } satisfies Detour);
export function takeDetourSlot(): number | null {
  const d = read<Detour>(DETOUR);
  write(DETOUR, null);
  return d?.slot ?? null;
}
export const RESUME_URL = "/planner/home?resume=trip";
