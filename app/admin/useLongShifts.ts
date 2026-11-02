"use client";
// app/admin/useLongShifts.ts
//
// Thin data hook: the company's last 30 days of shift events and its long-shift limit, turned into the list of
// shifts over the limit (lib/shifts/explanation.ts). Managers (admin, lead, dispatch) can read these events.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ShiftEventRow } from "@/lib/trips/types";
import { longShifts, unexplained } from "@/lib/shifts/explanation";

const DAYS = 30;

export function useLongShifts(companyId: string | null, enabled: boolean) {
  const [events, setEvents] = useState<ShiftEventRow[]>([]);
  const [maxHours, setMaxHours] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !enabled) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
      const [ev, ts] = await Promise.all([
        supabase.from("shift_events").select("event_id, company_id, user_id, event_type, occurred_at, actor_id, payload, source").eq("company_id", companyId).gte("occurred_at", since).order("occurred_at").limit(10000),
        supabase.from("trip_settings").select("max_shift_hours").eq("company_id", companyId).maybeSingle(),
      ]);
      if (!alive) return;
      if (ev.error) setError(ev.error.message); else setEvents((ev.data ?? []) as ShiftEventRow[]);
      const h = Number((ts.data as any)?.max_shift_hours);
      if (Number.isFinite(h) && h > 0) setMaxHours(h);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [companyId, enabled]);

  const rows = useMemo(() => longShifts(events, maxHours, new Date().toISOString(), new Date(Date.now() - DAYS * 86400_000).toISOString()), [events, maxHours]);
  return { rows, missing: unexplained(rows).length, maxHours, loading, error };
}
