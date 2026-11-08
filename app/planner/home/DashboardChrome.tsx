"use client";
// app/planner/home/DashboardChrome.tsx
//
// Presentational pieces of the Driver Dashboard that follow the selected look
// (dashLook.tsx): the terminal access strip and the tool tiles.

import React, { useState } from "react";
import { useDashLook } from "./dashLook";
import type { ReadinessSegment, ReadinessSummary } from "@/lib/terminals/readiness";
import { EXPIRY_COLOR } from "@/lib/expiry";
import { Spinner, busyProps } from "@/lib/ui/pending";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

// Shared expiration colors (lib/expiry.ts): white > 30 days, yellow 8-30,
// orange 0-7, red expired.
const C = EXPIRY_COLOR;
const RED = C.expired;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

const stateColor = (s: ReadinessSegment) =>
  s.state === "expired" ? C.expired : s.state === "expiring" ? C.expiring : s.state === "soon" ? C.soon : s.state === "ready" ? "#f2f2f2" : null;

// ── Terminal access strip ───────────────────────────────────────────────────
// One box per terminal in the city. Filled from the bottom by how much of the
// renewal period is left (full white = carded today), colored by the
// app-wide rule. Expired = red hatch. No access (never carded, or expired
// more than 30 days) = empty box with a grey X. Access steps underway = one
// horizontal line per step, filled from the bottom as steps are done. The
// trip's pickup terminal gets a marker. Tap a box for its details; tap again
// to open the terminal, or the access steps for no-access/training boxes.
export function TerminalAccessStrip({ place, summary, onOpenTerminal, onOpenSteps, onChangeCity, loading, otherCities }: {
  place: string | null;
  // Terminal access expiring or expired in cities other than the one shown.
  // Tapping opens the expirations list, so no terminal switch is needed.
  otherCities?: { count: number; color: string; onOpen: () => void } | null;
  summary: ReadinessSummary;
  onOpenTerminal: (terminalId: string | null) => void;
  // No access or steps underway: tap again opens the access steps.
  onOpenSteps: (terminalId: string) => void;
  onChangeCity: () => void;
  loading?: boolean;
}) {
  const L = useDashLook();
  const [sel, setSel] = useState<string | null>(null);
  const segs = summary.segments;
  const selected = segs.find((s) => s.terminalId === sel) ?? null;
  const total = segs.length;
  const toneColor = (t: string) =>
    t === "bad" ? C.expired : t === "warn" ? C.expiring : t === "soon" ? C.soon : t === "ok" ? "rgba(255,255,255,0.78)" : L.muted;
  const openSeg = (s: ReadinessSegment) =>
    s.state === "none" || s.state === "training" ? onOpenSteps(s.terminalId) : onOpenTerminal(s.terminalId);
  const dayText = (s: ReadinessSegment) =>
    s.state === "training" ? `${s.steps!.done}/${s.steps!.total}` : s.state === "none" ? "—" : s.daysLeft! < 0 ? `−${-s.daysLeft!}d` : `${s.daysLeft}d`;

  return (
    <div style={{ ...L.primary, padding: "14px 14px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <button type="button" onClick={onChangeCity}
          style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, color: "#fff", cursor: "pointer" }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{place ?? "Pick a city"}</span>
          <span style={{ color: L.faint, fontSize: 13 }}> ›</span>
        </button>
        {otherCities && otherCities.count > 0 && (
          <button type="button" onClick={otherCities.onOpen} className="dash-press"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: otherCities.color, whiteSpace: "nowrap" }}>
            <span aria-hidden style={{ width: 8, height: 8, background: otherCities.color }} />
            {otherCities.count} in other {otherCities.count === 1 ? "city" : "cities"} ›
          </button>
        )}
      </div>

      {total === 0 ? (
        <div style={{ fontSize: 14, color: L.muted, marginTop: 10 }}>
          {loading ? "Loading terminals…" : place ? "No terminals listed in this city." : "Pick a city to see your terminal access."}
        </div>
      ) : (
        <div className="pt-tabscroll" style={{ overflowX: "auto", margin: "12px -4px 0", padding: "0 4px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 5, minWidth: total * 35 }}>
            {segs.map((s) => {
              const isSel = s.terminalId === sel;
              const color = stateColor(s);
              const none = s.state === "none";
              const training = s.state === "training";
              const expired = s.state === "expired";
              const fill = Math.max(0.06, s.remaining);
              const label = training ? `access steps ${s.steps!.done} of ${s.steps!.total}` : none ? (s.timedOut ? "access timed out" : "no access") : expired ? "expired" : `${s.daysLeft} days left`;
              return (
                <button
                  key={s.terminalId}
                  type="button"
                  className="dash-press"
                  aria-label={`${s.name}: ${label}`}
                  onClick={() => (isSel ? openSeg(s) : setSel(s.terminalId))}
                  style={{ flex: "1 1 0", minWidth: 30, maxWidth: 72, background: "none", border: "none", padding: 0, cursor: "pointer", color: "#fff" }}
                >
                  <div style={{ height: 8, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
                    {s.isPickup && <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `5px solid ${color ?? "#fff"}` }} />}
                  </div>
                  <div style={{
                    position: "relative", height: 46, marginTop: 2, borderRadius: 2, overflow: "hidden",
                    background: none || training ? "transparent" : expired ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.08)",
                    border: isSel ? "1px solid rgba(255,255,255,0.8)"
                      : none || training ? `1px solid ${L.faint}` : expired ? `1px solid ${RED}88` : "1px solid transparent",
                  }}>
                    {training ? (
                      <div style={{ position: "absolute", inset: 3, display: "flex", flexDirection: "column-reverse", gap: 2 }}>
                        {s.steps!.states.map((st, i) => (
                          <div key={i} style={{
                            flex: "1 1 0", minHeight: 2, borderRadius: 1,
                            background: st === "done" ? "#f2f2f2" : st === "blocked" ? `${C.soon}55` : "transparent",
                            border: st === "next" ? "1px solid #f2f2f2" : st === "pending" ? `1px solid ${L.faint}` : st === "blocked" ? `1px solid ${C.soon}` : "none",
                          }} />
                        ))}
                      </div>
                    ) : none ? (
                      <svg width="100%" height="100%" viewBox="0 0 30 46" preserveAspectRatio="none" aria-hidden style={{ position: "absolute", inset: 0 }}>
                        <path d="M9 16 L21 30 M21 16 L9 30" stroke="rgba(255,255,255,0.32)" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                      </svg>
                    ) : expired ? (
                      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(135deg, ${RED}66 0 4px, transparent 4px 8px)` }} />
                    ) : (
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fill * 100}%`, background: color!, transition: "height 400ms ease" }} />
                    )}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: s.isPickup || isSel ? 800 : 600, marginTop: 5, letterSpacing: "0.02em",
                    color: none ? L.faint : isSel || s.isPickup || training ? "#fff" : L.muted,
                  }}>
                    {s.short}
                  </div>
                  <div style={{ fontSize: 9, marginTop: 1, color: none ? L.faint : training ? "#fff" : s.state === "ready" ? L.muted : color!, fontVariantNumeric: "tabular-nums" }}>
                    {dayText(s)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selected ? (
        <button type="button" onClick={() => openSeg(selected)}
          style={{ display: "flex", width: "100%", alignItems: "baseline", gap: 8, marginTop: 10, paddingTop: 10, background: "none", border: "none", borderTopStyle: "solid", borderTopWidth: 1, borderTopColor: L.hairline, color: "#fff", cursor: "pointer", textAlign: "left" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
            <span style={{ fontWeight: 800 }}>{selected.name}</span>
            <span style={{ color: L.muted }}>
              {selected.state === "training"
                ? ` · access steps ${selected.steps!.done} of ${selected.steps!.total}`
                : selected.state === "none"
                ? (selected.timedOut ? ` · no access · expired ${fmtDate(selected.expiresOn)}` : " · no access")
                : ` · carded ${fmtDate(selected.cardedOn)} · ${selected.daysLeft! < 0 ? `expired ${fmtDate(selected.expiresOn)}` : `good to ${fmtDate(selected.expiresOn)}`}`}
            </span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", color: stateColor(selected) ?? L.muted }}>
            {selected.state === "training" ? "Continue ›" : selected.state === "none" ? "Start steps ›" : selected.daysLeft! < 0 ? `${-selected.daysLeft!}d over ›` : `${selected.daysLeft}d ›`}
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

export type ToolIcon = "truck" | "terminal" | "store" | "card" | "route" | "chart" | "fuel" | "people" | "locate" | "plan" | "lock";

function Icon({ name, color, fluid }: { name: ToolIcon; color: string; fluid?: boolean }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg {...(fluid ? { style: { width: "100%", height: "100%" } } : { width: 22, height: 22 })} viewBox="0 0 24 24" aria-hidden>
      {name === "truck" && (<g {...p}><path d="M2 16V7h10v9" /><path d="M12 10h4l3 3v3h-7" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="16" cy="17.5" r="1.8" /></g>)}
      {name === "terminal" && (<g {...p}><path d="M4 21V9l8-5 8 5v12" /><path d="M9 21v-6h6v6" /><path d="M4 21h16" /></g>)}
      {name === "store" && (<g {...p}><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></g>)}
      {name === "card" && (<g {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></g>)}
      {name === "route" && (<g {...p}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></g>)}
      {name === "fuel" && (<g {...p}><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" /><path d="M3 21h12" /><path d="M7 8h4" /><path d="M14 11h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V9l-3-3" /></g>)}
      {name === "people" && (<g {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a5 5 0 0 1 10 0v1" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2a4 4 0 0 1 5 3.8V20" /></g>)}
      {name === "locate" && (<g {...p}><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="7.5" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /></g>)}
      {name === "plan" && (<g {...p}><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 4V3h6v1" /><path d="M8.5 10h7" /><path d="M8.5 14h7" /><path d="M8.5 18h4" /></g>)}
      {name === "lock" && (<g {...p}><rect x="5" y="11" width="14" height="10" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /><path d="M12 15v2" /></g>)}
      {name === "chart" && (<g {...p}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></g>)}
    </svg>
  );
}

// ── Tools and gauge panel ───────────────────────────────────────────────────

export type ToolItem = {
  icon: ToolIcon; label: string; sub?: string | null; subColor?: string; onClick?: () => void; busy?: boolean;
  /** A tile that opens a list of smaller tools instead of doing one thing. */
  group?: ToolItem[];
};

// Square tiles, three across, label under the icon. The grid is capped in width so the tiles stop growing
// on a big screen; the page puts the grid in its own column there.
export function ToolPanel({ items }: { items: ToolItem[] }) {
  const L = useDashLook();
  const [openGroup, setOpenGroup] = React.useState<string | null>(null);
  const group = items.find((t) => t.label === openGroup)?.group ?? null;
  const cell: React.CSSProperties = { background: "#0f0f10", aspectRatio: "1 / 1", minWidth: 0 };
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", border: `1px solid ${L.hairline}`, background: L.hairline, gap: 1, maxWidth: 480, margin: "0 auto", containerType: "inline-size" as const }}>
        {items.map((t) => (
          <button key={t.label} type="button" onClick={t.group ? () => setOpenGroup(t.label) : t.onClick} className="dash-press" {...busyProps(!!t.busy)}
            style={{ ...cell, border: "none", color: "#fff", cursor: "pointer", padding: 4, position: "relative",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6cqw" }}>
            {t.subColor && <span aria-hidden title={t.sub ?? undefined} style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, background: t.subColor }} />}
            <span style={{ width: "clamp(20px, 9cqw, 40px)", height: "clamp(20px, 9cqw, 40px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {t.busy ? <Spinner size={16} /> : <Icon name={t.icon} color={t.subColor ?? "rgba(255,255,255,0.85)"} fluid />}
            </span>
            <span style={{ fontSize: "clamp(9px, 3cqw, 12px)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
          </button>
        ))}
        {Array.from({ length: (3 - (items.length % 3)) % 3 }, (_, i) => <div key={`pad${i}`} style={cell} />)}
      </div>
      <FullscreenModal open={!!group} title={openGroup ?? ""} onClose={() => setOpenGroup(null)} footer={null}>
        {(group ?? []).map((g) => (
          <button key={g.label} type="button" className="dash-press" {...busyProps(!!g.busy)}
            onClick={() => { setOpenGroup(null); g.onClick?.(); }}
            style={{ ...L.secondary, display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px", marginBottom: 8, color: "#fff", textAlign: "left", cursor: "pointer" }}>
            <span style={{ width: 22, height: 22, flexShrink: 0 }}><Icon name={g.icon} color={g.subColor ?? "rgba(255,255,255,0.85)"} fluid /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{g.label}</span>
              {g.sub && <span style={{ display: "block", fontSize: 12, color: g.subColor ?? L.muted, marginTop: 2 }}>{g.sub}</span>}
            </span>
            <span style={{ color: L.faint }}>›</span>
          </button>
        ))}
      </FullscreenModal>
    </>
  );
}

// A row of big readouts under the main button.
export type GaugeCell = { label: string; value: string; unit?: string; color?: string; onClick?: () => void; busy?: boolean; wide?: boolean };
// Width to height of a chip. Not square: a little wider than tall, and the same for every chip row so the hours card
// and the status chips line up. Everything inside scales with the panel (container units), so the shape never stretches.
export const CHIP_ASPECT = "5 / 4";

// fluid: the chips are measured against `of` columns, so a row of three is the same size as a row of four, and the
// whole row grows with its container (no 480px cap) up to a larger type size. Used by the Dispatch dashboard.
export function GaugePanel({ cells, equal, labelBelow, top = 12, small, square, fluid, of = 4 }: { cells: GaugeCell[]; equal?: boolean; labelBelow?: boolean; top?: number; small?: boolean; square?: boolean; fluid?: boolean; of?: number }) {
  const L = useDashLook();
  // equal: every cell the same width, the whole set scaling with its width
  // (text sized from the panel via container units) up to the screen height,
  // and labels truncating once they no longer fit.
  const labelSize = fluid ? "clamp(8px, 2.6cqw, 15px)" : square ? "clamp(8px, 2.6cqw, 12px)" : equal ? "clamp(8px, 2.6cqw, 11px)" : small ? 8 : 9;
  const labelSpacing = equal || fluid ? "0.14em" : "0.06em"; // four labels have to fit a phone-width row
  const valueSize = fluid ? "clamp(18px, 7.6cqw, 56px)" : square ? "clamp(18px, 7.6cqw, 36px)" : equal ? "clamp(16px, 7cqw, 30px)" : small ? 17 : 24;
  const chips = fluid ? { square: true as const } : { square };
  const grid = (
    <div style={{
      display: "grid",
      gridTemplateColumns: equal || fluid ? `repeat(${cells.length}, minmax(0, 1fr))` : cells.map((c) => (c.wide ? "1.35fr" : "1fr")).join(" "),
      gap: 1, background: L.hairline, border: `1px solid ${L.hairline}`, marginTop: fluid ? 0 : top,
      ...(fluid ? { width: `${(cells.length / of) * 100}%`, boxSizing: "border-box" as const, minWidth: 0 } : {}),
      ...(square && !fluid ? { maxWidth: 480, marginLeft: "auto", marginRight: "auto", containerType: "inline-size" as const, boxSizing: "border-box" as const, minWidth: 0 } : {}),
      ...(equal ? { containerType: "inline-size" as const, maxWidth: "100vh", width: "100%", boxSizing: "border-box" as const, minWidth: 0, overflow: "hidden" } : {}),
    }}>
      {cells.map((c) => (
        <button key={c.label} type="button" onClick={c.onClick} disabled={!c.onClick || !!c.busy} aria-busy={!!c.busy} className={c.onClick ? "dash-press" : undefined}
          style={{ background: "#0f0f10", border: "none", color: "#fff", textAlign: chips.square ? "center" : "left", padding: small ? "7px 8px 6px" : "10px 10px 9px", cursor: c.onClick ? "pointer" : "default", minWidth: 0,
            ...(chips.square ? { aspectRatio: CHIP_ASPECT, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: "1.6cqw", textAlign: "center" as const } : {}) }}>
          {(() => {
            const label = (
              <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: labelSize, fontWeight: 800, letterSpacing: labelSpacing, textTransform: "uppercase", color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{c.label}</span>
              </div>
            );
            const value = (
              <div className="dash-num" style={{ marginTop: labelBelow ? 0 : 6, marginBottom: labelBelow ? 6 : 0, fontSize: valueSize, fontWeight: 800, lineHeight: 1, color: c.color ?? "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.value}{c.unit && <span style={{ fontSize: 11, fontWeight: 700, color: L.muted, marginLeft: 2 }}>{c.unit}</span>}
              </div>
            );
            return labelBelow ? <>{value}{label}</> : <>{label}{value}</>;
          })()}
        </button>
      ))}
    </div>
  );
  return fluid ? <div style={{ containerType: "inline-size" as const, width: "100%", minWidth: 0, marginTop: top }}>{grid}</div> : grid;
}
