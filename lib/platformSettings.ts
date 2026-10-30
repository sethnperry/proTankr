// lib/platformSettings.ts
//
// Platform-wide switches set by the ProTankr operator (table platform_settings). Missing row or a
// read error counts as "on", so the app behaves as before until someone turns a campaign off.

import { supabase } from "@/lib/supabase/client";

export const TRAINING_CAMPAIGN_KEY = "terminal_training_campaign";

export async function readCampaignEnabled(key: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
    if (error || !data) return true;
    return (data.value as { enabled?: boolean } | null)?.enabled !== false;
  } catch {
    return true;
  }
}
