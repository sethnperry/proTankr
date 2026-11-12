"use client";
// app/planner/hooks/useStuckSyncReporter.ts
//
// Tells the error log (Desk) when this phone has writes it can't send: rejected by the server, tried many times,
// or waiting a long while. At most once a day per driver, so a phone with no signal doesn't fill the log.

import { useEffect } from "react";
import type { TripStoreState } from "@/lib/trips/tripStore";
import { stuckWrites } from "@/lib/errors/appErrors";
import { logAppError } from "@/lib/errors/client";
import { supabase } from "@/lib/supabase/client";

const CHECK_MS = 5 * 60_000;

export function useStuckSyncReporter(state: TripStoreState, userId: string | null, companyId: string | null) {
  useEffect(() => {
    if (!userId || !companyId) return;
    const check = () => {
      const s = stuckWrites(state, Date.now());
      const key = `proTankr:u:${userId}:stuckLogged`;
      if (s.count === 0) {
        // Nothing stuck any more: close this driver's open "can't sync" entries on the Desk.
        let was = false;
        try { was = !!localStorage.getItem(key); } catch { /* storage blocked */ }
        if (was) {
          try { localStorage.removeItem(key); } catch { /* storage blocked */ }
          void supabase.auth.getSession().then(({ data }) => fetch("/api/errors/sync-cleared", { method: "POST", headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` } })).catch(() => {});
        }
        return;
      }
      const now = Date.now();
      try { const last = Number(localStorage.getItem(key)); if (Number.isFinite(last) && now - last < 6 * 3600_000) return; localStorage.setItem(key, String(now)); } catch { /* storage blocked: log anyway */ }
      void logAppError({ companyId, kind: "sync_stuck", message: `${s.count} write${s.count === 1 ? "" : "s"} stuck on this phone`, payload: { ...s } });
    };
    check();
    const t = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(t);
  }, [state, userId, companyId]);
}
