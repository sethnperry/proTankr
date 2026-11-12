"use client";
// app/planner/modals/TerminalCardSheet.tsx
//
// Quick "I have a card here" entry used by Setup: card number, PIN and the last visit. Everything is optional. If the
// driver isn't sure when they last loaded, a close guess is fine: the date corrects itself the next time they load there.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DateField } from "@/lib/ui/DateField";

const MUTED = "rgba(255,255,255,0.55)";
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MUTED, margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" };
const chip: React.CSSProperties = { flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#fff" };

const daysAgoISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export type TerminalCardValues = { cardNumber: string; pin: string; lastVisit: string };

export function TerminalCardSheet({ open, terminalName, initial, onSave, onClose }: {
  open: boolean; terminalName: string; initial: TerminalCardValues; onSave: (v: TerminalCardValues) => Promise<void> | void; onClose: () => void;
}) {
  const [num, setNum] = useState(""); const [pin, setPin] = useState(""); const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setNum(initial.cardNumber); setPin(initial.pin); setLast(initial.lastVisit); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => { setBusy(true); try { await onSave({ cardNumber: num.trim(), pin: pin.trim(), lastVisit: last }); } finally { setBusy(false); } onClose(); };

  return (
    <FullscreenModal open={open} title={terminalName} onClose={onClose}
      footer={<button type="button" disabled={busy} onClick={() => void save()} style={{ width: "100%", padding: "14px 0", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", background: "#fff", color: "#000", border: "none", borderRadius: 2, cursor: "pointer" }}>{busy ? "Saving…" : "Save my card"}</button>}>
      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.4 }}>Fill in what you know. Skip the rest, you can add it later.</div>
      <div style={label}>Card number</div>
      <input style={input} value={num} onChange={(e) => setNum(e.target.value)} autoComplete="off" inputMode="text" />
      <div style={label}>PIN</div>
      <input style={{ ...input, width: 140 }} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" inputMode="numeric" />
      <div style={label}>Last time you loaded here</div>
      <DateField value={last} onChange={setLast} title="Last visit" />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {[["This month", 7], ["1 mo ago", 30], ["2 mo ago", 60], ["3 mo ago", 90]].map(([t, n]) => (
          <button key={String(t)} type="button" style={chip} onClick={() => setLast(daysAgoISO(Number(n)))}>{t}</button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Not sure? Pick the closest. It fixes itself the next time you load here.</div>
    </FullscreenModal>
  );
}
