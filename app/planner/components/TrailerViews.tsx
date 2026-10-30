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
import { segsFor, type StripSeg } from "@/lib/equipment/trailerStrip";
import { fetchTrailerResidue, type TrailerCompSizes, type TrailerResidue } from "@/lib/equipment/fetchTrailerResidue";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { productColorFor } from "../utils/productColor";

export { segsFor };
export type { StripSeg };

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

// ── The one trailer header ───────────────────────────────────────────────────
// <TrailerHeader trailerId loaded variant="side" | "bird" /> draws a trailer anywhere in the app: sizes,
// residue (what it last held, cleared by a wash) and product colors are all handled here, so a change to
// how any of that works shows up everywhere. A list of trailers calls useTrailerHeaderData once and passes
// `data` to every header, so a long list is one lookup, not one per row.

export type TrailerHeaderData = { sizes: TrailerCompSizes; residue: TrailerResidue };
const NO_DATA: TrailerHeaderData = { sizes: {}, residue: {} };

export function useTrailerHeaderData(trailerIds: (string | null | undefined)[], refreshKey?: unknown): TrailerHeaderData {
  const ids = [...new Set(trailerIds.filter((x): x is string => !!x))].sort();
  const key = ids.join(",");
  const q = useQuery({
    queryKey: ["trailerHeaderData", key, refreshKey ?? null],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => { const r = await fetchTrailerResidue(ids); return { sizes: r.sizes, residue: r.residue } as TrailerHeaderData; },
  });
  return q.data ?? NO_DATA;
}

/** Product id -> fill color, from the catalog's hex or the family color. */
export function useProductColor(): (productId: string | null | undefined) => string | null {
  const catalog = useProductsCatalog().data;
  return (id) => {
    if (!id) return null;
    const p = catalog.find((x) => x.product_id === id);
    return p ? (p.hex_code?.trim() || productColorFor(p.display_name ?? p.product_name)) : null;
  };
}

export function TrailerHeader({ trailerId, loaded, variant = "side", data, height, width }: {
  trailerId: string | null | undefined;
  /** What is in each compartment now: compartment number -> product id. */
  loaded: Record<number, string | null | undefined>;
  variant?: "side" | "bird";
  /** From useTrailerHeaderData for a list; omitted, this header looks up its own trailer. */
  data?: TrailerHeaderData;
  height?: number;
  width?: number;
}) {
  const own = useTrailerHeaderData(data ? [] : [trailerId]);
  const d = data ?? own;
  const colorOf = useProductColor();
  const colors: Record<number, string | null> = {};
  for (const [n, pid] of Object.entries(loaded)) colors[Number(n)] = colorOf(pid ?? null);
  const res: Record<number, string> = {};
  for (const [n, pid] of Object.entries(trailerId ? d.residue[trailerId] ?? {} : {})) { const c = colorOf(pid); if (c) res[Number(n)] = c; }
  const segs = segsFor(trailerId ? d.sizes[trailerId] : undefined, colors, res);
  return variant === "bird" ? <BirdTab segs={segs} width={width} /> : <SideView segs={segs} height={height} />;
}
