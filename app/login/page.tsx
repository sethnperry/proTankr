"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email.");
      return;
    }

    setSending(true);
    try {
      const origin =
  typeof window !== "undefined"
    ? window.location.hostname === "localhost"
      ? window.location.origin
      : "https://www.protankr.com"
    : undefined;

const emailRedirectTo = origin
  ? `${origin}/auth/callback?next=${encodeURIComponent("/calculator")}`
  : undefined;

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo },
      });

      if (otpError) throw otpError;

      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send magic link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Login</h1>

      {error && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: "rgba(255,0,0,0.08)" }}>
          {error}
        </div>
      )}

      {sent ? (
        <div style={{ padding: 12, borderRadius: 10, background: "rgba(0,255,0,0.08)" }}>
          Magic link sent. Check your email and open the link to finish signing in.
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              inputMode="email"
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={sending}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
        After signing in you’ll be redirected to: <code>/calculator</code>
      </div>
    </main>
  );
}