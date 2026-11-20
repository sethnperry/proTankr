// lib/shifts/confirmDay.ts
//
// When the "Confirm your day" card shows: the server flagged the shift "needs confirmation" (a running empty move nobody
// answered for) and nothing has happened since. Only the server's own events (its question, its flag) don't count as
// something happening; an answer, a trip step or a move ending does. Pure.

export const SHIFT_NEEDS_CONFIRM = "shift_needs_confirm";
const SERVER_ONLY = new Set([SHIFT_NEEDS_CONFIRM, "shift_idle_ask"]);

export function flaggedForConfirm(events: { event_type: string; occurred_at: string }[]): boolean {
  const flagged = events.filter((e) => e.event_type === SHIFT_NEEDS_CONFIRM).map((e) => Date.parse(e.occurred_at)).sort((a, b) => b - a)[0];
  if (!flagged) return false;
  return !events.some((e) => !SERVER_ONLY.has(e.event_type) && Date.parse(e.occurred_at) > flagged);
}
