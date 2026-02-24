"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

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
  const [msg, setMsg] = useState("Signing you in…");

  const nextPath = useMemo(() => searchParams.get("next") ?? "/calculator", [searchParams]);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    // Handle hash errors (otp_expired etc.)
    if (hash && hash.includes("error=")) {
      const hp = parseHashParams(hash);
      const desc = hp.error_description ? decodeURIComponent(hp.error_description) : "";
      const code = hp.error_code ?? "";
      const err = hp.error ?? "access_denied";

      let m = "Magic link error: " + err;
      if (code) m += " (" + code + ")";
      if (desc) m += " — " + desc;
      m += ". Request a new link.";

      setMsg(m);
      return;
    }

    const code = searchParams.get("code");
    if (code) {
      setMsg("Completing sign-in…");
      const url =
        "/auth/confirm?code=" +
        encodeURIComponent(code) +
        "&next=" +
        encodeURIComponent(nextPath);

      window.location.replace(url);
      return;
    }

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setMsg("Auth error: " + error.message);
        return;
      }
      if (!data.session) {
        setMsg("No session found. Open the newest magic link or request a new one.");
        return;
      }
      router.replace(nextPath);
    })();
  }, [router, searchParams, nextPath]);

  return (
    <main style={{ padding: 24, maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signing in…</h1>
      <p style={{ marginTop: 12 }}>{msg}</p>
      <div style={{ marginTop: 16 }}>
        <a href="/login" style={{ textDecoration: "underline" }}>
          Back to login
        </a>
      </div>
    </main>
  );
}
