"use client";
// app/planner/components/fuel/VaultUnlockInline.tsx
//
// A small passphrase box so a driver can unlock the Vault without leaving the fuel screen. The key is kept
// in memory only (lib/vault/session.ts) and locks itself after a few idle minutes.

import React, { useState } from "react";
import { unlockVault } from "@/lib/vault/client";
import { bioEnrolled, unlockWithBio } from "@/lib/vault/biometric";

export function VaultUnlockInline({ userId }: { userId: string }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (!pass) return;
    setBusy(true); setErr(null);
    try { await unlockVault(userId, pass); setPass(""); } catch (e: any) { setErr(e?.message ?? "Couldn't unlock."); }
    setBusy(false);
  };
  const bio = async () => {
    setBusy(true); setErr(null);
    try { await unlockWithBio(userId); } catch (e: any) { setErr(e?.message ?? "Fingerprint unlock didn't work."); }
    setBusy(false);
  };
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.14)", padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>Your Vault is locked. Unlock it to show the name and PIN.</div>
      {bioEnrolled(userId) && (
        <button type="button" disabled={busy} onClick={() => void bio()} style={{ width: "100%", padding: "10px 0", marginBottom: 8, borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Unlock with fingerprint / face</button>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Vault passphrase" autoComplete="off"
          onKeyDown={(e) => { if (e.key === "Enter") void go(); }}
          style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 15, boxSizing: "border-box" }} />
        <button type="button" aria-busy={busy} disabled={busy || !pass} onClick={() => void go()}
          style={{ padding: "10px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: !pass ? 0.5 : 1 }}>{busy ? "…" : "Unlock"}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: "#f87171", marginTop: 6 }}>{err}</div>}
    </div>
  );
}
