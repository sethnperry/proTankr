"use client";
// app/planner/components/terminal/TerminalCardEdit.tsx
//
// Tap the card on the Terminal screen to edit it: last visit (which sets the access expiration), card number,
// PIN, and your training date for this terminal. Everything saves on Save.

import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DateField } from "@/lib/ui/DateField";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { useDashLook } from "../../home/dashLook";
import { expiresAfterCompletion, trainingStatus } from "@/lib/terminals/training";
import { TRAINING_QUERY_KEY, useTrainingDetail } from "../locations/TerminalTrainingSection";

const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

export function TerminalCardEdit({ open, terminalId, terminalName, onClose }: { open: boolean; terminalId: string; terminalName: string; onClose: () => void }) {
  const shell = useCalculatorShell();
  const L = useDashLook();
  const qc = useQueryClient();
  const userId = shell.effectiveUserId ?? null;
  const { data } = useTrainingDetail(terminalId, userId, false);
  const req = data?.req ?? null;
  const mine = data?.mine ?? null;

  const [lastVisit, setLastVisit] = useState("");
  const [number, setNumber] = useState("");
  const [pin, setPin] = useState("");
  const [trainExp, setTrainExp] = useState("");
  const [trainDone, setTrainDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const c = shell.cardDataByTerminalId[terminalId];
    setLastVisit(shell.terminals.accessDateByTerminalId[terminalId] ?? "");
    setNumber(c?.cardNumber ?? ""); setPin(c?.pin ?? "");
    setTrainExp(mine?.expires_at ?? ""); setTrainDone(mine?.completed_at ?? null);
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
      if (req?.required && userId && (trainExp !== (mine?.expires_at ?? "") || trainDone !== (mine?.completed_at ?? null))) {
        const { error } = await supabase.from("driver_terminal_training").upsert(
          { user_id: userId, terminal_id: terminalId, company_id: shell.companyId, completed_at: trainDone, expires_at: trainExp || null },
          { onConflict: "user_id,terminal_id" });
        if (error) throw new Error(error.message);
        await qc.invalidateQueries({ queryKey: [TRAINING_QUERY_KEY] });
      }
      onClose();
    } catch (e: any) { setErr(e?.message ?? "Couldn't save."); }
    finally { setBusy(false); }
  }

  const caps: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, marginBottom: 6 };
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 16, padding: "12px", borderRadius: 2 };
  const st = trainingStatus(req, { completed_at: trainDone, expires_at: trainExp || null });

  return (
    <FullscreenModal open={open} title={`Card · ${terminalName}`} onClose={onClose}
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
      {req?.required ? (
        <div style={{ marginBottom: 16 }}>
          <div style={caps}>Training certification expires</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><DateField value={trainExp} onChange={setTrainExp} title="Training expires" placeholder="Set expiration" /></div>
            <button type="button" onClick={() => { const d = today(); setTrainDone(d); const e = expiresAfterCompletion(d, req.renewal_months); if (e) setTrainExp(e); }}
              style={{ padding: "0 12px", border: `1px solid ${L.hairline}`, background: "#0f0f10", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Completed today</button>
          </div>
          <div style={{ fontSize: 12, color: L.muted, marginTop: 6 }}>{st.text}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: L.muted, marginBottom: 16 }}>No training is set up for this terminal. You can set it up in the Training and access section.</div>
      )}
      {err && <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div>}
    </FullscreenModal>
  );
}
