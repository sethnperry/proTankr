"use client";
// app/planner/modals/myLoads/LineRows.tsx
//
// Part of MyLoadsModal.tsx.

import React from "react";
import type { LoadHistoryLine } from "../../hooks/useLoadHistory";

import { fmtGalBare, fmtLbsBare, lineOverUnder } from "./helpers";

export function LineRows({ lines, loading }: { lines: LoadHistoryLine[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ padding: "12px 18px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {[85, 70, 85].map((w, i) => (
          <div key={i} style={{
            height: 13, width: `${w}%`, borderRadius: 2,
            background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)",
            backgroundSize: "600px 100%", animation: "_ptShimmer 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.08}s`,
          }} />
        ))}
      </div>
    );
  }
  if (!lines || lines.length === 0) {
    return <div style={{ padding: "10px 18px 14px", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No line data</div>;
  }

  // Grid: C# | Product | Gal | PLANNED Lbs · Temp · API | ACTUAL Lbs · Temp · API | +/−
  // Bare units — header says gal/lbs so values drop the suffix
  // Columns: C# | Prod | gal | p.lbs | p.°F | p.API | as-of | a.lbs | a.°F | a.API | +/−
  const COL = "18px 52px 44px 56px 30px 32px 44px 56px 30px 32px 56px";
  const GAP = 3;

  const totalPlannedLbs = lines.reduce((s, l) => s + (l.planned_lbs ?? 0), 0);
  const totalActualLbs  = lines.reduce((s, l) => s + (l.actual_lbs  ?? 0), 0);
  const hasActual = lines.some(l => l.actual_lbs != null);
  const totalDiff = hasActual ? totalActualLbs - totalPlannedLbs : null;

  const cellDim: React.CSSProperties   = { fontSize: 12, color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" };
  const cellBold: React.CSSProperties  = { fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)", fontVariantNumeric: "tabular-nums" };
  const cellFaint: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.28)", fontVariantNumeric: "tabular-nums" };
  const hdr: React.CSSProperties       = { fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.28)", letterSpacing: 0.5 };

  return (
    <div style={{ padding: "6px 18px 14px", overflowX: "auto" }}>
      {/* Group headers */}
      <div style={{ display: "grid", gridTemplateColumns: COL, gap: GAP, padding: "4px 0 1px", minWidth: 480 }}>
        <div /><div /><div />
        <div style={{ gridColumn: "span 4", ...hdr, color: "rgba(255,255,255,0.22)" }}>PLANNED</div>
        <div style={{ gridColumn: "span 3", ...hdr, color: "rgba(255,255,255,0.22)" }}>ACTUAL</div>
        <div />
      </div>
      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: COL, gap: GAP, padding: "0 0 5px", borderBottom: "1px solid rgba(255,255,255,0.08)", minWidth: 480 }}>
        {["C#", "Prod", "gal", "lbs", "°F", "API", "as of", "lbs", "°F", "API", "+/−"].map((h, i) => (
          <div key={i} style={{ ...hdr, textAlign: i >= 10 ? "right" : "left" }}>{h}</div>
        ))}
      </div>
      {/* Data rows */}
      {lines.map((l) => {
        const ou = lineOverUnder(l);
        // product: prefer product_name, fallback to product_code or button_code
        const prodLabel = l.product_name ?? (l as any).product_code ?? (l as any).button_code ?? "—";
        return (
          <div key={l.comp_number} style={{ display: "grid", gridTemplateColumns: COL, gap: GAP, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", minWidth: 480 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.50)" }}>{l.comp_number}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {l.button_code ?? prodLabel}
            </div>
            <div style={cellDim}>{fmtGalBare(l.planned_gallons)}</div>
            <div style={cellDim}>{fmtLbsBare(l.planned_lbs)}</div>
            <div style={cellFaint}>{l.planned_temp_f != null ? `${Math.round(Number(l.planned_temp_f))}` : "—"}</div>
            <div style={cellFaint}>{l.planned_api != null ? Number(l.planned_api).toFixed(1) : "—"}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {(l as any).planned_api_updated_at
                ? (() => { const d = new Date((l as any).planned_api_updated_at); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; })()
                : "—"}
            </div>
            <div style={l.actual_lbs != null ? cellBold : cellFaint}>{fmtLbsBare(l.actual_lbs)}</div>
            <div style={cellFaint}>{l.actual_temp_f != null ? `${Math.round(Number(l.actual_temp_f))}` : "—"}</div>
            <div style={cellFaint}>{l.actual_api != null ? Number(l.actual_api).toFixed(1) : "—"}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: ou ? ou.color : "rgba(255,255,255,0.2)", textAlign: "right", whiteSpace: "nowrap" }}>
              {ou ? ou.text.replace(" lbs", "") : "—"}
            </div>
          </div>
        );
      })}
      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: COL, gap: GAP, padding: "8px 0 2px", borderTop: "1px solid rgba(255,255,255,0.10)", alignItems: "center", minWidth: 480 }}>
        <div />
        <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.30)", letterSpacing: 0.5 }}>TOTAL</div>
        <div style={cellDim}>{fmtGalBare(lines.reduce((s, l) => s + (l.planned_gallons ?? 0), 0))}</div>
        <div style={{ ...cellDim, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>{fmtLbsBare(totalPlannedLbs)}</div>
        <div /><div /><div />
        <div style={{ ...cellBold, color: hasActual ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.25)" }}>
          {hasActual ? fmtLbsBare(totalActualLbs) : "—"}
        </div>
        <div /><div />
        <div style={{ fontSize: 12, fontWeight: 900, color: totalDiff != null ? (totalDiff > 0 ? "#ef4444" : "#4ade80") : "rgba(255,255,255,0.2)", textAlign: "right", whiteSpace: "nowrap" }}>
          {totalDiff != null ? `${totalDiff >= 0 ? "+" : ""}${Math.round(totalDiff).toLocaleString()}` : "—"}
        </div>
      </div>
    </div>
  );
}

// ─── Single load row ──────────────────────────────────────────────────────────
