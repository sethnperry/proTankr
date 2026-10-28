"use client";
// app/planner/components/TrailerViews.tsx
//
// The two ways a trailer's product is drawn, used wherever the app shows what is (or would be) in
// the compartments:
//   SideView  the drop-side view: compartments left to right, C1 on the right like the Planner.
//   BirdTab   the bird's-eye view: a tab down the right edge of a card, C1 on top.
// Both size each compartment by its volume. Loaded = filled in the product's color; empty but last
// held a product = outlined in that color (residue); new, washed or unknown = a gray outline.

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { CompartmentStrip } from "./trip/CompartmentStrip";
import { stripSegments, type StripSeg } from "@/lib/equipment/trailerStrip";

export type { StripSeg };

/** Compartment segments from a trailer's sizes plus what is in each compartment right now. */
export function segsFor(
  sizes: { comp: number; size: number | null }[] | undefined,
  loaded: Record<number, string | null | undefined>,
  residue: Record<number, string> = {},
): StripSeg[] {
  const comps = sizes && sizes.length ? sizes : Object.keys(loaded).map((n) => ({ comp: Number(n), size: null }));
  const now: Record<number, string> = {};
  for (const [n, c] of Object.entries(loaded)) if (c) now[Number(n)] = c;
  return stripSegments(comps, now, residue);
}

export function SideView({ segs, height = 10, gap = 3 }: { segs: StripSeg[]; height?: number; gap?: number }) {
  if (!segs.length) return null;
  return (
    <CompartmentStrip height={height} gap={gap} slots={segs.map((g) => ({
      comp: g.comp, size: g.size, color: g.kind === "loaded" ? g.color : null, residue: g.kind === "residue" ? g.color : null,
    }))} />
  );
}

/** The bird's-eye tab. Put it as the last child of a flex-row card whose right padding is 0. */
export function BirdTab({ segs, width = 20 }: { segs: StripSeg[]; width?: number }) {
  if (!segs.length) return null;
  return (
    <div aria-hidden style={{ alignSelf: "stretch", width, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2, borderLeft: "1px solid rgba(255,255,255,0.12)" }}>
      {segs.map((g) => (
        <div key={g.comp} style={{
          flex: `${g.size} 1 0`, minHeight: 3, boxSizing: "border-box",
          ...(g.kind === "loaded" ? { background: g.color ?? "#fff", border: `1px solid ${g.color ?? "#fff"}` }
            : g.kind === "residue" ? { border: `1.5px solid ${g.color ?? "#fff"}` }
            : { border: "1px solid rgba(255,255,255,0.35)" }),
        }} />
      ))}
    </div>
  );
}

/** Compartment sizes for a set of trailers, cached. */
export function useTrailerSizes(trailerIds: (string | null | undefined)[]): Record<string, { comp: number; size: number | null }[]> {
  const ids = [...new Set(trailerIds.filter((x): x is string => !!x))].sort();
  const q = useQuery({
    queryKey: ["trailerSizes", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const out: Record<string, { comp: number; size: number | null }[]> = {};
      for (let i = 0; i < ids.length; i += 80) {
        const { data } = await supabase.from("trailer_compartments").select("trailer_id, comp_number, max_gallons").in("trailer_id", ids.slice(i, i + 80));
        for (const r of (data ?? []) as { trailer_id: string; comp_number: number; max_gallons: number | null }[])
          (out[r.trailer_id] ??= []).push({ comp: Number(r.comp_number), size: r.max_gallons != null ? Number(r.max_gallons) : null });
      }
      return out;
    },
  });
  return q.data ?? EMPTY;
}
const EMPTY: Record<string, { comp: number; size: number | null }[]> = {};
