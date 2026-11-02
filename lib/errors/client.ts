// lib/errors/client.ts
//
// Writes to the error log from the phone. Never throws and never blocks: a problem report must not become a
// problem. RLS lets a driver write only their own rows.

import { supabase } from "@/lib/supabase/client";
import { buildError, type AppErrorInput } from "./appErrors";

export async function logAppError(e: AppErrorInput): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;
    await supabase.from("app_errors").insert(buildError({ ...e, userId: uid }));
  } catch { /* the log is best effort */ }
}
