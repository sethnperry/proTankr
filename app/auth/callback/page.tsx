"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [msg, setMsg] = useState("Signing you in...");

  const nextPath = useMemo(() => searchParams.get("next") ?? "/calculator", [searchParams]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Supabase magic links typically arrive as PKCE: /auth/callback?code=...
        const code = searchParams.get("code");

        if (code) {
          setMsg("Completing sign-in...");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (!cancelled) setMsg(`Auth error: ${error.message}`);
            return;
          }

          if (!cancelled) router.replace(nextPath);
          return;
        }

        // Fallback for older/implicit flows: session tokens in URL hash.
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          if (!cancelled) setMsg("Auth error: " + error.message);
          return;
        }

        if (!data.session) {
          if (!cancelled) setMsg("No session found. Open the newest magic link, or request a fresh one.");
          return;
        }

        if (!cancelled) router.replace(nextPath);
      } catch (e: any) {
        if (!cancelled) setMsg("Auth error: " + (e?.message ?? String(e)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, nextPath]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signing in…</h1>
      <p style={{ marginTop: 12 }}>{msg}</p>
    </main>
  );
}
