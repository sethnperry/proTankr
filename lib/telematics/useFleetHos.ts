"use client";
// lib/telematics/useFleetHos.ts
//
// Hours of service for every linked driver, for the Dispatch Dashboard. Polls
// every three minutes while `enabled` and the tab is visible; stops if the
// company has no connection.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HosAvailability } from "./types";

export function useFleetHos(companyId: string | null, enabled: boolean, nonce = 0): Map<string, HosAvailability> {
  const [hos, setHos] = useState<Map<string, HosAvailability>>(new Map());
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
          const r = await fetch(`/api/telematics/hos?companyId=${encodeURIComponent(companyId)}${nonce > 0 ? "&fresh=1" : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!r.ok) throw new Error("telematics answered " + r.status); // a failed answer is not "no connection": keep the last values and ask again
          const j = await r.json();
          if (off) return;
          if (!j?.connected) { setHos(new Map()); return; }
          setHos(new Map(Object.entries(j.hos as Record<string, HosAvailability>)));
        } catch { /* keep the last values */ }
      }
      if (!off) timer = window.setTimeout(run, 180_000);
    };
    void run();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [companyId, enabled, nonce]);
  return hos;
}
