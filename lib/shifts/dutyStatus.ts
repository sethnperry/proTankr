// lib/shifts/dutyStatus.ts
//
// The driver's duty status as the truck's telematics reports it, for the dashboard and for starting the shift
// without a question. Pure: no clock, no storage.

export type DutyHos = { status: string | null; statusSince?: string | null; at?: string | null } | null;

const LABELS: Record<string, string> = { D: "Driving", ON: "On duty", YM: "Yard move", OFF: "Off duty", SB: "Sleeper", PC: "Personal" };
const ON = new Set(["D", "ON", "YM"]);

/** A reading older than this is treated as no connection. The app asks every two minutes. */
export const STALE_MS = 15 * 60_000;

/** Telematics is answering: a reading with a status, read recently. */
export function telematicsLive(hos: DutyHos, nowMs: number): boolean {
  if (!hos?.status) return false;
  const at = hos.at ? Date.parse(hos.at) : NaN;
  return Number.isFinite(at) ? nowMs - at <= STALE_MS : true;
}
export const onDuty = (status: string | null | undefined) => !!status && ON.has(status);
export const dutyLabel = (status: string | null | undefined) => (status ? LABELS[status] ?? status : "");

/** What the dashboard shows beside the equipment: the status, or null when there is no live connection. */
export function dutyChip(hos: DutyHos, nowMs: number): { text: string; on: boolean; since: string | null } | null {
  if (!telematicsLive(hos, nowMs)) return null;
  return { text: dutyLabel(hos!.status), on: onDuty(hos!.status), since: hos!.statusSince ?? null };
}

/**
 * Begin Trip with a shift not yet open: with live telematics showing on duty there is nothing to ask (the shift starts
 * at the time that status began); otherwise the driver is asked, and told why.
 */
export function beginTripShift(hos: DutyHos, nowMs: number): { ask: false } | { ask: true; reason: string } {
  if (!telematicsLive(hos, nowMs)) return { ask: true, reason: "Telematics isn't connected, so the shift starts here. Starting it keeps your hours right." };
  if (!onDuty(hos!.status)) return { ask: true, reason: `Telematics shows you ${dutyLabel(hos!.status).toLowerCase()}. Start your shift here to keep your hours right.` };
  return { ask: false };
}

const OFF = new Set(["OFF", "SB", "PC"]);
/** Telematics shows the driver off duty (live) while a shift is open, and they haven't said "still working" for this stretch. */
export function offDutyAsk(o: { hos: DutyHos; nowMs: number; shiftOpen: boolean; dismissedSince: string | null }): { since: string; status: string; minutes: number } | null {
  const { hos } = o;
  if (!o.shiftOpen || !telematicsLive(hos, o.nowMs) || !hos!.status || !OFF.has(hos!.status) || !hos!.statusSince) return null;
  if (o.dismissedSince === hos!.statusSince) return null;
  const at = Date.parse(hos!.statusSince);
  if (!Number.isFinite(at)) return null;
  const minutes = Math.floor((o.nowMs - at) / 60_000);
  return { since: hos!.statusSince, status: hos!.status, minutes: Math.max(0, minutes) };
}
