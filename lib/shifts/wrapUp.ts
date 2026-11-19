// lib/shifts/wrapUp.ts
//
// When a shift ends by itself. After the last load is done and nothing has happened for 30 minutes, the driver is asked
// "Are you still working?" (on screen, and by push in case the screen is off). No answer for 15 minutes ends the shift,
// at the moment of the last activity. With a trip still open (a load aboard, say) the quiet spell has to be longer
// (3 hours) before the question comes up. Any activity, or answering "still working", starts the count again. Pure.

export const ASK_AFTER_MIN = 30;
export const ASK_AFTER_OPEN_TRIP_MIN = 180;
export const END_AFTER_ASK_MIN = 15;

export type WrapUpInput = {
  nowMs: number;
  shiftStartedMs: number;
  /** The newest sign of work: a trip step, a move ending, a shift event (including "still working"). Not the question itself. */
  lastActivityMs: number | null;
  /** When the question was last put to the driver (the server's ask event), if it was. */
  askedAtMs: number | null;
  /** A trip is open, or an empty move is running. */
  openTrip: boolean;
  /** An empty move is running: never asked. */
  movingEmpty?: boolean;
};

export type WrapUp = { action: "none" } | { action: "ask" } | { action: "end"; atMs: number };

export function wrapUp(o: WrapUpInput): WrapUp {
  if (o.movingEmpty) return { action: "none" };
  const last = Math.max(o.lastActivityMs ?? 0, o.shiftStartedMs);
  const quietMin = (o.nowMs - last) / 60_000;
  const askAfter = o.openTrip ? ASK_AFTER_OPEN_TRIP_MIN : ASK_AFTER_MIN;
  // Asked since the last activity: wait for the answer, then end.
  if (o.askedAtMs != null && o.askedAtMs > last) {
    return (o.nowMs - o.askedAtMs) / 60_000 >= END_AFTER_ASK_MIN ? { action: "end", atMs: last } : { action: "none" };
  }
  return quietMin >= askAfter ? { action: "ask" } : { action: "none" };
}
