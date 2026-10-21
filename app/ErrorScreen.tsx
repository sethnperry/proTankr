"use client";
// app/ErrorScreen.tsx
//
// What the app shows when a screen crashes, instead of Next's blank
// "Application error". Says what broke (the message and top of the stack, with a
// Copy button, since a phone has no console), and offers Try again / Reload.
// A stale-build error (the app was open across a deploy and a script it needs
// is gone) reloads itself once, which is the fix.

import React, { useEffect, useState } from "react";

const STALE = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const text = [error?.message, error?.digest ? `digest ${error.digest}` : null, (error?.stack ?? "").split("\n").slice(0, 4).join("\n")].filter(Boolean).join("\n");
  const stale = STALE.test(`${error?.name} ${error?.message}`);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error("[app error]", error);
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem("proTankr:staleReload") ?? 0);
      if (Date.now() - last > 60_000) { sessionStorage.setItem("proTankr:staleReload", String(Date.now())); window.location.reload(); }
    } catch { window.location.reload(); }
  }, [error, stale]);

  const btn: React.CSSProperties = { padding: "12px 18px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" };
  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{stale ? "Updating the app…" : "Something went wrong"}</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 8, maxWidth: 420, lineHeight: 1.5 }}>
        {stale ? "A new version came out while the app was open. Reloading." : "Your data is safe. Try again, or reload the app."}
      </div>
      {!stale && (
        <pre style={{ marginTop: 16, maxWidth: "92vw", maxHeight: 160, overflow: "auto", textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)", padding: 10, borderRadius: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</pre>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", justifyContent: "center" }}>
        {reset && <button type="button" style={btn} onClick={reset}>Try again</button>}
        <button type="button" style={{ ...btn, background: "#fff", color: "#000", border: "none" }} onClick={() => window.location.reload()}>Reload</button>
        {!stale && <button type="button" style={btn} onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy details"}</button>}
      </div>
    </div>
  );
}
