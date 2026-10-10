// lib/trips/tripStore.ts
//
// Offline-first store for the trip workflow (docs/trip-workflow-design.md §12).
//
// Every write lands on the phone first (rows + a pending-write queue, saved to
// storage synchronously), and drain() pushes the queue to the server whenever
// there is signal. The driver never waits on the network.
//
// - The queue holds one entry per row, not per edit: editing a row five times
//   offline sends it once, with its latest values.
// - Each local write stamps client_updated_at, the device's own edit time. The
//   server (trip_sync_write) keeps the newest client edit per row, so a phone
//   that comes back online late can't overwrite a newer edit made on another
//   phone during a handoff.
// - Tables drain parents-first (SYNC_ORDER) so a child never fails its foreign
//   key because its parent is still queued.
// - A network/server hiccup stops the drain and backs off; a row the server
//   rejects outright (RLS, check constraint, bad value) moves to `failed` so it
//   can be shown, and stops blocking everything behind it.
//
// Pure TypeScript with no React or Supabase import, so it runs under node's
// test runner. The Supabase sender lives in supabaseSender.ts; the React glue
// in useTripStore.ts.

import {
  INSERT_ONLY,
  SYNC_ORDER,
  rowKey,
  type TripTable,
  type TripTableRows,
} from "./types.ts";

export type QueueEntry = {
  table: TripTable;
  key: string;
  // Bumped on every local write, so a write made while that row was in flight
  // keeps it queued after the in-flight send succeeds.
  version: number;
  attempts: number;
  nextAttemptAt: number; // epoch ms
  lastError: string | null;
};

export type FailedWrite = {
  table: TripTable;
  key: string;
  error: string;
  failedAt: number;
};

export type TripStoreState = {
  v: 1;
  rows: { [T in TripTable]: Record<string, TripTableRows[T]> };
  queue: QueueEntry[];
  failed: FailedWrite[];
  lastSyncedAt: number | null;
};

export type SendError = { message: string; code?: string | null; status?: number | null };
export type SendResult = { ok: true } | { ok: false; error: SendError };
export type Sender = <T extends TripTable>(
  table: T,
  rows: TripTableRows[T][],
  opts: { insertOnly: boolean },
) => Promise<SendResult>;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type DrainResult = {
  sent: number;
  failed: number;
  // True when a retryable error (no signal, server down) stopped the drain.
  stalled: boolean;
  remaining: number;
};

const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export function emptyState(): TripStoreState {
  const rows = {} as TripStoreState["rows"];
  for (const t of SYNC_ORDER) (rows as Record<string, unknown>)[t] = {};
  return { v: 1, rows, queue: [], failed: [], lastSyncedAt: null };
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

// Postgres/PostgREST errors that will fail the same way however often they're
// retried. Everything else (no signal, 5xx, timeouts, serialization) retries.
export function isPermanentError(e: SendError): boolean {
  const code = e.code ?? "";
  if (code === "42501") return true; // RLS / insufficient privilege
  if (code.startsWith("22")) return true; // bad data (invalid uuid, out of range...)
  if (code === "23502" || code === "23514") return true; // not null, check constraint
  if (code === "23505") return true; // unique violation (e.g. a second primary order)
  if (code.startsWith("PGRST1") || code.startsWith("PGRST2")) return true; // bad request / schema
  // Foreign key (23503) stays retryable: the parent may still be on its way
  // from another phone. An expired session (401) clears up after a refresh.
  if (code === "23503") return false;
  const st = e.status ?? 0;
  if (st >= 400 && st < 500 && st !== 401 && st !== 408 && st !== 429) return true;
  return false;
}

function backoff(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export type TripStoreOptions = {
  storage?: StorageLike | null;
  storageKey: string;
  now?: () => number;
};

export type TripStore = ReturnType<typeof createTripStore>;

export function createTripStore(opts: TripStoreOptions) {
  const now = opts.now ?? (() => Date.now());
  const storage = opts.storage ?? null;
  let state = load();
  let draining: Promise<DrainResult> | null = null;
  const listeners = new Set<() => void>();

  function load(): TripStoreState {
    if (!storage) return emptyState();
    try {
      const raw = storage.getItem(opts.storageKey);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw) as TripStoreState;
      if (parsed?.v !== 1) return emptyState();
      const base = emptyState();
      // Tolerate a table added after the state was saved.
      return {
        ...base,
        ...parsed,
        rows: { ...base.rows, ...parsed.rows },
        queue: parsed.queue ?? [],
        failed: parsed.failed ?? [],
      };
    } catch {
      return emptyState();
    }
  }

  function commit(next: TripStoreState) {
    state = next;
    if (storage) {
      try {
        storage.setItem(opts.storageKey, JSON.stringify(state));
      } catch {
        // Storage full or blocked: keep running from memory. The queue still
        // drains this session; it just won't survive a reload.
      }
    }
    for (const l of listeners) l();
  }

  function enqueue(queue: QueueEntry[], table: TripTable, key: string): QueueEntry[] {
    const i = queue.findIndex((q) => q.table === table && q.key === key);
    if (i === -1) {
      return [...queue, { table, key, version: 1, attempts: 0, nextAttemptAt: 0, lastError: null }];
    }
    const next = queue.slice();
    // A fresh edit is sent on the next drain, not after the old backoff.
    next[i] = { ...next[i], version: next[i].version + 1, nextAttemptAt: 0 };
    return next;
  }

  // Write one row locally and queue it. Returns the stored row (with
  // client_updated_at stamped). Merges onto any existing row with that key, so
  // callers can pass only the fields they're changing plus the key.
  function put<T extends TripTable>(
    table: T,
    row: Partial<TripTableRows[T]>,
  ): TripTableRows[T] {
    const key = rowKey(table, row as TripTableRows[T]);
    if (key.split("|").some((k) => k === "undefined" || k === "null" || k === "")) {
      throw new Error(`${table}: put() needs the row's key column(s)`);
    }
    const existing = state.rows[table][key] as TripTableRows[T] | undefined;
    if (INSERT_ONLY.has(table) && existing) {
      throw new Error(`${table} rows are append-only; ${key} already exists`);
    }
    const stamped = INSERT_ONLY.has(table)
      ? ({ ...existing, ...row } as TripTableRows[T])
      : ({ ...existing, ...row, client_updated_at: new Date(now()).toISOString() } as TripTableRows[T]);
    commit({
      ...state,
      rows: { ...state.rows, [table]: { ...state.rows[table], [key]: stamped } },
      queue: enqueue(state.queue, table, key),
      failed: state.failed.filter((f) => !(f.table === table && f.key === key)),
    });
    return stamped;
  }

  // Store rows fetched from the server WITHOUT queueing them. A row with a
  // pending local edit is left alone: the local edit is newer and still has to
  // go up. Otherwise the server copy wins if it's at least as new.
  function hydrate<T extends TripTable>(table: T, rows: TripTableRows[T][]) {
    if (rows.length === 0) return;
    const pending = new Set(state.queue.filter((q) => q.table === table).map((q) => q.key));
    const current = { ...state.rows[table] } as Record<string, TripTableRows[T]>;
    let changed = false;
    for (const r of rows) {
      const key = rowKey(table, r);
      if (pending.has(key)) continue;
      const local = current[key] as { client_updated_at?: string | null } | undefined;
      const incoming = r as { client_updated_at?: string | null };
      if (local?.client_updated_at && incoming.client_updated_at && incoming.client_updated_at < local.client_updated_at) {
        continue;
      }
      current[key] = r;
      changed = true;
    }
    if (changed) commit({ ...state, rows: { ...state.rows, [table]: current } });
  }

  function get<T extends TripTable>(table: T, key: string): TripTableRows[T] | undefined {
    return state.rows[table][key] as TripTableRows[T] | undefined;
  }

  function list<T extends TripTable>(table: T, where?: (r: TripTableRows[T]) => boolean): TripTableRows[T][] {
    const all = Object.values(state.rows[table]) as TripTableRows[T][];
    return where ? all.filter(where) : all;
  }

  // Drop a trip and all of its rows from the phone (e.g. once it's complete and
  // fully synced). Refuses while any of its rows are still queued.
  function forgetTrip(tripId: string): boolean {
    const deliveryIds = new Set(
      list("trip_deliveries", (d) => d.trip_id === tripId).map((d) => d.delivery_id),
    );
    const belongs = (table: TripTable, r: Record<string, unknown>): boolean => {
      if (table === "compartment_readiness") return false;
      if (table === "trip_delivery_tanks") return deliveryIds.has(String(r.delivery_id));
      return r.trip_id === tripId;
    };
    const rows = { ...state.rows } as Record<TripTable, Record<string, unknown>>;
    const doomed: { table: TripTable; key: string }[] = [];
    for (const t of SYNC_ORDER) {
      for (const [key, r] of Object.entries(rows[t])) {
        if (belongs(t, r as Record<string, unknown>)) doomed.push({ table: t, key });
      }
    }
    if (doomed.some((d) => state.queue.some((q) => q.table === d.table && q.key === d.key))) return false;
    for (const t of SYNC_ORDER) rows[t] = { ...rows[t] };
    for (const d of doomed) delete rows[d.table][d.key];
    commit({ ...state, rows: rows as TripStoreState["rows"] });
    return true;
  }

  function dismissFailed(table: TripTable, key: string) {
    commit({ ...state, failed: state.failed.filter((f) => !(f.table === table && f.key === key)) });
  }

  // Push the queue to the server. Concurrent calls share one in-flight drain.
  function drain(send: Sender): Promise<DrainResult> {
    if (!draining) {
      draining = runDrain(send).finally(() => {
        draining = null;
      });
    }
    return draining;
  }

  async function runDrain(send: Sender): Promise<DrainResult> {
    let sent = 0;
    let failed = 0;
    for (const [i, table] of SYNC_ORDER.entries()) {
      // A parent table still has queued rows (backing off): hold the children
      // back too, or they'd just fail their foreign key against it.
      const earlier = new Set(SYNC_ORDER.slice(0, i));
      if (state.queue.some((q) => earlier.has(q.table))) break;
      const due = state.queue.filter((q) => q.table === table && q.nextAttemptAt <= now());
      if (due.length === 0) continue;
      const snapshot = due.map((q) => ({ key: q.key, version: q.version, row: state.rows[table][q.key] }));
      const present = snapshot.filter((s) => s.row !== undefined);

      const res = present.length
        ? await send(table, present.map((s) => s.row) as never[], { insertOnly: INSERT_ONLY.has(table) })
        : ({ ok: true } as const);

      if (res.ok) {
        markSent(table, snapshot);
        sent += snapshot.length;
        continue;
      }
      if (!isPermanentError(res.error)) {
        markRetry(table, snapshot.map((s) => s.key), res.error.message);
        return { sent, failed, stalled: true, remaining: state.queue.length };
      }
      // A batch was rejected outright: send its rows one at a time so one bad
      // row doesn't take the good ones down with it.
      for (const s of present) {
        const one = await send(table, [s.row] as never[], { insertOnly: INSERT_ONLY.has(table) });
        if (one.ok) {
          markSent(table, [s]);
          sent += 1;
        } else if (isPermanentError(one.error)) {
          markFailed(table, s.key, s.version, one.error.message);
          failed += 1;
        } else {
          markRetry(table, [s.key], one.error.message);
          return { sent, failed, stalled: true, remaining: state.queue.length };
        }
      }
    }
    if (state.queue.length === 0) commit({ ...state, lastSyncedAt: now() });
    return { sent, failed, stalled: false, remaining: state.queue.length };
  }

  function markSent(table: TripTable, done: { key: string; version: number }[]) {
    const byKey = new Map(done.map((d) => [d.key, d.version]));
    commit({
      ...state,
      // Keep the entry if the row was edited again while it was in flight.
      queue: state.queue.filter((q) => !(q.table === table && byKey.get(q.key) === q.version)),
    });
  }

  function markRetry(table: TripTable, keys: string[], message: string) {
    const set = new Set(keys);
    commit({
      ...state,
      queue: state.queue.map((q) => {
        if (q.table !== table || !set.has(q.key)) return q;
        const attempts = q.attempts + 1;
        return { ...q, attempts, nextAttemptAt: now() + backoff(attempts), lastError: message };
      }),
    });
  }

  function markFailed(table: TripTable, key: string, version: number, message: string) {
    commit({
      ...state,
      queue: state.queue.filter((q) => !(q.table === table && q.key === key && q.version === version)),
      failed: [
        ...state.failed.filter((f) => !(f.table === table && f.key === key)),
        { table, key, error: message, failedAt: now() },
      ],
    });
  }

  return {
    getState: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    put,
    hydrate,
    get,
    list,
    forgetTrip,
    dismissFailed,
    drain,
    pendingCount: () => state.queue.length,
    // Earliest time a backed-off entry becomes due, for scheduling the next drain.
    nextDueAt: (): number | null =>
      state.queue.length ? Math.min(...state.queue.map((q) => q.nextAttemptAt)) : null,
  };
}
