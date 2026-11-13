// lib/errors/appErrors.ts
//
// What goes in the error log (app_errors) and what counts as a stuck sync. The Desk view reads the log so an
// admin can see and solve a problem without calling the driver. Pure: no Supabase, no clock.

import type { TripStoreState } from "../trips/tripStore.ts";

export type AppErrorKind = "send_failed" | "sync_stuck" | "telematics_link" | "geotab_mismatch" | "other";

export type AppErrorInput = { companyId: string | null; userId?: string | null; kind: AppErrorKind; message: string; payload?: Record<string, unknown> };
export type AppErrorRow = { company_id: string | null; user_id: string | null; kind: AppErrorKind; message: string; payload: Record<string, unknown> };

const MAX_MESSAGE = 500;
const MAX_PAYLOAD_CHARS = 4000;

/** A row safe to insert: the message is trimmed to a sensible length and the payload can't be enormous. */
export function buildError(e: AppErrorInput): AppErrorRow {
  let payload = e.payload ?? {};
  try {
    if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) payload = { truncated: true, keys: Object.keys(payload).slice(0, 20) };
  } catch { payload = { unserialisable: true }; }
  return {
    company_id: e.companyId,
    user_id: e.userId ?? null,
    kind: e.kind,
    message: (e.message || "Unknown error").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE),
    payload,
  };
}

export type StuckItem = { table: string; error: string | null; suspect: Record<string, unknown> };
export type StuckSummary = { count: number; failed: number; tables: string[]; oldestAt: string | null; lastError: string | null; items: StuckItem[] };

/** The fields of a stuck row that most likely caused the rejection: numbers too big for a column, blank ids. Never ids or names in full. */
export function suspectFields(row: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!row) return out;
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) >= 1e7) out[k] = v;
    else if (typeof v === "string" && v === "" && /(^|_)id$/.test(k)) out[k] = "(empty)";
    else if (typeof v === "string" && /^-?\d{8,}(\.\d+)?$/.test(v)) out[k] = v;
  }
  return out;
}

/**
 * Writes the phone could not send. Stuck = the server has rejected it (it sits under "couldn't save"), or it
 * has been tried several times, or it has waited longer than `olderThanMs` since the edit.
 */
export function stuckWrites(state: Pick<TripStoreState, "queue" | "failed" | "rows">, now: number, o: { olderThanMs?: number; minAttempts?: number } = {}): StuckSummary {
  const older = o.olderThanMs ?? 30 * 60_000;
  const tries = o.minAttempts ?? 3;
  const tables = new Set<string>();
  let oldest: number | null = null;
  let lastError: string | null = null;
  let count = 0;
  const items: StuckItem[] = [];
  const rowOf = (t: string, k: string) => (state.rows as Record<string, Record<string, Record<string, unknown>>>)[t]?.[k];
  const seen = (t: number | null) => { if (t != null && (oldest == null || t < oldest)) oldest = t; };
  for (const f of state.failed) { count++; tables.add(f.table); lastError = f.error; seen(f.failedAt); if (items.length < 5) items.push({ table: f.table, error: f.error, suspect: suspectFields(rowOf(f.table, f.key)) }); }
  for (const q of state.queue) {
    const row = (state.rows as Record<string, Record<string, Record<string, unknown>>>)[q.table]?.[q.key];
    const editedAt = typeof row?.client_updated_at === "string" ? Date.parse(row.client_updated_at as string) : typeof row?.occurred_at === "string" ? Date.parse(row.occurred_at as string) : NaN;
    const waited = Number.isFinite(editedAt) ? now - editedAt : 0;
    if (q.attempts >= tries || waited > older) {
      count++; tables.add(q.table); if (q.lastError) lastError = q.lastError; if (Number.isFinite(editedAt)) seen(editedAt);
      if (items.length < 5) items.push({ table: q.table, error: q.lastError ?? null, suspect: suspectFields(row) });
    }
  }
  const failed = state.failed.length;
  return { count, failed, tables: [...tables].sort(), oldestAt: oldest == null ? null : new Date(oldest).toISOString(), lastError, items };
}
