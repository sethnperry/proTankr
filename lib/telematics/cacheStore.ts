// lib/telematics/cacheStore.ts
//
// The database-backed cache store (server only): one row per company and key in `telematics_cache`. Any error
// reading or writing is treated as a miss, so a missing table can never break a reading.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import type { CacheStore } from "./cache";

export function dbStore(companyId: string): CacheStore {
  return {
    async get(key) {
      try {
        const { data, error } = await getServiceSupabase().from("telematics_cache").select("value, fetched_at").eq("company_id", companyId).eq("key", key).maybeSingle();
        if (error || !data) return null;
        const row = data as { value: { v?: unknown } | null; fetched_at: string };
        const at = Date.parse(row.fetched_at);
        return Number.isFinite(at) ? { at, v: row.value?.v ?? null } : null;
      } catch { return null; }
    },
    async set(key, v) {
      try {
        await getServiceSupabase().from("telematics_cache").upsert({ company_id: companyId, key, value: { v: v ?? null }, fetched_at: new Date().toISOString() }, { onConflict: "company_id,key" });
      } catch { /* ignore */ }
    },
  };
}
