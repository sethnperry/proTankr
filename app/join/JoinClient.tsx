// app/join/JoinClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function JoinClient() {
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

      const { error } = await supabase.rpc("redeem_invite", {
        p_code: inviteCode.trim(),
      });

      if (error) throw error;

      router.replace("/calculator");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not redeem invite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: 0, marginBottom: 12 }}>Join</h1>

      {msg ? <div style={{ color: "#f88", marginBottom: 12 }}>{msg}</div> : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite code"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "#000",
            color: "#fff",
            border: "1px solid #333",
            width: 260,
          }}
        />
        <button
          onClick={() => redeem(code)}
          disabled={loading || !code.trim()}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "#111",
            color: "#fff",
            border: "1px solid #333",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Joining…" : "Join"}
        </button>
      </div>
    </div>
  );
}