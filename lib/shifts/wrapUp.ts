// lib/shifts/wrapUp.ts
//
// When a shift ends by itself. After the last load is done and nothing has happened for 30 minutes, the driver is asked
// "Are you still working?" (on screen, and by push in case the screen is off). No answer for 15 minutes ends the shift,
// at the moment of the last activity. With a trip still open (a load aboard, say) the quiet spell has to be longer
// (3 hours) before the question comes up, and with an empty move running it is 2 hours. Any activity, or answering
// "still working", starts the count again. A running empty move is never closed by the server (it can't know the miles or
// when the driver really stopped): after the 15 minutes it only FLAGS the shift, and the driver confirms the move's end,
// the odometer and the shift's end the next time they open the app. Pure.

export const ASK_AFTER_MIN = 30;
export const ASK_AFTER_OPEN_TRIP_MIN = 180;
export const ASK_AFTER_MOVE_MIN = 120;
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
  /** An empty move is running: asked after 2 hours, flagged (never closed) when nobody answers. */
  moveRunning?: boolean;
  /** When the server last flagged this shift "needs confirmation" (nothing more to do until the driver answers). */
  flaggedAtMs?: number | null;
};

export type WrapUp = { action: "none" } | { action: "ask" } | { action: "end"; atMs: number } | { action: "flag" };

export function wrapUp(o: WrapUpInput): WrapUp {
  const last = Math.max(o.lastActivityMs ?? 0, o.shiftStartedMs);
  if (o.flaggedAtMs != null && o.flaggedAtMs > last) return { action: "none" }; // flagged: waiting for the driver
  const quietMin = (o.nowMs - last) / 60_000;
  const askAfter = o.moveRunning ? ASK_AFTER_MOVE_MIN : o.openTrip ? ASK_AFTER_OPEN_TRIP_MIN : ASK_AFTER_MIN;
  // Asked since the last activity: wait for the answer, then end (or, with a move running, flag).
  if (o.askedAtMs != null && o.askedAtMs > last) {
    if ((o.nowMs - o.askedAtMs) / 60_000 < END_AFTER_ASK_MIN) return { action: "none" };
    return o.moveRunning ? { action: "flag" } : { action: "end", atMs: last };
  }
  return quietMin >= askAfter ? { action: "ask" } : { action: "none" };
}
