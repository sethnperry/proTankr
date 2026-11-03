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

/** A screen crashed on a phone: leave a line in the Desk with where it happened. Never throws. */
export async function logCrash(error: { message?: string; stack?: string; digest?: string } | null | undefined): Promise<void> {
  try {
    const { data: company } = await supabase.rpc("get_active_company_id");
    await logAppError({
      companyId: typeof company === "string" ? company : null,
      kind: "other",
      message: `Screen crashed: ${(error?.message ?? "unknown").slice(0, 300)}`,
      payload: { path: typeof window !== "undefined" ? window.location.pathname : null, digest: error?.digest ?? null, stack: (error?.stack ?? "").split("\n").slice(0, 6).join("\n") },
    });
  } catch { /* best effort */ }
}
