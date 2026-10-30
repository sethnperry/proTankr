"use client";
// app/planner/components/trip/GaugingAskSheet.tsx
//
// Asked once per terminal, the first time a driver reports it down for gauging: when does it normally
// begin and end. Saves to terminals.gauging_cutoff / gauging_minutes, which dispatch uses to flag late
// arrivals. Skippable; a driver who isn't sure just taps Not sure.

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { TERMINALS_CATALOG_QUERY_KEY } from "@/lib/queries/useTerminalsCatalog";
import { gaugingFromTimes } from "@/lib/trips/gaugingAsk";
import { fieldInput, fieldLabel, muted, primaryBtn } from "./tripUi";

export function GaugingAskSheet({ terminalId, terminalName, onClose }: { terminalId: string; terminalName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parsed = gaugingFromTimes(start, end);

  async function save() {
    if (!parsed) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("terminals")
      .update({ gauging_cutoff: parsed.cutoff, gauging_minutes: parsed.minutes }).eq("terminal_id", terminalId);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await qc.invalidateQueries({ queryKey: TERMINALS_CATALOG_QUERY_KEY });
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 520, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, boxSizing: "border-box", background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>When does {terminalName} normally gauge?</div>
        <div style={{ fontSize: 12, color: muted }}>Terminal time. This helps dispatch warn other drivers about it. Skip it if you don't know.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><div style={fieldLabel}>Begins</div><input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={fieldInput} /></div>
          <div style={{ flex: 1 }}><div style={fieldLabel}>Ends</div><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={fieldInput} /></div>
        </div>
        {err && <div style={{ fontSize: 12, color: "#f87171" }}>{err}</div>}
        <button type="button" disabled={!parsed || busy} onClick={() => void save()} style={{ ...primaryBtn, opacity: parsed && !busy ? 1 : 0.5 }}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onClose} style={{ padding: "11px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Not sure</button>
      </div>
    </div>
  );
}
