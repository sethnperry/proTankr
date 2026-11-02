"use client";
// app/planner/components/terminalwork/TerminalWorkSheet.tsx
//
// Terminal and transload work with a timer. With nothing running: pick the activity, the terminal and (optionally)
// the product, then Start. With a timer running: the activity, terminal and elapsed time, and Stop (with an
// optional note). Presentational: the caller starts and stops the record.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PickSheet } from "@/lib/ui/PickSheet";
import { ACTIVITIES, activityLabel, billableDefault, clock, minutesOf, startProblem, type Activity, type TerminalWorkRow } from "@/lib/terminalwork/terminalWork";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const chip = (on: boolean): React.CSSProperties => ({ padding: "10px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.18)"}`, background: on ? "#fff" : "#0a0a0b", color: on ? "#000" : "rgba(255,255,255,0.85)" });
const big: React.CSSProperties = { width: "100%", marginTop: 16, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" };
const picker: React.CSSProperties = { display: "flex", width: "100%", alignItems: "center", textAlign: "left", padding: "13px 14px", marginTop: 8, border: `1px solid ${HAIR}`, background: "#0f0f10", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" };

export function TerminalWorkSheet({ open, onClose, current, terminals, products, defaultTerminalId, defaults, onStart, onStop }: {
  open: boolean;
  onClose: () => void;
  current: TerminalWorkRow | null;
  terminals: { value: string; label: string }[];
  products: { value: string; label: string }[];
  defaultTerminalId: string | null;
  defaults: Partial<Record<Activity, boolean>>;
  onStart: (activity: Activity, terminal: { id: string | null; name: string }, productId: string | null) => void;
  onStop: (note?: string) => void;
}) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [terminalId, setTerminalId] = useState("");
  const [productId, setProductId] = useState("");
  const [pick, setPick] = useState<"terminal" | "product" | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { if (open) { setActivity(null); setProductId(""); setTerminalId(defaultTerminalId ?? ""); setNote(""); setErr(null); } }, [open, defaultTerminalId]);
  useEffect(() => { if (!open || !current) return; const t = window.setInterval(() => tick((n) => n + 1), 15_000); return () => window.clearInterval(t); }, [open, current]);

  const terminalLabel = terminals.find((t) => t.value === terminalId)?.label ?? "";
  const productLabel = products.find((x) => x.value === productId)?.label ?? "";

  return (
    <>
      <FullscreenModal open={open && !pick} title="Terminal work" onClose={onClose} footer={null}>
        {current ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fbbf24" }}>Timer running</div>
            <div className="dash-num" style={{ fontSize: 54, fontWeight: 900, margin: "6px 0" }}>{clock(minutesOf(current, Date.now()))}</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{activityLabel(current.activity)}</div>
            <div style={{ fontSize: 14, color: MUTE }}>{current.terminal_name}</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What got done? (optional)"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 70, marginTop: 16, padding: 10, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.28)", border: `1px solid ${HAIR}`, borderRadius: 0, fontFamily: "inherit" }} />
            <button type="button" style={big} onClick={() => { onStop(note); setNote(""); onClose(); }}>Stop timer</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, marginBottom: 6 }}>What are you doing?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ACTIVITIES.map((a) => <button key={a.value} type="button" style={chip(activity === a.value)} onClick={() => { setActivity(a.value); setErr(null); }}>{a.label}</button>)}
            </div>
            {activity && <div style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>{billableDefault(activity, defaults) ? "Billable by default." : "Not billable by default."}</div>}
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, margin: "16px 0 0" }}>Terminal</div>
            <button type="button" style={picker} onClick={() => setPick("terminal")}><span style={{ flex: 1 }}>{terminalLabel || "Pick the terminal"}</span><span style={{ color: MUTE }}>›</span></button>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, margin: "16px 0 0" }}>Product (optional)</div>
            <button type="button" style={picker} onClick={() => setPick("product")}><span style={{ flex: 1 }}>{productLabel || "No product"}</span><span style={{ color: MUTE }}>›</span></button>
            {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
            <button type="button" style={big} onClick={() => {
              const p = startProblem(activity, terminalLabel);
              if (p) { setErr(p); return; }
              onStart(activity!, { id: terminalId || null, name: terminalLabel }, productId || null);
            }}>Start timer</button>
          </div>
        )}
      </FullscreenModal>
      <PickSheet open={pick === "terminal"} title="Terminal" allLabel="Choose a terminal" options={terminals} value={terminalId} onPick={(v) => setTerminalId(v)} onClose={() => setPick(null)} />
      <PickSheet open={pick === "product"} title="Product" allLabel="No product" options={products} value={productId} onPick={(v) => setProductId(v)} onClose={() => setPick(null)} />
    </>
  );
}
