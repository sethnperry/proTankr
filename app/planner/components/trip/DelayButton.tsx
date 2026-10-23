"use client";
// app/planner/components/trip/DelayButton.tsx
//
// The Delay button under the big step button. Tap it when something is
// holding the truck up: pick why (the list depends on the leg), and a small
// timer runs until the driver taps it again or taps Arrive. See lib/trips/delays.ts.

import React, { useEffect, useState } from "react";
import { DELAY_REASONS, LEG_LABEL, OTHER_CODE, delayReasonLabel, type DelayLeg, type RunningDelay } from "@/lib/trips/delays";
import { fieldInput, muted } from "./tripUi";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
};

export function DelayButton({ leg, running, onStart, onEnd }: {
  leg: DelayLeg;
  running: RunningDelay | null;
  onStart: (code: string, note: string | null) => void;
  onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState(false);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const close = () => { setOpen(false); setOther(false); setNote(""); };
  const pick = (code: string) => {
    if (code === OTHER_CODE) return setOther(true);
    onStart(code, null);
    close();
  };

  if (running) {
    return (
      <button type="button" onClick={onEnd}
        style={{ width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 2, cursor: "pointer", textAlign: "left",
          background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.55)", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
        <span className="dash-num" style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24", fontVariantNumeric: "tabular-nums" }}>{mmss(now - Date.parse(running.startedAt))}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Delay · {delayReasonLabel(running.code, running.note)}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24" }}>End</span>
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 2, cursor: "pointer", fontSize: 14, fontWeight: 700,
          background: "transparent", border: "1px solid rgba(255,255,255,0.16)", color: "rgba(255,255,255,0.7)" }}>
        Delay
      </button>
      {open && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, maxHeight: "calc(100dvh - 48px)", overflowY: "auto", boxSizing: "border-box", background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, letterSpacing: 0.4, textTransform: "uppercase" }}>What's holding you up?</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 2 }}>{LEG_LABEL[leg]}. The timer runs until you tap it again or tap Arrive.</div>
            {!other && (
              <>
                {DELAY_REASONS[leg].map((r) => (
                  <button key={r.code} type="button" onClick={() => pick(r.code)}
                    style={{ textAlign: "left", padding: "13px 12px", borderRadius: 2, fontSize: 15, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "#fff" }}>
                    {r.label}
                  </button>
                ))}
                <button type="button" onClick={() => pick(OTHER_CODE)}
                  style={{ textAlign: "left", padding: "13px 12px", borderRadius: 2, fontSize: 15, fontWeight: 600, cursor: "pointer", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "rgba(255,255,255,0.75)" }}>
                  Other…
                </button>
              </>
            )}
            {other && (
              <>
                <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's the delay?" style={fieldInput} />
                <button type="button" disabled={!note.trim()} onClick={() => { onStart(OTHER_CODE, note.trim()); close(); }}
                  style={{ padding: "13px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", opacity: note.trim() ? 1 : 0.5 }}>
                  Start timer
                </button>
              </>
            )}
            <button type="button" onClick={close}
              style={{ padding: "11px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
