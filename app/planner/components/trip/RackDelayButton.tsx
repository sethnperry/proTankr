"use client";
// app/planner/components/trip/RackDelayButton.tsx
//
// "Rack Delay" under STUD in the rack window, the same button Plan Review has: tap it to pick why the truck is held up;
// once a delay is running it shows the clock instead.

import React, { useEffect, useState } from "react";
import type { RunningDelay } from "@/lib/trips/delays";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
};

export function RackDelayButton({ running, onClick }: { running: RunningDelay | null; onClick: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const live = !!running && running.leg === "at_rack";
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);
  return (
    <button type="button" className="dash-press" onClick={onClick} disabled={live}
      style={{ width: "100%", marginTop: 8, padding: "13px 0", fontSize: 14, fontWeight: 700, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: live ? "#fbbf24" : "#fff", cursor: live ? "default" : "pointer" }}>
      {live ? <>Rack Delay · <span style={{ fontVariantNumeric: "tabular-nums" }}>{mmss(now - Date.parse(running!.startedAt))}</span></> : "Rack Delay"}
    </button>
  );
}
