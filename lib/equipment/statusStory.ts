// lib/equipment/statusStory.ts — who put a unit into its current status, when, where, and from which flow.
// The parking pin (equipment_parks) records who parked it and when; a shift-end event at that moment says it
// was the end of a shift. Units with no pin fall back to the shift-end event closest before the status time.
import { supabase } from "@/lib/supabase/client";

import { WINDOW_MS, inferShiftEnd, type ShiftEndRow, type StatusStory } from "./statusStoryLogic";
export { storyLine, inferShiftEnd } from "./statusStoryLogic";
export type { StatusStory } from "./statusStoryLogic";

export async function fetchStatusStory(kind: "truck" | "trailer", unitId: string, companyId: string, statusAtIso: string | null): Promise<StatusStory> {
  const empty: StatusStory = { byId: null, byName: null, at: statusAtIso, source: null, lat: null, lon: null, placeLabel: null };
  try {
    const { data: park } = await supabase.from("equipment_parks").select("lat, lon, place_label, parked_by, parked_at").eq("unit_kind", kind).eq("unit_id", unitId).maybeSingle();
    const p = park as { lat: number | null; lon: number | null; place_label: string | null; parked_by: string | null; parked_at: string | null } | null;
    const at = p?.parked_at ?? statusAtIso;
    let byId = p?.parked_by ?? null;
    let source: StatusStory["source"] = null;
    if (at) {
      const from = new Date(Date.parse(at) - WINDOW_MS - 60_000).toISOString();
      const to = new Date(Date.parse(at) + 60_000).toISOString();
      const { data: ev } = await supabase.from("shift_events").select("user_id, occurred_at").eq("company_id", companyId).eq("event_type", "shift_end").gte("occurred_at", from).lte("occurred_at", to);
      const rows = (ev ?? []) as ShiftEndRow[];
      const who = inferShiftEnd(rows, at, byId);
      if (who) { byId = byId ?? who; source = "shift end"; } else if (byId) source = "status update";
    }
    let byName: string | null = null;
    if (byId) {
      const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: [byId] });
      byName = ((data ?? []) as { display_name: string | null }[])[0]?.display_name ?? null;
    }
    return { byId, byName, at, source, lat: p?.lat ?? null, lon: p?.lon ?? null, placeLabel: p?.place_label ?? null };
  } catch { return empty; }
}
