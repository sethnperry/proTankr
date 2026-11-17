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
import { CodeDash } from "./CodeDash";
import { CompartmentStrip } from "./trip/CompartmentStrip";
import { segsFor, type StripSeg } from "@/lib/equipment/trailerStrip";
import { fetchTrailerResidue, type TrailerCompSizes, type TrailerResidue } from "@/lib/equipment/fetchTrailerResidue";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { productColorFor } from "../utils/productColor";

export { segsFor };
export type { StripSeg };

export function SideView({ segs, height = 10 }: { segs: StripSeg[]; height?: number; gap?: number }) {
  if (!segs.length) return null;
  return <CodeDash fontSize={Math.max(13, height + 2)} items={segs.map((g) => ({ comp: g.comp, kind: g.kind, code: g.code, color: g.color }))} />;
}

/** The long colored side profile (the trip card's header): compartments left to right sized by volume, C1 on the right. */
export function BarView({ segs, height = 10, gap = 3 }: { segs: StripSeg[]; height?: number; gap?: number }) {
  if (!segs.length) return null;
  return (
    <CompartmentStrip height={height} gap={gap} slots={segs.map((g) => ({
      comp: g.comp, size: g.size, color: g.kind === "loaded" ? g.color : null, residue: g.kind === "residue" ? g.color : null,
    }))} />
  );
}

/** The same code-and-dash line, for the right end of a flex-row card. */
export function BirdTab({ segs }: { segs: StripSeg[]; width?: number }) {
  if (!segs.length) return null;
  return <div aria-hidden style={{ alignSelf: "center", flexShrink: 0, padding: "0 10px 0 6px" }}><SideView segs={segs} height={11} /></div>;
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
/** Product id -> short code (button code, else the first word of the name). */
export function useProductCode(): (productId: string | null | undefined) => string | null {
  const catalog = useProductsCatalog().data;
  return (id) => {
    if (!id) return null;
    const p = catalog.find((x) => x.product_id === id);
    if (!p) return null;
    const nm = String(p.display_name || p.product_name || "");
    return String(p.button_code ?? (nm.split(" ")[0] || "")).trim().toUpperCase() || null;
  };
}

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
  variant?: "side" | "bird" | "bar";
  /** From useTrailerHeaderData for a list; omitted, this header looks up its own trailer. */
  data?: TrailerHeaderData;
  height?: number;
  width?: number;
}) {
  const own = useTrailerHeaderData(data ? [] : [trailerId]);
  const d = data ?? own;
  const colorOf = useProductColor();
  const codeOf = useProductCode();
  const codes: Record<number, string> = {};
  for (const [n, pid] of Object.entries(loaded)) { const c = codeOf(pid ?? null); if (c) codes[Number(n)] = c; }
  const colors: Record<number, string | null> = {};
  for (const [n, pid] of Object.entries(loaded)) colors[Number(n)] = colorOf(pid ?? null);
  const res: Record<number, string> = {};
  for (const [n, pid] of Object.entries(trailerId ? d.residue[trailerId] ?? {} : {})) { const c = colorOf(pid); if (c) res[Number(n)] = c; }
  const segs = segsFor(trailerId ? d.sizes[trailerId] : undefined, colors, res, codes);
  return variant === "bird" ? <BirdTab segs={segs} width={width} /> : variant === "bar" ? <BarView segs={segs} height={height} /> : <SideView segs={segs} height={height} />;
}
