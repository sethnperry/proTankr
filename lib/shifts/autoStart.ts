// lib/shifts/autoStart.ts
//
// When the app offers to start the driver's shift: a Begin Trip tap, a fuel stop, an inspection, or the truck's
// telematics showing them on duty or driving. The driver always confirms the start time. Pure: no clock, no storage.

/** A start time can't be in the future (a minute's slack for clocks) or more than a day back. */
export function startTimeProblem(startMs: number, nowMs: number): string | null {
  if (!Number.isFinite(startMs)) return "Pick a start time.";
  if (startMs > nowMs + 60_000) return "The start time can't be in the future.";
  if (nowMs - startMs > 24 * 3600_000) return "That's more than a day ago.";
  return null;
}
export const clampStart = (startMs: number, nowMs: number) => Math.min(startMs, nowMs);

export type DutyReading = { status: string | null; statusSince?: string | null } | null;
const ON = new Set(["D", "ON", "YM"]);

/**
 * Telematics shows the driver on duty or driving and no shift is open: offer to start at the time that status began.
 * Not offered when that status began before the last shift ended (they ended it on purpose), when it is too old, or
 * when the driver already said no to this very status.
 */
export function telematicsStart(o: { hos: DutyReading; nowMs: number; shiftOpen: boolean; lastEndedMs: number | null; declinedSince: string | null }): { atMs: number; since: string } | null {
  const { hos, nowMs } = o;
  if (o.shiftOpen || !hos?.status || !ON.has(hos.status) || !hos.statusSince) return null;
  const at = Date.parse(hos.statusSince);
  if (!Number.isFinite(at) || at > nowMs + 60_000 || nowMs - at > 18 * 3600_000) return null;
  if (o.lastEndedMs != null && at <= o.lastEndedMs) return null;
  if (o.declinedSince === hos.statusSince) return null;
  return { atMs: clampStart(at, nowMs), since: hos.statusSince };
}

/** After "Not now" on a fuel stop or inspection, don't ask again for this long. Begin Trip always asks. */
export const SNOOZE_MS = 4 * 3600_000;
export const snoozed = (snoozedAtMs: number | null, nowMs: number) => snoozedAtMs != null && nowMs - snoozedAtMs < SNOOZE_MS;
