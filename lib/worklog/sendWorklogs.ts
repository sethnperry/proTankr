// lib/worklog/sendWorklogs.ts
//
// Emails each driver their Work Log for the last finished period, N days after it ends.
// The period is the driver's own if they set one, else the company's. Called from the
// hos-alerts cron (every few minutes), a couple of drivers per run.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { generatePayPeriods, type PayPeriodType } from "@/app/admin/payPeriods";
import { lastFinishedPeriod, PERIOD_TITLE } from "@/lib/reports/periodOptions";
import { buildDriverWorklog } from "./serverWorklog";
import { sendWorklogEmail } from "./emailWorklog";
import { addDays, localDateOf } from "./time";

const BATCH = 2;
const SEND_HOUR = 6;

export async function runWorklogs(nowMs = Date.now()): Promise<number> {
  const admin = getServiceSupabase();
  const { data: cps } = await admin.from("company_report_period").select("*");
  const companies = (cps ?? []) as { company_id: string; period_type: PayPeriodType; anchor_date: string; send_after_days: number; tz: string }[];
  if (!companies.length) return 0;
  const { data: members } = await admin.from("user_companies").select("user_id, company_id").in("company_id", companies.map((c) => c.company_id));
  const allMem = (members ?? []) as { user_id: string; company_id: string }[];
  if (!allMem.length) return 0;
  // A driver in more than one company gets one report, for their active company. (Their progress is kept
  // per driver, so reporting for two companies would let one mark the other's period done.)
  const { data: act } = await admin.from("user_settings").select("user_id, active_company_id").in("user_id", [...new Set(allMem.map((m) => m.user_id))]);
  const active = new Map(((act ?? []) as { user_id: string; active_company_id: string | null }[]).map((r) => [r.user_id, r.active_company_id]));
  const perUser = new Map<string, number>();
  for (const m of allMem) perUser.set(m.user_id, (perUser.get(m.user_id) ?? 0) + 1);
  const mem = allMem.filter((m) => (perUser.get(m.user_id) ?? 0) < 2 || active.get(m.user_id) === m.company_id);
  if (!mem.length) return 0;
  const ids = mem.map((m) => m.user_id);
  const [{ data: st }, { data: pay }] = await Promise.all([
    admin.from("driver_recap_state").select("user_id, last_period_end, checked_at").in("user_id", ids),
    admin.from("driver_pay_settings").select("user_id, pay_period_type, pay_period_anchor_date, worklog_email").in("user_id", ids),
  ]);
  const state = new Map(((st ?? []) as any[]).map((r) => [r.user_id as string, r]));
  const paySet = new Map(((pay ?? []) as any[]).map((r) => [r.user_id as string, r]));

  // Work out who is due, then take the least recently checked few.
  const due: { m: { user_id: string; company_id: string }; c: (typeof companies)[number]; period: { start: string; end: string }; type: PayPeriodType }[] = [];
  for (const m of mem) {
    const c = companies.find((x) => x.company_id === m.company_id)!;
    const ps = paySet.get(m.user_id);
    if (ps && ps.worklog_email === false) continue;
    const type: PayPeriodType = ps?.pay_period_type && ps?.pay_period_anchor_date ? ps.pay_period_type : c.period_type;
    const anchor: string = ps?.pay_period_type && ps?.pay_period_anchor_date ? ps.pay_period_anchor_date : c.anchor_date;
    const today = localDateOf(nowMs, c.tz);
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: c.tz, hour: "numeric", hourCycle: "h23" }).format(nowMs));
    const period = lastFinishedPeriod({ type, anchor }, today);
    if (!period || today < addDays(period.end, c.send_after_days) || hour < SEND_HOUR) continue;
    if (state.get(m.user_id)?.last_period_end >= period.end) continue;
    due.push({ m, c, period, type });
  }
  due.sort((a, b) => (Date.parse(state.get(a.m.user_id)?.checked_at ?? "") || 0) - (Date.parse(state.get(b.m.user_id)?.checked_at ?? "") || 0));

  let sent = 0;
  for (const d of due.slice(0, BATCH)) {
    const uid = d.m.user_id;
    const mark = (patch: Record<string, unknown>) => admin.from("driver_recap_state").upsert({ user_id: uid, company_id: d.m.company_id, checked_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...patch }, { onConflict: "user_id" });
    try {
      const [{ data: u }, { data: prof }] = await Promise.all([admin.auth.admin.getUserById(uid), admin.from("profiles").select("display_name").eq("user_id", uid).maybeSingle()]);
      const email = u?.user?.email;
      if (!email) { console.warn("[worklog] skipped, no email on file:", uid); await mark({ last_period_end: d.period.end }); continue; }
      const w = await buildDriverWorklog({ companyId: d.m.company_id, userId: uid, range: d.period, tz: d.c.tz, title: PERIOD_TITLE[d.type], driverName: ((prof as any)?.display_name ?? "").trim() || email });
      if (!w.summary.loads && !w.summary.worked) { console.warn("[worklog] skipped, no loads or hours in", d.period.start, "to", d.period.end, "for", uid); await mark({ last_period_end: d.period.end }); continue; }
      await sendWorklogEmail(email, w);
      console.log("[worklog] sent", d.period.start, "to", d.period.end, "for", uid);
      await mark({ last_period_end: d.period.end });
      sent++;
    } catch (e) { console.warn("[cron] worklog failed:", (e as Error).message); await mark({}); }
  }
  void generatePayPeriods;
  return sent;
}
