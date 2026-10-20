"use client";
// lib/dispatch/useTrailerPlan.ts
//
// A trailer's compartments, its plan slots (A-E, set by dispatch and shared by
// whoever drives it) and the products sold at a terminal. Reads and writes go
// straight to the server and fail open.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type TrailerComp = { n: number; size: number };
export type TrailerSlot = { slot: number; name: string | null; payload: any; updatedAt: string };

export function useTrailerPlan(companyId: string | null, trailerId: string | null, terminalId: string | null) {
  const [comps, setComps] = useState<TrailerComp[]>([]);
  const [slots, setSlots] = useState<Record<number, TrailerSlot>>({});
  const [terminalProductIds, setTerminalProductIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!trailerId) { setComps([]); setSlots({}); return; }
    const [c, s] = await Promise.all([
      supabase.from("trailer_compartments").select("comp_number, max_gallons").eq("trailer_id", trailerId).order("comp_number"),
      supabase.from("trailer_plan_slots").select("slot, name, payload, updated_at").eq("trailer_id", trailerId),
    ]);
    setComps(((c.data ?? []) as any[]).map((r) => ({ n: Number(r.comp_number), size: Number(r.max_gallons) || 0 })));
    const m: Record<number, TrailerSlot> = {};
    for (const r of (s.data ?? []) as any[]) m[Number(r.slot)] = { slot: Number(r.slot), name: r.name ?? null, payload: r.payload, updatedAt: r.updated_at };
    setSlots(m);
  }, [trailerId]);
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!terminalId) { setTerminalProductIds(null); return; }
    let off = false;
    void supabase.from("terminal_products").select("product_id, active").eq("terminal_id", terminalId).then(({ data }) => {
      if (off) return;
      const ids = ((data ?? []) as any[]).filter((r) => r.active !== false).map((r) => String(r.product_id));
      setTerminalProductIds(ids.length ? ids : null);
    });
    return () => { off = true; };
  }, [terminalId]);

  const saveSlot = useCallback(async (slot: number, name: string | null, payload: any, userId: string): Promise<string | null> => {
    if (!companyId || !trailerId) return "Pick a trailer first.";
    const { error: e } = await supabase.from("trailer_plan_slots").upsert({
      company_id: companyId, trailer_id: trailerId, slot, name: name?.trim() || null, payload, updated_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "trailer_id,slot" });
    if (e) { setError(e.message); return e.message; }
    setError(null); await reload(); return null;
  }, [companyId, trailerId, reload]);

  const clearSlot = useCallback(async (slot: number): Promise<string | null> => {
    if (!trailerId) return null;
    const { error: e } = await supabase.from("trailer_plan_slots").delete().eq("trailer_id", trailerId).eq("slot", slot);
    if (e) { setError(e.message); return e.message; }
    setError(null); await reload(); return null;
  }, [trailerId, reload]);

  return { comps, slots, terminalProductIds, error, saveSlot, clearSlot, reload };
}
