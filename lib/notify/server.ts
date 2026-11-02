// lib/notify/server.ts
//
// The real senders behind the scheduler: Resend for email, web push for phones, Supabase for the schedules, the
// company directory and the error log. Server only (the service client). The rules live in runDue.ts.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendPush, type StoredSub } from "@/lib/push/send";
import { runDueSchedules, type RunDeps, type RunSummary } from "./runDue";
import type { DueSchedule, Person } from "./schedule";

async function sendEmail(to: string[], subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
  const from = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // One message per recipient: nobody sees the others' addresses.
  for (const addr of to) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `ProTankr <${from}>`, to: [addr], subject, text,
        html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111111;white-space:pre-wrap">${esc(text)}</p>`,
      }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  }
}

export async function runNotifications(now = Date.now()): Promise<RunSummary> {
  const admin = getServiceSupabase();
  const deps: RunDeps = {
    now,
    loadDue: async () => {
      const { data } = await admin.from("notification_schedules").select("*").eq("is_active", true).lte("next_run_at", new Date(now).toISOString()).limit(100);
      return (data ?? []) as DueSchedule[];
    },
    directory: async (companyId) => {
      const { data: members } = await admin.from("user_companies").select("user_id, role").eq("company_id", companyId);
      const ids = ((members ?? []) as { user_id: string; role: string }[]).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await admin.from("profiles").select("user_id, region").in("user_id", ids);
      const region = new Map(((profs ?? []) as { user_id: string; region: string | null }[]).map((p) => [p.user_id, p.region]));
      const people: Person[] = [];
      for (const m of (members ?? []) as { user_id: string; role: string }[]) {
        const u = await admin.auth.admin.getUserById(m.user_id).catch(() => null);
        people.push({ user_id: m.user_id, email: u?.data?.user?.email ?? null, role: m.role, region: region.get(m.user_id) ?? null });
      }
      return people;
    },
    sendEmail,
    sendPush: async (userIds, title, body) => {
      const { data } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", userIds);
      return sendPush((data ?? []) as StoredSub[], { title, body, url: "/planner/home", tag: "scheduled" });
    },
    saveRun: async (id, lastRunAt, nextRunAt) => {
      await admin.from("notification_schedules").update({ last_run_at: lastRunAt, next_run_at: nextRunAt, is_active: nextRunAt != null }).eq("schedule_id", id);
    },
    logError: async (companyId, kind, message, payload) => {
      await admin.from("app_errors").insert({ company_id: companyId, kind, message, payload });
    },
  };
  return runDueSchedules(deps);
}
