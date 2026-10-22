"use client";
// lib/telematics/useMyHos.ts
//
// The signed-in driver's own hours of service, for the Driver Dashboard. Polls
// every two minutes while `enabled` and the tab is visible. Null when there is
// no telematics link, no matching Geotab driver, or HOS isn't on for them.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HosAvailability } from "./types";
import { linkMeToTelematics } from "./linkMe";

export function useMyHos(companyId: string | null, enabled: boolean): HosAvailability | null {
  const [hos, setHos] = useState<HosAvailability | null>(null);
  useEffect(() => {
    if (!companyId || !enabled) return;
    let off = false;
    let timer: number | undefined;
    let linked = false;
    let wait = 120_000;
    const run = async () => {
      if (document.visibilityState !== "hidden") {
        try {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          // First look each time the dashboard opens: link this driver to Geotab if they match.
          if (!linked) { linked = true; await linkMeToTelematics(companyId); }
          const r = await fetch(`/api/telematics/hos?companyId=${encodeURIComponent(companyId)}&self=1&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "")}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          const j = r.ok ? await r.json() : null;
          if (off) return;
          if (!j?.connected) { setHos(null); return; } // no telematics: stop asking
          if (!j.hos) { setHos(null); wait = 600_000; } // not linked or no hours yet: look again later
          else { setHos(j.hos as HosAvailability); wait = 120_000; }
        } catch { /* keep the last reading */ }
      }
      if (!off) timer = window.setTimeout(run, wait);
    };
    void run();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [companyId, enabled]);
  return hos;
}
