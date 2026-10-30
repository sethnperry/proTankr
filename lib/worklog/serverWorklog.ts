// lib/worklog/serverWorklog.ts
//
// Builds a driver's Work Log on the server, including the on-duty time from the electronic log
// (Geotab) when the company has it connected. One path for the emailed PDF, the sample and the
// in-app view, so they all show the same numbers.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { autoLinkDriver, providerFor } from "@/lib/telematics/server";
import { loadWorklogInputs } from "./loadWorklogInputs";
import { buildWorklog, type Worklog } from "./buildWorklog";
import { dailyHours } from "./dutyHours";
import { isOtRule, type OtRule } from "./overtime";
import { addDays, localMidnightMs } from "./time";
import { aggregateUtilization } from "@/lib/capacity/computeUtilization";

export async function companyOvertimeRule(companyId: string): Promise<OtRule> {
  const { data } = await getServiceSupabase().from("company_report_period").select("overtime_rule").eq("company_id", companyId).maybeSingle();
  const r = (data as { overtime_rule?: string } | null)?.overtime_rule;
  return isOtRule(r) ? r : "federal";
}

export async function buildDriverWorklog(o: {
  companyId: string; userId: string; range: { start: string; end: string }; tz: string; title: string; driverName: string;
}): Promise<Worklog> {
  const admin = getServiceSupabase();
  const [{ trips, purchases }, rule] = await Promise.all([
    loadWorklogInputs(admin, { userId: o.userId, range: o.range, tz: o.tz }),
    companyOvertimeRule(o.companyId),
  ]);

  let dutyHours: Record<string, number> | null = null;
  try {
    const provider = await providerFor(o.companyId);
    if (provider) {
      const { data } = await admin.from("telematics_driver_map").select("provider_user_id").eq("company_id", o.companyId).eq("user_id", o.userId).maybeSingle();
      const pid = (data as { provider_user_id?: string } | null)?.provider_user_id ?? (await autoLinkDriver(o.companyId, o.userId));
      if (pid) {
        const fromIso = new Date(Date.parse(`${addDays(o.range.start, -1)}T00:00:00Z`)).toISOString();
        const toIso = new Date(Date.parse(`${addDays(o.range.end, 2)}T00:00:00Z`)).toISOString();
        const logs = await provider.dutyLogs(pid, fromIso, toIso);
        dutyHours = {};
        for (const d of dailyHours(logs, o.tz, o.range.start, o.range.end)) dutyHours[d.date] = (d.driveMin + d.onDutyMin) / 60;
      }
    }
  } catch (e) { console.warn("[worklog] duty hours unavailable:", (e as Error).message); }

  const w = buildWorklog({ driverName: o.driverName, range: o.range, tz: o.tz, title: o.title, trips, purchases, dutyHours, overtimeRule: rule });
  // The period's utilization score: this driver's loads in the period, gallon-weighted over eligible loads.
  try {
    const since = new Date(localMidnightMs(o.range.start, o.tz)).toISOString();
    const until = new Date(localMidnightMs(addDays(o.range.end, 1), o.tz)).toISOString();
    const { data } = await admin.from("load_utilization")
      .select("effective_available_gallons, actual_gallons, unused_gallons, eligibility")
      .eq("driver_id", o.userId).gte("loaded_at", since).lt("loaded_at", until);
    const u = aggregateUtilization((data ?? []) as any[]);
    w.utilization = { pct: u.utilization_pct, loads: u.eligible_loads, excluded: u.excluded_safety + u.excluded_constraint + u.excluded_incomplete_data };
  } catch (e) { console.warn("[worklog] utilization unavailable:", (e as Error).message); }
  return w;
}
