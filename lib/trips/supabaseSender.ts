// lib/trips/supabaseSender.ts
//
// The Sender tripStore.drain() pushes the queue through. Kept separate from
// tripStore.ts so the store stays free of the Supabase client (and testable
// under node). Takes the client as an argument for the same reason.

import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLE_KEYS, type TripTable, type TripTableRows } from "./types";
import type { SendResult, Sender } from "./tripStore";

export function createSupabaseSender(supabase: SupabaseClient): Sender {
  return async function send<T extends TripTable>(
    table: T,
    rows: TripTableRows[T][],
    opts: { insertOnly: boolean },
  ): Promise<SendResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, error: { message: "offline", status: 0 } };
    }
    try {
      const onConflict = TABLE_KEYS[table].join(",");
      // Append-only tables have no update policy: a re-sent row (the first send
      // landed but the reply was lost) is skipped instead of tried as an update.
      const { error, status } = await supabase
        .from(table)
        .upsert(rows as never[], { onConflict, ignoreDuplicates: opts.insertOnly, defaultToNull: false });
      if (error) return { ok: false, error: { message: error.message, code: error.code, status } };
      return { ok: true };
    } catch (e) {
      // fetch() throws on no signal / DNS / aborted.
      return { ok: false, error: { message: e instanceof Error ? e.message : String(e), status: 0 } };
    }
  };
}
