"use client";
// app/planner/components/terminal/TerminalCardEdit.tsx
//
// Tap My access on the Terminal screen: last visit (which sets the access expiration), card number and PIN,
// then the training behind it (requirements and links, your training date, the company letter) and the access
// steps. The card fields save with Save; the training section saves as you go.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DateField } from "@/lib/ui/DateField";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { useDashLook } from "../../home/dashLook";
import { TerminalTrainingSection } from "../locations/TerminalTrainingSection";
import { openAccessSteps } from "../access/useAccessSteps";

const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

export function TerminalCardEdit({ open, terminalId, terminalName, onClose }: { open: boolean; terminalId: string; terminalName: string; onClose: () => void }) {
  const shell = useCalculatorShell();
  const L = useDashLook();
  const userId = shell.effectiveUserId ?? null;

  const [lastVisit, setLastVisit] = useState("");
  const [number, setNumber] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const c = shell.cardDataByTerminalId[terminalId];
    setLastVisit(shell.terminals.accessDateByTerminalId[terminalId] ?? "");
    setNumber(c?.cardNumber ?? ""); setPin(c?.pin ?? "");
    setErr(null);
  }, [open, terminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setErr(null);
    try {
      const prev = shell.cardDataByTerminalId[terminalId];
      if (number !== (prev?.cardNumber ?? "") || pin !== (prev?.pin ?? "")) {
        await shell.setCardDataForTerminal_(terminalId, { cardNumber: number.trim(), pin: pin.trim(), privateNote: prev?.privateNote ?? "" });
      }
      if (lastVisit && lastVisit !== (shell.terminals.accessDateByTerminalId[terminalId] ?? "")) {
        await shell.terminals.setAccessDateForTerminal(terminalId, lastVisit);
      }
      onClose();
    } catch (e: any) { setErr(e?.message ?? "Couldn't save."); }
    finally { setBusy(false); }
  }

  const caps: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, marginBottom: 6 };
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 16, padding: "12px", borderRadius: 2 };

  return (
    <FullscreenModal open={open} title={`Access · ${terminalName}`} onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ flex: 1, padding: "14px 0", border: `1px solid ${L.hairline}`, background: "#0f0f10", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Cancel</button>
          <button type="button" aria-busy={busy} onClick={() => void save()} disabled={busy} style={{ flex: 2, padding: "14px 0", border: "none", background: "#fff", color: "#000", fontWeight: 800, cursor: "pointer" }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      }>
      <div style={{ marginBottom: 16 }}>
        <div style={caps}>Last visit (access runs from this date)</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><DateField value={lastVisit} onChange={setLastVisit} title="Last visit" placeholder="Set last visit" allowClear={false} /></div>
          <button type="button" onClick={() => setLastVisit(today())} style={{ padding: "0 14px", border: `1px solid ${L.hairline}`, background: "#0f0f10", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Today</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 16 }}>
        <div><div style={caps}>Card number</div><input value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" style={{ ...input, fontFamily: "monospace" }} /></div>
        <div><div style={caps}>PIN</div><input value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" style={{ ...input, fontFamily: "monospace" }} /></div>
      </div>
      <div style={{ ...caps, margin: "6px 0 8px", paddingTop: 12, borderTop: `1px solid ${L.hairline}` }}>Training and company letter</div>
      <TerminalTrainingSection terminalId={terminalId} terminalName={terminalName} userId={userId} companyId={shell.companyId ?? null} staff={false} />
      <button type="button" className="dash-press" onClick={() => openAccessSteps({ terminalId })}
        style={{ display: "flex", width: "100%", alignItems: "center", padding: "13px 14px", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
        <span style={{ flex: 1, textAlign: "left" }}>Access steps</span><span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
      </button>
      {err && <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div>}
    </FullscreenModal>
  );
}
