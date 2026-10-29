"use client";
// app/planner/modals/loading/RackWaitBar.tsx
//
// Plan Review, on a trip, before loading starts: Delay (pick why, a timer runs, long line / rack
// down / terminal issue also warn other drivers) and Begin Loading, tapped as the truck pulls under
// the rack. That tap is the load's real begin time. Once begun it just shows when.

import React, { useEffect, useState } from "react";
import { DelayButton } from "../../components/trip/DelayButton";
import { delayReasonLabel } from "@/lib/trips/delays";
import type { LoadingModel } from "./useLoadingModel";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function RackWaitBar({ m }: { m: LoadingModel }) {
  const rw = m.trip?.rackWait;
  const running = rw?.delay ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running && !rw?.beganAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, rw?.beganAt]);
  if (!rw || m.report) return null;

  if (rw.beganAt) {
    const ms = now - Date.parse(rw.beganAt);
    const long = ms >= 3600_000;
    return (
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "10px 2px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>Began loading {clock(rw.beganAt)}</span>
        <span style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: long ? "#fbbf24" : "#fff" }}>{mmss(ms)}</span>
      </div>
    );
  }
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      {running && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 8, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.55)", borderRadius: 2 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24", fontVariantNumeric: "tabular-nums" }}>{mmss(now - Date.parse(running.startedAt))}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Delay · {delayReasonLabel(running.code, running.note)}
          </span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {!running && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <DelayButton leg="at_rack" running={null} onStart={rw.onStartDelay} onEnd={() => undefined} />
          </div>
        )}
        <button type="button" onClick={rw.onBegin}
          style={{ flex: running ? 1 : 1.4, marginTop: running ? 0 : 8, padding: "12px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
          Begin Loading
        </button>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>Tap Begin Loading as you pull under the rack.</div>
    </div>
  );
}
