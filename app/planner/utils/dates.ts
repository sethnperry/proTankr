// Keep function names identical to page.tsx (underscore suffix) to avoid behavior drift.

export function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function toLocalMidnight(dateLike: string) {
  // Accepts "YYYY-MM-DD" OR "YYYY-MM-DDTHH:mm:ss..." and normalizes to local midnight
  const ymd = dateLike.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function todayLocalMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
}

export function formatMDY(dateLike: string) {
  const ymd = dateLike.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  return `${m}-${d}-${y}`;
}

export function formatMDYSlash_(dateLike: string) {
  const ymd = dateLike.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

// Date AND time derived from the same local-timezone-converted Date object
// -- formatMDYSlash_ takes the date-only "YYYY-MM-DD" prefix as a literal
// string slice (correct for date-only values, but for a real timestamptz
// like load_log.completed_at that's the UTC calendar date, not necessarily
// the driver's local one). Mixing that with a separately-computed local
// time would risk a mismatched date/time pair near a timezone boundary
// (e.g. 10pm UTC showing as "08/13 @ 21:45" when the driver's actual local
// evening is still 08/12) -- this derives both from one Date instance so
// they always agree.
export function formatMDYWithTime_(dateLike: string) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return formatMDYSlash_(dateLike);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yy} @ ${hh}:${mi}`;
}

export function isoToday_() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function addDaysISO_(iso: string, days: number) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map((v) => Number(v));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (Number(days) || 0));
  return dt.toISOString().slice(0, 10);
}

export function daysUntilISO_(iso: string | null | undefined) {
  if (!iso) return null;
  const todayISO = isoToday_();
  const [ty, tm, td] = todayISO.slice(0, 10).split("-").map((v) => Number(v));
  const [y, m, d] = iso.slice(0, 10).split("-").map((v) => Number(v));
  const a = new Date(ty, (tm || 1) - 1, td || 1);
  const b = new Date(y, (m || 1) - 1, d || 1);
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function formatMDYWithCountdown_(iso: string) {
  const mdy = formatMDY(iso);
  const d = daysUntilISO_(iso);
  if (d === null) return mdy;
  return `${mdy} (${d} days)`;
}

export function isPastISO_(iso: string | null | undefined) {
  if (!iso) return false;
  // Lexicographic compare works for YYYY-MM-DD
  return iso < isoToday_();
}

// ─── Timezone-aware helpers (terminal outage banner clearing schedule) ────────
// Same Intl.DateTimeFormat-with-timeZone approach useTerminals.ts's
// isoTodayInTimeZone and LoadingModal.tsx's fmtLastApiLine_ already use
// elsewhere in this codebase.

function tzPartsAt(dateMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(dateMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// Converts a wall-clock date/time in the given IANA timezone to a real UTC
// instant (ms) -- JS has no native zonedTimeToUtc, so this uses the
// standard "format a guess, measure its offset, correct" trick. Accurate
// except within a couple hours of a DST transition, which is an acceptable
// approximation for a banner clearing schedule, not a safety-critical value.
function zonedWallTimeToUtcMs(year: number, month: number, day: number, hour: number, timeZone: string): number {
  const naiveUTC = Date.UTC(year, month - 1, day, hour, 0, 0);
  const asIfUTCParts = tzPartsAt(naiveUTC, timeZone);
  const asIfUTC = Date.UTC(asIfUTCParts.year, asIfUTCParts.month - 1, asIfUTCParts.day, asIfUTCParts.hour, asIfUTCParts.minute, asIfUTCParts.second);
  const offsetMs = asIfUTC - naiveUTC;
  return naiveUTC - offsetMs;
}

/**
 * The most recent 6:00/12:00/18:00/24:00 (terminal-local) boundary that has
 * already passed, as a UTC timestamp (ms). Both the Out-of-Product and
 * Out-of-Allocation outage banners clear on this same 4x/day schedule
 * (confirmed with the user -- not a rolling "N hours since posted" expiry).
 */
export function mostRecentClearingCheckpoint(nowMs: number, timeZone: string): number {
  const { year, month, day, hour } = tzPartsAt(nowMs, timeZone);
  const checkpointHour = Math.floor(hour / 6) * 6;
  return zonedWallTimeToUtcMs(year, month, day, checkpointHour, timeZone);
}

/** "1355" style terminal-local time, for the outage banner's message timestamp. */
export function hhmmInTimeZone(dateMs: number, timeZone: string): string {
  const { hour, minute } = tzPartsAt(dateMs, timeZone);
  return `${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
}

/**
 * The next 6:00/12:00/18:00/24:00 (terminal-local) checkpoint at or after
 * `atMs` -- i.e. when a report created at `atMs` will actually clear, for
 * the outage banner's detail view ("Expires ~5:00pm"). Always exactly the
 * checkpoint that comes after mostRecentClearingCheckpoint(atMs, ...),
 * since checkpoints are evenly spaced every 6h.
 */
export function nextClearingCheckpoint(atMs: number, timeZone: string): number {
  return mostRecentClearingCheckpoint(atMs, timeZone) + 6 * 60 * 60 * 1000;
}

// ─── Report lifetimes ────────────────────────────────────────────────────────
// Out of Allocation resets at local midnight. Everything else (out of product, long line,
// terminal issue) stays until someone clears it (a load at that rack clears out-of-product on its
// own), with a 72 h cap so a forgotten flag can't mislead forever.
export const MANUAL_REPORT_CAP_MS = 72 * 60 * 60 * 1000;

export function outageExpiresAtMs(reportType: string, createdAtMs: number, timeZone: string): number {
  if (reportType === "out_of_allocation") {
    const { year, month, day } = tzPartsAt(createdAtMs, timeZone);
    return zonedWallTimeToUtcMs(year, month, day + 1, 0, timeZone);
  }
  return createdAtMs + MANUAL_REPORT_CAP_MS;
}

export function outageIsActive(reportType: string, createdAtMs: number, nowMs: number, timeZone: string): boolean {
  return nowMs < outageExpiresAtMs(reportType, createdAtMs, timeZone);
}

/** How long a flag has been up: "45m" under an hour, "5h" under a day, then "1d 6h". */
export function outageAge(createdAtMs: number, nowMs: number): string {
  const min = Math.max(0, Math.floor((nowMs - createdAtMs) / 60000));
  if (min < 60) return `${Math.max(1, min)}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const d = Math.floor(hrs / 24);
  return `${d}d ${hrs % 24}h`;
}
