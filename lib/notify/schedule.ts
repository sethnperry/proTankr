// lib/notify/schedule.ts
//
// When a scheduled reminder or recap is next due, and who it goes to. Pure: no Supabase, no clock (the caller
// passes the time). Times are wall-clock in the schedule's own time zone.

import { addDays, localDateOf, localMidnightMs } from "../worklog/time.ts";

export type Cadence = {
  freq: "once" | "daily" | "weekly" | "monthly";
  /** "HH:MM", local to `tz`. */
  at: string;
  /** Weekly: 0 = Sunday ... 6 = Saturday. */
  dow?: number;
  /** Monthly: day of the month (31 means "the last day" in a shorter month). */
  dom?: number;
  /** Once: the local date (YYYY-MM-DD). */
  on?: string;
  tz?: string;
};

const DEFAULT_TZ = "America/New_York";

function matches(c: Cadence, date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  switch (c.freq) {
    case "once": return c.on === date;
    case "daily": return true;
    case "weekly": return new Date(`${date}T12:00:00Z`).getUTCDay() === (c.dow ?? 1);
    case "monthly": {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return d === Math.min(c.dom ?? 1, last);
    }
  }
}

/** The first run strictly after `after` (a time in ms), or null when there is none (a "once" in the past). */
export function nextRunAfter(c: Cadence, after: number): number | null {
  const tz = c.tz ?? DEFAULT_TZ;
  const [hh, mm] = c.at.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  let date = localDateOf(after, tz);
  for (let i = 0; i < 400; i++, date = addDays(date, 1)) {
    if (!matches(c, date)) continue;
    const t = localMidnightMs(date, tz) + (hh * 60 + mm) * 60_000;
    if (t > after) return t;
  }
  return null;
}

export type Recipient = { type: "email" | "user" | "role"; value: string; region?: string | null };
export type Person = { user_id: string; email: string | null; role: string; region: string | null };

export type Resolved = { emails: string[]; userIds: string[] };

/** Turns recipient rules into addresses and user ids (the people who can get a push), without repeats. */
export function resolveRecipients(rules: Recipient[], directory: Person[]): Resolved {
  const emails = new Map<string, string>(); // lower-case -> as given
  const userIds = new Set<string>();
  const keep = (addr: string) => { if (!emails.has(addr.toLowerCase())) emails.set(addr.toLowerCase(), addr); };
  const add = (p: Person) => { userIds.add(p.user_id); if (p.email) keep(p.email); };
  for (const r of rules) {
    if (r.type === "email") { if (/^\S+@\S+\.\S+$/.test(r.value)) keep(r.value); }
    else if (r.type === "user") { const p = directory.find((x) => x.user_id === r.value); if (p) add(p); }
    else for (const p of directory) if (p.role === r.value && (!r.region || (p.region ?? "").trim().toLowerCase() === r.region.trim().toLowerCase())) add(p);
  }
  return { emails: [...emails.values()], userIds: [...userIds] };
}

export type DueSchedule = { schedule_id: string; company_id: string; kind: string; template_key: string; recipients: Recipient[]; channels: string[]; cadence: Cadence; payload: Record<string, unknown>; next_run_at: string | null };

export function isDue(s: { is_active?: boolean; next_run_at: string | null }, now: number): boolean {
  return s.is_active !== false && !!s.next_run_at && Date.parse(s.next_run_at) <= now;
}
