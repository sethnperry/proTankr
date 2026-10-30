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
import { milesByState } from "@/lib/ifta/milesByState";
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
  // Loaded miles (pickup to last delivery) come from the truck's tracking, when the company has it: the
  // odometer change over the loaded stretch, else the GPS path. Without it the report shows total miles only.
  let provider: Awaited<ReturnType<typeof providerFor>> = null;
  const vehicleOfTruck = new Map<string, string>();
  try {
    provider = await providerFor(o.companyId);
    if (provider) {
      const { data: vm } = await admin.from("telematics_vehicle_map").select("truck_id, provider_vehicle_id").eq("company_id", o.companyId);
      for (const r of (vm ?? []) as { truck_id: string; provider_vehicle_id: string }[]) vehicleOfTruck.set(r.truck_id, r.provider_vehicle_id);
    }
  } catch (e) { console.warn("[worklog] tracking unavailable:", (e as Error).message); }
  const loadedMilesFor = provider && vehicleOfTruck.size
    ? async (t: { truckId: string | null; loadedFrom: string | null; loadedTo: string | null }): Promise<number | null> => {
        const vid = t.truckId ? vehicleOfTruck.get(t.truckId) : null;
        if (!vid || !t.loadedFrom || !t.loadedTo) return null;
        const span = await provider!.odometerSpan(vid, t.loadedFrom, t.loadedTo).catch(() => null);
        if (span && span.lastMi >= span.firstMi) return span.lastMi - span.firstMi;
        const trail = await provider!.trail(vid, t.loadedFrom, t.loadedTo).catch(() => []);
        if (trail.length < 2) return null;
        return Object.values(milesByState(trail, () => "all")).reduce((a, b) => a + b, 0);
      }
    : undefined;

  const [{ trips, purchases }, rule] = await Promise.all([
    loadWorklogInputs(admin, { userId: o.userId, range: o.range, tz: o.tz, loadedMilesFor }),
    companyOvertimeRule(o.companyId),
  ]);

  let dutyHours: Record<string, number> | null = null;
  try {
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
