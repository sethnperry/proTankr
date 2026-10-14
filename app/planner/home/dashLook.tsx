"use client";
// app/planner/home/dashLook.tsx
//
// Visual variants for the Driver Dashboard, compared while the design
// settles. Same layout and data in all three; only these tokens differ.
//   A  refined monochrome: layered graphite surfaces, thin borders, small
//      uppercase labels, press and focus states.
//   B  native-inspired: A plus a floating title bar (the one translucent
//      surface, solid where blur isn't supported) and short entrance motion.
//   C  instrument-inspired: A plus tighter corners, bigger tabular numbers
//      and square status marks.
// Pick with ?variant=a|b|c (remembered on this phone) or the switch at the
// bottom of the dashboard (super admins only). Temporary: remove once one
// is chosen.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";


export type LookName = "a" | "b" | "c";

export type Look = {
  name: LookName;
  label: string;
  radius: number;
  // Primary surfaces: trip card, terminal access.
  primary: React.CSSProperties;
  // Secondary surfaces: readout cards, tiles.
  secondary: React.CSSProperties;
  hairline: string;
  sectionLabel: React.CSSProperties;
  cta: React.CSSProperties;
  title: React.CSSProperties;
  // Painted on the page's scroll container (null = plain page background).
  backdrop: React.CSSProperties | null;
  stickyTitle: boolean;
  animate: boolean;
  // Instrument treatment: bigger tabular numbers, square status markers.
  instrument: boolean;
  // How the tools are laid out: tiles (A), a grouped list (B), a compact
  // icon panel (C).
  tools: "tiles" | "list" | "panel";
  muted: string;
  faint: string;
};

// A: refined monochrome. Near-black page with a faint highlight at the top,
// graphite cards one step lighter, a thin top edge, small uppercase labels.
const A: Look = {
  name: "a",
  label: "A · Mono",
  radius: 12,
  primary: {
    background: "#151516",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 12,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.5)",
  },
  secondary: {
    background: "#111112",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10,
  },
  hairline: "rgba(255,255,255,0.07)",
  sectionLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)", margin: "22px 2px 8px",
  },
  cta: {
    background: "#fff", color: "#000", borderRadius: 12, border: "none",
    letterSpacing: "0.01em", boxShadow: "0 1px 0 rgba(0,0,0,0.4)",
  },
  title: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" },
  backdrop: {
    background: "radial-gradient(1100px 380px at 50% -140px, rgba(255,255,255,0.055), transparent 70%), #0b0b0b",
  },
  stickyTitle: false,
  animate: false,
  instrument: false,
  tools: "tiles",
  muted: "rgba(255,255,255,0.52)",
  faint: "rgba(255,255,255,0.3)",
};

// B: native-inspired. Big title that collapses into a blurred one-line bar
// while scrolling, sentence-case labels, softer rounded surfaces, and the
// tools as one grouped list with chevrons, like a phone's settings screen.
const B: Look = {
  ...A,
  name: "b",
  label: "B · Native",
  radius: 16,
  primary: {
    background: "#1a1a1c",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16,
    boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
  },
  secondary: { background: "#1a1a1c", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 },
  sectionLabel: { fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.55)", margin: "26px 4px 8px" },
  cta: { background: "#fff", color: "#000", borderRadius: 16, border: "none" },
  title: { fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" },
  backdrop: { background: "#000" },
  stickyTitle: true,
  animate: true,
  tools: "list",
};

// C: instrument-inspired. Square corners, a gauge panel of big readouts
// under the main button, uppercase labels, square status marks, and the
// tools as a compact three-across icon panel.
const C: Look = {
  ...A,
  name: "c",
  label: "C · Instrument",
  radius: 2,
  primary: { background: "#121213", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 2 },
  secondary: { background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2 },
  hairline: "rgba(255,255,255,0.12)",
  sectionLabel: {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)", margin: "20px 0 6px", paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.12)",
  },
  cta: { background: "#fff", color: "#000", borderRadius: 2, border: "none", letterSpacing: "0.06em", textTransform: "uppercase" },
  title: { fontSize: 13, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" },
  backdrop: { background: "#080808" },
  instrument: true,
  tools: "panel",
};

export const LOOKS: Record<LookName, Look> = { a: A, b: B, c: C };

// The default until the comparison is settled.
export const DEFAULT_LOOK: LookName = "a";

const LookContext = createContext<Look>(LOOKS[DEFAULT_LOOK]);
export const DashLookProvider = LookContext.Provider;
export function useDashLook(): Look {
  return useContext(LookContext);
}

const STORE_KEY = "proTankr:dashVariant";

export function useLookPreference(): [LookName, (n: LookName) => void] {
  const [name, setName] = useState<LookName>(DEFAULT_LOOK);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("variant");
      if (q === "a" || q === "b" || q === "c") {
        window.localStorage.setItem(STORE_KEY, q);
        setName(q);
        return;
      }
      const s = window.localStorage.getItem(STORE_KEY);
      if (s === "a" || s === "b" || s === "c") setName(s);
    } catch { /* storage blocked */ }
  }, []);
  const set = useCallback((n: LookName) => {
    setName(n);
    try { window.localStorage.setItem(STORE_KEY, n); } catch { /* storage blocked */ }
  }, []);
  return [name, set];
}

// Paints the look's backdrop on the page's scroll container (not a fixed
// layer, which would cover the shell's menu header), restoring it on exit.
export function useScrollBackdrop(el: HTMLElement | null, look: Look) {
  useEffect(() => {
    if (!el || !look.backdrop) return;
    let host: HTMLElement | null = el.parentElement;
    while (host && !/(auto|scroll)/.test(getComputedStyle(host).overflowY)) host = host.parentElement;
    if (!host) return;
    const prev = host.style.background;
    host.style.background = String(look.backdrop.background ?? "");
    return () => { host!.style.background = prev; };
  }, [el, look]);
}

// True once the page's scroll container has scrolled past the title, so a
// floating title bar can collapse to a compact one-line bar.
export function useScrolledPast(el: HTMLElement | null, enabled: boolean, px = 40): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!el || !enabled) { setPast(false); return; }
    let host: HTMLElement | null = el.parentElement;
    while (host && !/(auto|scroll)/.test(getComputedStyle(host).overflowY)) host = host.parentElement;
    if (!host) return;
    const h = host;
    const on = () => setPast(h.scrollTop > px);
    on();
    h.addEventListener("scroll", on, { passive: true });
    return () => h.removeEventListener("scroll", on);
  }, [el, enabled, px]);
  return past;
}

// Shared CSS: press feedback, entrance, and the two-column desktop layout.
export function DashStyles() {
  return (
    <style
      // Plain <style>: scoped styled-jsx doesn't attach in this setup.
      dangerouslySetInnerHTML={{
        __html: `
.dash-press{transition:transform 120ms ease, filter 120ms ease, opacity 120ms ease;-webkit-tap-highlight-color:transparent}
.dash-press:active{transform:scale(0.985);filter:brightness(0.92)}
.dash-wrap button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.dash-num{font-variant-numeric:tabular-nums}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.dash-titlebar{background:#0b0b0b !important}}
@keyframes dashEnter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.dash-enter{animation:dashEnter 320ms cubic-bezier(.2,.7,.2,1) both}
@media (prefers-reduced-motion: reduce){.dash-enter{animation:none}.dash-press{transition:none}.dash-press:active{transform:none}}
.dash-wrap{max-width:640px;margin:0 auto}
.dash-cols{display:block}
.dash-desk{display:none}
@media (min-width: 960px){
  .dash-wrap{max-width:1080px}
  .dash-cols{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,0.92fr);gap:28px;align-items:start}
  .dash-side{position:sticky;top:12px}
  .dash-desk{display:flex}
  .dash-first{margin-top:4px !important}
  .dash-titlebar{background:transparent !important;border-bottom-color:transparent !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;position:static !important}
}
`,
      }}
    />
  );
}

export function SectionLabel({ children, right, desktopOnly, first }: { children: React.ReactNode; right?: React.ReactNode; desktopOnly?: boolean; first?: boolean }) {
  const L = useDashLook();
  return (
    <div className={[desktopOnly ? "dash-desk" : "", first ? "dash-first" : ""].join(" ").trim() || undefined}
      style={{ ...L.sectionLabel, display: desktopOnly ? undefined : "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {right}
    </div>
  );
}
