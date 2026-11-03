// lib/telematics/cache.ts
//
// A small read-through cache for provider calls. Geotab allows only about 10 calls a minute per login, and one
// truck reading used to make 9 to 17, so recent answers are shared: by every phone, the dispatch board and the
// cron job (the store is a database table on the server). Pure: the store is injected, so it is tested without
// a network or a database.
//
// `cached` returns a fresh-enough stored answer, otherwise asks the provider and stores the result. If the
// provider fails (the quota, an outage) it serves the last stored answer for up to six hours instead of failing.
// A bad login is never hidden that way.

import { TelematicsAuthError } from "./types.ts";

export type CacheEntry = { at: number; v: unknown };
export interface CacheStore {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, v: unknown): Promise<void>;
}

export const STALE_OK_MS = 6 * 3600_000;

export function memoryStore(): CacheStore {
  const m = new Map<string, CacheEntry>();
  return {
    async get(k) { return m.get(k) ?? null; },
    async set(k, v) { m.set(k, { at: Date.now(), v: v ?? null }); },
  };
}

// Calls for the same key that overlap share one answer.
const flights = new WeakMap<CacheStore, Map<string, Promise<unknown>>>();

export async function cached<T>(
  store: CacheStore | undefined,
  key: string,
  ttl: number | ((v: T) => number),
  fetcher: () => Promise<T>,
  o: { staleOkMs?: number } = {},
): Promise<T> {
  if (!store) return fetcher();
  let m = flights.get(store);
  if (!m) { m = new Map(); flights.set(store, m); }
  const live = m.get(key);
  if (live) return live as Promise<T>;
  const flight = m;
  const p = (async () => {
    let entry: CacheEntry | null = null;
    try { entry = await store.get(key); } catch { entry = null; }
    if (entry) {
      const t = typeof ttl === "function" ? ttl(entry.v as T) : ttl;
      if (Date.now() - entry.at < t) return entry.v as T;
    }
    try {
      const v = await fetcher();
      try { await store.set(key, v); } catch { /* a failed store write only costs a repeat call */ }
      return v;
    } catch (e) {
      if (e instanceof TelematicsAuthError) throw e;
      if (entry && Date.now() - entry.at < (o.staleOkMs ?? STALE_OK_MS)) return entry.v as T;
      throw e;
    }
  })().finally(() => flight.delete(key));
  m.set(key, p);
  return p;
}

/** A Map survives JSON as a list of pairs. */
export const mapToPairs = <K, V>(m: Map<K, V>): [K, V][] => [...m.entries()];
export const pairsToMap = <K, V>(p: unknown): Map<K, V> => new Map(Array.isArray(p) ? (p as [K, V][]) : []);
