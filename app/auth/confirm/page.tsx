"use client";
// app/auth/confirm/page.tsx

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const LOGO_PATH =
  "M 41.28,85.61 L40.14,85.38 L39.51,84.29 L39.51,29.70 L39.97,28.44 L41.86,27.35 L75.00,27.35 L76.43,26.38 L76.66,24.20 L74.77,22.76 L21.90,22.65 L19.15,21.62 L16.57,19.50 L9.12,11.24 L8.66,10.21 L8.89,8.72 L10.32,7.51 L75.11,7.40 L79.36,8.08 L82.91,9.58 L87.90,13.65 L91.34,19.72 L92.14,26.38 L91.46,30.05 L90.08,33.37 L85.67,38.70 L82.57,40.77 L79.13,42.14 L75.92,42.72 L55.85,42.72 L54.99,43.35 L54.42,72.36 L52.92,74.89 L41.28,85.61 Z";

// ── Detect Outlook / Office webviews ─────────────────────────────────────────
function isOutlookWebview(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    ua.includes("Outlook") ||
    ua.includes("outlook") ||
    ua.includes("OfficeWord") ||
    ua.includes("microsoft.office") ||
    ua.includes("MSMailApp") ||
    ua.includes("OfficeApp")
  );
}

// Every type any Supabase email template can send here. Drives both the
// verifyOtp call and the dead-end copy on the error screen -- an expired
// magic link must not tell a solo driver to "ask your administrator."
type LinkKind =
  | "invite" | "magiclink" | "recovery" | "signup" | "email" | "email_change";

// ── Inner component ───────────────────────────────────────────────────────────
function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error" | "webview">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind>("invite");

  useEffect(() => {
    if (isOutlookWebview()) {
      setStatus("webview");
      return;
    }

    async function exchange() {
      const tokenHash = params.get("token_hash");
      // "email_change" is what the Change Email Address template actually
      // sends -- it was missing here, so that link verified against the
      // wrong type. Kept alongside "email" rather than replacing it: both
      // are valid EmailOtpType values in the installed SDK.
      const type = (params.get("type") ?? "invite") as LinkKind;
      setLinkKind(type);

      if (!tokenHash) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          try { await supabase.rpc("provision_solo_company"); }
          catch (err) { console.warn("provision_solo_company failed (non-fatal):", err); }
          router.replace("/planner");
          return;
        }
        setErrMsg("No token found in this link. It may have already been used or has expired.");
        setStatus("error");
        return;
      }

      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) {
        setErrMsg(error.message ?? "This link is invalid or has expired.");
        setStatus("error");
        return;
      }

      // Ensure every signed-in user has at least one company membership before
      // landing in the app. Idempotent -- a no-op for anyone already invited
      // into a real company.
      try {
        await supabase.rpc("provision_solo_company");
      } catch (err) {
        console.warn("provision_solo_company failed (non-fatal):", err);
      }

      router.replace("/planner");
    }
    exchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") return <LoadingScreen />;
  if (status === "webview") return <WebviewScreen />;
  return <ErrorScreen msg={errMsg} kind={linkKind} />;
}

// ── Page export ───────────────────────────────────────────────────────────────
export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ConfirmInner />
    </Suspense>
  );
}

// ── Shared screen wrapper ─────────────────────────────────────────────────────
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

// ── Shared logo + wordmark ────────────────────────────────────────────────────
function Logo({ size = 48 }: { size?: number }) {
  return (
    <>
      <div style={{ width: size, height: size, marginBottom: 16 }}>
        <svg viewBox="0 0 100 92.1" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
          <path d={LOGO_PATH} fill="white" />
        </svg>
      </div>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.15em",
        textTransform: "uppercase" as const,
        color: "rgba(255,255,255,0.28)",
        marginBottom: 28,
      }}>
        ProTankr
      </div>
    </>
  );
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen() {
  const [phase, setPhase] = useState<"spin" | "settle">("spin");

  useEffect(() => {
    const t = setTimeout(() => setPhase("settle"), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <Screen>
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
    </Screen>
  );
}

// ── Outlook webview screen ────────────────────────────────────────────────────
function WebviewScreen() {
  return (
    <Screen>
      <Logo size={48} />
      <div style={{
        background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 2,
        padding: "24px 28px",
        maxWidth: 380,
        width: "100%",
        textAlign: "center" as const,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 12 }}>
          Open in Chrome to continue
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7, marginBottom: 20 }}>
          This link was opened inside Outlook. To sign in and install the app, open it in Chrome instead.
        </div>
        <div style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 2,
          padding: "14px 16px",
          textAlign: "left" as const,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom: 10,
          }}>
            How to open in Chrome
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 }}>
            Tap the <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>⋯</span> menu in the
            top-right corner of this screen, then choose{" "}
            <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>Open in browser</span>.
          </div>
        </div>
      </div>
    </Screen>
  );
}

// ── Error screen ──────────────────────────────────────────────────────────────
function ErrorScreen({ msg, kind }: { msg: string; kind: LinkKind }) {
  // A sign-in link that expires needs a way to get a new one, not an
  // instruction to contact an administrator the user may not have.
  const isSignIn =
    kind === "magiclink" || kind === "signup" || kind === "email" || kind === "recovery";
  return (
    <Screen>
      <Logo size={48} />
      <div style={{
        background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 2,
        padding: "24px 28px",
        maxWidth: 380,
        width: "100%",
        textAlign: "center" as const,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
          Link expired or already used
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 16 }}>
          {msg}
        </div>
        {isSignIn ? (
          <a
            href="/login"
            style={{
              display: "inline-block",
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 2,
              padding: "10px 18px",
            }}
          >
            Request a new link
          </a>
        ) : kind === "email_change" ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
            Start the email change again from Settings.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
            Ask your administrator to send a new invite.
          </div>
        )}
      </div>
    </Screen>
  );
}
