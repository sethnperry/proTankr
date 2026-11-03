"use client";
// app/planner/hooks/useShift.ts
//
// The driver's shift: Start and End, and the long-shift and idle questions. Shifts are worked out from shift
// events (lib/shifts), which live in the same offline store as the trip rows, so a Start tapped with no signal
// lands once on reconnect. A thin hook: the rules are in lib/shifts/shiftLogic.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripStore, TripStoreState } from "@/lib/trips/tripStore";
import type { ShiftEventRow, ShiftSource } from "@/lib/trips/types";
import { recordShiftEvent } from "@/lib/shifts/shiftEvents";
import { SHIFT_EXPLANATION, SHIFT_END, SHIFT_IDLE_RESPONSE, SHIFT_LONG_ACK, SHIFT_START, deriveShifts, openShift, shiftPrompt, type Shift, type ShiftPrompt } from "@/lib/shifts/shiftLogic";

type Args = {
  store: TripStore | null;
  state: TripStoreState;
  syncNow: () => unknown;
  userId: string | null;
  companyId: string | null;
  /** The company's long-shift limit (trip_settings.max_shift_hours). */
  maxHours: number;
};

export function useShift({ store, state, syncNow, userId, companyId, maxHours }: Args) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Pull the last few days of this driver's events so a second phone, or a cleared browser, sees the same shift.
  useEffect(() => {
    if (!store || !userId) return;
    let off = false;
    void (async () => {
      try {
        const since = new Date(Date.now() - 4 * 86400_000).toISOString();
        const { data, error } = await supabase.from("shift_events").select("*").eq("user_id", userId).gte("occurred_at", since).order("occurred_at");
        if (!off && !error) store.hydrate("shift_events", (data ?? []) as ShiftEventRow[]);
      } catch { /* the phone's own copy stands */ }
    })();
    return () => { off = true; };
  }, [store, userId]);

  const events = useMemo(
    () => (store && userId ? store.list("shift_events", (e) => e.user_id === userId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, userId, state],
  );
  const nowIso = new Date(now).toISOString();
  const shifts = useMemo(() => (userId ? deriveShifts(events, userId, nowIso) : []), [events, userId, nowIso]);
  const current: Shift | null = openShift(shifts);

  // The newest sign of the driver doing something: a shift event or a trip step.
  const lastActivityAt = useMemo(() => {
    if (!store || !userId) return null;
    const times = [
      ...events.map((e) => e.occurred_at),
      ...store.list("trip_events", (e) => e.actor_id === userId).map((e) => e.occurred_at),
    ];
    return times.sort().pop() ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, userId, state, events]);

  const prompt: ShiftPrompt = shiftPrompt(current, nowIso, { maxHours, lastActivityAt });

  const write = useCallback((type: string, payload?: Record<string, unknown>, o?: { at?: string; source?: ShiftSource }) => {
    if (!store || !userId || !companyId) return;
    recordShiftEvent(store, { companyId, userId, actorId: userId, type, payload, at: o?.at, source: o?.source });
    void syncNow();
  }, [store, userId, companyId, syncNow]);

  return {
    current,
    shifts,
    prompt,
    /** Start the shift now, or at a time the driver confirmed (telematics: when they went on duty). */
    start: useCallback((at?: string, source?: ShiftSource) => write(SHIFT_START, undefined, { at, source }), [write]),
    end: useCallback((payload?: Record<string, unknown>) => write(SHIFT_END, payload), [write]),
    /** The Shift Explanation, written just before the shift ends. */
    explain: useCallback((payload: Record<string, unknown>) => write(SHIFT_EXPLANATION, payload), [write]),
    /** "Still on shift" after the long-shift question. */
    ackLong: useCallback(() => write(SHIFT_LONG_ACK), [write]),
    /** The idle question answered "still working". */
    keepGoing: useCallback(() => write(SHIFT_IDLE_RESPONSE, { answer: "still_working" }), [write]),
  };
}
