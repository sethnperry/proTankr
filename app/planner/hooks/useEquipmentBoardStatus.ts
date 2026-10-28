"use client";
// app/planner/hooks/useEquipmentBoardStatus.ts
//
// What the equipment board shows under a combo's unit numbers: who has the truck
// (initials) and what the trailer is carrying (one colored dot per loaded compartment).
// Read straight from the server (trips and their compartments are readable company-wide).
// Fails open: with no data the board just shows no extra line.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { productColorFor } from "../utils/productColor";
import { dotsFor, initialsOf, type LoadedDot } from "@/lib/equipment/boardStatus";
import { stripSegments, residueStands, type StripSeg } from "@/lib/equipment/trailerStrip";

const CARRYING = ["loading", "in_transit", "delivering", "parked"];

export function useEquipmentBoardStatus(enabled: boolean, claimerIds: string[], trailerIds: string[], refreshKey?: unknown) {
  const catalog = useProductsCatalog();
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [aboard, setAboard] = useState<Record<string, { comp: number; productId: string | null }[]>>({});

  const [compSizes, setCompSizes] = useState<Record<string, { comp: number; size: number | null }[]>>({});
  const [residueBy, setResidueBy] = useState<Record<string, Record<number, string>>>({});

  const claimKey = [...new Set(claimerIds)].sort().join(",");
  const trailerKey = [...new Set(trailerIds)].sort().join(",");

  useEffect(() => {
    if (!enabled || !claimKey) { setInitials({}); return; }
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: claimKey.split(",") });
        const m: Record<string, string> = {};
        for (const r of (data ?? []) as { user_id?: string; display_name?: string | null }[]) {
          if (r.user_id) m[r.user_id] = initialsOf(r.display_name);
        }
        if (alive) setInitials(m);
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, [enabled, claimKey, refreshKey]);

  useEffect(() => {
    if (!enabled || !trailerKey) { setAboard({}); return; }
    let alive = true;
    void (async () => {
      try {
        const ids = trailerKey.split(",");
        const tr = await supabase.from("trips").select("trip_id, trailer_id").in("trailer_id", ids).in("status", CARRYING);
        const trips = (tr.data ?? []) as { trip_id: string; trailer_id: string }[];
        if (trips.length === 0) { if (alive) setAboard({}); return; }
        const cl = await supabase.from("trip_compartment_loads").select("trip_id, comp_number, product_id")
          .in("trip_id", trips.map((t) => t.trip_id)).eq("disposition", "loaded");
        const trailerOf = new Map(trips.map((t) => [t.trip_id, t.trailer_id]));
        const out: Record<string, { comp: number; productId: string | null }[]> = {};
        for (const r of (cl.data ?? []) as { trip_id: string; comp_number: number; product_id: string | null }[]) {
          const tid = trailerOf.get(r.trip_id);
          if (!tid) continue;
          (out[tid] ??= []).push({ comp: Number(r.comp_number), productId: r.product_id });
        }
        if (alive) setAboard(out);
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, [enabled, trailerKey, refreshKey]);

  // Compartment sizes, and what each trailer last held (cleared by a wash after that load).
  useEffect(() => {
    if (!enabled || !trailerKey) { setCompSizes({}); setResidueBy({}); return; }
    let alive = true;
    const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
    void (async () => {
      try {
        const ids = trailerKey.split(",");
        const sizes: Record<string, { comp: number; size: number | null }[]> = {};
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
        if (alive) setCompSizes(sizes);

        // Newest finished load per trailer.
        const lastLoad = new Map<string, { loadId: string; at: string }>();
        for (const part of chunk([...comboTrailer.keys()], 80)) {
          const { data } = await supabase.from("load_log").select("load_id, combo_id, completed_at").in("combo_id", part).eq("status", "loaded")
            .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1000);
          for (const r of (data ?? []) as { load_id: string; combo_id: string; completed_at: string }[]) {
            const tid = comboTrailer.get(r.combo_id);
            if (tid && (!lastLoad.get(tid) || r.completed_at > lastLoad.get(tid)!.at)) lastLoad.set(tid, { loadId: r.load_id, at: r.completed_at });
          }
        }
        const lastWash = new Map<string, string>();
        for (const part of chunk(ids, 80)) {
          const { data } = await supabase.from("wash_records").select("trailer_id, washed_at").in("trailer_id", part).order("washed_at", { ascending: false }).limit(1000);
          for (const r of (data ?? []) as { trailer_id: string | null; washed_at: string }[]) if (r.trailer_id && !lastWash.has(r.trailer_id)) lastWash.set(r.trailer_id, r.washed_at);
        }
        const standing = [...lastLoad.entries()].filter(([tid, l]) => residueStands(l.at, lastWash.get(tid) ?? null));
        const byLoad = new Map<string, Record<number, string>>();
        for (const part of chunk(standing.map(([, l]) => l.loadId), 80)) {
          const { data } = await supabase.from("load_lines").select("load_id, comp_number, product_id").in("load_id", part);
          for (const r of (data ?? []) as { load_id: string; comp_number: number; product_id: string | null }[])
            if (r.product_id) (byLoad.get(r.load_id) ?? byLoad.set(r.load_id, {}).get(r.load_id)!)[Number(r.comp_number)] = String(r.product_id);
        }
        const out: Record<string, Record<number, string>> = {};
        for (const [tid, l] of standing) if (byLoad.has(l.loadId)) out[tid] = byLoad.get(l.loadId)!;
        if (alive) setResidueBy(out);
      } catch { /* fail open: gray outlines */ }
    })();
    return () => { alive = false; };
  }, [enabled, trailerKey, refreshKey]);

  const colorOf = useMemo(() => {
    const by = new Map(catalog.data.map((p) => [p.product_id, p.hex_code || productColorFor(p.display_name || p.product_name)]));
    return (id: string) => by.get(id) ?? "#ffffff";
  }, [catalog.data]);

  const loadedByTrailer = useMemo(() => {
    const out: Record<string, LoadedDot[]> = {};
    for (const [tid, comps] of Object.entries(aboard)) {
      const dots = dotsFor(comps, colorOf);
      if (dots.length) out[tid] = dots;
    }
    return out;
  }, [aboard, colorOf]);

  const strips = useMemo(() => {
    const out: Record<string, StripSeg[]> = {};
    for (const [tid, comps] of Object.entries(compSizes)) {
      const now: Record<number, string> = {};
      for (const a of aboard[tid] ?? []) if (a.productId) now[a.comp] = colorOf(a.productId);
      const res: Record<number, string> = {};
      for (const [c, pid] of Object.entries(residueBy[tid] ?? {})) res[Number(c)] = colorOf(pid);
      out[tid] = stripSegments(comps, now, res);
    }
    return out;
  }, [compSizes, aboard, residueBy, colorOf]);

  return { initials, loadedByTrailer, strips };
}
