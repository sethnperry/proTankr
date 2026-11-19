// lib/position/captures.ts
//
// Position capture: one row when something happens, not continuous tracking. The phone's GPS is read, the row waits
// in a small per-user queue on the phone, and is sent when there is signal. Never blocks or throws: a driver action
// must not depend on a GPS fix or on the table existing yet. Pure helpers are at the top so they can be tested.

export type CaptureCause = "open" | "wake" | "arrive" | "cancel" | "move_begin" | "move_end" | "shift_end" | "shift_start" | "fuel" | "park" | "hook" | "drop";
export type Capture = {
  capture_id: string; company_id: string; user_id: string; truck_id: string | null; trailer_id: string | null;
  lat: number; lon: number; odometer: number | null; cause: string; captured_at: string;
};

export const QUEUE_MAX = 200;
/** A wake or app-open capture is skipped when the last one was this recent. */
export const WAKE_MIN_GAP_MS = 5 * 60_000;
/** How long to stop trying after the table turns out not to exist yet. */
export const DISABLED_MS = 30 * 60_000;

export function queueKey(userId: string) { return `proTankr:u:${userId}:posQueue`; }

export function parseQueue(raw: string | null): Capture[] {
  try { const a = JSON.parse(raw ?? "[]"); return Array.isArray(a) ? a.filter((c) => c && typeof c.capture_id === "string" && Number.isFinite(c.lat) && Number.isFinite(c.lon)) : []; } catch { return []; }
}
/** Newest QUEUE_MAX kept; the oldest are dropped first. */
export function trimQueue(q: Capture[]): Capture[] { return q.length > QUEUE_MAX ? q.slice(q.length - QUEUE_MAX) : q; }
export function shouldCaptureWake(lastAtMs: number | null, nowMs: number): boolean { return lastAtMs == null || nowMs - lastAtMs >= WAKE_MIN_GAP_MS; }
/** The table missing (migration not applied yet) is not an error worth retrying hard. */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  const m = `${err?.code ?? ""} ${err?.message ?? ""}`;
  return /42P01|PGRST205|PGRST204|does not exist|Could not find the table/i.test(m);
}
