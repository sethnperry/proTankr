"use client";
// app/planner/home/dashLook.tsx
//
// Visual treatments for the Driver Dashboard, compared side by side while
// the design settles:
//   mono  — refined monochrome: solid graphite surfaces, hairlines, clear
//           section labels, no blur.
//   glass — native-inspired: a soft lit backdrop, translucent blurred
//           surfaces on the primary cards only, a sticky blurred title bar,
//           short entrance and press transitions.
// Pick with ?look=mono|glass (remembered on this phone) or the switch at the
// bottom of the dashboard (super admins only). Layout is shared; only these
// tokens differ.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";


export type LookName = "mono" | "glass";

export type Look = {
  name: LookName;
  radius: number;
  // Primary surfaces: trip card, terminal access.
  primary: React.CSSProperties;
  // Secondary surfaces: readout cards, tiles.
  secondary: React.CSSProperties;
  hairline: string;
  sectionLabel: React.CSSProperties;
  cta: React.CSSProperties;
  title: React.CSSProperties;
  // Fixed layer painted behind the page (null = plain page background).
  backdrop: React.CSSProperties | null;
  stickyTitle: boolean;
  animate: boolean;
  muted: string;
  faint: string;
};

const MONO: Look = {
  name: "mono",
  radius: 16,
  primary: {
    background: "#141414",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 16,
  },
  secondary: {
    background: "#121212",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
  },
  hairline: "rgba(255,255,255,0.07)",
  sectionLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase",
    color: "rgba(255,255,255,0.42)", margin: "22px 4px 8px",
  },
  cta: {
    background: "#fff", color: "#000", borderRadius: 16, border: "none",
    boxShadow: "none",
  },
  title: { fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em" },
  backdrop: null,
  stickyTitle: false,
  animate: false,
  muted: "rgba(255,255,255,0.5)",
  faint: "rgba(255,255,255,0.3)",
};

const GLASS: Look = {
  name: "glass",
  radius: 22,
  primary: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.035) 100%)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 22,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 32px rgba(0,0,0,0.38)",
    backdropFilter: "blur(22px) saturate(150%)",
    WebkitBackdropFilter: "blur(22px) saturate(150%)",
  },
  secondary: {
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
  },
  hairline: "rgba(255,255,255,0.08)",
  sectionLabel: {
    fontSize: 12, fontWeight: 600, letterSpacing: "0.01em",
    color: "rgba(255,255,255,0.55)", margin: "24px 6px 8px",
  },
  cta: {
    background: "linear-gradient(180deg, #ffffff 0%, #f1f1f3 100%)", color: "#000", borderRadius: 20, border: "none",
    boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 10px 30px rgba(0,0,0,0.45)",
  },
  title: { fontSize: 30, fontWeight: 900, letterSpacing: "-0.025em" },
  backdrop: {
    background:
      "radial-gradient(900px 520px at 0% -8%, rgba(120,146,190,0.22), transparent 62%)," +
      "radial-gradient(700px 480px at 105% 4%, rgba(255,255,255,0.07), transparent 60%)," +
      "radial-gradient(800px 600px at 50% 110%, rgba(90,110,140,0.12), transparent 60%)," +
      "#08090b",
  },
  stickyTitle: true,
  animate: true,
  muted: "rgba(255,255,255,0.55)",
  faint: "rgba(255,255,255,0.32)",
};

export const LOOKS: Record<LookName, Look> = { mono: MONO, glass: GLASS };

// The default until the comparison is settled.
export const DEFAULT_LOOK: LookName = "glass";

const LookContext = createContext<Look>(LOOKS[DEFAULT_LOOK]);
export const DashLookProvider = LookContext.Provider;
export function useDashLook(): Look {
  return useContext(LookContext);
}

const STORE_KEY = "proTankr:dashLook";

export function useLookPreference(): [LookName, (n: LookName) => void] {
  const [name, setName] = useState<LookName>(DEFAULT_LOOK);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("look");
      if (q === "mono" || q === "glass") {
        window.localStorage.setItem(STORE_KEY, q);
        setName(q);
        return;
      }
      const s = window.localStorage.getItem(STORE_KEY);
      if (s === "mono" || s === "glass") setName(s);
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

// Shared CSS: press feedback, entrance, and the two-column desktop layout.
export function DashStyles() {
  return (
    <style
      // Plain <style>: scoped styled-jsx doesn't attach in this setup.
      dangerouslySetInnerHTML={{
        __html: `
.dash-press{transition:transform 140ms ease, background-color 140ms ease, opacity 140ms ease}
.dash-press:active{transform:scale(0.985)}
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
