"use client";
// app/planner/hooks/useActiveCallouts.ts
//
// The company's active call-outs from yesterday on, for the dispatch board: a driver who called out for a day
// can't have a plan completed for that day until the call-out is corrected. Staff can read these. Thin data
// hook; the rule is calloutBlock in lib/callouts/callout.ts. Refreshes on a slow poll and when asked.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { CalloutRow } from "@/lib/trips/types";

export function useActiveCallouts(companyId: string | null) {
  const [rows, setRows] = useState<CalloutRow[]>([]);
  const load = useCallback(async () => {
    if (!companyId) return;
    const since = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const { data } = await supabase.from("callouts").select("*").eq("company_id", companyId).eq("status", "active").gte("shift_date", since).limit(500);
    setRows((data ?? []) as CalloutRow[]);
  }, [companyId]);
  useEffect(() => {
    if (!companyId) return;
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [companyId, load]);
  return { rows, reload: load };
}
