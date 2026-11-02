"use client";
// app/planner/hooks/useStuckSyncReporter.ts
//
// Tells the error log (Desk) when this phone has writes it can't send: rejected by the server, tried many times,
// or waiting a long while. At most once a day per driver, so a phone with no signal doesn't fill the log.

import { useEffect } from "react";
import type { TripStoreState } from "@/lib/trips/tripStore";
import { stuckWrites } from "@/lib/errors/appErrors";
import { logAppError } from "@/lib/errors/client";

const CHECK_MS = 5 * 60_000;

export function useStuckSyncReporter(state: TripStoreState, userId: string | null, companyId: string | null) {
  useEffect(() => {
    if (!userId || !companyId) return;
    const check = () => {
      const s = stuckWrites(state, Date.now());
      if (s.count === 0) return;
      const key = `proTankr:u:${userId}:stuckLogged`;
      const now = Date.now();
      try { const last = Number(localStorage.getItem(key)); if (Number.isFinite(last) && now - last < 6 * 3600_000) return; localStorage.setItem(key, String(now)); } catch { /* storage blocked: log anyway */ }
      void logAppError({ companyId, kind: "sync_stuck", message: `${s.count} write${s.count === 1 ? "" : "s"} stuck on this phone`, payload: { ...s } });
    };
    check();
    const t = window.setInterval(check, CHECK_MS);
    return () => window.clearInterval(t);
  }, [state, userId, companyId]);
}
