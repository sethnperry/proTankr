"use client";
// app/planner/dispatch/useDriverDirectory.ts
//
// What the Plan a Load search needs beyond the roster: employee number and
// local area, each driver's scheduled shift, and recent truck use (for "last
// person in the truck").
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type DriverShift = { days: number[]; start: string | null; end: string | null };
export type DriverDirectory = {
  extra: Map<string, { employeeNumber: string | null; localArea: string | null; region: string | null }>;
  shifts: Map<string, DriverShift>;
  truckUse: { truckId: string; trailerId: string | null; driverId: string }[]; // newest first
};

export function useDriverDirectory(companyId: string | null, userIds: string[]): DriverDirectory {
  const [dir, setDir] = useState<DriverDirectory>({ extra: new Map(), shifts: new Map(), truckUse: [] });
  const key = [...userIds].sort().join(",");
  useEffect(() => {
    if (!companyId || userIds.length === 0) return;
    let off = false;
    (async () => {
      const [names, sched, trips] = await Promise.all([
        supabase.rpc("get_display_names_full", { p_user_ids: userIds }),
        supabase.from("driver_schedules").select("user_id, days_of_week, shift_start_local, shift_end_local").in("user_id", userIds),
        supabase.from("trips").select("truck_id, trailer_id, driver_id, started_at").eq("company_id", companyId)
          .not("truck_id", "is", null).not("started_at", "is", null).order("started_at", { ascending: false }).limit(800),
      ]);
      if (off) return;
      setDir({
        extra: new Map(((names.data ?? []) as any[]).map((r) => [r.user_id, { employeeNumber: r.employee_number ?? null, localArea: r.local_area ?? null, region: r.region ?? null }])),
        shifts: new Map(((sched.data ?? []) as any[]).map((r) => [r.user_id, { days: r.days_of_week ?? [], start: r.shift_start_local?.slice(0, 5) ?? null, end: r.shift_end_local?.slice(0, 5) ?? null }])),
        truckUse: ((trips.data ?? []) as any[]).map((t) => ({ truckId: String(t.truck_id), trailerId: t.trailer_id ? String(t.trailer_id) : null, driverId: String(t.driver_id) })),
      });
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, key]);
  return dir;
}
