"use client";
// app/planner/components/callouts/CalloutForm.tsx
//
// The one call-out screen: why, which shift (day and start time), department, a note. Used by the driver's own
// call-out and by dispatch entering or correcting one for a driver. Presentational.

import React, { useEffect, useState } from "react";
import { ReasonChips, type ReasonPick } from "../reasons/ReasonChips";
import { calloutProblem, type CalloutInput } from "@/lib/callouts/callout";
import { addDays, localDateOf } from "@/lib/worklog/time";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const field: React.CSSProperties = { boxSizing: "border-box", padding: 10, fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.28)", border: `1px solid ${HAIR}`, borderRadius: 0, colorScheme: "dark" };
const chip = (on: boolean): React.CSSProperties => ({ padding: "10px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.18)"}`, background: on ? "#fff" : "#0a0a0b", color: on ? "#000" : "rgba(255,255,255,0.85)" });
const cap: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, margin: "14px 0 6px" };

export type CalloutFormValue = CalloutInput & { category: string | null; department: string | null };

export function CalloutForm({ reasons, departments, tz, initial, submitLabel, busy, onSubmit }: {
  reasons: { reason_id: string; label: string; category: string | null }[];
  departments: string[];
  tz: string;
  initial?: Partial<CalloutFormValue> & { pick?: ReasonPick | null };
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: CalloutFormValue) => void;
}) {
  const today = localDateOf(Date.now(), tz);
  const [pick, setPick] = useState<ReasonPick | null>(initial?.pick ?? null);
  const [date, setDate] = useState(initial?.date ?? today);
  const [time, setTime] = useState(initial?.time ?? "06:00");
  const [dept, setDept] = useState<string | null>(initial?.department ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setErr(null); }, [pick, date, time]);

  return (
    <div>
      <div style={{ ...cap, marginTop: 0 }}>Why?</div>
      <ReasonChips reasons={reasons} value={pick} onPick={setPick} />
      <div style={cap}>Which shift?</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button type="button" style={chip(date === today)} onClick={() => setDate(today)}>Today</button>
        <button type="button" style={chip(date === addDays(today, 1))} onClick={() => setDate(addDays(today, 1))}>Tomorrow</button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...field, flex: 1, minWidth: 0 }} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...field, width: 130 }} />
      </div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>The time the shift was to start. You can withdraw until then.</div>
      {departments.length > 0 && (
        <>
          <div style={cap}>Department</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {departments.map((d) => <button key={d} type="button" style={chip(dept === d)} onClick={() => setDept(dept === d ? null : d)}>{d}</button>)}
          </div>
        </>
      )}
      {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 12 }}>{err}</div>}
      <button type="button" disabled={busy} aria-busy={busy}
        onClick={() => {
          const input: CalloutInput = { reason: pick?.label ?? "", reasonId: pick?.reasonId ?? null, note: pick?.note ?? "", date, time };
          const p = calloutProblem(input);
          if (p) { setErr(p); return; }
          onSubmit({ ...input, category: pick?.category ?? null, department: dept });
        }}
        style={{ width: "100%", marginTop: 18, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}
