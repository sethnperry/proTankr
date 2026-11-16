// lib/squawk/cleanupServer.ts
//
// Deletes expired Squawk messages and their stored files, on the five-minute tick. The database already hides an
// expired message from every query; this makes sure nothing is kept. Service client; never import from the browser.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";

export async function runSquawkCleanup(nowMs = Date.now()): Promise<number> {
  const admin = getServiceSupabase();
  const { data: cfgRow } = await admin.from("platform_settings").select("value").eq("key", "squawk").maybeSingle();
  const v = (cfgRow?.value ?? {}) as { view_ttl_min?: number; unviewed_cap_min?: number };
  const ttl = Number(v.view_ttl_min ?? 60), cap = Number(v.unviewed_cap_min ?? 240);
  const nowIso = new Date(nowMs).toISOString();
  // Per-person messages last at most the unviewed cap plus one view window after posting.
  const areaCut = new Date(nowMs - (cap + ttl) * 60_000).toISOString();
  const { data: gone } = await admin.from("squawk_messages").select("id, attachments")
    .or(`and(channel_type.neq.local_area,expires_at.lt.${nowIso}),and(channel_type.eq.local_area,created_at.lt.${areaCut})`).limit(500);
  const rows = (gone ?? []) as { id: string; attachments: { path?: string }[] | null }[];
  if (!rows.length) return 0;
  const paths = rows.flatMap((r) => (Array.isArray(r.attachments) ? r.attachments : []).map((a) => a?.path).filter((p): p is string => !!p));
  if (paths.length) {
    const rm = await admin.storage.from("squawk").remove(paths);
    if (rm.error) console.warn("[squawk] file cleanup failed:", rm.error.message);
  }
  const del = await admin.from("squawk_messages").delete().in("id", rows.map((r) => r.id));
  if (del.error) { console.warn("[squawk] cleanup failed:", del.error.message); return 0; }
  return rows.length;
}
