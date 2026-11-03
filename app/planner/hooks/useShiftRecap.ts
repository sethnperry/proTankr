"use client";
// app/planner/hooks/useShiftRecap.ts
//
// The Shift pop-out's data: the driver's shift events for the current pay period (from the server, merged with this
// phone's own so a shift just started shows at once) and their schedule. The rules are in lib/shifts/recap.ts.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useReportPeriods } from "@/lib/reports/useReportPeriods";
import { periodOptions } from "@/lib/reports/periodOptions";
import { localDateOf, localMidnightMs, addDays } from "@/lib/worklog/time";
import { deriveShifts } from "@/lib/shifts/shiftLogic";
import { scheduledStart, shiftRecap, type Schedule } from "@/lib/shifts/recap";
import type { ShiftEventRow } from "@/lib/trips/types";

export function useShiftRecap(o: { companyId: string | null; userId: string | null; enabled: boolean; localEvents: ShiftEventRow[]; nowMs: number }) {
  const { companyId, userId, enabled, localEvents, nowMs } = o;
  const { settings, tz } = useReportPeriods(companyId, userId);
  const today = localDateOf(nowMs, tz);
  const period = useMemo(() => {
    const p = periodOptions(settings, today).find((x) => x.group === "period");
    return p ? { start: p.start, end: p.end, label: p.label.replace(/^This period /, "Pay period ").replace(/[()]/g, "") } : { start: addDays(today, -13), end: today, label: "Last 14 days" };
  }, [settings, today]);

  const [server, setServer] = useState<ShiftEventRow[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  useEffect(() => {
    if (!enabled || !userId) return;
    let off = false;
    void (async () => {
      try {
        const from = new Date(localMidnightMs(addDays(period.start, -1), tz)).toISOString();
        const [ev, sc] = await Promise.all([
          supabase.from("shift_events").select("*").eq("user_id", userId).gte("occurred_at", from).order("occurred_at").limit(3000),
          supabase.from("driver_schedules").select("days_of_week, shift_start_local").eq("user_id", userId).maybeSingle(),
        ]);
        if (off) return;
        if (!ev.error) setServer((ev.data ?? []) as ShiftEventRow[]);
        setSchedule((sc.data as Schedule | null) ?? null);
      } catch { /* the phone's own copy stands */ }
    })();
    return () => { off = true; };
  }, [enabled, userId, period.start, tz]);

  const recap = useMemo(() => {
    if (!userId) return { rows: [], total: 0 };
    const byId = new Map<string, ShiftEventRow>();
    for (const e of [...server, ...localEvents]) byId.set(e.event_id, e);
    const shifts = deriveShifts([...byId.values()].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)), userId, new Date(nowMs).toISOString());
    return shiftRecap(shifts, { start: period.start, end: period.end }, tz, nowMs);
  }, [server, localEvents, userId, nowMs, period.start, period.end, tz]);

  return { recap, periodLabel: period.label, scheduled: scheduledStart(schedule, nowMs, tz) };
}
