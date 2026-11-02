"use client";
// app/planner/components/repair/RepairSheet.tsx
//
// Truck Down: which unit, what's wrong, a few words. Sending puts the unit at Deadline and asks the company's
// approver for the repair. Presentational: the caller creates the work order and sends the email.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { REPAIR_CATEGORIES, repairProblem, type RepairCategory, type RepairInput, type UnitKind } from "@/lib/repairs/repairRequest";

export type RepairUnit = { kind: UnitKind; id: string; name: string };

export function RepairSheet({ open, onClose, units, onSend }: {
  open: boolean;
  onClose: () => void;
  units: RepairUnit[];
  /** Resolves with a message to show ("Sent for approval…"), or throws to show an error. */
  onSend: (unit: RepairUnit, input: RepairInput) => Promise<string>;
}) {
  const [unitKey, setUnitKey] = useState<string>("");
  const [category, setCategory] = useState<RepairCategory | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { if (open) { setUnitKey(units[0] ? `${units[0].kind}:${units[0].id}` : ""); setCategory(null); setNote(""); setErr(null); setDone(null); setBusy(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const unit = units.find((u) => `${u.kind}:${u.id}` === unitKey) ?? null;
  const chip = (on: boolean): React.CSSProperties => ({ padding: "10px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.18)"}`, background: on ? "#fff" : "#0a0a0b", color: on ? "#000" : "rgba(255,255,255,0.85)" });

  const send = async () => {
    const input: RepairInput = { unitId: unit?.id ?? null, unitName: unit?.name ?? "", category, note };
    const p = repairProblem(input);
    if (p || !unit) { setErr(p ?? "Pick the unit that is down."); return; }
    setBusy(true); setErr(null);
    try { setDone(await onSend(unit, input)); } catch (e: any) { setErr(e?.message ?? "Couldn't send. Try again."); }
    setBusy(false);
  };

  return (
    <FullscreenModal open={open} title="Truck down" onClose={onClose} footer={null}>
      {done ? (
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Sent</div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{done}</div>
          <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 20, padding: "16px 0", fontSize: 16, fontWeight: 900, textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>Done</button>
        </div>
      ) : (
        <>
          {units.length === 0 && <div style={{ color: "#fbbf24", fontSize: 14, marginBottom: 12 }}>Pick your truck or trailer on the Equipment tool first.</div>}
          {units.length > 1 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Which unit is down?</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {units.map((u) => <button key={`${u.kind}:${u.id}`} type="button" style={chip(unitKey === `${u.kind}:${u.id}`)} onClick={() => setUnitKey(`${u.kind}:${u.id}`)}>{u.kind === "truck" ? "Truck" : "Trailer"} {u.name}</button>)}
              </div>
            </>
          )}
          {units.length === 1 && <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14 }}>{units[0].kind === "truck" ? "Truck" : "Trailer"} {units[0].name}</div>}
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>What's wrong?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {REPAIR_CATEGORIES.map((c) => <button key={c.value} type="button" style={chip(category === c.value)} onClick={() => setCategory(c.value)}>{c.label}</button>)}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened, and where are you?"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 90, padding: 12, fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontFamily: "inherit" }} />
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>Sending puts this unit at Deadline and asks for the repair to be approved.</div>
          {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
          <button type="button" disabled={busy} aria-busy={busy} onClick={() => void send()}
            style={{ width: "100%", marginTop: 18, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Sending…" : "Send repair request"}
          </button>
        </>
      )}
    </FullscreenModal>
  );
}
