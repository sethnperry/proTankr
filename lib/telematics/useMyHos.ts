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
    let misses = 0;
    const run = async () => {
      if (document.visibilityState !== "hidden") {
        try {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          // First look each time the dashboard opens: link this driver to Geotab if they match.
          if (!linked) { linked = true; await linkMeToTelematics(companyId); }
          const r = await fetch(`/api/telematics/hos?companyId=${encodeURIComponent(companyId)}&self=1&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "")}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!r.ok) {
            // A failed answer (Geotab busy, a server hiccup) is not "no telematics": keep the last
            // reading and ask again, instead of going quiet until the app is reopened.
            if (!off) timer = window.setTimeout(run, 120_000);
            return;
          }
          const j = await r.json();
          if (off) return;
          if (!j?.connected) { setHos(null); return; } // no telematics: stop asking
          // No hours yet (not linked, or Geotab didn't answer this time): keep asking every two
          // minutes for a while, so one bad answer doesn't hide the card for ten.
          if (!j.hos) { misses += 1; wait = misses <= 5 ? 120_000 : 600_000; }
          else { misses = 0; setHos(j.hos as HosAvailability); wait = 120_000; }
        } catch { /* keep the last reading */ }
      }
      if (!off) timer = window.setTimeout(run, wait);
    };
    void run();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [companyId, enabled]);
  return hos;
}
