// lib/shifts/shiftLogic.ts
//
// Shifts are not stored: they are worked out from shift events (shift_events). Start shift opens one, End shift
// closes it, and a shift can run with no load at all. If the driver forgets to end it, the shift closes at its
// last event and is marked unconfirmed. When Geotab's start or stop is linked it wins over the phone's.
//
// Pure: no Supabase, no clock (the caller passes `now`). Every signal has a source (geotab, app, manual).

import type { ShiftEventRow, ShiftSource } from "../trips/types.ts";

export const SHIFT_START = "shift_start";
export const SHIFT_END = "shift_end";
export const SHIFT_EXPLANATION = "shift_explanation";
export const SHIFT_LONG_ACK = "shift_long_ack";
export const SHIFT_IDLE_RESPONSE = "shift_idle_response";

export type Shift = {
  userId: string;
  startedAt: string;
  endedAt: string | null;
  /** Still running (not ended, and not stale). */
  open: boolean;
  /** Closed by the system at its last event because nobody ended it. */
  unconfirmed: boolean;
  startSource: ShiftSource;
  endSource: ShiftSource | null;
  events: ShiftEventRow[];
  hours: number;
};

export type ShiftOptions = {
  /** An open shift with no event for this long is closed at its last event, unconfirmed. Default 18. */
  staleAfterHours?: number;
  /** A Geotab start or stop within this many hours of the phone's is the same moment. Default 4. */
  matchHours?: number;
};

const H = 3600_000;
const ms = (iso: string) => Date.parse(iso);
const hoursBetween = (a: string, b: string) => Math.max(0, (ms(b) - ms(a)) / H);

/** Shifts for one driver from their events, oldest first. */
export function deriveShifts(allEvents: ShiftEventRow[], userId: string, now: string, opts: ShiftOptions = {}): Shift[] {
  const stale = (opts.staleAfterHours ?? 18) * H;
  const match = (opts.matchHours ?? 4) * H;
  const events = allEvents.filter((e) => e.user_id === userId).sort((a, b) => ms(a.occurred_at) - ms(b.occurred_at));

  // Geotab's starts and stops, and the phone's. A phone event within the window of a Geotab one is absorbed by it.
  const geoStarts = events.filter((e) => e.event_type === SHIFT_START && e.source === "geotab");
  const geoEnds = events.filter((e) => e.event_type === SHIFT_END && e.source === "geotab");
  const absorbed = new Set<string>();
  const near = (list: ShiftEventRow[], e: ShiftEventRow) => list.find((g) => Math.abs(ms(g.occurred_at) - ms(e.occurred_at)) <= match);
  for (const e of events) {
    if (e.source === "geotab") continue;
    if (e.event_type === SHIFT_START && near(geoStarts, e)) absorbed.add(e.event_id);
    if (e.event_type === SHIFT_END && near(geoEnds, e)) absorbed.add(e.event_id);
  }

  const shifts: Shift[] = [];
  let cur: Shift | null = null;
  let lastClosed: Shift | null = null;
  const closeAtLastEvent = (s: Shift) => {
    const last = s.events[s.events.length - 1];
    s.endedAt = last.occurred_at;
    s.endSource = last.source;
    s.open = false;
    s.unconfirmed = true;
    s.hours = hoursBetween(s.startedAt, s.endedAt);
  };

  for (const e of events) {
    if (absorbed.has(e.event_id)) continue;
    if (e.event_type === SHIFT_START) {
      if (cur) closeAtLastEvent(cur); // started a new one without ending the old one
      cur = { userId, startedAt: e.occurred_at, endedAt: null, open: true, unconfirmed: false, startSource: e.source, endSource: null, events: [e], hours: 0 };
      shifts.push(cur);
    } else if (e.event_type === SHIFT_END) {
      if (cur) {
        cur.events.push(e);
        cur.endedAt = e.occurred_at;
        cur.endSource = e.source;
        cur.open = false;
        cur.hours = hoursBetween(cur.startedAt, cur.endedAt);
        lastClosed = cur;
        cur = null;
      }
    } else if (cur) {
      cur.events.push(e);
    } else if (lastClosed?.endedAt && ms(e.occurred_at) - ms(lastClosed.endedAt) <= 6 * H) {
      // Asked at End shift (the explanation, a note): belongs to the shift that just ended.
      lastClosed.events.push(e);
    }
  }
  if (cur) {
    const last = cur.events[cur.events.length - 1];
    if (ms(now) - ms(last.occurred_at) > stale) closeAtLastEvent(cur);
    else cur.hours = hoursBetween(cur.startedAt, now);
  }
  return shifts;
}

/** The shift running now, if any. */
export function openShift(shifts: Shift[]): Shift | null {
  return shifts.find((s) => s.open) ?? null;
}

/** Has this shift run past the company's long-shift limit? (An open shift counts up to `now`.) */
export function isLongShift(s: Shift, maxHours: number): boolean {
  return s.hours > maxHours;
}

/** A long shift needs a Shift Explanation, and none has been given. */
export function needsExplanation(s: Shift, maxHours: number): boolean {
  return isLongShift(s, maxHours) && !s.events.some((e) => e.event_type === SHIFT_EXPLANATION);
}

export type ShiftPrompt = "long" | "idle" | null;

/**
 * Which question to put to the driver now. "long": the shift passed the limit and the driver has not answered.
 * "idle": nothing at all for `idleMinutes` while on shift (the caller passes the newest sign of activity, from
 * shift events, trip events, or the truck moving) and they have not answered since.
 */
export function shiftPrompt(
  s: Shift | null,
  now: string,
  o: { maxHours: number; lastActivityAt: string | null; idleMinutes?: number },
): ShiftPrompt {
  if (!s || !s.open) return null;
  const lastAck = [...s.events].reverse().find((e) => e.event_type === SHIFT_LONG_ACK || e.event_type === SHIFT_IDLE_RESPONSE);
  if (isLongShift(s, o.maxHours) && !s.events.some((e) => e.event_type === SHIFT_LONG_ACK)) return "long";
  const idleMs = (o.idleMinutes ?? 90) * 60_000;
  const last = o.lastActivityAt && ms(o.lastActivityAt) > ms(s.startedAt) ? o.lastActivityAt : s.startedAt;
  const quietSince = lastAck && ms(lastAck.occurred_at) > ms(last) ? lastAck.occurred_at : last;
  if (ms(now) - ms(quietSince) >= idleMs) return "idle";
  return null;
}

/** "3:42" for a number of hours. */
export function clockHM(hours: number): string {
  const m = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
