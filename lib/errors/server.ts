// lib/errors/server.ts
//
// Writes to the error log from a server route (a failed email or push, a broken telematics link). Service role,
// so it can name any company and user. Never throws.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { buildError, type AppErrorInput } from "./appErrors";

/** `dedupeMinutes`: skip it when the same kind is already open for that company within that time (a poll that fails every minute is one entry, not sixty). */
export async function logServerError(e: AppErrorInput, o: { dedupeMinutes?: number } = {}): Promise<void> {
  try {
    const admin = getServiceSupabase();
    if (o.dedupeMinutes && e.companyId) {
      const since = new Date(Date.now() - o.dedupeMinutes * 60_000).toISOString();
      const { data } = await admin.from("app_errors").select("error_id").eq("company_id", e.companyId).eq("kind", e.kind).is("resolved_at", null).gte("created_at", since).limit(1);
      if ((data ?? []).length) return;
    }
    await admin.from("app_errors").insert(buildError(e));
  } catch { /* the log is best effort */ }
}
