// Ask the server to let go of the equipment this driver holds (end of shift). Best effort: never throws.
import { supabase } from "@/lib/supabase/client";

export async function releaseEquipment(truckId: string | null | undefined, trailerId: string | null | undefined): Promise<boolean> {
  if (!truckId && !trailerId) return true;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return false;
    const r = await fetch("/api/equipment/release", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ truckId: truckId ?? null, trailerId: trailerId ?? null }) });
    return r.ok;
  } catch { return false; }
}
