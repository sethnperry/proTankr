"use client";
// app/planner/modals/myLoads/LoadRow.tsx
//
// Part of MyLoadsModal.tsx.

import type { LoadHistoryRow, LoadHistoryLine } from "../../hooks/useLoadHistory";

import { fmtDateTime, rowDiffColor, rowDiffText } from "./helpers";
import { LineRows } from "./LineRows";

export function LoadRow({ row, expanded, selected, onToggle, lines, linesLoading, terminalCatalog, combos }: {
  row: LoadHistoryRow; expanded: boolean; selected: boolean; onToggle: () => void;
  lines: LoadHistoryLine[] | undefined; linesLoading: boolean;
  terminalCatalog: any[];
  headerOverride?: string; combos: any[];
}) {
  const cityState = [row.city_name, row.state_code].filter(Boolean).join(", ");

  // Resolve labels from catalog if not already on row
  const resolvedTerminal = row.terminal_name
    || terminalCatalog.find((t: any) => String(t.terminal_id) === String(row.terminal_id))?.terminal_name
    || "";
  const resolvedCombo = row.combo_label
    || (() => {
      const c = combos.find((c: any) => String(c.combo_id) === String(row.combo_id));
      if (!c) return "";
      return c.combo_name ?? [c.tractor_name, c.trailer_name].filter(Boolean).join(" / ") ?? "";
    })();

  // Collapsed: date/time · total gal · diff lbs
  const galText = row.planned_total_gal != null ? `${Math.round(Number(row.planned_total_gal)).toLocaleString()} gal` : "";
  const diffText = rowDiffText(row.diff_lbs);
  const diffColor = rowDiffColor(row.diff_lbs);

  // Expanded subtitle: Equipment · City, ST · Terminal
  const subtitleParts = [resolvedCombo, cityState, resolvedTerminal].filter(Boolean);
  const subtitle = subtitleParts.join(" · ");

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: selected ? "rgba(255,255,255,0.04)" : "transparent",
        transition: "background 120ms ease",
      }}
    >
      <div
        onClick={onToggle}
        style={{ padding: "11px 18px 10px", cursor: "pointer" }}
      >
        {/* Single collapsed line */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Date/time */}
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
            {fmtDateTime(row.started_at)}
          </div>
          {/* Divider */}
          <div style={{ color: "rgba(255,255,255,0.18)", flexShrink: 0 }}>·</div>
          {/* Total gal */}
          {galText && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", whiteSpace: "nowrap", flexShrink: 0 }}>
              {galText}
            </div>
          )}
          {/* Spacer — pushes diff to the right, city/gal truncates */}
          <div style={{ flex: 1, minWidth: 0 }} />
          {/* Diff lbs */}
          <div style={{ fontSize: 13, fontWeight: 800, color: diffColor, whiteSpace: "nowrap", flexShrink: 0 }}>
            {diffText}
          </div>
        </div>

        {/* Expanded subtitle */}
        {expanded && subtitle && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitle}
          </div>
        )}
      </div>

      {expanded && <LineRows lines={lines} loading={linesLoading} />}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
