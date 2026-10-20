"use client";
// app/planner/dispatch/TimelineCard.tsx
//
// The planned load for one driver, laid out in time: drive to the terminal,
// gauging if it applies, loading, drive to the store, the drop. Flags show
// where the plan runs into trouble. "Add to day plan" stacks it so the next
// load starts when this one is forecast to end. The day plan lives on this
// screen only; nothing is sent to the driver yet.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DutyGraph } from "./DutyGraph";
import { dutyBlocks } from "@/lib/dispatch/dutyGraph";
import { useDashLook } from "../home/dashLook";
import { PRIMARY_BTN, SECONDARY_BTN } from "@/lib/ui/look";
import { clock, durationText, type Flag, type Forecast } from "@/lib/dispatch/forecast";
import { fieldInput } from "../components/trip/tripUi";
import type { PlanGroup } from "@/lib/dispatch/compPlan";

export type DayLeg = {
  startMs: number; endMs: number; driveMin: number; terminal: string; location: string; locationLL: { lat: number; lon: number } | null;
  // What a dispatch of this leg writes.
  terminalId: string; city: string | null; state: string | null; locationId: string; deliveryType: "drop" | "pump_off";
  supplierId: string | null; orderNumber: string; truckId: string | null; trailerId: string | null; warnings: string[];
  groups?: PlanGroup[];
};

const FLAG_COLOR: Record<Flag["severity"], string> = { info: "rgba(255,255,255,0.5)", warn: "#fb923c", bad: "#f87171" };

export function toLocalInput(ms: number): string {
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TimelineCard(p: {
  driverName: string;
  forecast: Forecast | null;
  startMs: number;
  chained: boolean;
  typicalStart: string | null;       // "5:30 AM"
  dayLegs: DayLeg[];
  historyLoading?: boolean;
  onStart: (ms: number | null) => void;
  onAdd: () => void;
  onRemoveLeg: (index: number) => void;
  onClearDay: () => void;
  // Dispatch
  compartments?: React.ReactNode;
  terminalPlace?: string | null;   // abbreviated, "Tampa, FL"
  locationPlace?: string | null;
  orderNumber: string;
  onOrder: (v: string) => void;
  warnings: string[];                 // everything shown above that is a problem; never blocks
  dispatching?: boolean;
  dispatchMsg?: { ok: boolean; text: string } | null;
  onDispatch: () => void;
}) {
  const L = useDashLook();
  const [detailOpen, setDetailOpen] = useState(false);
  const f = p.forecast;
  const shiftH = f ? (f.endMs - (p.dayLegs[0]?.startMs ?? p.startMs)) / 3600000 : 0;
  return (
    <div style={{ ...L.secondary, padding: "12px 12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>Timeline</span>
        <span style={{ fontSize: 15, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.driverName}</span>
        {p.typicalStart && <span className="dash-num" style={{ fontSize: 12, color: L.muted }}>usually starts {p.typicalStart}</span>}
      </div>

      {p.dayLegs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {p.dayLegs.map((l, i) => (
            <div key={i} className="dash-num" style={{ display: "flex", gap: 8, fontSize: 12, padding: "4px 0", borderTop: i ? `1px solid ${L.hairline}` : undefined }}>
              <span style={{ color: L.muted, width: 44 }}>Load {i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clock(l.startMs)}–{clock(l.endMs)} · {l.terminal} → {l.location}</span>
              <button type="button" aria-label="Remove load" onClick={() => p.onRemoveLeg(i)} style={{ border: "none", background: "transparent", color: L.muted, cursor: "pointer", fontSize: 15 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>
          {p.chained ? `Load ${p.dayLegs.length + 1} starts (after load ${p.dayLegs.length})` : "Starts"}
        </div>
        <input type="datetime-local" value={toLocalInput(p.startMs)} onChange={(e) => { const t = Date.parse(e.target.value); if (Number.isFinite(t)) p.onStart(t); }} style={fieldInput} />
      </div>

      {!f ? (
        <div style={{ fontSize: 13, color: L.muted, marginTop: 10 }}>{p.historyLoading ? "Loading trip history…" : "Pick a drop location and a terminal."}</div>
      ) : (
        <>
          <button type="button" onClick={() => setDetailOpen(true)} className="dash-press" aria-label="Open timeline detail"
            style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 0, marginTop: 10 }}>
            <DutyGraph blocks={dutyBlocks(f.segments, p.dayLegs)}
              terminalPlace={p.terminalPlace ?? null} terminalAtMs={f.segments.find((s) => s.key === "to_terminal")?.endMs ?? null}
              locationPlace={p.locationPlace ?? null} locationAtMs={f.segments.find((s) => s.key === "to_delivery")?.endMs ?? null} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${L.hairline}` }}>
              <span style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>Delivery complete about {clock(f.endMs)}</span>
              <span className="dash-num" style={{ fontSize: 12, color: L.muted }}>{shiftH.toFixed(1)} h into the day · details ›</span>
            </div>
          </button>
          <FullscreenModal open={detailOpen} title="Timeline" onClose={() => setDetailOpen(false)}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{p.driverName}</div>
            {f.segments.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "8px 0", borderTop: i ? `1px solid ${L.hairline}` : undefined, color: s.key === "gauging" ? "#fb923c" : "#fff" }}>
                <span className="dash-num" style={{ width: 66, fontSize: 12, color: L.muted, flexShrink: 0 }}>{clock(s.startMs)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{s.label}</span>
                  {s.basis && <div style={{ fontSize: 12, color: L.faint }}>{s.basis.note}</div>}
                </span>
                <span className="dash-num" style={{ fontSize: 13, color: L.muted }}>{durationText(s.minutes)}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, paddingTop: 10, borderTop: `1px solid ${L.hairline}` }}>
              <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>Delivery complete about {clock(f.endMs)}</span>
              <span className="dash-num" style={{ fontSize: 12, color: L.muted }}>{shiftH.toFixed(1)} h into the day</span>
            </div>
            {f.flags.map((x, i) => (
              <div key={i} style={{ fontSize: 13, color: FLAG_COLOR[x.severity], marginTop: 8 }}>{x.severity === "info" ? "" : "⚠ "}{x.text}</div>
            ))}
          </FullscreenModal>
          {f.flags.map((x, i) => (
            <div key={i} style={{ fontSize: 12, color: FLAG_COLOR[x.severity], marginTop: 6 }}>{x.severity === "info" ? "" : "⚠ "}{x.text}</div>
          ))}
          <div style={{ marginTop: 12 }}>{p.compartments}</div>
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Order number (optional)</div>
            <input value={p.orderNumber} onChange={(e) => p.onOrder(e.target.value)} placeholder="Saves the driver typing it" style={fieldInput} />
          </div>
          <button type="button" className="dash-press" onClick={p.onAdd} style={{ ...SECONDARY_BTN, marginTop: 10, padding: "10px 0", fontSize: 12 }}>
            + Then another load after this one
          </button>
          {p.dispatchMsg && <div style={{ fontSize: 13, marginTop: 10, color: p.dispatchMsg.ok ? "#4ade80" : "#f87171" }}>{p.dispatchMsg.text}</div>}
          <button type="button" className="dash-press" onClick={p.onDispatch} disabled={p.dispatching} aria-busy={!!p.dispatching} style={{ ...PRIMARY_BTN, marginTop: 10 }}>
            {p.dispatching ? "Dispatching…" : `${p.warnings.length ? "Dispatch anyway" : "Dispatch"} ${p.dayLegs.length + 1} load${p.dayLegs.length ? "s" : ""} to ${p.driverName.split(" ")[0]}`}
          </button>
          <div style={{ fontSize: 11, color: L.faint, marginTop: 6 }}>
            {p.warnings.length ? `${p.warnings.length} warning${p.warnings.length === 1 ? "" : "s"} above. Warnings never block a dispatch. ` : ""}
            The driver sees it on their dashboard and begins it from there.
          </div>
        </>
      )}
      {p.dayLegs.length > 0 && (
        <button type="button" className="dash-press" onClick={p.onClearDay} style={{ ...SECONDARY_BTN, marginTop: 8, padding: "9px 0", fontSize: 12 }}>Clear day plan</button>
      )}
    </div>
  );
}
