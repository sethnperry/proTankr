// lib/telematics/dutyLogs.ts
//
// Reads Geotab DutyStatusLog rows down to what dispatch cares about: the
// driver's real duty status and how long they've been in it. Only actual duty
// status changes count. Log-in / log-out of the ELD, power events, malfunction
// and certification entries are skipped, and so are edits that were rejected
// or superseded (state "Inactive...").

export type DutyCode = "D" | "ON" | "OFF" | "SB" | "PC" | "YM";

export type DutyState = {
  status: DutyCode | null;
  /** ISO time the current status began. */
  since: string | null;
  /** ISO time the current unbroken off-duty stretch (Off, Sleeper or Personal Conveyance) began; null when not off duty. */
  offSince: string | null;
};

const NAMES: Record<string, DutyCode> = {
  d: "D", driving: "D",
  on: "ON", onduty: "ON", "on duty": "ON", waitingtime: "ON", wt: "ON",
  off: "OFF", offduty: "OFF", "off duty": "OFF",
  sb: "SB", sleeper: "SB", sleeperberth: "SB",
  pc: "PC", personalconveyance: "PC", personal: "PC",
  ym: "YM", yardmove: "YM", yard: "YM",
};

/** A Geotab status string as a duty code, or null for anything that isn't a duty status. */
export function dutyCodeOf(raw: unknown): DutyCode | null {
  if (typeof raw !== "string") return null;
  return NAMES[raw.trim().toLowerCase().replace(/[\s_-]+/g, "")] ?? NAMES[raw.trim().toLowerCase()] ?? null;
}

/** Duty-status-change rows only (see header). */
export function isDutyChange(log: any): boolean {
  if (!log?.dateTime) return false;
  if (typeof log.state === "string" && /^inactive/i.test(log.state)) return false;
  // ELD event types: 1 duty status change, 3 driver indication (personal conveyance / yard move).
  // 2 intermediate, 4 certification, 5 login/logout, 6 power up/down, 7 malfunction are not changes.
  const t = Number(log.eventType);
  if (Number.isFinite(t) && log.eventType !== "" && log.eventType != null && ![1, 3].includes(t)) return false;
  return dutyCodeOf(log.status) != null;
}

const OFFISH = new Set<DutyCode>(["OFF", "SB", "PC"]);

export function dutyFromLogs(logs: any[], nowMs: number = Date.now()): DutyState {
  const rows = (logs ?? [])
    .filter(isDutyChange)
    .map((l) => ({ code: dutyCodeOf(l.status)!, t: Date.parse(l.dateTime) }))
    .filter((r) => Number.isFinite(r.t) && r.t <= nowMs + 60000)
    .sort((a, b) => a.t - b.t);
  const last = rows[rows.length - 1];
  if (!last) return { status: null, since: null, offSince: null };
  // The status began where its unbroken run of the same code began (repeated rows are re-confirmations).
  let i = rows.length - 1;
  while (i > 0 && rows[i - 1].code === last.code) i--;
  const since = new Date(rows[i].t).toISOString();
  let offSince: string | null = null;
  if (OFFISH.has(last.code)) {
    let j = rows.length - 1;
    while (j > 0 && OFFISH.has(rows[j - 1].code)) j--;
    offSince = new Date(rows[j].t).toISOString();
  }
  return { status: last.code, since, offSince };
}
