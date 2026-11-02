"use client";
// app/planner/components/reasons/ReasonChips.tsx
//
// Reason chips for a company's reason list (see lib/reasons): grouped by category, tap one, "Other" opens a note.
// Presentational. The Shift Explanation, call-outs and the other forms that ask "why" all use it.

import React, { useState } from "react";
import { groupByCategory, type ReasonGroup } from "@/lib/reasons/reasons";

export type ReasonPick = { reasonId: string | null; label: string; category: string | null; note: string | null };

const HAIR = "rgba(255,255,255,0.12)";
const MUTE = "rgba(255,255,255,0.52)";

export function ReasonChips({ reasons, value, onPick, allowOther = true }: {
  reasons: { reason_id: string; label: string; category: string | null }[];
  value: ReasonPick | null;
  onPick: (p: ReasonPick | null) => void;
  allowOther?: boolean;
}) {
  const [other, setOther] = useState(value?.reasonId == null && !!value?.label);
  const [note, setNote] = useState(value?.reasonId == null ? value?.note ?? "" : "");
  const groups: ReasonGroup[] = groupByCategory(reasons);
  const chip = (on: boolean): React.CSSProperties => ({ padding: "9px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#fff" : HAIR}`, background: on ? "#fff" : "#0a0a0b", color: on ? "#000" : "rgba(255,255,255,0.85)" });
  return (
    <div>
      {groups.map((g) => (
        <div key={g.category || "none"} style={{ marginBottom: 12 }}>
          {g.label && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, marginBottom: 6 }}>{g.label}</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {g.reasons.map((r) => {
              const on = value?.reasonId === r.reason_id;
              return <button key={r.reason_id} type="button" style={chip(on)} onClick={() => { setOther(false); onPick(on ? null : { reasonId: r.reason_id, label: r.label, category: r.category, note: null }); }}>{r.label}</button>;
            })}
          </div>
        </div>
      ))}
      {allowOther && (
        <div>
          <button type="button" style={chip(other)} onClick={() => { const next = !other; setOther(next); onPick(next ? { reasonId: null, label: "Other", category: "other", note: note.trim() || null } : null); }}>Other</button>
          {other && (
            <input value={note} placeholder="What happened?" onChange={(e) => { setNote(e.target.value); onPick({ reasonId: null, label: "Other", category: "other", note: e.target.value.trim() || null }); }}
              style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 8, padding: "11px 12px", background: "#0a0a0b", border: `1px solid ${HAIR}`, color: "#fff", fontSize: 16, borderRadius: 0, outline: "none" }} />
          )}
        </div>
      )}
    </div>
  );
}
