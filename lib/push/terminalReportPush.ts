// lib/push/terminalReportPush.ts
//
// New terminal reports (last 20 minutes) pushed to the drivers they change, once each. Run by the
// cron, and right after a driver's notification answer posts a report so other trucks hear at once.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendPush, type StoredSub } from "@/lib/push/send";
import { planReportPushes, reportPushText, type HeadedTruck, type NewReport } from "@/lib/push/terminalReportCore";
import { outageIsActive } from "@/app/planner/utils/dates";

const OPEN = ["draft", "loading", "in_transit", "delivering"];

export async function pushTerminalReports(): Promise<number> {
  const admin = getServiceSupabase();
  // Every report still showing in the app (reports clear on a 6-hour schedule), not just the last few minutes: a driver
  // whose trip starts after the report was posted still hears about it. Each report goes to each driver once.
  const nowMs = Date.now();
  const since = new Date(nowMs - 8 * 3600_000).toISOString();
  const { data: rs0 } = await admin.from("terminal_outage_reports")
    .select("report_id, terminal_id, report_type, product_id, supplier_name, company_id, reporter_user_id, created_at, last_activity_at").gte("created_at", since);
  const tzRows = (rs0 ?? []).length ? (await admin.from("terminals").select("terminal_id, timezone").in("terminal_id", [...new Set(((rs0 ?? []) as any[]).map((r) => String(r.terminal_id)))])).data : [];
  const tzOf = new Map(((tzRows ?? []) as any[]).map((t) => [String(t.terminal_id), (t.timezone as string | null) || "America/New_York"]));
  const rs = ((rs0 ?? []) as any[]).filter((r) => outageIsActive(r.report_type, Date.parse(r.created_at), nowMs, tzOf.get(String(r.terminal_id)) ?? "America/New_York", r.last_activity_at ? Date.parse(r.last_activity_at) : null));
  const reports: NewReport[] = ((rs ?? []) as any[]).map((r) => ({
    reportId: r.report_id, terminalId: String(r.terminal_id), type: r.report_type, productId: r.product_id ?? null,
    supplierName: r.supplier_name ?? null, companyId: r.company_id, reporterUserId: r.reporter_user_id ?? null,
  }));
  if (!reports.length) return 0;
  const { data: ts } = await admin.from("trips")
    .select("driver_id, company_id, trip_pickups(seq, terminal_id, arrived_at, begin_at, left_at, outcome, planned_comps, load_id)")
    .in("status", OPEN).not("driver_id", "is", null);
  const loadIds: string[] = [];
  const heads: { userId: string; companyId: string; terminalId: string; comps: string[]; loadId: string | null }[] = [];
  for (const t of (ts ?? []) as any[]) {
    const live = ((t.trip_pickups ?? []) as any[]).filter((k) => k.outcome !== "no_load" && !k.left_at).sort((a, b) => a.seq - b.seq)[0];
    if (!live || live.begin_at || !live.terminal_id) continue; // headed there, or at the rack and not loading yet
    const comps = ((live.planned_comps ?? []) as { product_id?: string }[]).map((c) => c.product_id).filter((x): x is string => !!x);
    if (live.load_id) loadIds.push(live.load_id);
    heads.push({ userId: t.driver_id, companyId: t.company_id, terminalId: String(live.terminal_id), comps, loadId: live.load_id ?? null });
  }
  const planned = new Map<string, string[]>();
  if (loadIds.length) {
    const { data: ll } = await admin.from("load_lines").select("load_id, product_id").in("load_id", loadIds);
    for (const l of (ll ?? []) as any[]) if (l.product_id) planned.set(l.load_id, [...new Set([...(planned.get(l.load_id) ?? []), String(l.product_id)])]);
  }
  const trucks: HeadedTruck[] = heads.map((h) => ({
    userId: h.userId, companyId: h.companyId, terminalId: h.terminalId,
    products: h.comps.length ? [...new Set(h.comps)] : h.loadId ? planned.get(h.loadId) ?? [] : [],
  }));
  const plan = planReportPushes(reports, trucks);
  if (!plan.length) return 0;
  // Once per report and driver.
  const { data: fresh } = await admin.from("terminal_report_pushes")
    .upsert(plan.map((p) => ({ report_id: p.reportId, user_id: p.userId })), { onConflict: "report_id,user_id", ignoreDuplicates: true })
    .select("report_id, user_id");
  const todo = (fresh ?? []) as { report_id: string; user_id: string }[];
  if (!todo.length) return 0;
  const [{ data: tm }, { data: pr }, { data: subRows }] = await Promise.all([
    admin.from("terminals").select("terminal_id, terminal_name").in("terminal_id", [...new Set(reports.map((r) => r.terminalId))]),
    admin.from("products").select("product_id, display_name, product_name").in("product_id", [...new Set(reports.map((r) => r.productId).filter((x): x is string => !!x))]),
    admin.from("push_subscriptions").select("endpoint, p256dh, auth, user_id").in("user_id", [...new Set(todo.map((x) => x.user_id))]),
  ]);
  const tName = new Map(((tm ?? []) as any[]).map((t) => [String(t.terminal_id), t.terminal_name as string]));
  const pName = new Map(((pr ?? []) as any[]).map((p) => [String(p.product_id), (p.display_name ?? p.product_name ?? null) as string | null]));
  let sent = 0;
  for (const x of todo) {
    const r = reports.find((q) => q.reportId === x.report_id);
    if (!r) continue;
    const subs = ((subRows ?? []) as (StoredSub & { user_id: string })[]).filter((s) => s.user_id === x.user_id);
    sent += await sendPush(subs, {
      title: tName.get(r.terminalId) ?? "Terminal", body: reportPushText(r, r.productId ? pName.get(r.productId) ?? null : null),
      url: "/planner/home", tag: `rep-${r.reportId}`,
    });
  }
  return sent;
}

