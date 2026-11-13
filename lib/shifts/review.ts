// lib/shifts/review.ts
//
// A manager clearing shifts nobody dealt with: explain a long shift, or confirm a shift the driver never ended.
// Both write an ordinary shift event (source "manual", actor = the manager) so the shift logic picks them up the
// same way it picks up the driver's own. Pure: no Supabase, no clock.

import type { ShiftEventRow } from "../trips/types.ts";
import { SHIFT_END, SHIFT_EXPLANATION, deriveShifts, isLongShift, type Shift } from "./shiftLogic.ts";
import { explanationPayload, type ExplanationPick } from "./explanation.ts";

export type ReviewRow = {
  key: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  hours: number;
  /** Past the company's limit and nobody has explained it. */
  needsReason: boolean;
  /** The driver never ended it (the system closed it at its last activity). */
  needsConfirm: boolean;
};

/** Shifts that need a manager: long and unexplained (last `longSince`), or unconfirmed (last `confirmSince`). */
export function reviewRows(events: ShiftEventRow[], maxHours: number, now: string, longSince: string, confirmSince: string): ReviewRow[] {
  const users = [...new Set(events.map((e) => e.user_id))];
  const out: ReviewRow[] = [];
  for (const u of users) {
    for (const s of deriveShifts(events, u, now)) {
      const needsReason = s.startedAt >= longSince && isLongShift(s, maxHours) && !s.events.some((e) => e.event_type === SHIFT_EXPLANATION);
      const needsConfirm = s.startedAt >= confirmSince && s.unconfirmed;
      if (!needsReason && !needsConfirm) continue;
      out.push({ key: `${u}|${s.startedAt}`, userId: u, startedAt: s.startedAt, endedAt: s.endedAt, hours: s.hours, needsReason, needsConfirm });
    }
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

type NewEvent = Omit<ShiftEventRow, "event_id">;

/** The explanation a manager enters for a driver's shift. Dated at the shift's end (or now if it is still open). */
export function managerExplanationEvent(o: { companyId: string; managerId: string; row: Pick<ReviewRow, "userId" | "endedAt" | "hours">; pick: ExplanationPick; now: string }): NewEvent {
  return {
    company_id: o.companyId, user_id: o.row.userId, event_type: SHIFT_EXPLANATION, occurred_at: o.row.endedAt ?? o.now, actor_id: o.managerId, source: "manual",
    payload: { ...explanationPayload(o.pick, o.row.hours), entered_by_manager: true },
  };
}

/** Confirms an unconfirmed shift: an end at the time the manager says. Never before the shift began or after now. */
export function managerConfirmEvent(o: { companyId: string; managerId: string; row: Pick<ReviewRow, "userId" | "startedAt">; endAt: string; now: string }): NewEvent | { error: string } {
  const t = Date.parse(o.endAt);
  if (!Number.isFinite(t)) return { error: "Enter the time the shift ended." };
  if (t <= Date.parse(o.row.startedAt)) return { error: "The end has to be after the start." };
  if (t > Date.parse(o.now)) return { error: "The end can't be in the future." };
  return {
    company_id: o.companyId, user_id: o.row.userId, event_type: SHIFT_END, occurred_at: new Date(t).toISOString(), actor_id: o.managerId, source: "manual",
    payload: { confirmed_by_manager: true },
  };
}

export const confirmedShift = (events: ShiftEventRow[], userId: string, startedAt: string, now: string): Shift | undefined =>
  deriveShifts(events, userId, now).find((s) => s.startedAt === startedAt);
