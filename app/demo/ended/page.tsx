"use client";
// app/demo/ended/page.tsx
//
// Landed on when useDemoWatchdog signs the demo account out (someone else
// opened the demo link, or it timed out from inactivity), or when
// /api/demo/start itself fails. Visual language matches app/auth/confirm/page.tsx.
//
// Reads the query string directly (not next/navigation's useSearchParams)
// -- that hook's Suspense-based resolution produced a real client/server
// hydration mismatch here (the href briefly computed with the "alpha"
// default instead of the actual ?persona= in the URL). This page is only
// ever reached via a client-side redirect or a direct link click, so there's
// no SSR value worth reconciling -- reading window.location.search directly
// sidesteps the whole hydration question.

import { useEffect, useState } from "react";

const LOGO_PATH =
  "M 41.28,85.61 L40.14,85.38 L39.51,84.29 L39.51,29.70 L39.97,28.44 L41.86,27.35 L75.00,27.35 L76.43,26.38 L76.66,24.20 L74.77,22.76 L21.90,22.65 L19.15,21.62 L16.57,19.50 L9.12,11.24 L8.66,10.21 L8.89,8.72 L10.32,7.51 L75.11,7.40 L79.36,8.08 L82.91,9.58 L87.90,13.65 L91.34,19.72 L92.14,26.38 L91.46,30.05 L90.08,33.37 L85.67,38.70 L82.57,40.77 L79.13,42.14 L75.92,42.72 L55.85,42.72 L54.99,43.35 L54.42,72.36 L52.92,74.89 L41.28,85.61 Z";

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      background: "#111111",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {children}
    </div>
  );
}

function Logo({ size = 48 }: { size?: number }) {
  return (
    <>
      <div style={{ width: size, height: size, marginBottom: 16 }}>
        <svg viewBox="0 0 100 92.1" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
          <path d={LOGO_PATH} fill="white" />
        </svg>
      </div>
      <div style={{
        fontSize: 12, fontWeight: 700, letterSpacing: "0.15em",
        textTransform: "uppercase" as const, color: "rgba(255,255,255,0.28)", marginBottom: 28,
      }}>
        ProTankr
      </div>
    </>
  );
}

const COPY: Record<string, { title: string; body: string }> = {
  commandeered: {
    title: "This demo session was taken over",
    body: "Someone (maybe you, in another tab) opened the demo link again, which always takes over the active session. Only one demo session can be active at a time.",
  },
  idle: {
    title: "Demo session ended (inactivity)",
    body: "This demo session signed out automatically after a period of inactivity, so it's free for the next person to try.",
  },
  error: {
    title: "Couldn't start the demo",
    body: "Something went wrong generating a demo login link. Try again in a moment.",
  },
};

export default function DemoEndedPage() {
  // null until mounted client-side -- avoids ever rendering a guessed
  // default that could mismatch the real URL.
  const [query, setQuery] = useState<{ reason: string; persona: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery({ reason: params.get("reason") ?? "", persona: params.get("persona") ?? "alpha" });
  }, []);

  if (!query) return <Screen><Logo size={48} /></Screen>;

  const copy = COPY[query.reason] ?? { title: "Demo session ended", body: "This demo session is no longer active." };

  return (
    <Screen>
      <Logo size={48} />
      <div style={{
        background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2,
        padding: "24px 28px", maxWidth: 380, width: "100%", textAlign: "center" as const,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 12 }}>
          {copy.title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 20 }}>
          {copy.body}
        </div>
        <a
          href={`/api/demo/start?persona=${query.persona}`}
          style={{
            display: "block", padding: "13px 18px", borderRadius: 2, textDecoration: "none",
            background: "#fff", color: "#000", fontSize: 14, fontWeight: 700,
          }}
        >
          Start a new demo session
        </a>
      </div>
    </Screen>
  );
}
