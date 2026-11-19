"use client";
// lib/position/useEquipmentPositions.ts
//
// Where the company's equipment was last captured (equipment_positions, written from the drivers' phones when
// something happens; see lib/position/captures.ts). Replaces the tracker's live positions on the Dispatch board and
// Track. A capture is "last seen", not live: lines say how old it is. Empty (and quiet) until the migration is applied.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { LivePos } from "@/lib/telematics/progress";

export type UnitPosition = { kind: "truck" | "trailer"; unitId: string; lat: number; lon: number; odometer: number | null; cause: string | null; capturedAt: string; capturedBy: string | null };

type Row = { unit_kind: string; unit_id: string; lat: number; lon: number; odometer: number | null; cause: string | null; captured_at: string; captured_by: string | null };

export function rowsToPositions(rows: Row[]): UnitPosition[] {
  return rows.filter((r) => (r.unit_kind === "truck" || r.unit_kind === "trailer") && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
    .map((r) => ({ kind: r.unit_kind as "truck" | "trailer", unitId: r.unit_id, lat: Number(r.lat), lon: Number(r.lon), odometer: r.odometer != null ? Number(r.odometer) : null, cause: r.cause, capturedAt: r.captured_at, capturedBy: r.captured_by }));
}
/** The Dispatch board's live-dot shape. A capture has no speed. */
export const toLivePos = (p: UnitPosition): LivePos => ({ lat: p.lat, lon: p.lon, speedMph: null, at: p.capturedAt });

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
