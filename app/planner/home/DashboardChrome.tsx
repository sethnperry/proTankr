"use client";
// app/planner/home/DashboardChrome.tsx
//
// Presentational pieces of the Driver Dashboard that follow the selected look
// (dashLook.tsx): the terminal access strip and the tool tiles.

import React, { useState } from "react";
import { useDashLook } from "./dashLook";
import type { ReadinessSegment, ReadinessSummary } from "@/lib/terminals/readiness";

const AMBER = "#fbbf24";
const RED = "#f87171";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

// ── Terminal access strip ───────────────────────────────────────────────────
// One bar per terminal in the city: the fill is how much of the renewal
// period is left (full = just carded), the color is the state. A dashed empty
// bar is a starred terminal with no carded date. The trip's pickup terminal
// gets a marker. Tap a bar for its dates; tap again (or Open) for the
// terminal list.

export function TerminalAccessStrip({ place, summary, onOpenTerminal, onChangeCity, loading }: {
  place: string | null;
  summary: ReadinessSummary;
  onOpenTerminal: (terminalId: string | null) => void;
  onChangeCity: () => void;
  loading?: boolean;
}) {
  const L = useDashLook();
  const [sel, setSel] = useState<string | null>(null);
  const segs = summary.segments;
  const selected = segs.find((s) => s.terminalId === sel) ?? null;
  const total = segs.length;
  const fillColor = (s: ReadinessSegment) =>
    s.state === "expired" ? RED : s.state === "expiring" ? AMBER : "#f2f2f2";
  const toneColor = (t: string) => (t === "bad" ? RED : t === "warn" ? AMBER : t === "ok" ? "rgba(255,255,255,0.78)" : L.muted);

  return (
    <div style={{ ...L.primary, padding: "14px 14px 12px" }} className={L.animate ? "dash-enter" : undefined}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <button type="button" onClick={onChangeCity}
          style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, color: "#fff", cursor: "pointer" }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{place ?? "Pick a city"}</span>
          <span style={{ color: L.faint, fontSize: 13 }}> ›</span>
        </button>
        {total > 0 && (
          <span style={{ fontSize: 13, color: L.muted, whiteSpace: "nowrap" }}>
            <span className="dash-num" style={{ color: "#fff", fontWeight: 800, fontSize: L.instrument ? 17 : undefined }}>{summary.ready}</span>{L.instrument ? <span className="dash-num">/{total}</span> : <> of {total}</>} ready
          </span>
        )}
      </div>

      {total === 0 ? (
        <div style={{ fontSize: 14, color: L.muted, marginTop: 10 }}>
          {loading ? "Loading terminals…" : place ? "Star the terminals you use in this city to track access here." : "Pick a city to see your terminal access."}
        </div>
      ) : (
        <div className="pt-tabscroll" style={{ overflowX: "auto", margin: "12px -4px 0", padding: "0 4px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 5, minWidth: total * 35 }}>
            {segs.map((s) => {
              const isSel = s.terminalId === sel;
              const fill = s.state === "none" ? 0 : s.state === "expired" ? 1 : Math.max(0.08, s.remaining);
              return (
                <button
                  key={s.terminalId}
                  type="button"
                  className="dash-press"
                  aria-label={`${s.name}: ${s.state === "none" ? "not carded" : s.state}`}
                  onClick={() => (isSel ? onOpenTerminal(s.terminalId) : setSel(s.terminalId))}
                  style={{ flex: "1 1 0", minWidth: 30, maxWidth: 72, background: "none", border: "none", padding: 0, cursor: "pointer", color: "#fff" }}
                >
                  <div style={{ height: 8, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
                    {s.isPickup && <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `5px solid ${fillColor(s)}` }} />}
                  </div>
                  <div style={{
                    position: "relative", height: 46, marginTop: 2, borderRadius: L.instrument ? 2 : 6, overflow: "hidden",
                    background: s.state === "none" ? "transparent" : s.state === "expired" ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.08)",
                    border: s.state === "none" ? `1px dashed ${L.faint}` : isSel ? "1px solid rgba(255,255,255,0.7)" : "1px solid transparent",
                    boxShadow: isSel && s.state === "none" ? "0 0 0 1px rgba(255,255,255,0.5)" : undefined,
                  }}>
                    {s.state === "expired" ? (
                      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(135deg, ${RED}55 0 4px, transparent 4px 8px)` }} />
                    ) : (
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fill * 100}%`, background: fillColor(s), transition: "height 400ms ease" }} />
                    )}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: s.isPickup || isSel ? 800 : 600, marginTop: 5, letterSpacing: "0.02em",
                    color: s.state === "expired" ? RED : s.state === "expiring" ? AMBER : isSel || s.isPickup ? "#fff" : L.muted,
                  }}>
                    {s.short}
                  </div>
                  <div style={{ fontSize: 9, marginTop: 1, color: s.state === "expired" ? RED : s.state === "expiring" ? AMBER : L.faint, fontVariantNumeric: "tabular-nums" }}>
                    {s.state === "none" ? "—" : s.daysLeft! < 0 ? `−${-s.daysLeft!}d` : `${s.daysLeft}d`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected ? (
        <button type="button" onClick={() => onOpenTerminal(selected.terminalId)}
          style={{ display: "flex", width: "100%", alignItems: "baseline", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${L.hairline}`, background: "none", border: "none", borderTopStyle: "solid", borderTopWidth: 1, borderTopColor: L.hairline, color: "#fff", cursor: "pointer", textAlign: "left" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
            <span style={{ fontWeight: 800 }}>{selected.name}</span>
            <span style={{ color: L.muted }}>
              {selected.state === "none"
                ? " · not carded"
                : ` · carded ${fmtDate(selected.cardedOn)} · ${selected.daysLeft! < 0 ? `expired ${fmtDate(selected.expiresOn)}` : `good to ${fmtDate(selected.expiresOn)}`}`}
            </span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", color: selected.state === "expired" ? RED : selected.state === "expiring" ? AMBER : "#fff" }}>
            {selected.state === "none" ? "Open ›" : selected.daysLeft! < 0 ? `${-selected.daysLeft!}d over ›` : `${selected.daysLeft}d ›`}
          </span>
        </button>
      ) : summary.headline ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${L.hairline}`, fontSize: 13, fontWeight: 600, color: toneColor(summary.headline.tone) }}>
          {summary.headline.text}
        </div>
      ) : null}
    </div>
  );
}

// ── Tool tiles ──────────────────────────────────────────────────────────────

export type ToolIcon = "truck" | "terminal" | "store" | "card" | "route" | "chart";

function Icon({ name, color }: { name: ToolIcon; color: string }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      {name === "truck" && (<g {...p}><path d="M2 16V7h10v9" /><path d="M12 10h4l3 3v3h-7" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="16" cy="17.5" r="1.8" /></g>)}
      {name === "terminal" && (<g {...p}><path d="M4 21V9l8-5 8 5v12" /><path d="M9 21v-6h6v6" /><path d="M4 21h16" /></g>)}
      {name === "store" && (<g {...p}><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></g>)}
      {name === "card" && (<g {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></g>)}
      {name === "route" && (<g {...p}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></g>)}
      {name === "chart" && (<g {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></g>)}
    </svg>
  );
}

export function ToolTile({ icon, label, sub, subColor, onClick, delay = 0 }: {
  icon: ToolIcon; label: string; sub?: string | null; subColor?: string; onClick: () => void; delay?: number;
}) {
  const L = useDashLook();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`dash-press${L.animate ? " dash-enter" : ""}`}
      style={{
        ...L.secondary, color: "#fff", cursor: "pointer", textAlign: "left", padding: "13px 14px",
        display: "flex", alignItems: "center", gap: 12, minHeight: 60, minWidth: 0,
        animationDelay: L.animate ? `${delay}ms` : undefined,
      }}
    >
      <Icon name={icon} color="rgba(255,255,255,0.8)" />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{label}</span>
        {sub && (
          <span style={{ display: "block", fontSize: 12, color: subColor ?? L.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}

export function LookSwitch({ value, onChange }: { value: string; onChange: (v: "a" | "b" | "c") => void }) {
  const L = useDashLook();
  const opt = (v: "a" | "b" | "c", label: string) => (
    <button type="button" onClick={() => onChange(v)}
      style={{ flex: 1, padding: "7px 0", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
        background: value === v ? "#fff" : "transparent", color: value === v ? "#000" : L.muted }}>
      {label}
    </button>
  );
  return (
    <div style={{ marginTop: 28, display: "flex", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 999, border: `1px solid ${L.hairline}`, width: 260 }}>
        {opt("a", "A Mono")}
        {opt("b", "B Native")}
        {opt("c", "C Instr.")}
      </div>
    </div>
  );
}
