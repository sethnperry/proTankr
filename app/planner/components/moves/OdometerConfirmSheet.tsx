"use client";
// app/planner/components/moves/OdometerConfirmSheet.tsx
//
// The odometer pop-out for cancelling a load and ending a shift. Prefilled from the truck's tracker when it answers:
// the driver taps Confirm. If it can't, the big number pad opens and the driver types the dash reading. There is no
// skip: the move and the shift record both need it. "Back" goes back to the screen before (not a skip).

import React, { useEffect, useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ValueEntryOverlay from "../ValueEntryOverlay";
import { odometerProblem, parseOdometer } from "@/lib/moves/emptyMoves";

const MUTE = "rgba(255,255,255,0.5)";
const primary: React.CSSProperties = { width: "100%", padding: "18px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", marginTop: 14 };

export function OdometerConfirmSheet({ open, title, lead, placeLabel, loading, guess, floor, onConfirm, onBack }: {
  open: boolean; title: string; lead: string; placeLabel: string | null; loading: boolean; guess: number | null; floor: number | null;
  onConfirm: (odometer: number) => void; onBack: () => void;
}) {
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // The lookup only starts after the sheet opens, so for one render "not loading, no reading" means "not asked yet", not
  // "tracker has nothing". Only a lookup that was seen running and then finished counts as an answer.
  const sawLoading = useRef(false);
  useEffect(() => { if (!open) { setValue(""); setTyping(false); setTouched(false); setErr(null); sawLoading.current = false; } }, [open]);
  useEffect(() => { if (open && loading) sawLoading.current = true; }, [open, loading]);
  // The tracker answered: use it, unless the driver already typed something.
  useEffect(() => { if (open && !loading && !touched && guess != null) setValue(String(guess)); }, [open, loading, guess, touched]);
  // No reading from the tracker: go straight to the big number pad.
  useEffect(() => { if (open && !loading && sawLoading.current && guess == null && !touched) { setDraft(""); setTyping(true); } }, [open, loading, guess, touched]);
  // A reading that lands while an untouched, empty pad is up replaces the pad with the number to confirm.
  useEffect(() => { if (open && typing && !touched && !draft && guess != null) setTyping(false); }, [open, typing, touched, draft, guess]);

  const problem = value ? odometerProblem(value, floor) : null;
  const confirm = () => {
    const p = odometerProblem(value, floor);
    if (p) { setErr(p); return; }
    onConfirm(parseOdometer(value)!);
  };

  return (
    <>
      <FullscreenModal open={open && !typing} onClose={onBack} title={title} footer={null}>
        <div style={{ fontSize: 13, color: MUTE }}>{lead}</div>
        {placeLabel && <div style={{ fontSize: 13, color: MUTE, marginTop: 2 }}>At {placeLabel}</div>}
        <button type="button" onClick={() => { setDraft(value); setTyping(true); }} aria-label="Change the odometer"
          style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: "18px 0 6px" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE }}>Odometer</div>
          <div className="dash-num" style={{ fontSize: 44, fontWeight: 900, letterSpacing: "0.02em" }}>
            {loading ? "Reading…" : value ? Number(value.replace(/,/g, "")).toLocaleString("en-US") : "Tap to enter"}
          </div>
          <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{guess != null && value === String(guess) ? "From the truck. Tap the number to change it." : "Tap the number to type it from the dash."}</div>
        </button>
        {(err || problem) && <div style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{err ?? problem}</div>}
        <button type="button" style={{ ...primary, opacity: !value || loading ? 0.4 : 1 }} disabled={!value || loading} onClick={confirm}>Confirm</button>
        <button type="button" onClick={onBack} style={{ ...primary, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", marginTop: 8 }}>Back</button>
      </FullscreenModal>
      <ValueEntryOverlay open={open && typing} title="Odometer" hint="Read it from the dash."
        fields={[{ key: "o", label: "Odometer", value: draft, onChange: setDraft, decimal: false, showLabel: true }]}
        error={odometerProblem(draft, floor) && draft ? odometerProblem(draft, floor) : undefined}
        cancelLabel="Back" submitLabel="Use"
        onCancel={() => { setTyping(false); if (!value) onBack(); }}
        onSubmit={() => { if (odometerProblem(draft, floor)) return; setValue(draft.replace(/,/g, "").trim()); setTouched(true); setTyping(false); setErr(null); }} />
    </>
  );
}
