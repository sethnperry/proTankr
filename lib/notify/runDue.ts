// lib/notify/runDue.ts
//
// One pass over the schedules that are due: work out who it goes to, render the template, send by each channel,
// and set the next run. Everything it touches is passed in (`deps`), so the rules run in a test with no network;
// the cron route supplies the real Supabase, Resend and push. A failed send is written to the error log and does
// not stop the others. The one scheduler: reminders and recaps use it, and no form sends its own.

import { nextRunAfter, resolveRecipients, type DueSchedule, type Person } from "./schedule.ts";
import { render } from "./templates.ts";

export type RunDeps = {
  now: number;
  loadDue: () => Promise<DueSchedule[]>;
  directory: (companyId: string) => Promise<Person[]>;
  sendEmail: (to: string[], subject: string, text: string) => Promise<void>;
  sendPush: (userIds: string[], title: string, body: string) => Promise<number>;
  /** Saved after a run: when it ran and when it runs next (null = never again, so it is switched off). */
  saveRun: (scheduleId: string, lastRunAt: string, nextRunAt: string | null) => Promise<void>;
  /** The user ids who have not signed a safety meeting yet (for "unsigned" recipients). Optional. */
  unsignedFor?: (companyId: string, meetingId: string) => Promise<string[]>;
  logError: (companyId: string, kind: "send_failed" | "other", message: string, payload: Record<string, unknown>) => Promise<void>;
};

export type RunSummary = { ran: number; emails: number; pushes: number; failed: number };

export async function runDueSchedules(d: RunDeps): Promise<RunSummary> {
  const out: RunSummary = { ran: 0, emails: 0, pushes: 0, failed: 0 };
  for (const s of await d.loadDue()) {
    const msg = render(s.template_key, s.payload);
    // The next run is set first, so a crash mid-send can't send it twice on the next pass.
    const next = nextRunAfter(s.cadence, d.now);
    await d.saveRun(s.schedule_id, new Date(d.now).toISOString(), next == null ? null : new Date(next).toISOString());
    out.ran++;
    if (!msg) {
      out.failed++;
      await d.logError(s.company_id, "other", `Unknown template ${s.template_key}`, { schedule_id: s.schedule_id });
      continue;
    }
    // "Everyone who hasn't signed" is worked out now, not when the schedule was made.
    const rules = [];
    for (const r of s.recipients) {
      if (r.type !== "unsigned") { rules.push(r); continue; }
      for (const id of (await d.unsignedFor?.(s.company_id, r.value)) ?? []) rules.push({ type: "user" as const, value: id });
    }
    const who = resolveRecipients(rules, await d.directory(s.company_id));
    if (s.channels.includes("email") && who.emails.length) {
      try { await d.sendEmail(who.emails, msg.subject, msg.text); out.emails += who.emails.length; }
      catch (e) { out.failed++; await d.logError(s.company_id, "send_failed", `Scheduled email failed: ${(e as Error).message}`, { schedule_id: s.schedule_id, template: s.template_key }); }
    }
    if (s.channels.includes("push") && who.userIds.length) {
      try { out.pushes += await d.sendPush(who.userIds, msg.subject, msg.push); }
      catch (e) { out.failed++; await d.logError(s.company_id, "send_failed", `Scheduled push failed: ${(e as Error).message}`, { schedule_id: s.schedule_id, template: s.template_key }); }
    }
  }
  return out;
}
