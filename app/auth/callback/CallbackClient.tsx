"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const LOGO_PATH =
  "M 41.28,85.61 L40.14,85.38 L39.51,84.29 L39.51,29.70 L39.97,28.44 L41.86,27.35 L75.00,27.35 L76.43,26.38 L76.66,24.20 L74.77,22.76 L21.90,22.65 L19.15,21.62 L16.57,19.50 L9.12,11.24 L8.66,10.21 L8.89,8.72 L10.32,7.51 L75.11,7.40 L79.36,8.08 L82.91,9.58 L87.90,13.65 L91.34,19.72 L92.14,26.38 L91.46,30.05 L90.08,33.37 L85.67,38.70 L82.57,40.77 L79.13,42.14 L75.92,42.72 L55.85,42.72 L54.99,43.35 L54.42,72.36 L52.92,74.89 L41.28,85.61 Z";

function parseHashParams(hash: string) {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const sp = new URLSearchParams(h);
  const obj: Record<string, string> = {};
  sp.forEach((v, k) => (obj[k] = v));
  return obj;
}

export default function CallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"spin" | "settle">("spin");

  const nextPath = useMemo(() => searchParams.get("next") ?? "/planner", [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setPhase("settle"), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    if (hash && hash.includes("error=")) {
      const hp = parseHashParams(hash);
      const desc = hp.error_description ? decodeURIComponent(hp.error_description) : "";
      const code = hp.error_code ?? "";
      const err = hp.error ?? "access_denied";
      setError(
        `${err}${code ? ` (${code})` : ""}${desc ? ` — ${desc}` : ""}. Request a new link from the login page.`
      );
      return;
    }

    const code = searchParams.get("code");

    (async () => {
      if (code) {
        // PKCE flow (the client now forces flowType: "pkce" via
        // createBrowserClient) -- the emailed link carries ?code=, which
        // must be exchanged here, in the same browser that generated the
        // original code_verifier. Redirecting to /auth/confirm (as this
        // used to do) doesn't work: that page only ever reads token_hash,
        // never code, so the exchange has to happen right here.
        const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr || !data?.session) {
          setError("Auth error: " + (exErr?.message ?? "Could not complete sign-in."));
          return;
        }
      } else {
        const { data, error: authErr } = await supabase.auth.getSession();
        if (authErr) { setError("Auth error: " + authErr.message); return; }
        if (!data?.session) { setError("No session found. Open the newest magic link, or request a fresh one."); return; }
      }

      // Ensure every signed-in user has at least one company membership before
      // landing in the app. Idempotent -- a no-op for anyone already invited
      // into a real company (e.g. via /api/admin/invite, which creates their
      // user_companies row before they ever click the link).
      try {
        await supabase.rpc("provision_solo_company");
      } catch (err) {
        console.warn("provision_solo_company failed (non-fatal):", err);
      }

      router.replace(nextPath);
    })();
  }, [router, searchParams, nextPath]);

  const base = {
    minHeight: "100dvh" as const,
    display: "flex" as const,
    flexDirection: "column" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    background: "#111111",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "0 24px",
  };

  if (error) {
    return (
      <div style={base}>
        <div style={{ width: 48, height: 48, marginBottom: 20 }}>
          <svg viewBox="0 0 100 92.1" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
            <path d={LOGO_PATH} fill="white" />
          </svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.28)", marginBottom: 28 }}>
          ProTankr
        </div>
        <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, padding: "24px 28px", maxWidth: 380, width: "100%", textAlign: "center" as const }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            Link expired or already used
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 20 }}>
            {error}
          </div>
          <a href="/login" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", textDecoration: "underline" }}>
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={base}>
      <div style={{
        width: 72,
        height: 72,
        animation: phase === "spin" ? "pt-flip 0.9s ease-in-out forwards" : "none",
      }}>
        <svg viewBox="0 0 100 92.1" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
          <path d={LOGO_PATH} fill="white" />
        </svg>
      </div>
      <div style={{
        marginTop: 20,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.15em",
        textTransform: "uppercase" as const,
        color: "rgba(255,255,255,0.28)",
        opacity: phase === "spin" ? 0 : 1,
        transition: "opacity 0.3s ease 0.1s",
      }}>
        ProTankr
      </div>
      <div style={{
        marginTop: 8,
        fontSize: 13,
        color: "rgba(255,255,255,0.30)",
        opacity: phase === "spin" ? 0 : 1,
        transition: "opacity 0.3s ease 0.2s",
      }}>
        Signing you in…
      </div>
      <style>{`
        @keyframes pt-flip {
          0%   { transform: perspective(400px) rotateY(0deg) scaleX(1); }
          40%  { transform: perspective(400px) rotateY(-180deg) scaleX(0.85); }
          70%  { transform: perspective(400px) rotateY(-340deg) scaleX(1.05); }
          100% { transform: perspective(400px) rotateY(-360deg) scaleX(1); }
        }
      `}</style>
    </div>
  );
}
