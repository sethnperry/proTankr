"use client";
// app/planner/home/QualificationStrip.tsx
//
// Access steps underway, one row per terminal. Steps come from
// lib/terminals/accessSteps.ts; tapping a row opens the steps sheet.
//
// Monochrome: filled = done, outlined with a corner tick = next, dim outline
// = pending, hatched = blocked/waiting on someone else. The letter under each
// segment is the step type (L letter, V video, O orientation, T training
// load, C check load), so state never relies on color.

import React from "react";
import { useDashLook } from "./dashLook";
import {
  QUAL_KIND_MARK, compactSteps, summarizeQualification,
  type QualStep,
} from "@/lib/terminals/qualification";

const MAX_SEGMENTS = 9;

export type QualTerminal = { terminalId: string; name: string; steps: QualStep[] };

function Segment({ s }: { s: QualStep }) {
  const L = useDashLook();
  const r = 2;
  const base: React.CSSProperties = { position: "relative", height: 22, borderRadius: r };
  const look: React.CSSProperties =
    s.state === "done" ? { background: "#f2f2f2" }
    : s.state === "next" ? { border: "1.5px solid #fff", background: "rgba(255,255,255,0.06)" }
    : s.state === "blocked" ? { border: `1px solid ${L.faint}`, background: "repeating-linear-gradient(135deg, rgba(255,255,255,0.22) 0 3px, transparent 3px 7px)" }
    : { border: `1px solid ${L.faint}` };
  return (
    <div style={{ flex: "1 1 0", minWidth: 18, maxWidth: 44 }} title={`${s.label} · ${s.state}`}>
      <div style={{ ...base, ...look }}>
        {s.state === "next" && (
          <span style={{ position: "absolute", top: -1, right: -1, width: 6, height: 6, background: "#fff", borderBottomLeftRadius: 2 }} />
        )}
      </div>
      <div style={{ textAlign: "center", fontSize: 10, fontWeight: 700, marginTop: 4,
        color: s.state === "done" ? L.muted : s.state === "next" ? "#fff" : L.faint }}>
        {QUAL_KIND_MARK[s.kind]}
      </div>
    </div>
  );
}

function Row({ t, onOpen, first }: { t: QualTerminal; onOpen: () => void; first?: boolean }) {
  const L = useDashLook();
  const sum = summarizeQualification(t.steps);
  const { folded, steps } = compactSteps(t.steps, MAX_SEGMENTS);
  const nextText = t.steps.length === 0 ? "Not set up yet · tap to answer a few questions"
    : sum.complete ? "All steps done · waiting on access" : sum.blocked
    ? `Waiting · ${sum.blocked.label}` : sum.next ? `Next · ${sum.next.label}` : "";
  return (
    <button type="button" onClick={onOpen} className="dash-press"
      style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 0", color: "#fff", cursor: "pointer", borderTop: first ? "none" : `1px solid ${L.hairline}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
        <span className="dash-num" style={{ fontSize: 12, color: L.muted, whiteSpace: "nowrap" }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{sum.done}</span>/{sum.total} steps
        </span>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 9, alignItems: "flex-start" }}>
        {folded > 0 && (
          <div style={{ flex: "0 0 auto" }}>
            <div className="dash-num" style={{ height: 22, borderRadius: 2, background: "#f2f2f2", color: "#000", fontSize: 11, fontWeight: 800, padding: "0 6px", display: "flex", alignItems: "center" }}>
              {folded}✓
            </div>
            <div style={{ fontSize: 10, marginTop: 4, color: L.faint, textAlign: "center" }}>done</div>
          </div>
        )}
        {steps.map((s, i) => <Segment key={i} s={s} />)}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 12 }}>
        <span style={{ flex: 1, minWidth: 0, color: sum.blocked ? "#fbbf24" : sum.complete ? "rgba(255,255,255,0.8)" : "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nextText}
        </span>
        {sum.loadsTotal > 0 && (
          <span className="dash-num" style={{ color: L.muted, whiteSpace: "nowrap" }}>Loads {sum.loadsDone}/{sum.loadsTotal}</span>
        )}
      </div>
    </button>
  );
}

export function QualificationCard({ items, onOpen }: { items: QualTerminal[]; onOpen: (terminalId: string) => void }) {
  const L = useDashLook();
  return (
    <div style={{ ...L.primary, padding: "2px 14px 2px" }}>
      {items.map((t, i) => <Row key={t.terminalId} t={t} first={i === 0} onOpen={() => onOpen(t.terminalId)} />)}
    </div>
  );
}
