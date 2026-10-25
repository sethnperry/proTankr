"use client";
// lib/telematics/useFleetPositions.ts
//
// Live positions of the company's linked trucks, for the Dispatch board.
// Polls once a minute while `enabled` and the tab is visible. Stops polling if
// the company has no connection.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { LivePos } from "./progress";

export function useFleetPositions(companyId: string | null, enabled: boolean): Map<string, LivePos> {
  const [pos, setPos] = useState<Map<string, LivePos>>(new Map());
  useEffect(() => {
    if (!companyId || !enabled) return;
    let off = false;
    let timer: number | undefined;
    const run = async () => {
      if (document.visibilityState === "hidden") { timer = window.setTimeout(run, 60_000); return; }
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const r = await fetch(`/api/telematics/fleet?companyId=${encodeURIComponent(companyId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!r.ok) throw new Error("telematics answered " + r.status); // a failed answer is not "no connection": keep the last values and ask again
        const j = await r.json();
        if (off) return;
        if (!j?.connected) { setPos(new Map()); return; } // no connection: don't keep asking
        setPos(new Map(Object.entries(j.positions as Record<string, LivePos>)));
      } catch { /* keep the last positions */ }
      if (!off) timer = window.setTimeout(run, 60_000);
    };
    void run();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [companyId, enabled]);
  return pos;
}
