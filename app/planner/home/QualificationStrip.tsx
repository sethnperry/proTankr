"use client";
// app/planner/home/QualificationStrip.tsx
//
// Terminal-qualification strip prototype. Draws whatever steps it's given;
// nothing in the database supplies real steps yet, so the dashboard only
// shows this with clearly labeled mock data (?mockQual=1, dev or super admin).
//
// Monochrome: filled = done, outlined with a corner tick = next, dim outline
// = pending, hatched = blocked/waiting on someone else. The letter under each
// segment is the step type (L letter, V video, O orientation, T training
// load, C check load), so state never relies on color.

import React, { useState } from "react";
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
  const nextText = sum.complete ? "All steps done · waiting on access" : sum.blocked
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

export function QualificationCard({ items }: { items: QualTerminal[] }) {
  const L = useDashLook();
  const [open, setOpen] = useState<QualTerminal | null>(null);
  return (
    <div style={{ ...L.primary, padding: "2px 14px 2px" }}>
      {items.map((t, i) => <Row key={t.terminalId} t={t} first={i === 0} onOpen={() => setOpen(t)} />)}
      {open && (
        <div style={{ borderTop: `1px solid ${L.hairline}`, padding: "10px 0 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>{open.name} checklist</span>
            <button type="button" onClick={() => setOpen(null)} style={{ background: "none", border: "none", color: L.muted, fontSize: 13, cursor: "pointer" }}>Close</button>
          </div>
          {open.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, marginTop: 6 }}>
              <span style={{ width: 16, textAlign: "center", fontWeight: 800, color: s.state === "done" ? "#fff" : L.faint }}>
                {s.state === "done" ? "✓" : s.state === "blocked" ? "…" : s.state === "next" ? "›" : "○"}
              </span>
              <span style={{ flex: 1, color: s.state === "done" ? L.muted : "#fff", textDecoration: s.state === "done" ? "line-through" : undefined }}>{s.label}</span>
              <span style={{ fontSize: 11, color: s.state === "blocked" ? "#fbbf24" : L.faint }}>
                {s.state === "blocked" ? "Waiting" : s.state === "next" ? "Next" : s.state === "done" ? "Done" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Mock terminals covering few/many steps, different training-load counts,
// complete, partial, and blocked. Dev/super-admin only, never saved.
export function mockQualification(): QualTerminal[] {
  const st = (kind: QualStep["kind"], label: string, state: QualStep["state"]): QualStep => ({ kind, label, state });
  const loads = (n: number, done: number, firstState: QualStep["state"] = "next") =>
    Array.from({ length: n }, (_, i) => st("training_load", `Training load ${i + 1}`, i < done ? "done" : i === done ? firstState : "pending"));
  return [
    { terminalId: "q1", name: "Buckeye North", steps: [
      st("letter", "Company letter", "done"), st("video", "Training video", "done"),
      st("orientation", "On-site orientation", "next"), ...loads(2, 0, "pending"), st("check_load", "Operator check load", "pending"),
    ] },
    { terminalId: "q2", name: "Kinder Morgan Port Everglades Terminal", steps: [
      st("letter", "Company letter", "done"), st("video", "Training video", "done"), st("orientation", "On-site orientation", "done"),
      ...loads(8, 6), st("check_load", "Operator check load", "pending"),
    ] },
    { terminalId: "q3", name: "Citgo", steps: [
      st("letter", "Company letter", "blocked"), st("video", "Training video", "pending"), st("check_load", "Operator check load", "pending"),
    ] },
    { terminalId: "q4", name: "Marathon", steps: [
      st("letter", "Company letter", "done"), st("orientation", "On-site orientation", "done"),
      ...loads(3, 3), st("check_load", "Operator check load", "done"),
    ] },
  ];
}
