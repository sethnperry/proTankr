"use client";
// app/approve/[token]/page.tsx
//
// What an emailed approve or deny link opens. It only shows the request and a button: opening the link does
// nothing, so a scanner that pre-fetches it can't decide. The decision is the tap, and the first one is final.

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Info = { valid: true; decision: "approve" | "deny"; title: string; lines: string[] } | { valid: false; reason: "unknown" | "used" | "expired" };

const WHY: Record<string, string> = {
  unknown: "This link isn't valid.",
  used: "This request has already been decided. The first decision is final.",
  expired: "This link has expired. Ask for a new request.",
};

export default function ApprovePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/approvals?token=${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => r.json()).then(setInfo).catch(() => setErr("Couldn't check this link."));
  }, [token]);

  const decide = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json();
      if (j.ok) setDone(j.decision === "approve" ? "Approved. Thank you." : "Denied. Thank you.");
      else setErr(WHY[j.reason] ?? "Couldn't record the decision.");
    } catch { setErr("Couldn't record the decision."); }
    setBusy(false);
  };

  const box: React.CSSProperties = { maxWidth: 460, margin: "0 auto", padding: "40px 20px", color: "#fff" };
  return (
    <div style={{ minHeight: "100dvh", background: "#0b0b0b", fontFamily: "Outfit, Arial, sans-serif" }}>
      <div style={box}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>ProTankr</div>
        {err && !info && <div style={{ marginTop: 20, color: "#f87171" }}>{err}</div>}
        {!info && !err && <div style={{ marginTop: 20, color: "rgba(255,255,255,0.5)" }}>Checking…</div>}
        {info && !info.valid && <div style={{ marginTop: 20, fontSize: 17 }}>{WHY[info.reason]}</div>}
        {info && info.valid && !done && (
          <>
            <div style={{ marginTop: 18, fontSize: 24, fontWeight: 800 }}>{info.title}</div>
            <div style={{ marginTop: 12, background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)", padding: 14 }}>
              {info.lines.map((l, i) => <div key={i} style={{ fontSize: 16, marginTop: i ? 6 : 0 }}>{l}</div>)}
            </div>
            <button type="button" onClick={() => void decide()} disabled={busy}
              style={{ width: "100%", marginTop: 18, padding: "16px 0", border: "none", background: info.decision === "approve" ? "#fff" : "#050505", color: info.decision === "approve" ? "#000" : "#fff", outline: info.decision === "approve" ? "none" : "1px solid rgba(255,255,255,0.3)", fontSize: 16, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : info.decision === "approve" ? "Approve this request" : "Deny this request"}
            </button>
            {err && <div style={{ marginTop: 12, color: "#f87171" }}>{err}</div>}
            <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Nothing happens until you tap. The first decision is final.</div>
          </>
        )}
        {done && <div style={{ marginTop: 22, fontSize: 20, fontWeight: 800 }}>{done}</div>}
      </div>
    </div>
  );
}
