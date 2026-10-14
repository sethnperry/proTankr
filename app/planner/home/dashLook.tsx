"use client";
// app/planner/home/dashLook.tsx
//
// The Driver Dashboard's visual tokens: the "instrument" look picked from a
// three-way comparison on 2026-10-14. Square corners, near-black surfaces
// with thin borders, uppercase labels, tabular numbers. Kept in one place so
// the dashboard's pieces (DashboardChrome, QualificationStrip, the readout
// cards via CSS variables) stay consistent.

import React, { createContext, useContext, useEffect } from "react";


export type Look = {
  primary: React.CSSProperties;   // trip card, terminal access
  secondary: React.CSSProperties; // readout cards, attention rows
  hairline: string;
  sectionLabel: React.CSSProperties;
  cta: React.CSSProperties;
  title: React.CSSProperties;
  backdrop: React.CSSProperties;  // painted on the page's scroll container
  muted: string;
  faint: string;
};

export const LOOK: Look = {
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
  muted: "rgba(255,255,255,0.52)",
  faint: "rgba(255,255,255,0.3)",
};

const LookContext = createContext<Look>(LOOK);
export const DashLookProvider = LookContext.Provider;
export function useDashLook(): Look {
  return useContext(LookContext);
}

// Paints the look's backdrop on the page's scroll container (not a fixed
// layer, which would cover the shell's menu header), restoring it on exit.
export function useScrollBackdrop(el: HTMLElement | null, look: Look) {
  useEffect(() => {
    if (!el) return;
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
.dash-press{transition:transform 120ms ease, filter 120ms ease, opacity 120ms ease;-webkit-tap-highlight-color:transparent}
.dash-press:active{transform:scale(0.985);filter:brightness(0.92)}
.dash-wrap button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.dash-num{font-variant-numeric:tabular-nums}
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
