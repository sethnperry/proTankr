"use client";
// app/planner/components/trip/CancelTripSheet.tsx
//
// Cancel a load in progress from the Driver Dashboard. Reasons compound
// (traffic, a rack hop, gauging, then still no allocation), so the driver
// ticks every one that applies; they're numbered in the order picked and
// saved that way. Managers see these on the Dispatch Dashboard.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CANCEL_REASONS, cancelReasonLabel } from "@/lib/trips/cancelReasons";
import { fieldInput, fieldLabel, fromLocalInput, muted, primaryBtn, sectionCard, sectionTitle, toLocalInput } from "./tripUi";

export type CancelTripSubmit = {
  reasons: string[];
  note: string | null;
  returnedTo: string | null;
  endMiles: number | null;
  cancelledAt: string;
};

const GROUPS = ["Terminal", "Road", "Other"] as const;

export function CancelTripSheet({ open, title, busy, error, onSubmit, onClose }: {
  open: boolean;
  title: string; // e.g. "Order 4792811"
  busy: boolean;
  error: string | null;
  onSubmit: (v: CancelTripSubmit) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [returnedTo, setReturnedTo] = useState("");
  const [miles, setMiles] = useState("");
  const [at, setAt] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setNote("");
    setReturnedTo("");
    setMiles("");
    setAt(toLocalInput(new Date().toISOString()));
    setErr(null);
  }, [open]);

  const toggle = (code: string) =>
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const submit = () => {
    if (picked.length === 0) return setErr("Pick at least one reason.");
    if (picked.includes("other") && !note.trim()) return setErr("Add a note for Other.");
    const when = fromLocalInput(at);
    if (!when) return setErr("Enter the time.");
    const m = miles.trim() ? Number(miles) : null;
    if (m != null && !Number.isFinite(m)) return setErr("Ending miles must be a number.");
    onSubmit({ reasons: picked, note: note.trim() || null, returnedTo: returnedTo.trim() || null, endMiles: m, cancelledAt: when });
  };

  return (
    <FullscreenModal open={open} title={`Cancel ${title}`} onClose={onClose} footer={null}>
      <div style={sectionCard}>
        <div style={sectionTitle}>Why? Pick everything that applies</div>
        {GROUPS.map((g) => (
          <div key={g} style={{ marginBottom: 10 }}>
            <div style={{ ...fieldLabel, marginBottom: 6 }}>{g}</div>
            {CANCEL_REASONS.filter((r) => r.group === g).map((r) => {
              const n = picked.indexOf(r.code);
              const on = n >= 0;
              return (
                <button key={r.code} type="button" onClick={() => toggle(r.code)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                    padding: "11px 12px", marginBottom: 6, borderRadius: 10, cursor: "pointer", fontSize: 15,
                    border: on ? "1px solid rgba(248,113,113,0.7)" : "1px solid rgba(255,255,255,0.12)",
                    background: on ? "rgba(248,113,113,0.10)" : "transparent", color: "#fff",
                  }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: "inline-flex",
                    alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800,
                    border: on ? "none" : "1px solid rgba(255,255,255,0.3)",
                    background: on ? "#f87171" : "transparent", color: "#000",
                  }}>{on ? n + 1 : ""}</span>
                  {r.label}
                </button>
              );
            })}
          </div>
        ))}
        {picked.length > 1 && (
          <div style={{ fontSize: 13, color: muted }}>
            In order: {picked.map(cancelReasonLabel).join(" → ")}
          </div>
        )}
      </div>

      <div style={sectionCard}>
        <div style={fieldLabel}>Note{picked.includes("other") ? "" : " (optional)"}</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="What happened? Times, who you talked to…" style={{ ...fieldInput, resize: "vertical", marginBottom: 10 }} />
        <div style={fieldLabel}>Headed to (optional)</div>
        <input value={returnedTo} onChange={(e) => setReturnedTo(e.target.value)} placeholder="Yard, parking location…"
          style={{ ...fieldInput, marginBottom: 10 }} />
        <div style={fieldLabel}>Ending miles (optional)</div>
        <input value={miles} onChange={(e) => setMiles(e.target.value)} inputMode="numeric" placeholder="Odometer"
          style={{ ...fieldInput, marginBottom: 10 }} />
        <div style={fieldLabel}>Cancelled at</div>
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={fieldInput} />
      </div>

      <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>
        Your manager sees cancelled loads and their reasons. You can hide it from your own Trips list afterward.
      </div>
      {(err || error) && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{err || error}</div>}
      <button type="button" onClick={submit} disabled={busy}
        style={{ ...primaryBtn, background: "#f87171", color: "#000", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : "Cancel Load"}
      </button>
    </FullscreenModal>
  );
}
