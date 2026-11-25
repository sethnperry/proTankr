// lib/trips/planDetour.ts
//
// Begin / Edit Trip sends the driver to the Planner to make or change a plan, then brings them
// back. The sheet's values are kept in sessionStorage while they're away; the Planner marks the
// trip as "in a detour" so Close, Save Plan and the plan builder return to the sheet instead of
// the dashboard, and hands back which plan slot to use.

import type { StartLoadValues } from "@/app/planner/components/startLoad/types";

const DRAFT = "proTankr:tripDraft";
const DETOUR = "proTankr:planDetour";

type Draft = { userId: string; v: StartLoadValues; editTripId?: string | null };
type Detour = { slot: number | null; note?: string | null };

const read = <T,>(k: string): T | null => {
  try { const s = sessionStorage.getItem(k); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
};
const write = (k: string, v: unknown | null) => {
  try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ }
};

/** editTripId: the dispatched load whose details were open, so the same window comes back. */
export const saveTripDraft = (userId: string, v: StartLoadValues, editTripId?: string | null) => write(DRAFT, { userId, v, editTripId: editTripId ?? null } satisfies Draft);
export function takeTripDraftFull(userId: string): { v: StartLoadValues; editTripId: string | null } | null {
  const d = read<Draft>(DRAFT);
  write(DRAFT, null);
  return d && d.userId === userId ? { v: d.v, editTripId: d.editTripId ?? null } : null;
}
export function takeTripDraft(userId: string): StartLoadValues | null {
  return takeTripDraftFull(userId)?.v ?? null;
}

/** The Planner marks that it was opened from the trip sheet. */
export const startDetour = () => write(DETOUR, { slot: null } satisfies Detour);
export const detourActive = () => read<Detour>(DETOUR) != null;
/** Records the plan slot to hand back, and what to tell the driver when they land (the Planner then navigates home). */
export const finishDetour = (slot: number | null, note?: string | null) => write(DETOUR, { slot, note: note ?? null } satisfies Detour);
export function takeDetour(): { slot: number | null; note: string | null } {
  const d = read<Detour>(DETOUR);
  write(DETOUR, null);
  return { slot: d?.slot ?? null, note: d?.note ?? null };
}
export function takeDetourSlot(): number | null {
  return takeDetour().slot;
}
export const RESUME_URL = "/planner/home?resume=trip";
