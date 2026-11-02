// lib/notify/server.ts
//
// The real senders behind the scheduler: Resend for email, web push for phones, Supabase for the schedules, the
// company directory and the error log. Server only (the service client). The rules live in runDue.ts.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendPush, type StoredSub } from "@/lib/push/send";
import { runDueSchedules, type RunDeps, type RunSummary } from "./runDue";
import type { DueSchedule, Person } from "./schedule";
import { freightRows, recapLines, type Load, type Stop } from "../freight/freight";

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
    payloadFor: async (s) => {
      if (s.template_key !== "freight_recap") return null;
      const days = Math.min(60, Math.max(1, Number(s.payload.days) || 7));
      const since = new Date(now - 90 * 86400_000).toISOString();
      const [{ data: loads }, { data: trucks }] = await Promise.all([
        admin.from("freight_loads").select("*").eq("company_id", s.company_id).or(`status.eq.open,begun_at.gte.${since},delivered_at.gte.${since}`).limit(2000),
        admin.from("trucks").select("truck_id, truck_name").eq("company_id", s.company_id),
      ]);
      const ls = (loads ?? []) as Load[];
      const { data: stops } = ls.length ? await admin.from("freight_stops").select("*").in("freight_id", ls.map((l) => l.freight_id)) : { data: [] };
      const { data: profs } = ls.length ? await admin.from("profiles").select("user_id, display_name").in("user_id", [...new Set(ls.map((l) => l.driver_id))]) : { data: [] };
      const dn = new Map(((profs ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [p.user_id, p.display_name ?? "Driver"]));
      const tn = new Map(((trucks ?? []) as { truck_id: string; truck_name: string }[]).map((t) => [t.truck_id, t.truck_name]));
      const rows = freightRows(ls, (stops ?? []) as Stop[], (id) => dn.get(id) ?? "Driver", (id) => (id ? tn.get(id) ?? "Truck" : "Truck"));
      return { ...s.payload, lines: recapLines(rows, now, days) };
    },
    unsignedFor: async (companyId, meetingId) => {
      const [{ data: members }, { data: sigs }] = await Promise.all([
        admin.from("user_companies").select("user_id, role").eq("company_id", companyId).in("role", ["driver", "lead"]),
        admin.from("safety_meeting_signatures").select("user_id").eq("meeting_id", meetingId),
      ]);
      const signed = new Set(((sigs ?? []) as { user_id: string }[]).map((x) => x.user_id));
      return ((members ?? []) as { user_id: string }[]).map((m) => m.user_id).filter((id) => !signed.has(id));
    },
    logError: async (companyId, kind, message, payload) => {
      await admin.from("app_errors").insert({ company_id: companyId, kind, message, payload });
    },
  };
  return runDueSchedules(deps);
}
