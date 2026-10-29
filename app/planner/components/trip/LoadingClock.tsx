"use client";
// app/planner/components/trip/LoadingClock.tsx
//
// How long this load has been loading (since Begin Loading), under the big step button.
// White, amber once it passes an hour.

import React, { useEffect, useState } from "react";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
};

export function LoadingClock({ since, label = "Loading" }: { since: string; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [since]);
  const ms = now - Date.parse(since);
  const long = ms >= 3600_000;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8, padding: "10px 12px", borderRadius: 2,
      border: `1px solid ${long ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.16)"}`, background: long ? "rgba(251,191,36,0.1)" : "transparent" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: long ? "#fbbf24" : "#fff" }}>{mmss(ms)}</span>
    </div>
  );
}
