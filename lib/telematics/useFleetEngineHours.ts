"use client";
// lib/telematics/useFleetEngineHours.ts
//
// Hour meters of the company's linked trucks, for the Dispatch Dashboard's
// service-due list. Refreshed every ten minutes while visible; stops if there is
// no link. Empty when no service type counts engine hours.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export function useFleetEngineHours(companyId: string | null): Map<string, number> {
  const [hours, setHours] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!companyId) return;
    let off = false;
    let timer: number | undefined;
    const run = async () => {
      if (document.visibilityState !== "hidden") {
        try {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          const r = await fetch(`/api/telematics/engine-hours?companyId=${encodeURIComponent(companyId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          const j = r.ok ? await r.json() : null;
          if (off) return;
          if (!j?.connected) { setHours(new Map()); return; }
          setHours(new Map(Object.entries(j.hours as Record<string, number>)));
        } catch { /* keep the last values */ }
      }
      if (!off) timer = window.setTimeout(run, 600_000);
    };
    void run();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [companyId]);
  return hours;
}
