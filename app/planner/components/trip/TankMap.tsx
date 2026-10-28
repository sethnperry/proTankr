"use client";
// app/planner/components/trip/TankMap.tsx
//
// Top-down view for picking which store tank each compartment drops into.
// The trailer is thin and tall on the left, C1 on top and the last compartment
// at the bottom. The store's tanks sit on the right: dome lids for a drop,
// fill caps for a pump off. Swipe from a compartment to a tank to connect
// them, or tap a compartment and then a tank. A second tank can be added to a
// compartment to split it (gallons per tank are typed in the readout below).
// Everything the map can do is also in the pop-out (onPick), for fat fingers.

import React, { useRef, useState } from "react";
import { muted } from "./tripUi";

export type MapComp = {
  id: string;
  n: number;
  productId: string | null;
  code: string;
  color: string;
  gallons: number;
  max: number;
  retained: boolean;
  targets: { tank: string; gallons: number }[];
  /** Not dropped here: shown in place but can't be linked. */
  kind?: "empty" | "later";
};
export type MapTank = { tank: string; code: string | null; name?: string | null; color: string | null; productId: string | null; capacity: number | null };

const VBW = 340;
const TRAILER_X = 8;
const TRAILER_W = 52;
const TANK_CX = 282;
const R = 27;

// A numbered tank reads "T3"; a named one (EAST) reads as is. Long names shrink to fit the lid.
const tankTag = (tank: string) => (/^\d+$/.test(tank.trim()) ? `T${tank}` : tank);
const lidFont = (tag: string) => Math.max(7, Math.min(13, (R * 1.76) / Math.max(1, tag.length * 0.68)));

const g0 = (n: number) => Math.round(n).toLocaleString("en-US");

export function TankMap({
  comps, tanks, kind, armedId, splitId, onArm, onLink, onPick, onSplitStart, onSplitGallons, onUnlink,
}: {
  comps: MapComp[];
  tanks: MapTank[];
  kind: "dome" | "cap";
  armedId: string | null;
  splitId: string | null;
  onArm: (id: string | null) => void;
  onLink: (compId: string, tank: string) => void;
  onPick: (compId: string) => void;
  onSplitStart: (compId: string) => void;
  onSplitGallons: (compId: string, tank: string, gallons: number) => void;
  onUnlink: (compId: string, tank: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ compId: string; x: number; y: number; sx: number; sy: number; moved: boolean } | null>(null);

  const sorted = [...comps].sort((a, b) => a.n - b.n);
  const active = sorted.filter((c) => !c.kind);
  const H = Math.max(230, sorted.length * 64, tanks.length * 74) + 16;
  const top = 8;
  const trailerH = H - 16;

  // Compartment heights follow capacity but never get too thin to tap.
  const avg = sorted.length ? sorted.reduce((t, c) => t + (c.max || c.gallons || 1), 0) / sorted.length : 1;
  const weights = sorted.map((c) => Math.max(c.max || c.gallons || 1, avg * 0.6));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const segGap = 4;
  let y = top;
  const segs = sorted.map((c, i) => {
    const h = (trailerH - segGap * (sorted.length - 1)) * (weights[i] / wsum);
    const seg = { c, y, h, mid: y + h / 2 };
    y += h + segGap;
    return seg;
  });
  const tankPos = tanks.map((t, i) => ({ t, cy: top + (trailerH / Math.max(1, tanks.length)) * (i + 0.5) }));
  const intoTank = (tank: string) => active.reduce((s, c) => s + c.targets.filter((x) => x.tank === tank).reduce((a, b) => a + b.gallons, 0), 0);

  const armed = active.find((c) => c.id === armedId) ?? null;
  const dim = (t: MapTank) => !!armed && !!t.productId && armed.productId !== t.productId;

  const point = (e: React.PointerEvent) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * VBW) / (r.width || 1), y: ((e.clientY - r.top) * H) / (r.height || 1) };
  };
  const tankAt = (x: number, yy: number) => {
    let best: { tank: string; d: number } | null = null;
    for (const p of tankPos) {
      const d = Math.hypot(x - TANK_CX, yy - p.cy);
      if (d <= R + 14 && (!best || d < best.d)) best = { tank: p.t.tank, d };
    }
    return best?.tank ?? null;
  };

  const down = (e: React.PointerEvent, compId: string) => {
    const p = point(e);
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setDrag({ compId, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = point(e);
    setDrag({ ...drag, x: p.x, y: p.y, moved: drag.moved || Math.hypot(p.x - drag.sx, p.y - drag.sy) > 8 });
  };
  const up = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = point(e);
    const d = drag;
    setDrag(null);
    if (d.moved) {
      const tank = tankAt(p.x, p.y);
      if (tank) onLink(d.compId, tank);
    } else {
      onArm(armedId === d.compId ? null : d.compId);
    }
  };

  const path = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VBW} ${H}`}
        width="100%"
        style={{ display: "block", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <radialGradient id="tm-dome" cx="40%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#3a3a3d" />
            <stop offset="100%" stopColor="#141415" />
          </radialGradient>
        </defs>

        {/* connectors, under everything */}
        {segs.flatMap(({ c, mid }) =>
          c.targets.map((t, k) => {
            const tp = tankPos.find((p) => p.t.tank === t.tank);
            if (!tp) return null;
            return (
              <path key={`${c.id}-${t.tank}-${k}`} d={path(TRAILER_X + TRAILER_W, mid, TANK_CX - R, tp.cy)}
                fill="none" stroke={c.color} strokeWidth={c.targets.length > 1 ? 2.2 : 3.2} strokeLinecap="round" opacity={0.95} />
            );
          }),
        )}
        {drag && drag.moved && (
          <path d={path(TRAILER_X + TRAILER_W, segs.find((s) => s.c.id === drag.compId)?.mid ?? drag.sy, drag.x, drag.y)}
            fill="none" stroke="#fff" strokeWidth={2.5} strokeDasharray="5 4" strokeLinecap="round" />
        )}

        {/* trailer, top down */}
        <rect x={TRAILER_X - 3} y={top - 3} width={TRAILER_W + 6} height={trailerH + 6} rx={14} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
        {segs.map(({ c, y: sy, h }) => {
          const on = armedId === c.id;
          if (c.kind) {
            return (
              <g key={c.id} opacity={0.7}>
                <rect x={TRAILER_X} y={sy} width={TRAILER_W} height={h} rx={6} fill="none"
                  stroke={c.kind === "later" ? c.color : "rgba(255,255,255,0.25)"} strokeWidth={1.5} strokeDasharray="4 4" />
                <text x={TRAILER_X + TRAILER_W / 2} y={sy + h / 2 - 2} textAnchor="middle" fontSize={12} fontWeight={800} fill="rgba(255,255,255,0.7)">C{c.n}</text>
                <text x={TRAILER_X + TRAILER_W / 2} y={sy + h / 2 + 12} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.5)">{c.kind === "later" ? "Next stop" : "Empty"}</text>
              </g>
            );
          }
          return (
            <g key={c.id} onPointerDown={(e) => down(e, c.id)} style={{ cursor: "pointer" }}>
              <rect x={TRAILER_X} y={sy} width={TRAILER_W} height={h} rx={6}
                fill={c.retained ? "rgba(147,197,253,0.14)" : c.color} fillOpacity={c.retained ? 1 : 0.28}
                stroke={on ? "#fff" : c.retained ? "#93c5fd" : c.color} strokeWidth={on ? 2.5 : 1.5} />
              <text x={TRAILER_X + TRAILER_W / 2} y={sy + h / 2 - 5} textAnchor="middle" fontSize={12} fontWeight={800} fill="#fff">C{c.n}</text>
              <text x={TRAILER_X + TRAILER_W / 2} y={sy + h / 2 + 8} textAnchor="middle" fontSize={10} fontWeight={800} fill={c.color}>{c.code}</text>
              <text x={TRAILER_X + TRAILER_W / 2} y={sy + h / 2 + 20} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.6)">{g0(c.gallons)}</text>
            </g>
          );
        })}

        {/* store tanks: dome lids for a drop, fill caps for a pump off */}
        {tankPos.map(({ t, cy }) => {
          const c = t.color ?? "rgba(255,255,255,0.4)";
          const wrong = dim(t);
          const into = intoTank(t.tank);
          return (
            <g key={t.tank} opacity={wrong ? 0.3 : 1}
              onPointerUp={(e) => { if (armedId && !drag) { e.stopPropagation(); onLink(armedId, t.tank); } }}
              style={{ cursor: armedId ? "pointer" : "default" }}>
              {kind === "dome" ? (
                <>
                  <circle cx={TANK_CX} cy={cy} r={R} fill="url(#tm-dome)" stroke={c} strokeWidth={2.5} />
                  <circle cx={TANK_CX} cy={cy} r={R * 0.66} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1.2} />
                  <circle cx={TANK_CX} cy={cy - R * 0.5} r={4.2} fill="#0b0b0b" stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
                  <circle cx={TANK_CX + R * 0.45} cy={cy + R * 0.32} r={2.6} fill="rgba(255,255,255,0.35)" />
                  <circle cx={TANK_CX - R * 0.45} cy={cy + R * 0.32} r={2.6} fill="rgba(255,255,255,0.35)" />
                </>
              ) : (
                <>
                  <rect x={TANK_CX - R * 0.8} y={cy - R * 0.8} width={R * 1.6} height={R * 1.6} rx={7} fill="url(#tm-dome)" stroke={c} strokeWidth={2.5} />
                  <circle cx={TANK_CX} cy={cy} r={R * 0.52} fill="#0b0b0b" stroke="rgba(255,255,255,0.35)" strokeWidth={1.4} />
                  <circle cx={TANK_CX} cy={cy} r={R * 0.3} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={3} strokeDasharray="2.2 2.2" />
                </>
              )}
              <text x={TANK_CX} y={cy + 4} textAnchor="middle" fontSize={lidFont(tankTag(t.tank))} fontWeight={800} fill="#fff" style={{ pointerEvents: "none" }}>
                {kind === "dome" ? tankTag(t.tank) : ""}
              </text>
              {kind === "cap" && (
                <text x={TANK_CX + R * 0.8 + 7} y={cy + 4} textAnchor="start" fontSize={12} fontWeight={800} fill="#fff" style={{ pointerEvents: "none" }}>{tankTag(t.tank)}</text>
              )}
              <text x={TANK_CX} y={cy + R + 13} textAnchor="middle" fontSize={10} fontWeight={800} fill={c} style={{ pointerEvents: "none" }}>
                {(t.name ?? t.code ?? "").slice(0, 12)}{into > 0 ? `  +${g0(into)}` : ""}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ fontSize: 12, color: muted, textAlign: "center", margin: "2px 0 10px" }}>
        {armed
          ? `C${armed.n} selected. Tap a ${kind === "dome" ? "tank" : "fill cap"}, or swipe from it.`
          : `Swipe from a compartment to a ${kind === "dome" ? "tank" : "fill cap"}, or tap one and then the other.`}
      </div>

      {/* readout, one row per compartment */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {active.map((c) => {
          const placed = c.targets.reduce((s, t) => s + t.gallons, 0);
          const off = Math.round(c.gallons - placed);
          const splitting = c.targets.length > 1 || splitId === c.id;
          return (
            <div key={c.id} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, padding: "8px 10px", background: armedId === c.id ? "rgba(255,255,255,0.07)" : "transparent" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 800 }}>C{c.n}</span>
                <span style={{ fontSize: 13, color: muted }}>{c.code} · {g0(c.gallons)} gal</span>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={() => onPick(c.id)}
                  style={{ background: "none", border: "none", color: c.retained ? "#93c5fd" : c.targets.length ? "#fff" : "#fbbf24", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: "4px 0" }}>
                  {c.retained ? "Retain ›" : c.targets.length ? (c.targets.length > 1 ? "Split ›" : `${/^\d+$/.test(c.targets[0].tank.trim()) ? "Tank " : ""}${c.targets[0].tank} ›`) : "Pick ›"}
                </button>
              </div>
              {c.targets.length > 0 && splitting && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  {c.targets.map((t) => (
                    <div key={t.tank} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, width: 70 }}>C{c.n} → {tankTag(t.tank)}</span>
                      <input value={String(Math.round(t.gallons))} inputMode="numeric"
                        onChange={(e) => onSplitGallons(c.id, t.tank, Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                        onFocus={(e) => e.currentTarget.select()}
                        style={{ width: 90, padding: "6px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2, color: "#fff", fontSize: 15, fontWeight: 700 }} />
                      <span style={{ fontSize: 12, color: muted }}>gal</span>
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={() => onUnlink(c.id, t.tank)}
                        style={{ background: "none", border: "none", color: muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                  {off !== 0 && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>
                      {off > 0 ? `${g0(off)} gal not placed yet` : `${g0(-off)} gal more than the compartment holds`}
                    </div>
                  )}
                </div>
              )}
              {c.targets.length > 0 && !c.retained && (
                <button type="button" onClick={() => onSplitStart(c.id)}
                  style={{ marginTop: 6, background: "none", border: "none", color: splitId === c.id ? "#fff" : muted, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                  {splitId === c.id ? "Tap the other tank…" : "+ Split into another tank"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
