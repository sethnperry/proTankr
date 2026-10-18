// app/planner/theme.ts
//
// Planner-screen theming: light mode is the original all-white top section
// (header/tab-bar) + white Load button + white compartment handles + light
// CG-slider puck. Dark mode swaps that same set of elements to a graphite
// fill, with icon/tab/button text flipping light. A custom accent color (if
// set) overrides the fill for those same elements regardless of dark/light
// -- but per the user's explicit choice, text/icon colors always follow the
// dark/light setting only, never the accent color itself.

export const GRAPHITE = "#2a2a2c";
export const GRAPHITE_DARKER = "#1c1c1e";

// The "instrument" look (Driver Dashboard, lib/ui/look.ts): flat near-black
// surfaces with a thin border, square corners. Sheets and cards use these.
export const SURFACE = "#121213";
export const SURFACE_BORDER = "1px solid rgba(255,255,255,0.14)";

// Solid fill for the Load button, compartment handles, and CG puck. Each
// caller passes its OWN current light-mode color (they aren't all the same
// shade today -- e.g. the CG puck is "#d9d9d9", not pure white) so light
// mode stays pixel-identical to "what we have now"; dark mode is the one
// that unifies all of them to a single graphite, and a custom accent color
// overrides either.
export function themeFill(darkMode: boolean, accentColor: string | null, lightDefault: string = "#ffffff"): string {
  return accentColor || (darkMode ? GRAPHITE : lightDefault);
}

// themeHeaderGradient (a two-tone graphite/accent gradient for the header
// band) was removed here -- per explicit direction, the shared Header
// (CalculatorLayoutClient.tsx) now uses a flat black background matching
// the page body exactly ("turn the background black so it looks like
// there's no header"), not a themed gradient.

// Text/icon colors -- driven by dark/light only, never the accent color.
export function themeTextOnFill(darkMode: boolean): string {
  return darkMode ? "#fff" : "#000";
}
export function themeIconStroke(darkMode: boolean): string {
  return darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)";
}
// themeTabActive/themeTabInactive/themeUnderlineTrack/themeUnderlineActive
// were removed here -- they only ever styled the visible tab bar
// (CalculatorLayoutClient.tsx's TabBar), deleted along with it once every
// destination it held moved into NavMenu's own dropdown instead.
