"use client";
// app/planner/components/shift/ConfirmDay.tsx
//
// "Confirm your day": a running empty move (and its shift) that nobody answered for. The server never closes a move on its own
// (it can't know when the driver stopped, or the miles); it flags the shift "needs confirmation" (see lib/shifts/autoEndServer.ts).
// The next time the driver opens the app this card shows. A short sequence, each answer prefilled so the usual case is a few
// taps: did the move end, when, the ending odometer, and whether to end the shift at that time. Geotab, when connected and
// switched on, only fills defaults (the time the driver went off duty, the odometer then, with the green check).

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DateTimePopout, formatDateTime } from "@/lib/ui/DateTimePopout";
import { supabase } from "@/lib/supabase/client";
import { tfetch } from "@/lib/telematics/switch";
import { matchesTracker } from "@/lib/telematics/odometerSync";
import { odometerProblem, parseOdometer } from "@/lib/moves/emptyMoves";
import { flaggedForConfirm } from "@/lib/shifts/confirmDay";
import { useDashLook } from "@/app/planner/home/dashLook";
import { TrackerCheck } from "../TrackerCheck";
import type { EmptyMoveRow } from "@/lib/trips/types";
import type { HosAvailability } from "@/lib/telematics/types";

const OFF = new Set(["OFF", "SB", "PC"]);
export type ConfirmAnswers = { moveEndAt: string; odometer: number; endShift: boolean; shiftEndAt: string };

type ShiftLike = { current: { startedAt: string; events: { event_type: string; occurred_at: string }[] } | null };

export function ConfirmDay({ shift, move, truckId, myHos, onConfirm, onStillMoving }: {
  shift: ShiftLike;
  /** The running empty move, if any. */
  move: EmptyMoveRow | null;
  truckId: string | null;
  myHos: HosAvailability | null;
  onConfirm: (a: ConfirmAnswers) => void;
  onStillMoving: () => void;
}) {
  const L = useDashLook();
  const show = !!move && flaggedForConfirm(shift.current?.events ?? []);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"ended" | "when" | "shift">("ended");
  const [atMs, setAtMs] = useState(() => Date.now());
  const [odo, setOdo] = useState("");
  const [geoOdo, setGeoOdo] = useState<number | null>(null);
  const [geoTime, setGeoTime] = useState(false);
  const [shiftAtMs, setShiftAtMs] = useState(() => Date.now());
  const [pickingFor, setPickingFor] = useState<"move" | "shift" | null>(null);
  const [typing, setTyping] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Defaults when the sequence opens: when Geotab says the driver went off duty (after the move began), else now.
  const offAt = useMemo(() => {
    if (!myHos?.status || !OFF.has(myHos.status) || !myHos.statusSince) return null;
    const t = Date.parse(myHos.statusSince);
    return Number.isFinite(t) && move && t > Date.parse(move.started_at) && t <= Date.now() ? t : null;
  }, [myHos?.status, myHos?.statusSince, move?.started_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = () => {
    const t = offAt ?? Date.now();
    setAtMs(t); setShiftAtMs(t); setGeoTime(offAt != null); setStep("ended"); setErr(null); setTyping(false);
    setOdo(""); setGeoOdo(null);
    setOpen(true);
  };

  // The odometer at that moment, from Geotab's history (one call, only when the truck is linked and telematics is on).
  useEffect(() => {
    if (!open || !move || !truckId || step === "ended") return;
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const from = new Date(Date.parse(move.started_at)).toISOString(), to = new Date(Math.max(atMs, Date.parse(move.started_at) + 60_000)).toISOString();
        const r = await tfetch(`/api/telematics/shift-recap?truckId=${encodeURIComponent(truckId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&odoOnly=1`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        const mi = j?.odo?.lastMi;
        if (alive && typeof mi === "number" && Number.isFinite(mi)) { setGeoOdo(Math.round(mi)); setOdo((o) => (o.trim() ? o : String(Math.round(mi)))); }
      } catch { /* the driver types it */ }
    })();
    return () => { alive = false; };
  }, [open, move?.move_id, truckId, atMs, step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show || !move) return null;
  const begMiles = move.begin_miles != null ? Number(move.begin_miles) : null;
  const startMs = Date.parse(move.started_at);
  const timeProblem = atMs < startMs ? "That's before the move began." : atMs > Date.now() + 60_000 ? "That's in the future." : null;
  const odoProblem = odometerProblem(odo, begMiles);
  const big: React.CSSProperties = { width: "100%", padding: "16px 0", border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2, marginTop: 10 };
  const ghost: React.CSSProperties = { ...big, background: "transparent", color: "#fff", border: `1px solid ${L.hairline}`, fontSize: 13 };
  const row: React.CSSProperties = { ...L.secondary, display: "block", width: "100%", textAlign: "left", padding: "14px", marginBottom: 8, color: "#fff", cursor: "pointer" };
  const cap: React.CSSProperties = { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted };

  return (
    <>
      <button type="button" onClick={begin} className="dash-press"
        style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", marginTop: 8, padding: "12px 14px", color: "#fff", cursor: "pointer", borderColor: "rgba(251,191,36,0.55)" }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Confirm your day ›</div>
        <div style={{ fontSize: 12, color: L.muted, marginTop: 3 }}>Your empty move never ended. Tell us when, so your hours and miles are right.</div>
      </button>

      <FullscreenModal open={open && pickingFor == null} title="Confirm your day" onClose={() => setOpen(false)} footer={null}>
        {step === "ended" && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Did your empty move end?</div>
            <div style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>It began {formatDateTime(startMs)} and was never ended.</div>
            <button type="button" className="dash-press" style={big} onClick={() => setStep("when")}>Yes, it ended</button>
            <button type="button" className="dash-press" style={ghost} onClick={() => { setOpen(false); onStillMoving(); }}>No, I'm still moving</button>
          </>
        )}

        {step === "when" && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>When did it end?</div>
            <button type="button" className="dash-press" style={row} onClick={() => setPickingFor("move")}>
              <div style={cap}>Ended at</div>
              <div className="dash-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{formatDateTime(atMs)} ›</div>
              <div style={{ fontSize: 12, color: L.faint, marginTop: 2 }}>{geoTime ? "Filled from when your ELD went off duty. Tap to change it." : "Tap to set when you really stopped."}</div>
            </button>
            {timeProblem && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{timeProblem}</div>}
            <div style={{ ...L.secondary, padding: "14px", marginBottom: 8 }}>
              <div style={cap}>Ending odometer</div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                <input value={odo} onChange={(e) => { setOdo(e.target.value.replace(/[^0-9.]/g, "")); setErr(null); }} inputMode="decimal" placeholder="Miles from the dash"
                  onFocus={() => setTyping(true)}
                  style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "#fff", fontSize: 22, fontWeight: 800, padding: 0, outline: "none" }} />
                {matchesTracker(odo, geoOdo) && <TrackerCheck size={24} />}
              </div>
              {begMiles != null && <div style={{ fontSize: 12, color: L.faint, marginTop: 4 }}>It began at {begMiles.toLocaleString("en-US")}.</div>}
            </div>
            {(err || (typing && odoProblem)) && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err ?? odoProblem}</div>}
            <button type="button" className="dash-press" style={{ ...big, opacity: timeProblem || odoProblem ? 0.5 : 1 }}
              onClick={() => { if (timeProblem) return setErr(timeProblem); if (odoProblem) { setTyping(true); return setErr(odoProblem); } setShiftAtMs(atMs); setStep("shift"); }}>Next · Shift</button>
            <button type="button" className="dash-press" style={ghost} onClick={() => setStep("ended")}>‹ Back</button>
          </>
        )}

        {step === "shift" && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>End your shift?</div>
            <div style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>If you're done for the day, the shift ends at the time below. Otherwise it stays open.</div>
            <button type="button" className="dash-press" style={row} onClick={() => setPickingFor("shift")}>
              <div style={cap}>Shift ends at</div>
              <div className="dash-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{formatDateTime(shiftAtMs)} ›</div>
            </button>
            <button type="button" className="dash-press" style={big} onClick={() => { const n = parseOdometer(odo); if (n == null) return; setOpen(false); onConfirm({ moveEndAt: new Date(atMs).toISOString(), odometer: n, endShift: true, shiftEndAt: new Date(Math.max(shiftAtMs, atMs)).toISOString() }); }}>End shift</button>
            <button type="button" className="dash-press" style={ghost} onClick={() => { const n = parseOdometer(odo); if (n == null) return; setOpen(false); onConfirm({ moveEndAt: new Date(atMs).toISOString(), odometer: n, endShift: false, shiftEndAt: new Date(atMs).toISOString() }); }}>Keep my shift open</button>
            <button type="button" className="dash-press" style={{ ...ghost, border: "none", color: L.muted }} onClick={() => setStep("when")}>‹ Back</button>
          </>
        )}
      </FullscreenModal>

      <DateTimePopout open={open && pickingFor != null} title={pickingFor === "shift" ? "Shift end time" : "When the move ended"} valueMs={pickingFor === "shift" ? shiftAtMs : atMs}
        onSet={(ms) => { if (pickingFor === "shift") setShiftAtMs(Math.max(ms, atMs)); else { setAtMs(ms); setShiftAtMs((s) => Math.max(s, ms)); setGeoTime(false); } setErr(null); setPickingFor(null); }}
        onCancel={() => setPickingFor(null)} />
    </>
  );
}
