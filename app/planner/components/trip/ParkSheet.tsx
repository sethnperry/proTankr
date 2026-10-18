"use client";
// app/planner/components/trip/ParkSheet.tsx
//
// Park Preloaded: stage a loaded trailer for a slip-seat driver, or for
// yourself after a layover. The trip keeps its load and stops; whoever picks
// up the trailer next resumes it from their Driver Dashboard.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PARK_FOR_LABEL } from "@/lib/trips/tripFlow";
import type { ParkFor } from "@/lib/trips/types";
import { fieldInput, fieldLabel, fromLocalInput, muted, primaryBtn, sectionCard, sectionTitle, toLocalInput } from "./tripUi";

export type ParkSubmit = { parkFor: ParkFor; where: string | null; note: string | null; parkedAt: string };

const chip = (on: boolean): React.CSSProperties => ({
  padding: "10px 14px", borderRadius: 2, fontSize: 14, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.8)",
});

export function ParkSheet({ open, trailerLabel, onBoard, onSubmit, onClose }: {
  open: boolean;
  trailerLabel: string;
  onBoard: string[]; // e.g. "C1 · D2 · 3,000 gal"
  onSubmit: (v: ParkSubmit) => void;
  onClose: () => void;
}) {
  const [parkFor, setParkFor] = useState<ParkFor | null>(null);
  const [where, setWhere] = useState("");
  const [note, setNote] = useState("");
  const [at, setAt] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setParkFor(null);
    setWhere("");
    setNote("");
    setAt(toLocalInput(new Date().toISOString()));
    setErr(null);
  }, [open]);

  const submit = () => {
    if (!parkFor) return setErr("Pick who it's for.");
    const parkedAt = fromLocalInput(at);
    if (!parkedAt) return setErr("Enter the time.");
    onSubmit({ parkFor, where: where.trim() || null, note: note.trim() || null, parkedAt });
  };

  return (
    <FullscreenModal open={open} title="Park Preloaded" onClose={onClose} footer={null}>
      <div style={sectionCard}>
        <div style={sectionTitle}>{trailerLabel} stays loaded</div>
        {onBoard.length > 0 ? (
          onBoard.map((l) => <div key={l} style={{ fontSize: 14, marginTop: 2 }}>{l}</div>)
        ) : (
          <div style={{ fontSize: 14, color: muted }}>Product on board</div>
        )}
        <div style={{ fontSize: 12, color: muted, marginTop: 10 }}>
          The trip stops here and you can start another one. Whoever picks up this trailer resumes the trip and delivers it.
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionTitle}>Who&apos;s it for?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(Object.keys(PARK_FOR_LABEL) as ParkFor[]).map((k) => (
            <button key={k} type="button" style={chip(parkFor === k)} onClick={() => setParkFor(k)}>{PARK_FOR_LABEL[k]}</button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={fieldLabel}>Where it&apos;s parked (optional)</div>
          <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Yard, terminal lot, row…" style={fieldInput} />
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={fieldLabel}>Note for the next driver (optional)</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Keys, seals, delivery window…" style={fieldInput} />
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={fieldLabel}>Parked</div>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={fieldInput} />
        </div>
      </div>

      {err && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{err}</div>}
      <button type="button" onClick={submit} style={primaryBtn}>Park Load</button>
    </FullscreenModal>
  );
}
