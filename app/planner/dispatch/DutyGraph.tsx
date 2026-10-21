"use client";
// app/planner/dispatch/DutyGraph.tsx
//
// The planned load as a logbook-style grid: Off / Sleeper / Driving / On Duty
// rows, one line stepping between them across the hours. Widths are
// proportional to time, so the loaded drive shows as the long run it is.
// Lines are SVG stretched to the width; text is HTML so it never distorts.

import React from "react";
import { useDashLook } from "../home/dashLook";
import { DUTY_ROWS, dutyRange, pct, type DutyBlock } from "@/lib/dispatch/dutyGraph";

const ROW = 20;

function hourLabel(ms: number): string {
  const h = new Date(ms).getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "a" : "p"}`;
}

export function DutyGraph({ blocks, terminalPlace, terminalAtMs, locationPlace, locationAtMs, rest }: {
  blocks: DutyBlock[];
  /** Rested and able to start, but usually starts later: drawn as a blue hatched band. */
  rest?: { fromMs: number; toMs: number } | null;
  terminalPlace: string | null;  // "Tampa, FL"
  terminalAtMs: number | null;   // when the driver reaches the terminal
  locationPlace: string | null;
  locationAtMs: number | null;   // when the driver reaches the drop
}) {
  const L = useDashLook();
  const r = dutyRange(blocks, rest);
  const rowOf = (s: string) => DUTY_ROWS.findIndex((x) => x.status === s);
  const y = (s: string) => rowOf(s) * ROW + ROW / 2;
  const H = DUTY_ROWS.length * ROW;
  const hours: number[] = [];
  for (let t = r.t0; t <= r.t1; t += 3600000) hours.push(t);
  const every = hours.length > 16 ? 3 : hours.length > 8 ? 2 : 1;

  // Path pieces: a colored run per block, grey steps between them.
  const runs: React.ReactNode[] = [];
  const steps: string[] = [];
  const x = (ms: number) => pct(ms, r);
  let lastY = y("off"), lastX = 0;
  blocks.forEach((b, i) => {
    const by = y(b.status);
    // Off Duty up to the block (or across any gap), then step to the block's row.
    if (b.startMs > r.t0 && (i === 0 || b.startMs > blocks[i - 1].endMs)) {
      steps.push(`M${lastX} ${lastY} H${x(b.startMs)}`);
      lastX = x(b.startMs);
    }
    steps.push(`M${lastX} ${lastY} V${by}`);
    runs.push(
      <line key={i} x1={x(b.startMs)} x2={x(b.endMs)} y1={by} y2={by} vectorEffect="non-scaling-stroke"
        stroke={b.key === "gauging" ? "#fb923c" : b.key === "earlier" ? "rgba(255,255,255,0.4)" : "#fff"} strokeWidth={3} />,
    );
    lastY = by; lastX = x(b.endMs);
    const next = blocks[i + 1];
    if (!next || next.startMs > b.endMs) {
      steps.push(`M${lastX} ${lastY} V${y("off")}`);
      lastY = y("off");
    }
  });
  if (blocks.length) steps.push(`M${lastX} ${lastY} H100`);

  const tag = (text: string | null, ms: number | null) => {
    if (!text || ms == null) return null;
    const p = Math.max(0, Math.min(100, x(ms)));
    const align = p < 18 ? "left" : p > 82 ? "right" : "center";
    return (
      <span key={text + ms} style={{ position: "absolute", top: 0, left: `${p}%`, transform: align === "center" ? "translateX(-50%)" : align === "right" ? "translateX(-100%)" : "none",
        fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
        {text}
      </span>
    );
  };

  return (
    <div>
      <div style={{ display: "flex" }}>
        <div style={{ width: 24, flexShrink: 0 }}>
          {DUTY_ROWS.map((row) => (
            <div key={row.status} style={{ height: ROW, display: "flex", alignItems: "center", fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", color: L.muted }}>{row.label}</div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, position: "relative", height: H, border: `1px solid ${L.hairline}` }}>
          <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ position: "absolute", inset: 0, display: "block" }} aria-hidden>
            {rest && (
              <>
                <defs>
                  <pattern id="rest-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#60a5fa" strokeWidth="2" opacity="0.55" />
                  </pattern>
                </defs>
                <rect x={x(rest.fromMs)} width={Math.max(0, x(rest.toMs) - x(rest.fromMs))} y={0} height={H} fill="rgba(96,165,250,0.14)" />
                <rect x={x(rest.fromMs)} width={Math.max(0, x(rest.toMs) - x(rest.fromMs))} y={0} height={H} fill="url(#rest-hatch)" />
              </>
            )}
            {hours.map((t, i) => <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={H} stroke={L.hairline} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={i % every ? 0.4 : 1} />)}
            {DUTY_ROWS.map((_, i) => i > 0 && <line key={i} x1={0} x2={100} y1={i * ROW} y2={i * ROW} stroke={L.hairline} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
            {steps.map((d, i) => <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
            {runs}
          </svg>
        </div>
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: 24, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", height: 14, marginTop: 3 }}>
            {hours.map((t, i) => i % every === 0 && (
              <span key={t} className="dash-num" style={{ position: "absolute", top: 0, left: `${x(t)}%`, transform: i === 0 ? "none" : i === hours.length - 1 ? "translateX(-100%)" : "translateX(-50%)", fontSize: 10, color: L.faint }}>{hourLabel(t)}</span>
            ))}
          </div>
          <div style={{ position: "relative", height: 16, marginTop: 2 }}>
            {tag(terminalPlace, terminalAtMs)}
            {tag(locationPlace, locationAtMs)}
          </div>
        </div>
      </div>
    </div>
  );
}
