"use client";
// app/planner/hooks/useEmptyMoves.ts
//
// The driver's empty moves through the offline store: begin, end, list. Rules: lib/moves/emptyMoves.ts.

import { useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripStore, TripStoreState } from "@/lib/trips/tripStore";
import type { EmptyMoveRow } from "@/lib/trips/types";
import { newMove, openMove, type MoveKind, type MovePlace } from "@/lib/moves/emptyMoves";

export function useEmptyMoves(o: { store: TripStore | null; state: TripStoreState; syncNow: () => unknown; userId: string | null; companyId: string | null }) {
  const { store, state, syncNow, userId, companyId } = o;

  useEffect(() => {
    if (!store || !userId) return;
    let alive = true;
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    void (async () => {
      const { data, error } = await supabase.from("empty_moves").select("*").eq("driver_id", userId).or(`ended_at.is.null,started_at.gte.${since}`).limit(200);
      if (alive && !error) store.hydrate("empty_moves", (data ?? []) as EmptyMoveRow[]);
    })();
    return () => { alive = false; };
  }, [store, userId]);

  const moves = useMemo(() => (store && userId ? store.list("empty_moves", (m) => m.driver_id === userId).sort((a, b) => b.started_at.localeCompare(a.started_at)) : []), [store, userId, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = useMemo(() => (userId ? openMove(moves, userId) : null), [moves, userId]);

  const begin = useCallback((a: { truckId: string | null; trailerId: string | null; kind: MoveKind; from: MovePlace; to: MovePlace; beginMiles: number | null; source?: "app" | "geotab"; at?: string }): string | null => {
    if (!store || !userId || !companyId || current) return null;
    const id = crypto.randomUUID();
    store.put("empty_moves", newMove({ id, companyId, driverId: userId, truckId: a.truckId, trailerId: a.trailerId, kind: a.kind, from: a.from, to: a.to, beginMiles: a.beginMiles, nowIso: a.at ?? new Date().toISOString() }) as any);
    if (a.source && a.source !== "app") store.put("empty_moves", { move_id: id, source: a.source } as any);
    void syncNow();
    return id;
  }, [store, userId, companyId, current, syncNow]);

  const end = useCallback((moveId: string, endMiles: number | null, to?: MovePlace, endedAt?: string) => {
    if (!store) return;
    store.put("empty_moves", { move_id: moveId, ended_at: endedAt ?? new Date().toISOString(), end_miles: endMiles, ...(to ? { to_place_id: to.id, to_text: to.text?.trim() || null } : {}) } as any);
    void syncNow();
  }, [store, syncNow]);

  const discard = useCallback((moveId: string) => {
    if (!store) return;
    // A move started by mistake ends at once with no distance, so it carries no time into a report.
    store.put("empty_moves", { move_id: moveId, ended_at: new Date().toISOString(), end_miles: null, billable: false, notes: "Cancelled" } as any);
    void syncNow();
  }, [store, syncNow]);

  const patch = useCallback((moveId: string, fields: Partial<Pick<EmptyMoveRow, "begin_miles" | "end_miles" | "to_place_id" | "to_text" | "from_place_id" | "from_text">>) => {
    if (!store) return;
    store.put("empty_moves", { move_id: moveId, ...fields } as any);
    void syncNow();
  }, [store, syncNow]);

  return { moves, current, begin, end, discard, patch };
}
