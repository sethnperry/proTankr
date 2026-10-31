// lib/vault/grays.ts
//
// Each Vault category has its own color, so the boxes need no category label: the driver learns the colors
// (the legend under the search box shows them). All are deep, muted shades that carry white text and sit
// well on the app's dark background. A custom category gets one of the spare shades, the same one every
// time. (The file keeps its old name; it used to hold grays.) Pure.

export type Shade = { bg: string; fg: string; sub: string; border: string };

const mk = (bg: string): Shade => ({ bg, fg: "#ffffff", sub: "rgba(255,255,255,0.68)", border: "1px solid rgba(255,255,255,0.16)" });

const FIXED: Record<string, Shade> = {
  Work: mk("#1f4a8a"),            // blue
  Personal: mk("#2f6b4f"),        // green
  "Company Card": mk("#8a5a12"),  // amber
  "Personal Card": mk("#6a2f86"), // purple
};
const SPARE: Shade[] = [mk("#12606b"), mk("#8a2f40"), mk("#5f6b1a"), mk("#403f94"), mk("#8a4a2a"), mk("#7a2f6a")];
const NONE = mk("#4a4a4a");

export function shadeFor(category: string | null | undefined): Shade {
  if (!category) return NONE;
  if (FIXED[category]) return FIXED[category];
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[h % SPARE.length];
}
