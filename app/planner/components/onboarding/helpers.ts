"use client";
// app/planner/components/onboarding/helpers.ts
//
// Part of SoloOnboarding.tsx.

import React from "react";

import type { Step } from "./types";

export const DEFAULT_TARGET_LBS = 79500;

export const MAX_PLAUSIBLE_CAP_GAL = 20000;

export const MAX_PLAUSIBLE_TARE_LBS = 60000;

export const SAFETY_BUFFER_GAL = 50;

// Steps that get a progress dot (the "build" steps). welcome/ready/tutorial/
// done are outside the counter.
export const DOT_STEPS: Step[] = ["identity", "truck", "trailer", "caps", "safety", "tare", "target", "location", "terminal"];

// ── Styling (inherits the app-wide Outfit font; never overrides font-family) ──

export const S = {
  screen: {
    position: "fixed" as const, inset: 0, zIndex: 45,
    background: "#111111", color: "#fff",
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    padding: "24px 22px",
    paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
    overflowY: "auto" as const,
  },
  card: {
    width: "100%", maxWidth: 380, display: "flex", flexDirection: "column" as const, gap: 18,
  },
  h1: { fontSize: 26, fontWeight: 800, lineHeight: 1.2, margin: 0 },
  h2: { fontSize: 22, fontWeight: 800, lineHeight: 1.25, margin: 0 },
  sub: { fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,0.55)" },
  label: { fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" as const, color: "rgba(255,255,255,0.45)", marginBottom: 6 },
  input: {
    width: "100%", padding: "14px 14px", fontSize: 20, fontWeight: 700,
    color: "#fff", background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2,
  } as React.CSSProperties,
  example: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 },
  primary: {
    width: "100%", padding: "15px 0", borderRadius: 2, border: "none",
    background: "#fff", color: "#000", fontSize: 16, fontWeight: 800, cursor: "pointer",
    letterSpacing: "0.06em", textTransform: "uppercase",
  } as React.CSSProperties,
  secondary: {
    width: "100%", padding: "13px 0", borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
    color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600, cursor: "pointer",
  } as React.CSSProperties,
  back: {
    position: "absolute" as const, top: "calc(env(safe-area-inset-top,0px) + 14px)", left: 16,
    background: "none", border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.3)", padding: "6px 10px",
  },
  err: { fontSize: 13, color: "#f87171", lineHeight: 1.4 },
  warn: {
    fontSize: 13, color: "#fbbf24", lineHeight: 1.5,
    background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
    borderRadius: 2, padding: "12px 14px",
  } as React.CSSProperties,
};

export function disabledPrimary(disabled: boolean): React.CSSProperties {
  return disabled ? { ...S.primary, opacity: 0.4, cursor: "not-allowed" } : S.primary;
}

export function fmt(n: number): string {
  return n.toLocaleString();
}

export function digits(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

// ── Component ────────────────────────────────────────────────────────────────
