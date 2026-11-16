// lib/equipment/adminNotice.ts — before staff change a unit a driver is using, find out who holds it, and afterwards
// tell the driver (a Squawk message to the unit plus a banner on their dashboard, sent by admin_notice_unit).
import { supabase } from "@/lib/supabase/client";

import type { HolderInfo } from "./adminNoticeLogic";
export type { HolderInfo } from "./adminNoticeLogic";
const NONE: HolderInfo = { holderId: null, holderName: null, openTrip: false };

/** Who holds the unit and whether they are on an open trip with it. Drivers (not staff) get "none": they are not warned. */
export async function unitHolderInfo(kind: "truck" | "trailer", unitId: string): Promise<HolderInfo> {
  try {
    const { data, error } = await supabase.rpc("unit_holder_info", { p_kind: kind, p_unit_id: unitId });
    if (error || !data) return NONE;
    const d = data as { holder_id: string | null; holder_name: string | null; open_trip: boolean };
    return { holderId: d.holder_id ?? null, holderName: d.holder_name ?? null, openTrip: !!d.open_trip };
  } catch { return NONE; }
}

/** Logs the change and, when a driver holds the unit, messages them. Never throws: the change itself already saved. */
export async function noticeUnitChange(kind: "truck" | "trailer", unitId: string, action: string, summary: string): Promise<void> {
  try { await supabase.rpc("admin_notice_unit", { p_kind: kind, p_unit_id: unitId, p_action: action, p_summary: summary }); } catch { /* the change is saved either way */ }
}

export { heldWarning } from "./adminNoticeLogic";
export type { HeldUnit } from "./adminNoticeLogic";
