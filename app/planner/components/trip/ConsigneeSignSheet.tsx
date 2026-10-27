"use client";
// app/planner/components/trip/ConsigneeSignSheet.tsx
//
// The consignee signs any time after the driver has arrived, not only inside the
// finish sequence. Saved on the delivery; the sequence's Consignee step then
// just shows it as signed.

import React, { useState } from "react";
import { fieldInput, muted, SignaturePad } from "./tripUi";
import { useIsLandscape } from "@/app/planner/hooks/useOrientation";

export function ConsigneeSignSheet({ open, initialName, initialSig, onSave, onClear, onClose }: {
  open: boolean; initialName: string; initialSig: string | null;
  onSave: (name: string, sig: string) => void; onClear: () => void; onClose: () => void;
}) {
  const landscape = useIsLandscape(480);
  const [name, setName] = useState(initialName);
  const [sig, setSig] = useState<string | null>(initialSig);
  const [err, setErr] = useState<string | null>(null);
  const onSig = React.useCallback((p: string | null) => setSig(p), []);
  if (!open) return null;
  const apply = () => {
    if (!name.trim()) return setErr("Print the consignee's name.");
    if (!sig) return setErr("They need to sign.");
    onSave(name.trim(), sig);
  };
  const btn: React.CSSProperties = { flex: 1, padding: "12px 0", borderRadius: 2, fontSize: 14, fontWeight: 600, cursor: "pointer", background: "transparent" };
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 520, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: landscape ? "stretch" : "flex-start", justifyContent: "center",
      padding: landscape ? 0 : 24, paddingTop: landscape ? 0 : "calc(env(safe-area-inset-top, 0px) + 24px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: landscape ? "none" : 420, boxSizing: "border-box",
        background: "#161616", border: landscape ? "none" : "1px solid rgba(255,255,255,0.12)", borderRadius: landscape ? 0 : 2,
        padding: landscape ? "calc(env(safe-area-inset-top, 0px) + 10px) calc(env(safe-area-inset-right, 0px) + 16px) 10px calc(env(safe-area-inset-left, 0px) + 16px)" : 20,
        display: "flex", flexDirection: "column", gap: 10, overflowY: "auto",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" }}>Consignee</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Printed name" style={{ ...fieldInput, flex: 1, padding: "8px 10px", fontSize: 16 }} />
        </div>
        <SignaturePad onChange={onSig} fill={landscape} initial={initialSig} />
        {!landscape && <div style={{ fontSize: 11, color: muted }}>Turn the phone sideways for a bigger pad.</div>}
        {err && <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>{err}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} style={{ ...btn, border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.65)" }}>Cancel</button>
          {initialSig && <button type="button" onClick={onClear} style={{ ...btn, border: "1px solid rgba(248,113,113,0.5)", color: "#f87171" }}>Remove</button>}
          <button type="button" onClick={apply} style={{ ...btn, border: "none", background: "#fff", color: "#000", fontWeight: 800 }}>Apply</button>
        </div>
      </div>
    </div>
  );
}
