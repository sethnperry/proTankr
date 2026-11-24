// app/planner/utils/driverPrefsStore.ts
//
// The server copy of the driver's prefs (see driverPrefs.ts): user_plan_slots slot 26 under a sentinel combo.
import { supabase } from "@/lib/supabase/client";
import { UNIVERSAL_SCOPE } from "./planSlotStorage";
import type { DriverPrefs } from "./driverPrefs";
import { cleanPrefs } from "./driverPrefs";

export const DRIVER_PREFS_SLOT = 26;
export const DRIVER_PREFS_COMBO = "__driver__";

export async function fetchPrefs(authUserId: string): Promise<DriverPrefs | null> {
  try {
    const { data } = await supabase.from("user_plan_slots").select("payload").eq("user_id", authUserId)
      .eq("terminal_id", UNIVERSAL_SCOPE).eq("combo_id", DRIVER_PREFS_COMBO).eq("slot", DRIVER_PREFS_SLOT).maybeSingle();
    return data?.payload ? cleanPrefs(data.payload) : null;
  } catch { return null; }
}
export async function pushPrefs(authUserId: string, p: DriverPrefs) {
  try {
    await supabase.from("user_plan_slots").upsert(
      { user_id: authUserId, terminal_id: UNIVERSAL_SCOPE, combo_id: DRIVER_PREFS_COMBO, slot: DRIVER_PREFS_SLOT, payload: p },
      { onConflict: "user_id,terminal_id,combo_id,slot" },
    );
  } catch { /* the phone copy still stands */ }
}

