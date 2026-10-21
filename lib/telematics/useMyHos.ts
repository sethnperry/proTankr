"use client";
// lib/telematics/useMyHos.ts
//
// The signed-in driver's own hours of service, for the Driver Dashboard. Polls
// every two minutes while `enabled` and the tab is visible. Null when there is
// no telematics link, no matching Geotab driver, or HOS isn't on for them.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HosAvailability } from "./types";

export function useMyHos(companyId: string | null, enabled: boolean): HosAvailability | null {
  const [hos, setHos] = useState<HosAvailability | null>(null);
  useEffect(() => {
    if (!companyId || !enabled) return;
    let off = false;
    let timer: number | undefined;
    const run = async () => {
      if (document.visibilityState !== "hidden") {
        try {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          const r = await fetch(`/api/telematics/hos?companyId=${encodeURIComponent(companyId)}&self=1`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          const j = r.ok ? await r.json() : null;
          if (off) return;
          if (!j?.connected || !j.hos) { setHos(null); return; } // nothing to show: stop asking
          setHos(j.hos as HosAvailability);
        } catch { /* keep the last reading */ }
      }
      if (!off) timer = window.setTimeout(run, 120_000);
    };
    void run();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [companyId, enabled]);
  return hos;
}
