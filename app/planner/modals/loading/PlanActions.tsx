"use client";
// app/planner/modals/loading/PlanActions.tsx
//
// Plan Review: Finish Loading, Rack Delay, Couldn't Load, Back to Planner.

import { useEffect, useState } from "react";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../../cards/cardTheme";
import type { LoadingModel } from "./useLoadingModel";

export function PlanActions({ m }: { m: LoadingModel }) {
  const {
    busy,
    loadedDisabled,
    loadedLabel,
    logLoadButtonRef,
    onBackToPlanner,
    onRackDelay,
    rackDelayStartedAt,
    onBeginLoading,
    loadingBegun,
    onCancelLoad,
    onUpdateCardOnly,
    startLogSequence,
    styles,
  } = m;
  const [confirmCancel, setConfirmCancel] = useState(false);
  // The running delay's clock, ticking once a second.
  const delayRunning = !!rackDelayStartedAt;
  const needsBegin = loadingBegun === false && !!onBeginLoading;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!rackDelayStartedAt) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [rackDelayStartedAt]);
  const clock = (() => {
    if (!rackDelayStartedAt) return "";
    const s = Math.max(0, Math.floor((now - Date.parse(rackDelayStartedAt)) / 1000));
    const two = (n: number) => String(n).padStart(2, "0");
    return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
  })();
  return (
    /* Action buttons -- the "next steps" that used to live in a separate
             sheet, now directly in the modal. */
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      <button
        ref={logLoadButtonRef}
        type="button"
        onClick={needsBegin ? onBeginLoading : startLogSequence}
        disabled={busy}
        aria-busy={busy}
        style={{ ...(styles as any).doneBtn, opacity: busy ? 0.55 : 1, width: "100%" }}
      >
        {needsBegin ? "Begin Loading" : loadedDisabled ? (loadedLabel ?? "Saving…") : "Finish Loading"}
      </button>

      <button
        type="button"
        onClick={onRackDelay}
        disabled={busy || delayRunning || !needsBegin || !onRackDelay}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 2,
          border: CARD_BORDER,
          background: CARD_BG,
          boxShadow: CARD_SHADOW,
          color: "rgba(255,255,255,0.90)",
          fontSize: 15,
          fontWeight: 700,
          cursor: delayRunning ? "default" : "pointer",
          opacity: busy ? 0.55 : 1,
        }}
      >
        {delayRunning ? <span style={{ color: "#fbbf24" }}>Rack Delay · <span style={{ fontVariantNumeric: "tabular-nums" }}>{clock}</span></span> : "Rack Delay"}
      </button>

      <button
        type="button"
        onClick={onUpdateCardOnly}
        disabled={busy}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 2,
          border: CARD_BORDER,
          background: CARD_BG,
          boxShadow: CARD_SHADOW,
          color: "rgba(255,255,255,0.90)",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          opacity: busy ? 0.55 : 1,
        }}
      >
        Couldn&apos;t Load
      </button>

      <button
        type="button"
        onClick={onBackToPlanner}
        disabled={busy}
        style={{
          width: "100%",
          padding: "10px 0",
          borderRadius: 2,
          border: "none",
          background: "transparent",
          color: "rgba(255,255,255,0.40)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          opacity: busy ? 0.55 : 1,
        }}
      >
        Back to Planner
      </button>

      {onCancelLoad && (!confirmCancel ? (
        <button type="button" onClick={() => setConfirmCancel(true)} disabled={busy}
          style={{ width: "100%", padding: "10px 0", border: "none", background: "transparent", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.55 : 1 }}>
          Cancel load
        </button>
      ) : (
        <div style={{ border: "1px solid rgba(248,113,113,0.55)", borderRadius: 2, padding: 12, background: "rgba(248,113,113,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Cancel this load?</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>It undoes the load and today&apos;s card update, and stops any delay timer.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setConfirmCancel(false)} style={{ flex: 1, padding: "11px 0", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", borderRadius: 2 }}>Keep it</button>
            <button type="button" onClick={() => { setConfirmCancel(false); onCancelLoad(); }} style={{ flex: 1, padding: "11px 0", border: "none", background: "#f87171", color: "#000", fontSize: 13, fontWeight: 900, cursor: "pointer", borderRadius: 2 }}>Cancel load</button>
          </div>
        </div>
      ))}
    </div>
  );
}
