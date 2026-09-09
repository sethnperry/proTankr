"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

/**
 * A throwaway, implicit-flow client used ONLY to fire signInWithOtp below --
 * never for reading/holding a session (persistSession: false, no storage
 * writes). The shared `supabase` singleton forces flowType: "pkce" (via
 * createBrowserClient, see lib/supabase/client.ts), which means the emailed
 * magic link needs the code_verifier cookie from this exact browser to
 * complete -- fine on the same device/browser, but breaks the moment the
 * link is opened somewhere else. Sending the OTP request through an
 * implicit-flow client instead makes the resulting magic LINK carry session
 * tokens directly in the URL fragment, so it completes wherever it's opened.
 *
 * The 6-digit CODE path below does NOT go through this client -- it verifies
 * on the shared `supabase` client so the resulting session is written to
 * cookies for THIS context (crucially, the installed PWA). A code the driver
 * types in never opens in the wrong browser and never loses its session --
 * that's why it's the primary, most reliable path for invited drivers.
 */
const otpUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const otpKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const otpOnlyClient = createClient(otpUrl, otpKey, {
  auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export default function LoginPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) { router.replace("/planner"); return; }
      setCheckingSession(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  function validEmail() {
    const t = email.trim();
    if (!t) { setError("Please enter your email."); return null; }
    return t;
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null); setLinkSent(false);
    const trimmed = validEmail(); if (!trimmed) return;
    setSendingLink(true);
    try {
      const siteUrl =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
          ? "http://localhost:3000"
          : "https://www.protankr.com";
      const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent("/planner")}`;
      const { error: otpError } = await otpOnlyClient.auth.signInWithOtp({ email: trimmed, options: { emailRedirectTo } });
      if (otpError) throw otpError;
      setLinkSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send magic link.");
    } finally { setSendingLink(false); }
  }

  // Ask Supabase to email a fresh sign-in code. (Invited drivers already have
  // one in their invite email; this is the "resend / self-serve" path.)
  async function sendCode() {
    setError(null); setNotice(null);
    const trimmed = validEmail(); if (!trimmed) return;
    setSendingCode(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: trimmed, options: { shouldCreateUser: false } });
      if (otpError) throw otpError;
      setCodeSent(true);
      setNotice(`We emailed a sign-in code to ${trimmed}. Enter it above.`);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't send a code. Check the email and try again.");
    } finally { setSendingCode(false); }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null);
    const trimmed = validEmail(); if (!trimmed) return;
    const token = code.replace(/\D/g, "");
    if (token.length < 6) { setError("Enter the code from your email."); return; }
    setVerifying(true);
    try {
      // type 'email' verifies both signInWithOtp and generateLink(magiclink/invite)
      // codes; fall back through the other types for robustness.
      let ok = false, lastErr: any = null;
      for (const type of ["email", "magiclink", "invite"] as const) {
        const { data, error: vErr } = await supabase.auth.verifyOtp({ email: trimmed, token, type });
        if (!vErr && data.session) { ok = true; break; }
        lastErr = vErr;
      }
      if (!ok) throw lastErr ?? new Error("That code didn't work.");
      // provision a solo company for a brand-new driver (no-op if they already
      // have one), matching /auth/confirm's behavior, then into the app.
      try { await supabase.rpc("provision_solo_company"); } catch { /* non-fatal */ }
      router.replace("/planner");
    } catch (err: any) {
      const msg = /expired|invalid|token/i.test(err?.message ?? "")
        ? "That code is wrong or expired. Request a new one below."
        : (err?.message ?? "Sign-in failed.");
      setError(msg);
    } finally { setVerifying(false); }
  }

  if (checkingSession) {
    return <main style={wrap}><div style={{ color: "rgba(255,255,255,0.55)" }}>Checking session…</div></main>;
  }

  return (
    <main style={wrap}>
      <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900 }}>Sign in</h1>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
        Enter your email, then the code from your ProTankr email.
      </p>

      {error && <div style={banner("rgba(255,60,60,0.12)", "#ff8080")}>{error}</div>}
      {notice && <div style={banner("rgba(60,200,120,0.12)", "#7ee2a8")}>{notice}</div>}

      <label style={label}>Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com" autoComplete="email" inputMode="email" style={input} />
      </label>

      {/* Primary: 6-digit code (reliable everywhere -- no link opening in the wrong app). */}
      <form onSubmit={verifyCode}>
        <label style={label}>Sign-in code
          <input type="text" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="Code from your email" autoComplete="one-time-code" inputMode="numeric"
            style={{ ...input, letterSpacing: 4, fontWeight: 800, fontSize: 20 }} />
        </label>
        <button type="submit" disabled={verifying} style={primaryBtn(verifying)}>
          {verifying ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <button type="button" onClick={sendCode} disabled={sendingCode}
        style={{ ...linkBtn, marginTop: 12 }}>
        {sendingCode ? "Sending…" : codeSent ? "Resend code" : "Email me a code"}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 14px" }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>or</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
      </div>

      {linkSent ? (
        <div style={banner("rgba(60,200,120,0.10)", "#7ee2a8")}>
          Magic link sent. Open it on this device to finish signing in.
        </div>
      ) : (
        <form onSubmit={sendMagicLink}>
          <button type="submit" disabled={sendingLink} style={secondaryBtn(sendingLink)}>
            {sendingLink ? "Sending…" : "Email me a magic link instead"}
          </button>
        </form>
      )}
    </main>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 420, margin: "40px auto", padding: 20,
  fontFamily: "var(--font-outfit), Outfit, Helvetica, Arial, sans-serif", color: "#fff",
};
const label: React.CSSProperties = {
  display: "block", marginBottom: 14, fontSize: 12, fontWeight: 700,
  letterSpacing: 0.4, textTransform: "uppercase", color: "rgba(255,255,255,0.5)",
};
const input: React.CSSProperties = {
  display: "block", width: "100%", marginTop: 6, padding: "12px 14px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
  color: "#fff", fontSize: 15, boxSizing: "border-box",
};
function primaryBtn(disabled: boolean): React.CSSProperties {
  return { width: "100%", padding: "13px 12px", borderRadius: 10, border: "none",
    background: "#fff", color: "#000", fontWeight: 800, fontSize: 15,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 };
}
function secondaryBtn(disabled: boolean): React.CSSProperties {
  return { width: "100%", padding: "12px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
    color: "rgba(255,255,255,0.8)", fontWeight: 600, fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 };
}
const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: "rgba(255,255,255,0.6)",
  fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline",
};
function banner(bg: string, color: string): React.CSSProperties {
  return { marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: bg, color, fontSize: 13, lineHeight: 1.5 };
}
