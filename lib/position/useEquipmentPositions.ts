"use client";
// lib/position/useEquipmentPositions.ts
//
// Where the company's equipment was last captured (equipment_positions, written from the drivers' phones when
// something happens; see lib/position/captures.ts). Replaces the tracker's live positions on the Dispatch board and
// Track. A capture is "last seen", not live: lines say how old it is. Empty (and quiet) until the migration is applied.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { PositionRow } from "./positionRows";

export { rowsToPositions, toLivePos, type UnitPosition } from "./positionRows";
import { rowsToPositions, type UnitPosition } from "./positionRows";
type Row = PositionRow;

export function useEquipmentPositions(companyId: string | null, enabled: boolean, pollMs = 60_000) {
  const [list, setList] = useState<UnitPosition[]>([]);
  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase.from("equipment_positions").select("unit_kind,unit_id,lat,lon,odometer,cause,captured_at,captured_by").eq("company_id", companyId).limit(2000);
      if (!error) setList(rowsToPositions((data ?? []) as Row[]));
    } catch { /* keep what we have */ }
  }, [companyId]);
  useEffect(() => {
    if (!companyId || !enabled) return;
    let off = false; let timer: number | undefined;
    const tick = async () => {
      if (document.visibilityState !== "hidden") await load();
      if (!off) timer = window.setTimeout(tick, pollMs);
    };
    void tick();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [companyId, enabled, pollMs, load]);
  const trucks = new Map(list.filter((p) => p.kind === "truck").map((p) => [p.unitId, toLivePos(p)]));
  const byUnit = new Map(list.map((p) => [`${p.kind}:${p.unitId}`, p]));
  return { trucks, byUnit, list, reload: load };
}
