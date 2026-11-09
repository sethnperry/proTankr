// lib/trips/abandoned.ts
//
// Abandoned loads: a trip still "en route to the rack" (nothing loaded yet) that nobody has touched for
// ABANDON_AFTER_H hours is cancelled. Cancelled loads are kept a week, reported to the admins on Monday
// morning (only those that were never redispatched), then deleted. Pure; the database side is abandonedServer.ts.

export const ABANDON_AFTER_H = 16;   // past the 14-hour driving window: nobody is legitimately mid-trip
export const KEEP_CANCELLED_DAYS = 7;
export const REPORT_DOW = 1;         // Monday
export const REPORT_HOUR = 6;        // local, so it is in the inbox for the start of the day
export const AUTO_REASON = "auto_abandoned";

const H = 3600000, D = 86400000;

export type OpenTrip = { tripId: string; status: string; lastActivityMs: number; productAboard: boolean };

/** Trips to cancel: before loading, no product aboard, quiet for ABANDON_AFTER_H. Parked trips are deliberate. */
export function abandonedTrips(open: OpenTrip[], nowMs: number, afterH = ABANDON_AFTER_H): string[] {
  return open
    .filter((t) => (t.status === "draft" || t.status === "loading") && !t.productAboard && nowMs - t.lastActivityMs >= afterH * H)
    .map((t) => t.tripId);
}

export type CancelledTrip = {
  tripId: string; driverId: string | null; terminalId: string | null; locationId: string | null;
  orderNumbers: string[]; createdMs: number; cancelledMs: number;
};
export type LaterTrip = Pick<CancelledTrip, "tripId" | "driverId" | "terminalId" | "locationId" | "orderNumbers" | "createdMs">;

/** A cancelled load counts as redispatched when a later, live trip carries one of its order numbers; with no order
 *  number to go by, the same driver, rack and drop. */
export function wasRedispatched(c: CancelledTrip, later: LaterTrip[]): boolean {
  const mine = new Set(c.orderNumbers.map((n) => n.trim().toLowerCase()).filter(Boolean));
  return later.some((t) => {
    if (t.tripId === c.tripId || t.createdMs <= c.createdMs) return false;
    if (mine.size) return t.orderNumbers.some((n) => mine.has(n.trim().toLowerCase()));
    return !!c.terminalId && !!c.locationId && t.driverId === c.driverId && t.terminalId === c.terminalId && t.locationId === c.locationId;
  });
}

/** True from Monday REPORT_HOUR (in the zone) until the next Monday, so a missed tick still sends it. */
export function reportDue(nowMs: number, tz: string): boolean {
  const p = parts(nowMs, tz);
  return p.dow === REPORT_DOW && p.hour >= REPORT_HOUR;
}
/** The Monday date (YYYY-MM-DD, local) that this week's run belongs to. */
export function weekKey(nowMs: number, tz: string): string {
  const p = parts(nowMs, tz);
  const t = Date.UTC(p.y, p.m - 1, p.d) - ((p.dow + 6) % 7) * D;
  return new Date(t).toISOString().slice(0, 10);
}
function parts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(ms));
  const g = (t: string) => f.find((x) => x.type === t)!.value;
  return { y: Number(g("year")), m: Number(g("month")), d: Number(g("day")), hour: Number(g("hour")), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")) };
}

/** Cancelled this long ago or more: reported already (or this Monday) and due to be deleted. */
export const deleteBefore = (nowMs: number) => new Date(nowMs - KEEP_CANCELLED_DAYS * D).toISOString();
/** The report covers what was cancelled since a week ago. */
export const reportSince = deleteBefore;

export type ReportRow = { driver: string; when: string; route: string; order: string; why: string };
export function reportText(rows: ReportRow[], company: string): { subject: string; text: string } {
  const n = rows.length;
  const subject = `ProTankr - ${n} cancelled load${n === 1 ? "" : "s"} not redispatched (${company})`;
  const head = `${n} load${n === 1 ? " was" : "s were"} cancelled in the last week and never redispatched.`;
  const body = rows.map((r) => `${r.when} · ${r.driver}\n  ${r.route}${r.order ? ` · order ${r.order}` : ""}\n  ${r.why}`).join("\n\n");
  return { subject, text: `${head}\n\n${body}\n\nCancelled loads are deleted after a week.` };
}
