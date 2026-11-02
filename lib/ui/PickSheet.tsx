"use client";
// lib/ui/PickSheet.tsx
//
// One pick from a list, in a full-screen sheet with search at the top. "" means no filter, and the first row
// clears it. Used by the Trips tool filters and the report shell; every filter pop-out is this one sheet.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

/** One pick from a list, with search at the top. "" = no filter. */
export function PickSheet({ open, title, allLabel, options, value, onPick, onClose }: {
  open: boolean; title: string; allLabel: string; options: { value: string; label: string }[]; value: string; onPick: (v: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const shown = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const row = (v: string, label: string) => (
    <button key={v || "all"} type="button" onClick={() => { onPick(v); onClose(); }}
      style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "13px 14px 13px 0", border: "none", borderTop: "1px solid rgba(255,255,255,0.12)", background: "#0f0f10", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
      <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: value === v ? "#fff" : "transparent", marginRight: 12 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoFocus
        style={{ width: "100%", boxSizing: "border-box", background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 16, padding: "11px 12px", borderRadius: 0, outline: "none", marginBottom: 10 }} />
      <div style={{ background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)" }}>
        {!q.trim() && row("", allLabel)}
        {shown.length === 0 && <div style={{ padding: 14, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>No matches.</div>}
        {shown.map((o) => row(o.value, o.label))}
      </div>
    </FullscreenModal>
  );
}

