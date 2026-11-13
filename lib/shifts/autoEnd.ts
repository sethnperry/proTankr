// lib/shifts/autoEnd.ts
//
// When a shift ends by itself: the truck's tracker shows the driver OFF duty (not sleeper, not personal conveyance)
// for at least `minOffMin`, with a recent reading. The shift closes at the moment off duty began. Pure.

export const AUTO_END_MIN = 15;
const STALE_MS = 20 * 60_000;

export type AutoEndInput = {
  openStartedAt: string;
  hos: { status: string | null; statusSince?: string | null; at?: string | null } | null;
  nowMs: number;
  minOffMin?: number;
};

/** The time to close the shift at, or null when it should stay open. */
export function autoEndAt(o: AutoEndInput): string | null {
  const h = o.hos;
  if (!h || h.status !== "OFF" || !h.statusSince) return null;
  const readAt = h.at ? Date.parse(h.at) : NaN;
  if (Number.isFinite(readAt) && o.nowMs - readAt > STALE_MS) return null; // no live connection: don't guess
  const since = Date.parse(h.statusSince);
  if (!Number.isFinite(since)) return null;
  if (since <= Date.parse(o.openStartedAt)) return null; // off duty before this shift began: not the end of it
  if (o.nowMs - since < (o.minOffMin ?? AUTO_END_MIN) * 60_000) return null;
  return new Date(since).toISOString();
}
