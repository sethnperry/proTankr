"use client";
// app/planner/components/trip/DelayButton.tsx
//
// The Delay button under the big step button. Tap it when something is
// holding the truck up: pick why (the list depends on the leg), and a small
// timer runs until the driver taps it again or taps Arrive (at the rack: until Begin Loading in Plan Review). See lib/trips/delays.ts.

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

export type RackActions = { onAnotherRack: () => void; onCancelLoad: () => void };

function DelayCore({ leg, running, onStart, onEnd, rackActions, flush }: {
  leg: DelayLeg;
  /** Sits in a row with another button: no top margin or full width of its own. */
  flush?: boolean;
  running: RunningDelay | null;
  onStart: (code: string, note: string | null) => void;
  onEnd: () => void;
  /** At the rack before loading: the delay can't be tapped away, it ends at Begin Loading in Plan Review, when the driver
   *  leaves for another rack, or when the load is cancelled. The last two are right here. */
  rackActions?: RackActions;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
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

  if (running && running.leg === "at_rack" && rackActions) {
    const sb: React.CSSProperties = { flex: 1, padding: "11px 0", borderRadius: 2, fontSize: 13, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff" };
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ padding: "10px 12px", borderRadius: 2, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.55)", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="dash-num" style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24", fontVariantNumeric: "tabular-nums" }}>{mmss(now - Date.parse(running.startedAt))}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Delay · {delayReasonLabel(running.code, running.note)}</span>
        </div>
        {!confirmCancel ? (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button type="button" onClick={rackActions.onAnotherRack} style={sb}>Another rack</button>
            <button type="button" onClick={() => setConfirmCancel(true)} style={{ ...sb, color: "#f87171" }}>Cancel load</button>
          </div>
        ) : (
          <div style={{ marginTop: 6, padding: 12, border: "1px solid rgba(248,113,113,0.55)", borderRadius: 2, background: "rgba(248,113,113,0.06)" }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Cancel this load?</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>You'll be asked why. The delay timer stops.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setConfirmCancel(false)} style={sb}>Keep it</button>
              <button type="button" onClick={() => { setConfirmCancel(false); rackActions.onCancelLoad(); }} style={{ ...sb, background: "#f87171", color: "#000", border: "none" }}>Cancel load</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (running) {
    return (
      <button type="button" onClick={onEnd}
        style={{ width: "100%", marginTop: flush ? 0 : 8, padding: "10px 12px", borderRadius: 2, cursor: "pointer", textAlign: "left",
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
        style={{ width: "100%", marginTop: flush ? 0 : 8, padding: "10px 0", borderRadius: 2, cursor: "pointer", fontSize: 14, fontWeight: 700,
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


type CoreProps = Parameters<typeof DelayCore>[0];

/**
 * Delay on the left, Cancel load on the right. Either can be missing: some steps have no delay to log but a load can
 * still be cancelled there, and a load with product aboard can't be cancelled (park it or deliver it). Cancel asks
 * first; what follows (the reasons, then the odometer, time and place) is the page's own flow.
 */
export function DelayButton({ leg, onCancel, ...rest }: Omit<CoreProps, "leg" | "flush"> & { leg: DelayLeg | null; onCancel?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  // At the rack with a delay running, the core already carries Another rack and Cancel load.
  if (leg && rest.running && rest.running.leg === "at_rack" && rest.rackActions) return <DelayCore leg={leg} {...rest} />;
  if (!onCancel) return leg ? <DelayCore leg={leg} {...rest} /> : null;
  const sb: React.CSSProperties = { flex: 1, padding: "11px 0", borderRadius: 2, fontSize: 13, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff" };
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0 }}>{leg ? <DelayCore leg={leg} flush {...rest} /> : null}</div>
        <button type="button" onClick={() => setConfirm(true)}
          style={{ flex: 1, padding: "10px 0", borderRadius: 2, cursor: "pointer", fontSize: 14, fontWeight: 700, background: "transparent", border: "1px solid rgba(248,113,113,0.5)", color: "#f87171" }}>
          Cancel load
        </button>
      </div>
      {confirm && (
        <div style={{ marginTop: 8, padding: 12, border: "1px solid rgba(248,113,113,0.55)", borderRadius: 2, background: "rgba(248,113,113,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Cancel this load?</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>You'll be asked why, then to confirm the odometer. The empty run starts from here.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setConfirm(false)} style={sb}>Keep it</button>
            <button type="button" onClick={() => { setConfirm(false); onCancel(); }} style={{ ...sb, background: "#f87171", color: "#000", border: "none" }}>Cancel load</button>
          </div>
        </div>
      )}
    </>
  );
}
