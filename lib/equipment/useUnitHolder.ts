"use client";
// lib/equipment/useUnitHolder.ts
//
// Who has a truck or trailer in ProTankr: the driver holding it now (a claimed pairing, or a bobtail / trailer-only
// hold), and the last driver to run a trip with it. Company data only; no tracker. A read the viewer's role can't make
// is just skipped.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type UnitHolder = { holder: { userId: string; name: string | null } | null; last: { name: string | null; at: string } | null; loaded: boolean };

export function useUnitHolder(kind: "truck" | "trailer" | null, unitId: string | null, enabled = true): UnitHolder {
  const [s, setS] = useState<UnitHolder>({ holder: null, last: null, loaded: false });
  useEffect(() => {
    if (!enabled || !kind || !unitId) { setS({ holder: null, last: null, loaded: false }); return; }
    let off = false;
    void (async () => {
      const col = kind === "truck" ? "truck_id" : "trailer_id";
      const cur = kind === "truck" ? "current_truck_id" : "current_trailer_id";
      let holderId: string | null = null;
      try {
        const c = await supabase.from("equipment_combos").select("claimed_by").eq(col, unitId).eq("active", true).not("claimed_by", "is", null).limit(1);
        holderId = ((c.data ?? []) as { claimed_by: string }[])[0]?.claimed_by ?? null;
        if (!holderId) {
          const u = await supabase.from("user_settings").select("user_id").eq(cur, unitId).limit(1);
          holderId = ((u.data ?? []) as { user_id: string }[])[0]?.user_id ?? null;
        }
      } catch { /* the holder stays unknown */ }
      let lastId: string | null = null, lastAt: string | null = null;
      try {
        const t = await supabase.from("trips").select("driver_id, started_at").eq(col, unitId).not("driver_id", "is", null).order("started_at", { ascending: false }).limit(1);
        const row = ((t.data ?? []) as { driver_id: string; started_at: string | null }[])[0];
        if (row) { lastId = row.driver_id; lastAt = row.started_at; }
      } catch { /* no last driver */ }
      const ids = [...new Set([holderId, lastId].filter((x): x is string => !!x))];
      const names = new Map<string, string | null>();
      if (ids.length) {
        try {
          const n = await supabase.rpc("get_display_names_full", { p_user_ids: ids });
          for (const r of (n.data ?? []) as { user_id: string; display_name: string | null }[]) names.set(r.user_id, r.display_name);
        } catch { /* names stay blank */ }
      }
      if (off) return;
      setS({ holder: holderId ? { userId: holderId, name: names.get(holderId) ?? null } : null, last: lastId && lastAt ? { name: names.get(lastId) ?? null, at: lastAt } : null, loaded: true });
    })();
    return () => { off = true; };
  }, [kind, unitId, enabled]);
  return s;
}
