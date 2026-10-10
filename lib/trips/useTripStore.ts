"use client";
// lib/trips/useTripStore.ts
//
// React glue for the offline trip store: one store per signed-in user, saved
// to localStorage, drained to Supabase in the background.
//
// Drains when: the hook mounts, the phone comes back online, the app returns
// to the foreground, shortly after any local write, and when a backed-off
// write comes due. Nothing here blocks the UI on the network.
//
// No consumer yet: phase 2 (dashboard + Start Load) is the first.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/client";
import { createSupabaseSender } from "./supabaseSender";
import { createTripStore, emptyState, type TripStore } from "./tripStore";
import type { TripTable, TripTableRows } from "./types";

const WRITE_DEBOUNCE_MS = 1_000;

const stores = new Map<string, TripStore>();
const sender = createSupabaseSender(supabase);
const EMPTY = emptyState();

export function tripStorageKey(userId: string): string {
  return `proTankr:u:${userId}:trips:v1`;
}

function safeLocalStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getTripStore(userId: string): TripStore {
  let s = stores.get(userId);
  if (!s) {
    s = createTripStore({ storage: safeLocalStorage(), storageKey: tripStorageKey(userId) });
    stores.set(userId, s);
  }
  return s;
}

export function useTripStore(userId: string | null | undefined) {
  const store = useMemo(() => (userId ? getTripStore(userId) : null), [userId]);

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => (store ? store.subscribe(cb) : () => {}), [store]),
    () => (store ? store.getState() : EMPTY),
    () => EMPTY,
  );

  const syncNow = useCallback(() => {
    if (!store || store.pendingCount() === 0) return Promise.resolve(null);
    return store.drain(sender);
  }, [store]);

  // Drain on mount, on reconnect, and on return to the foreground.
  useEffect(() => {
    if (!store) return;
    void syncNow();
    const onOnline = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [store, syncNow]);

  // Drain shortly after a write, or when the earliest backed-off write comes due.
  const nextDueAt = store?.nextDueAt() ?? null;
  const queueLen = state.queue.length;
  useEffect(() => {
    if (!store || queueLen === 0 || nextDueAt == null) return;
    const wait = Math.max(WRITE_DEBOUNCE_MS, nextDueAt - Date.now());
    const t = window.setTimeout(() => void syncNow(), wait);
    return () => window.clearTimeout(t);
  }, [store, queueLen, nextDueAt, syncNow]);

  const put = useCallback(
    <T extends TripTable>(table: T, row: Partial<TripTableRows[T]>) => {
      if (!store) throw new Error("useTripStore: no signed-in user");
      return store.put(table, row);
    },
    [store],
  );

  return {
    state,
    store,
    put,
    syncNow,
    pendingCount: queueLen,
    failed: state.failed,
    lastSyncedAt: state.lastSyncedAt,
  };
}
