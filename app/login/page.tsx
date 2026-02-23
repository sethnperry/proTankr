"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"link" | "code">("link");

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const nextPath = useMemo(() => searchParams.get("next") ?? "/calculator", [searchParams]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      if (!normalizedEmail.includes("@")) {
        setStatus("Please enter a valid email address.");
        return;
      }

      // Must be allow-listed in Supabase Auth settings.
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo,
          shouldCreateUser: true,
        },
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      setStatus(
        "Email sent. Use the magic link OR switch to “Enter code” and paste the 6-digit code from the email."
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      if (!normalizedEmail.includes("@")) {
        setStatus("Enter the same email you requested the code for.");
        return;
      }

      const token = code.replace(/\s+/g, "");
      if (token.length < 4) {
        setStatus("Enter the 6-digit code from the email.");
        return;
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "magiclink",
      });

      if (error) {
        setStatus(error.message);
        return;
      }

      if (!data?.session) {
        setStatus("No session returned. Try requesting a fresh code and entering it again.");
        return;
      }

      router.replace(nextPath);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 440 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Sign in</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Enter your email. We’ll send a magic link, and you can also sign in using the 6-digit code from the email.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          type="button"
          onClick={() => setMode("link")}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: mode === "link" ? "rgba(255,255,255,0.10)" : "transparent",
            color: "white",
            cursor: "pointer",
          }}
        >
          Magic link
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: mode === "code" ? "rgba(255,255,255,0.10)" : "transparent",
            color: "white",
            cursor: "pointer",
          }}
        >
          Enter code
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          style={{
            width: "100%",
            padding: 12,
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.25)",
            color: "white",
            outline: "none",
          }}
        />
      </div>

      {mode === "link" ? (
        <form onSubmit={sendMagicLink} style={{ marginTop: 12 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 10,
              padding: 12,
              width: "100%",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: loading ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Sending…" : "Send magic link"}
          </button>

          <p style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
            After sign-in you’ll go to: <b>{nextPath}</b>
          </p>
        </form>
      ) : (
        <form onSubmit={verifyCode} style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 13, opacity: 0.8, marginBottom: 6 }}>6-digit code</label>
          <input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            style={{
              width: "100%",
              padding: 12,
              fontSize: 16,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              outline: "none",
              letterSpacing: 2,
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 10,
              padding: 12,
              width: "100%",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: loading ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Verifying…" : "Sign in with code"}
          </button>

          <p style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
            Use the newest email. Codes and links are single-use and can expire quickly.
          </p>
        </form>
      )}

      {status && <p style={{ marginTop: 12, opacity: 0.9 }}>{status}</p>}
    </main>
  );
}
