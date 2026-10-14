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

// ── Variant-specific tool layouts ───────────────────────────────────────────

export type ToolItem = { icon: ToolIcon; label: string; sub?: string | null; subColor?: string; onClick: () => void };

// B: one grouped list, icon + label + detail + chevron, like a settings screen.
export function ToolList({ items }: { items: ToolItem[] }) {
  const L = useDashLook();
  return (
    <div style={{ ...L.secondary, overflow: "hidden", padding: 0 }}>
      {items.map((t, i) => (
        <button key={t.label} type="button" onClick={t.onClick} className="dash-press"
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "0 14px", minHeight: 54,
            background: "none", border: "none", color: "#fff", cursor: "pointer", textAlign: "left" }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={t.icon} color="#fff" />
          </span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, alignSelf: "stretch",
            borderBottom: i < items.length - 1 ? `1px solid ${L.hairline}` : "none" }}>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{t.label}</span>
            {t.sub && <span style={{ fontSize: 14, color: t.subColor ?? L.muted, maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.sub}</span>}
            <span style={{ color: L.faint, fontSize: 18 }}>›</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// C: compact three-across icon panel, square, label under the icon.
export function ToolPanel({ items }: { items: ToolItem[] }) {
  const L = useDashLook();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: `1px solid ${L.hairline}`, background: L.hairline, gap: 1 }}>
      {items.map((t) => (
        <button key={t.label} type="button" onClick={t.onClick} className="dash-press"
          style={{ background: "#0f0f10", border: "none", color: "#fff", cursor: "pointer", padding: "14px 6px 12px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 7, minHeight: 82 }}>
          <Icon name={t.icon} color={t.subColor ?? "rgba(255,255,255,0.85)"} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// C: a row of big readouts under the main button.
export type GaugeCell = { label: string; value: string; unit?: string; color?: string; onClick?: () => void };
export function GaugePanel({ cells }: { cells: GaugeCell[] }) {
  const L = useDashLook();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 1, background: L.hairline, border: `1px solid ${L.hairline}`, marginTop: 12 }}>
      {cells.map((c) => (
        <button key={c.label} type="button" onClick={c.onClick} disabled={!c.onClick} className={c.onClick ? "dash-press" : undefined}
          style={{ background: "#0f0f10", border: "none", color: "#fff", textAlign: "left", padding: "10px 10px 9px", cursor: c.onClick ? "pointer" : "default", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden style={{ width: 6, height: 6, background: c.color ?? "rgba(255,255,255,0.5)", flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
          </div>
          <div className="dash-num" style={{ marginTop: 6, fontSize: 24, fontWeight: 800, lineHeight: 1, color: c.color ?? "#fff", whiteSpace: "nowrap" }}>
            {c.value}{c.unit && <span style={{ fontSize: 11, fontWeight: 700, color: L.muted, marginLeft: 2 }}>{c.unit}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}
