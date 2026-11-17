"use client";
// app/planner/components/standby/StandbySheet.tsx
//
// A driver's Standby window (opened from the Shift sheet): their cycle time left, a calculator that previews a block of
// extra hours (what's left after it, when it runs out, when the 34-hour reset completes), sign up, and where they
// stand on each market list. Signing up is a promise to be reachable and fit to drive; the bench (past the wanted
// number) is free until the list opens up.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DateTimePopout, formatDateTime } from "@/lib/ui/DateTimePopout";
import { useDashLook } from "@/app/planner/home/dashLook";
import { fmtHours, hosPreview, type RecapDayLite } from "@/lib/standby/hosPreview";
import { useMyStandby } from "@/lib/standby/useStandby";

const HOURS = [2, 4, 6, 8, 10, 12, 14];

function tomorrowAt(h: number): number {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d.getTime();
}
const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

export function StandbySheet({ open, onClose, userId, companyId, cycleLeftMin, recapDays, tz }: {
  open: boolean; onClose: () => void; userId: string | null; companyId: string | null;
  cycleLeftMin: number | null; recapDays: RecapDayLite[]; tz?: string;
}) {
  const L = useDashLook();
  const mine = useMyStandby(userId, companyId, open);
  const [startMs, setStartMs] = useState(() => tomorrowAt(6));
  const [hours, setHours] = useState(10);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endMs = startMs + hours * 3600_000;
  const p = useMemo(() => hosPreview({ recapDays, startMs, endMs, tz }), [recapDays, startMs, endMs, tz]);
  const haveHos = recapDays.length > 0;
  const card: React.CSSProperties = { ...L.secondary, padding: "12px 14px", marginBottom: 10 };
  const row = (label: string, value: React.ReactNode, color?: string) => (
    <div className="dash-num" style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: 15 }}>
      <span style={{ color: L.muted }}>{label}</span><b style={{ color: color ?? "#fff", textAlign: "right" }}>{value}</b>
    </div>
  );
  const chip = (on: boolean): React.CSSProperties => ({ flex: 1, minWidth: 44, padding: "11px 0", cursor: "pointer", fontSize: 14, fontWeight: 800, borderRadius: 2, border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.18)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

  const signUp = async () => {
    setBusy(true); setErr(null);
    const e = await mine.add(startMs, endMs);
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <>
      <FullscreenModal open={open && !picking} title="Standby" onClose={onClose} footer={null}>
        <div style={{ ...card }}>
          <div style={{ ...L.sectionLabel }}>Cycle time left</div>
          <div className="dash-num" style={{ fontSize: 34, fontWeight: 900, marginTop: 4 }}>
            {cycleLeftMin != null ? fmtHours(cycleLeftMin) : "—"}<span style={{ fontSize: 13, color: L.muted, fontWeight: 600 }}> h</span>
          </div>
          {!haveHos && <div style={{ fontSize: 12, color: L.muted, marginTop: 4 }}>Your hours aren't connected, so the preview below can't count your cycle. You can still sign up.</div>}
        </div>

        {mine.signups.length > 0 && (
          <>
            <div style={{ ...L.sectionLabel, margin: "16px 0 8px" }}>Your standby</div>
            {mine.signups.map((s) => (
              <div key={s.signup_id} style={card}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <b style={{ flex: 1, fontSize: 15 }}>{when(Date.parse(s.start_at))} to {when(Date.parse(s.end_at))}</b>
                  <button type="button" onClick={() => void mine.withdraw(s.signup_id)} style={{ background: "none", border: "none", color: "#f87171", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Withdraw</button>
                </div>
                {s.positions.length === 0 && <div style={{ fontSize: 13, color: L.muted, marginTop: 6 }}>No standby list covers your local area yet. Dispatch will see your offer.</div>}
                {s.positions.map((x) => {
                  const on = x.position <= x.required;
                  return (
                    <div key={x.market_id} style={{ marginTop: 8, fontSize: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ color: L.muted }}>{x.market_name}</span>
                        <b style={{ color: on ? "#4ade80" : "#fbbf24" }}>#{x.position} of {x.total}</b>
                      </div>
                      <div style={{ fontSize: 12, color: on ? "#4ade80" : "#fbbf24", marginTop: 2 }}>
                        {on ? `You're on call (${x.required} wanted). Be reachable and fit to drive.` : `You're on the bench: nobody needs you unless the list opens up (${x.required} wanted).`}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}

        <div style={{ ...L.sectionLabel, margin: "16px 0 8px" }}>Offer extra hours</div>
        <button type="button" onClick={() => setPicking(true)} style={{ ...card, width: "100%", textAlign: "left", cursor: "pointer", color: "#fff", display: "flex", justifyContent: "space-between", fontSize: 15 }}>
          <span style={{ color: L.muted }}>Starts</span><b>{formatDateTime(startMs)} ›</b>
        </button>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {HOURS.map((h) => <button key={h} type="button" onClick={() => setHours(h)} style={chip(hours === h)}>{h}h</button>)}
        </div>

        <div style={card}>
          {row("Ends", when(endMs))}
          {haveHos && (
            <>
              {row("Cycle left when you start", `${fmtHours(p.availableAtStartMin)} h`)}
              {p.runsOutAtMs != null
                ? row("Cycle runs out", `${when(p.runsOutAtMs)} (${fmtHours(p.shortByMin)} h of this block don't fit)`, "#f87171")
                : row("Cycle left after the block", `${fmtHours(p.leftAfterMin)} h`, p.leftAfterMin < 120 ? "#fbbf24" : "#4ade80")}
              {row("34-hour reset done", when(p.restartDoneAtMs))}
              {p.over14 && <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 4 }}>A block over 14 hours is longer than your on-duty window.</div>}
              <div style={{ fontSize: 11, color: L.muted, marginTop: 6 }}>An estimate: it assumes the whole block is worked and nothing else is planned. Hours from 8 days ago drop off your cycle on their own.</div>
            </>
          )}
        </div>
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <button type="button" disabled={busy || endMs <= Date.now()} aria-busy={busy} onClick={() => void signUp()}
          style={{ width: "100%", padding: "17px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", background: "#fff", color: "#000", border: "none", cursor: "pointer", borderRadius: 2, opacity: busy ? 0.6 : 1 }}>
          Sign up for standby
        </button>
      </FullscreenModal>
      <DateTimePopout open={open && picking} title="Standby starts" valueMs={startMs} onSet={(ms) => { setStartMs(ms); setPicking(false); }} onCancel={() => setPicking(false)} />
    </>
  );
}
