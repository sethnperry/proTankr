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

const CARRYING = ["loading", "in_transit", "delivering", "parked"];

export function useEquipmentBoardStatus(enabled: boolean, claimerIds: string[], trailerIds: string[], refreshKey?: unknown) {
  const catalog = useProductsCatalog();
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [aboard, setAboard] = useState<Record<string, { comp: number; productId: string | null }[]>>({});

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

  return { initials, loadedByTrailer };
}
