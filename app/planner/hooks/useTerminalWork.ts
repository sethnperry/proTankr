"use client";
// app/planner/hooks/useTerminalWork.ts
//
// The driver's terminal and transload work timer: start and stop are written through the offline store (so a
// timer started with no signal still counts), and each is also a shift event so the shift's timeline and the idle
// check see the activity. The company's billable defaults per activity are read when the sheet opens.
// The rules are in lib/terminalwork/terminalWork.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripStore, TripStoreState } from "@/lib/trips/tripStore";
import type { TerminalWorkRow } from "@/lib/trips/types";
import { recordShiftEvent } from "@/lib/shifts/shiftEvents";
import { running, startWork, stopWork, type Activity } from "@/lib/terminalwork/terminalWork";

export function useTerminalWork(o: { store: TripStore | null; state: TripStoreState; syncNow: () => unknown; userId: string | null; companyId: string | null; enabled: boolean }) {
  const { store, state, syncNow, userId, companyId, enabled } = o;
  const [defaults, setDefaults] = useState<Partial<Record<Activity, boolean>>>({});

  useEffect(() => {
    if (!enabled || !userId || !companyId || !store) return;
    let alive = true;
    void (async () => {
      const since = new Date(Date.now() - 3 * 86400_000).toISOString();
      const [d, w] = await Promise.all([
        supabase.from("terminal_work_defaults").select("activity, billable").eq("company_id", companyId),
        supabase.from("terminal_work").select("*").eq("user_id", userId).gte("started_at", since),
      ]);
      if (!alive) return;
      setDefaults(Object.fromEntries(((d.data ?? []) as { activity: Activity; billable: boolean }[]).map((r) => [r.activity, r.billable])));
      if (!w.error) store.hydrate("terminal_work", (w.data ?? []) as TerminalWorkRow[]);
    })();
    return () => { alive = false; };
  }, [enabled, userId, companyId, store]);

  const current = useMemo(
    () => (store && userId ? running(store.list("terminal_work", (r) => r.user_id === userId), userId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, userId, state],
  );

  const start = useCallback((activity: Activity, terminal: { id: string | null; name: string }, productId: string | null) => {
    if (!store || !userId || !companyId || current) return;
    const row = startWork(store, { companyId, userId, activity, terminalId: terminal.id, terminalName: terminal.name, productId, defaults, nowIso: new Date().toISOString() });
    recordShiftEvent(store, { companyId, userId, actorId: userId, type: "terminal_work_start", payload: { work_id: row.work_id, activity } });
    void syncNow();
  }, [store, userId, companyId, current, defaults, syncNow]);

  const stop = useCallback((note?: string) => {
    if (!store || !userId || !companyId || !current) return;
    const done = stopWork(store, current.work_id, new Date().toISOString(), note);
    if (done) recordShiftEvent(store, { companyId, userId, actorId: userId, type: "terminal_work_stop", payload: { work_id: done.work_id, activity: done.activity } });
    void syncNow();
  }, [store, userId, companyId, current, syncNow]);

  return { current, defaults, start, stop };
}
