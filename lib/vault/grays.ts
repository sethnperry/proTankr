// lib/vault/grays.ts
//
// Each Vault category is one shade of gray, so the boxes can drop their category label and the driver learns
// the colors. Work is the lightest; the card categories run from dark to mid. A custom category gets one of
// the spare shades, the same one every time. Pure.

export type Shade = { bg: string; fg: string; sub: string; border: string };

const mk = (bg: string, light: boolean): Shade => light
  ? { bg, fg: "#0b0b0b", sub: "rgba(0,0,0,0.58)", border: "1px solid rgba(0,0,0,0.12)" }
  : { bg, fg: "#ffffff", sub: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.12)" };

const FIXED: Record<string, Shade> = {
  Work: mk("#e4e4e4", true),
  Personal: mk("#1c1c1c", false),
  "Company Card": mk("#3d3d3d", false),
  "Personal Card": mk("#8f8f8f", true),
};
const SPARE: Shade[] = [mk("#b9b9b9", true), mk("#2a2a2a", false), mk("#6b6b6b", false), mk("#d2d2d2", true)];
const NONE = mk("#555555", false);

export function shadeFor(category: string | null | undefined): Shade {
  if (!category) return NONE;
  if (FIXED[category]) return FIXED[category];
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[h % SPARE.length];
}
