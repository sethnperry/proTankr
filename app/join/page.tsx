// app/join/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function JoinPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [code, setCode] = useState<string>(sp.get("code") ?? "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const q = sp.get("code");
    if (q) setCode(q);
  }, [sp]);

  async function redeem(inviteCode: string) {
    setLoading(true);
    setMsg(null);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase.rpc("redeem_invite", {
        p_code: inviteCode.trim(),
      });

      if (error) throw error;

      // success: go to calculator
      router.replace("/calculator");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not redeem invite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Join a company</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Paste an invite code to join your company.
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite code (e.g. 8 chars)"
          autoCapitalize="characters"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #333",
          }}
        />
        <button
          onClick={() => redeem(code)}
          disabled={loading || code.trim().length < 4}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            cursor: "pointer",
          }}
        >
          {loading ? "Joining…" : "Join"}
        </button>
      </div>

      {msg && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #662",
            background: "#221",
          }}
        >
          {msg}
        </div>
      )}
    </main>
  );
}