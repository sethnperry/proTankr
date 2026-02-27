// app/join/JoinClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function JoinClient() {
  const router  = useRouter();
  const sp      = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [msg,    setMsg]    = useState("Setting up your account…");

  useEffect(() => {
    async function join() {
      try {
        // Give Supabase time to process the magic link token from the URL hash
        await new Promise(r => setTimeout(r, 1000));

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }

        const companyId = sp.get("company");

        // Set this company as active so the app loads it immediately
        if (companyId) {
          await supabase.rpc("set_active_company", { p_company_id: companyId });
        }

        // The invite API route already created the user_companies row —
        // no insert needed here. Just redirect.
        setStatus("success");
        setMsg("You're in! Redirecting…");
        setTimeout(() => router.replace("/profile"), 1000);

      } catch (e: any) {
        setStatus("error");
        setMsg(e?.message ?? "Something went wrong. Please contact your admin.");
      }
    }
    join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = status === "error" ? "#f87171" : status === "success" ? "#4ade80" : "rgba(255,255,255,0.7)";
  const icon  = status === "error" ? "✕" : status === "success" ? "✓" : "…";

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", padding: "40px 32px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", maxWidth: 360, width: "100%", margin: "0 16px" }}>
        <div style={{ fontSize: 48, marginBottom: 16, color }}>{icon}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 8 }}>
          {status === "loading" ? "Setting up your account" : status === "success" ? "Welcome aboard!" : "Something went wrong"}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{msg}</div>
        {status === "error" && (
          <button onClick={() => router.replace("/profile")}
            style={{ marginTop: 20, padding: "10px 20px", borderRadius: 10, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", fontSize: 14 }}>
            Go to app anyway
          </button>
        )}
      </div>
    </div>
  );
}
