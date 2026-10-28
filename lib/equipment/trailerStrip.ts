// lib/equipment/trailerStrip.ts
//
// The vertical compartment strip on a trailer card: one segment per compartment, comp 1 on top, each
// as tall as the compartment is big. Loaded = filled in the product's color; empty but last held a
// product = outlined in that color (residue); new or cleaned = a gray outline. Pure.

export type StripSeg = { comp: number; size: number; kind: "loaded" | "residue" | "empty"; color: string | null };

export function stripSegments(
  comps: { comp: number; size: number | null }[],
  aboard: Record<number, string>,
  residue: Record<number, string>,
): StripSeg[] {
  const sized = comps.map((c) => ({ comp: c.comp, size: c.size && c.size > 0 ? c.size : 1 }));
  const fallback = Math.max(1, ...sized.map((c) => c.size));
  return sized
    .sort((a, b) => a.comp - b.comp)
    .map((c) => {
      const size = comps.every((x) => !x.size) ? fallback : c.size;
      if (aboard[c.comp]) return { comp: c.comp, size, kind: "loaded" as const, color: aboard[c.comp] };
      if (residue[c.comp]) return { comp: c.comp, size, kind: "residue" as const, color: residue[c.comp] };
      return { comp: c.comp, size, kind: "empty" as const, color: null };
    });
}

/** Residue is cleared once the trailer has been washed after its last load. */
export function residueStands(lastLoadAt: string | null, lastWashAt: string | null): boolean {
  if (!lastLoadAt) return false;
  if (!lastWashAt) return true;
  return Date.parse(lastWashAt) <= Date.parse(lastLoadAt);
}
