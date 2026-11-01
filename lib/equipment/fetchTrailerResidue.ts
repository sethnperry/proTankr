// lib/equipment/fetchTrailerResidue.ts
//
// For a set of trailers: each compartment's size, and what each trailer last held in each compartment
// (its residue). Residue is dropped once the trailer was washed after that load. Used by the equipment
// board and the dispatch live board, so both draw the same bird's-eye tab.

import { supabase } from "@/lib/supabase/client";
import { residueStands } from "./trailerStrip";

export type TrailerCompSizes = Record<string, { comp: number; size: number | null }[]>;
export type TrailerResidue = Record<string, Record<number, string>>;

export async function fetchTrailerResidue(ids: string[]): Promise<{ sizes: TrailerCompSizes; residue: TrailerResidue }> {
  const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  const sizes: TrailerCompSizes = {};
  const comboTrailer = new Map<string, string>();
  for (const part of chunk(ids, 80)) {
    const [tc, cb] = await Promise.all([
      supabase.from("trailer_compartments").select("trailer_id, comp_number, max_gallons").in("trailer_id", part),
      supabase.from("equipment_combos").select("combo_id, trailer_id").in("trailer_id", part),
    ]);
    for (const r of (tc.data ?? []) as { trailer_id: string; comp_number: number; max_gallons: number | null }[])
      (sizes[r.trailer_id] ??= []).push({ comp: Number(r.comp_number), size: r.max_gallons != null ? Number(r.max_gallons) : null });
    for (const r of (cb.data ?? []) as { combo_id: string; trailer_id: string }[]) comboTrailer.set(r.combo_id, r.trailer_id);
  }

  // The newest few finished loads per trailer. A compartment's residue is what it last held, which can be an
  // older load when the newest one left that compartment empty.
  const loadsBy = new Map<string, { loadId: string; at: string }[]>();
  for (const part of chunk([...comboTrailer.keys()], 80)) {
    const { data } = await supabase.from("load_log").select("load_id, combo_id, completed_at").in("combo_id", part).eq("status", "loaded")
      .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1000);
    for (const r of (data ?? []) as { load_id: string; combo_id: string; completed_at: string }[]) {
      const tid = comboTrailer.get(r.combo_id);
      if (!tid) continue;
      const arr = loadsBy.get(tid) ?? [];
      arr.push({ loadId: r.load_id, at: r.completed_at });
      loadsBy.set(tid, arr);
    }
  }
  const lastWash = new Map<string, string>();
  for (const part of chunk(ids, 80)) {
    const { data } = await supabase.from("wash_records").select("trailer_id, washed_at").in("trailer_id", part).order("washed_at", { ascending: false }).limit(1000);
    for (const r of (data ?? []) as { trailer_id: string | null; washed_at: string }[]) if (r.trailer_id && !lastWash.has(r.trailer_id)) lastWash.set(r.trailer_id, r.washed_at);
  }
  const recent = new Map<string, string[]>(); // trailer -> its newest standing loads, newest first
  for (const [tid, arr] of loadsBy) {
    const live = arr.sort((x, y) => y.at.localeCompare(x.at)).filter((l) => residueStands(l.at, lastWash.get(tid) ?? null)).slice(0, 8);
    if (live.length) recent.set(tid, live.map((l) => l.loadId));
  }
  const byLoad = new Map<string, Record<number, string>>();
  const loadIds = [...new Set([...recent.values()].flat())];
  for (const part of chunk(loadIds, 80)) {
    const { data } = await supabase.from("load_lines").select("load_id, comp_number, product_id").in("load_id", part);
    for (const r of (data ?? []) as { load_id: string; comp_number: number; product_id: string | null }[])
      if (r.product_id) (byLoad.get(r.load_id) ?? byLoad.set(r.load_id, {}).get(r.load_id)!)[Number(r.comp_number)] = String(r.product_id);
  }
  const residue: TrailerResidue = {};
  for (const [tid, loads] of recent) {
    const per: Record<number, string> = {};
    for (const id of loads) for (const [c, pid] of Object.entries(byLoad.get(id) ?? {})) if (per[Number(c)] == null) per[Number(c)] = pid;
    if (Object.keys(per).length) residue[tid] = per;
  }
  return { sizes, residue };
}
