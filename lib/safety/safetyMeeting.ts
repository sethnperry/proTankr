// lib/safety/safetyMeeting.ts
//
// Safety meetings, the rules only: when the next one in a series is due, where a meeting stands (scheduled, open,
// ended, closed), who has and hasn't signed, the reminders (made for the one scheduler, never sent from here), and
// the roster export for an audit. Pure: no Supabase.

import { meetingMinutes, meetingWindow } from "./onDuty.ts";
import { addDays } from "../worklog/time.ts";
import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";
import type { Cadence, Recipient } from "../notify/schedule.ts";

export type Series = { series_id: string; title: string; interval_days: number; starts_on: string; zoom_url: string | null; attachment_path: string | null; attachment_name: string | null; is_active: boolean };
export type Meeting = {
  meeting_id: string; series_id: string | null; title: string; scheduled_for: string; zoom_url: string | null; attachment_path: string | null; attachment_name: string | null;
  started_at: string | null; ended_at: string | null; closed_at: string | null;
};

export type SeriesInput = { title: string; intervalDays: string; startsOn: string; zoomUrl: string };

export function seriesProblem(i: SeriesInput): string | null {
  if (!i.title.trim()) return "Give the series a title.";
  const n = Number(i.intervalDays);
  if (!Number.isInteger(n) || n < 1 || n > 365) return "Repeat every 1 to 365 days.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.startsOn)) return "Pick the first meeting date.";
  if (i.zoomUrl.trim() && !/^https?:\/\/\S+$/i.test(i.zoomUrl.trim())) return "The Zoom link should start with https://";
  return null;
}

/** The next date in the series on or after `from`, counting every `interval` days from `startsOn`. */
export function nextDueDate(s: Pick<Series, "starts_on" | "interval_days">, from: string): string {
  if (from <= s.starts_on) return s.starts_on;
  const a = Date.parse(`${s.starts_on}T12:00:00Z`), b = Date.parse(`${from}T12:00:00Z`);
  const steps = Math.ceil(Math.round((b - a) / 86400_000) / s.interval_days);
  return addDays(s.starts_on, steps * s.interval_days);
}

/** The next date in this series that has no meeting yet. */
export function nextToSchedule(s: Series, meetings: Meeting[], today: string): string {
  const have = new Set(meetings.filter((m) => m.series_id === s.series_id).map((m) => m.scheduled_for));
  let d = nextDueDate(s, today);
  for (let i = 0; i < 400 && have.has(d); i++) d = addDays(d, s.interval_days);
  return d;
}

export type MeetingState = "scheduled" | "open" | "ended" | "closed";
export const meetingState = (m: Pick<Meeting, "started_at" | "ended_at" | "closed_at">): MeetingState =>
  m.closed_at ? "closed" : m.ended_at ? "ended" : m.started_at ? "open" : "scheduled";
/** A driver can sign from the moment it starts until an admin closes it (also after it ended: late sign-in). */
export const canSign = (m: Pick<Meeting, "started_at" | "closed_at">) => !!m.started_at && !m.closed_at;

export const signProblem = (path: string | null): string | null => (!path || path.length < 12 ? "Sign with your finger first." : null);

// ── Who has signed ─────────────────────────────────────────────────────────────────────────────────────────
export type Person = { user_id: string; name: string; role: string };
export type Signature = { user_id: string; signed_at: string };
export type RosterRow = { user_id: string; name: string; signed: boolean; signedAt: string | null };

/** Everyone who is expected to sign (drivers and leads), signed or not, unsigned first then by name. */
export function roster(people: Person[], sigs: Signature[]): RosterRow[] {
  const at = new Map(sigs.map((s) => [s.user_id, s.signed_at]));
  return people.filter((p) => p.role === "driver" || p.role === "lead")
    .map((p) => ({ user_id: p.user_id, name: p.name, signed: at.has(p.user_id), signedAt: at.get(p.user_id) ?? null }))
    .sort((a, b) => Number(a.signed) - Number(b.signed) || a.name.localeCompare(b.name));
}
export const unsignedCount = (rows: RosterRow[]) => rows.filter((r) => !r.signed).length;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US") : "");
export const rosterColumns: ShellColumn<RosterRow>[] = [
  { key: "name", label: "Driver", get: (r) => r.name, weight: 1.6 },
  { key: "status", label: "Status", get: (r) => (r.signed ? "Signed" : "Not signed"), weight: 1 },
  { key: "at", label: "Signed at", get: (r) => when(r.signedAt), weight: 1.4 },
];
export const rosterFilters: ShellFilter<RosterRow>[] = [{ id: "status", label: "Status", of: (r) => (r.signed ? "signed" : "unsigned"), show: (v) => (v === "signed" ? "Signed" : "Not signed") }];

/** The audit export for one meeting: what it was, when it ran, and every signer with the time. */
export function auditCsv(m: Meeting, rows: RosterRow[]): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = [["Meeting", m.title], ["Scheduled for", m.scheduled_for], ["Started", when(m.started_at)], ["Ended", when(m.ended_at)], ["Closed", when(m.closed_at)], ["Zoom", m.zoom_url ?? ""], ["Material", m.attachment_name ?? ""], ["Counts as", "On-duty time for every signer"]];
  return [...head.map(([k, v]) => `${esc(k)},${esc(v)}`), "", "Driver,Status,Signed at,Minutes on duty", ...rows.map((r) => [r.name, r.signed ? "Signed" : "Not signed", when(r.signedAt), r.signed ? String(meetingMinutes(meetingWindow(m, r.signedAt as string))) : ""].map(esc).join(","))].join("\r\n");
}

// ── Reminders, for the one scheduler ───────────────────────────────────────────────────────────────────────
export type ReminderDraft = { kind: "reminder"; template_key: "reminder"; recipients: Recipient[]; channels: string[]; cadence: Cadence; payload: { subject: string; body: string } };

/** A day-before reminder to every driver and lead, and a follow-up the day after to whoever hasn't signed. */
export function reminderDrafts(m: Pick<Meeting, "meeting_id" | "title" | "scheduled_for" | "zoom_url">, tz: string): ReminderDraft[] {
  const link = m.zoom_url ? ` Join: ${m.zoom_url}` : "";
  const everyone: Recipient[] = [{ type: "role", value: "driver" }, { type: "role", value: "lead" }];
  return [
    { kind: "reminder", template_key: "reminder", recipients: everyone, channels: ["push", "email"], cadence: { freq: "once", at: "08:00", on: addDays(m.scheduled_for, -1), tz },
      payload: { subject: `Safety meeting tomorrow: ${m.title}`, body: `${m.title} is ${m.scheduled_for}.${link} You sign in on the app when it starts.` } },
    { kind: "reminder", template_key: "reminder", recipients: [{ type: "unsigned", value: m.meeting_id }], channels: ["push", "email"], cadence: { freq: "once", at: "08:00", on: addDays(m.scheduled_for, 1), tz },
      payload: { subject: `You haven't signed in: ${m.title}`, body: `You have not signed the safety meeting "${m.title}" (${m.scheduled_for}). Open the app, Safety meeting, and sign.` } },
  ];
}
