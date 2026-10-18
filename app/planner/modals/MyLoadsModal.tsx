"use client";
// modals/MyLoadsModal.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LoadHistoryRow, LoadHistoryLine } from "../hooks/useLoadHistory";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** h:mm ago if < 24h, Xd ago if >= 24h */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const totalMins = Math.floor(diff / 60000);
  if (totalMins < 1) return "0:00 ago";
  if (totalMins < 1440) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}:${String(m).padStart(2, "0")} ago`;
  }
  const days = Math.floor(totalMins / 1440);
  return `${days}d ago`;
}

/** "03/20/26 · 0:19" */
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const yr = String(d.getFullYear()).slice(2);
  const h  = d.getHours();
  const m  = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${dy}/${yr} · ${h}:${m}`;
}

function fmtGal(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v)).toLocaleString()} gal`;
}

function fmtGalBare(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Math.round(Number(v)).toLocaleString();
}

function fmtLbs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v)).toLocaleString()} lbs`;
}

function fmtLbsBare(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Math.round(Number(v)).toLocaleString();
}

function fmtTemp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v))}°F`;
}

function lineOverUnder(l: LoadHistoryLine): { text: string; color: string } | null {
  if (l.actual_lbs == null || l.planned_lbs == null) return null;
  const diff = Math.round(l.actual_lbs - l.planned_lbs);
  const color = diff > 0 ? "#ef4444" : "#4ade80";
  return { text: `${diff >= 0 ? "+" : ""}${diff.toLocaleString()} lbs`, color };
}

function rowDiffColor(diff: number | null | undefined): string {
  if (diff == null) return "rgba(255,255,255,0.4)";
  return Number(diff) > 0 ? "#ef4444" : "#4ade80";
}

function rowDiffText(diff: number | null | undefined): string {
  if (diff == null || !Number.isFinite(Number(diff))) return "—";
  const n = Math.round(Number(diff));
  return `${n >= 0 ? "+" : ""}${n.toLocaleString()} lbs`;
}

// ─── Share report builder ─────────────────────────────────────────────────────

function buildShareText(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined): { subject: string; body: string } {
  const cityState = [row.city_name, row.state_code].filter(Boolean).join(", ");

  // Subject line: date · city · terminal · gal (no redundant header line)
  const subjectParts = [
    fmtDateTime(row.started_at),
    cityState || null,
    row.terminal_name || null,
    row.planned_total_gal != null ? `${Math.round(Number(row.planned_total_gal)).toLocaleString()} gal` : null,
  ].filter(Boolean);
  const subject = subjectParts.join("  ·  ");

  const diffTxt = rowDiffText(row.diff_lbs);
  const diffTag = row.diff_lbs == null ? "" :
    row.diff_lbs > 0 ? "  ▲ OVER" :
    row.diff_lbs === 0 ? "  ✓ ON WEIGHT" : "  ▼ UNDER";

  const divider = "─".repeat(48);
  const header = [
    "LOAD REPORT",
    divider,
    subject,
    divider,
  ].join("\n");

  let lineBlock = "";
  if (lines && lines.length > 0) {
    const totalPlanned = lines.reduce((s, l) => s + (l.planned_lbs ?? 0), 0);
    const totalActual  = lines.reduce((s, l) => s + (l.actual_lbs  ?? 0), 0);
    const hasActual    = lines.some(l => l.actual_lbs != null);
    const totalDiff    = hasActual ? Math.round(totalActual - totalPlanned) : null;

    lineBlock = lines.map((l) => {
      const ou = lineOverUnder(l);
      const ouTag = ou == null ? "" :
        Number(l.actual_lbs) > Number(l.planned_lbs) ? "  ▲ OVER" :
        Number(l.actual_lbs) === Number(l.planned_lbs) ? "  ✓" : "  ▼ UNDER";

      // Planned API with as-of date
      const plannedApiStr = l.planned_api != null
        ? `API ${Number(l.planned_api).toFixed(1)}${(l as any).planned_api_updated_at
            ? ` (as of ${(() => { const d = new Date((l as any).planned_api_updated_at); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; })()})`
            : ""}`
        : "API —";

      const codeLabel = l.button_code
        ? `${l.button_code}${l.product_name ? " — " + l.product_name : ""}`
        : (l.product_name ?? "—");
      const rows = [
        `C${l.comp_number}  ${codeLabel}`,
        `  Planned:  ${fmtLbs(l.planned_lbs)}  ${fmtTemp(l.planned_temp_f)}  ${plannedApiStr}`,
        `  Actual:   ${fmtLbs(l.actual_lbs)}  ${fmtTemp(l.actual_temp_f)}  API ${l.actual_api?.toFixed(1) ?? "—"}  ${ou?.text ?? "—"}${ouTag}`,
      ];
      return rows.join("\n");
    }).join("\n\n");

    const totalDiffTxt = totalDiff == null ? "—" :
      `${totalDiff >= 0 ? "+" : ""}${totalDiff.toLocaleString()} lbs`;
    const totalTag = totalDiff == null ? "" :
      totalDiff > 0 ? "  ▲ OVER" :
      totalDiff === 0 ? "  ✓ ON WEIGHT" : "  ▼ UNDER";

    // Drain-down calc — to legal limit of 80,000 lbs gross
    // Tare = planned_gross_lbs - planned payload total
    // Actual gross = tare + actual payload
    const LEGAL_GROSS = 80000;
    let drainLine = "";
    if (hasActual) {
      const plannedGross = row.planned_gross_lbs != null ? Number(row.planned_gross_lbs) : null;
      const plannedPayload = totalPlanned;
      const tare = plannedGross != null && plannedPayload > 0 ? plannedGross - plannedPayload : null;
      const actualGross = tare != null ? tare + totalActual : null;
      if (actualGross != null && actualGross > LEGAL_GROSS) {
        const lbsToRemove = actualGross - LEGAL_GROSS;
        // Rear = highest comp_number with actual data
        const rearComp = [...lines]
          .filter(l => l.actual_lbs != null && l.actual_gallons != null && l.actual_gallons > 0)
          .sort((a, b) => b.comp_number - a.comp_number)[0] ?? null;
        if (rearComp && rearComp.actual_gallons && rearComp.actual_lbs) {
          const lpg = rearComp.actual_lbs / rearComp.actual_gallons;
          const galToDrain = lbsToRemove / lpg;
          const prodLabel = rearComp.button_code ?? rearComp.product_name ?? `C${rearComp.comp_number}`;
          drainLine = `\n\nCorrect to 80k lbs: drain ~${galToDrain.toFixed(1)} gal from C${rearComp.comp_number} (${prodLabel})`;
        }
      }
    }

    lineBlock += `\n\n${divider}\n`;
    lineBlock += `TOTAL\n`;
    lineBlock += `  Planned: ${fmtLbs(totalPlanned)}\n`;
    lineBlock += `  Actual:  ${hasActual ? fmtLbs(totalActual) : "—"}\n`;
    lineBlock += `  Net:     ${totalDiffTxt}${totalTag}`;
    if (drainLine) lineBlock += drainLine;
  }

  const body = lineBlock ? `${header}\n\n${lineBlock}` : header;
  return { subject, body };
}

function shareViaClipboard(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined, onCopied: () => void) {
  const { subject, body } = buildShareText(row, lines);
  navigator.clipboard.writeText(body)
    .then(onCopied)
    .catch(() => window.prompt("Copy this report:", body));
}

function shareViaSMS(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined) {
  const { body } = buildShareText(row, lines);
  // sms: URI with no number — opens default SMS app, user picks contact
  // body param is url-encoded; iOS uses &body=, Android uses ?body=
  const encoded = encodeURIComponent(body);
  // Try iOS format first; Android handles both
  window.location.href = `sms:?&body=${encoded}`;
}

function shareViaEmail(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined) {
  const { subject, body } = buildShareText(row, lines);
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    completed:   { label: "LOADED",   color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
    in_progress: { label: "IN PROG",  color: "#67e8f9", bg: "rgba(103,232,249,0.12)" },
    started:     { label: "STARTED",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
    planned:     { label: "PLANNED",  color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.07)" },
  };
  const s = map[status] ?? { label: status.toUpperCase(), color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.06)" };
  return (
    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.8, padding: "3px 7px", borderRadius: 2, color: s.color, background: s.bg, whiteSpace: "nowrap", flexShrink: 0 }}>
      {s.label}
    </span>
  );
}

// ─── Date filter chips ────────────────────────────────────────────────────────

const DATE_RANGES: { label: string; days: number | null }[] = [
  { label: "7d",  days: 7    },
  { label: "30d", days: 30   },
  { label: "90d", days: 90   },
  { label: "All", days: null },
];

// ─── Expanded line rows ───────────────────────────────────────────────────────

function LineRows({ lines, loading }: { lines: LoadHistoryLine[] | undefined; loading: boolean }) {
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

function shareBtnStyle(color?: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 2, padding: "5px 10px", cursor: "pointer",
    fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
    color: color ?? "rgba(255,255,255,0.55)",
    transition: "all 150ms ease", whiteSpace: "nowrap",
  };
}

function LoadRow({ row, expanded, selected, onToggle, lines, linesLoading, terminalCatalog, combos }: {
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

type Props = {
  open: boolean;
  onClose: () => void;
  authUserId: string;
  rows: LoadHistoryRow[];
  loading: boolean;
  error: string | null;
  linesCache: Record<string, LoadHistoryLine[]>;
  linesLoading: Record<string, boolean>;
  onFetchLines: (loadId: string, plannedSnapshot?: any, productTempF?: number | null) => void;
  onFetchRange: (days: number | null) => void;
  terminalCatalog: any[];
  headerOverride?: string;
  combos: any[];
  // Omitted entirely from the admin view (AdminLoadsModal.tsx) -- delete_load
  // is owner-checked server-side (auth.uid() must match), and restoring
  // another driver's load into the viewing admin's own planner never makes
  // sense, so those actions just don't render there.
  onDeleteLoad?: (loadId: string) => Promise<void>;
  onRestoreLoad?: (row: LoadHistoryRow) => void;
  // Deep-link target -- e.g. the Planner's "Recall Last Load" warning
  // sheet, for a load whose equipment can't safely be switched to (see
  // RecallDifferentEquipmentSheet.tsx). When set, this modal forces the
  // date range to "All" (the target load could be arbitrarily old) and
  // auto-expands it once its row is available, instead of the normal
  // reset-to-collapsed/7-day-range open behavior.
  initialExpandLoadId?: string | null;
};

export default function MyLoadsModal({
  open, onClose,
  rows, loading, error,
  linesCache, linesLoading,
  onFetchLines, onFetchRange,
  terminalCatalog, combos,
  headerOverride,
  onDeleteLoad, onRestoreLoad,
  initialExpandLoadId,
}: Props) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDays, setActiveDays] = useState<number | null>(7);
  const [copied, setCopied] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"delete" | "restore" | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // While set, the list shows ONLY this one load -- not just auto-expanded
  // within the full history -- per explicit follow-up ("can the link
  // filter to the specific load in my loads?"). Separate from
  // initialExpandLoadId (the prop, fixed for the life of this deep-link
  // open) so the driver can still escape back to their full history by
  // typing in search, without page.tsx needing to know or care.
  const [focusedLoadId, setFocusedLoadId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const autoExpandedRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setConfirmMode(null);
      if (initialExpandLoadId) {
        // The target load could be arbitrarily old -- the normal default
        // 7-day range would silently exclude it. expandedId/selectedId are
        // set once its row actually resolves, see the effect below.
        autoExpandedRef.current = null;
        setFocusedLoadId(initialExpandLoadId);
        setActiveDays(null);
        onFetchRange(null);
      } else {
        setExpandedId(null);
        setSelectedId(null);
        setFocusedLoadId(null);
        onFetchRange(activeDays);
      }
      setTimeout(() => searchRef.current?.focus(), 180);
    }
  }, [open]);

  // Fires once `rows` actually contains the deep-linked load (after the
  // forced all-time fetch above resolves) -- deferred to here, rather than
  // firing blind on open, so it can pass the row's own planned_snapshot/
  // product_temp_f into onFetchLines, same enrichment a normal manual tap
  // gets (see handleToggle below).
  useEffect(() => {
    if (!open || !initialExpandLoadId) return;
    if (autoExpandedRef.current === initialExpandLoadId) return;
    const row = rows.find((r) => r.load_id === initialExpandLoadId);
    if (!row) return;
    autoExpandedRef.current = initialExpandLoadId;
    setExpandedId(initialExpandLoadId);
    setSelectedId(initialExpandLoadId);
    onFetchLines(initialExpandLoadId, row.planned_snapshot, row.product_temp_f);
  }, [open, initialExpandLoadId, rows, onFetchLines]);

  function handleRangeChange(days: number | null) {
    setActiveDays(days);
    onFetchRange(days);
  }

  function handleToggle(loadId: string, plannedSnapshot?: any, productTempF?: number | null) {
    const isExpanded = expandedId === loadId;
    setExpandedId(isExpanded ? null : loadId);
    setSelectedId(loadId);
    if (!isExpanded) onFetchLines(loadId, plannedSnapshot, productTempF);
  }

  const selectedRow = selectedId ? rows.find(r => r.load_id === selectedId) ?? null : null;
  const selectedLines = selectedId ? linesCache[selectedId] : undefined;

  function handleCopy() {
    if (!selectedRow) return;
    shareViaClipboard(selectedRow, selectedLines, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  function handleSMS() {
    if (!selectedRow) return;
    shareViaSMS(selectedRow, selectedLines);
  }
  function handleEmail() {
    if (!selectedRow) return;
    shareViaEmail(selectedRow, selectedLines);
  }

  async function confirmDelete() {
    if (!selectedRow || !onDeleteLoad) return;
    setDeleteBusy(true);
    try {
      await onDeleteLoad(selectedRow.load_id);
      setConfirmMode(null);
      setExpandedId(null);
      setSelectedId(null);
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete load.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function confirmRestore() {
    if (!selectedRow || !onRestoreLoad) return;
    onRestoreLoad(selectedRow);
    setConfirmMode(null);
    onClose();
  }

  const filtered = useMemo(() => {
    if (focusedLoadId) return rows.filter((r) => r.load_id === focusedLoadId);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.terminal_name ?? "").toLowerCase().includes(q) ||
      (r.combo_label ?? "").toLowerCase().includes(q) ||
      (r.city_name ?? "").toLowerCase().includes(q) ||
      (r.state_code ?? "").toLowerCase().includes(q) ||
      (r.status ?? "").toLowerCase().includes(q)
    );
  }, [rows, search, focusedLoadId]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 10px", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 }}>{headerOverride ?? "My Loads"}</div>
            {!loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>{filtered.length}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        {/* Focused-on-one-load banner -- deep-link mode (see focusedLoadId's
            own comment). Explicit one-tap escape back to the full history,
            in addition to the implicit "just start typing to search"
            escape wired into the search input below. */}
        {focusedLoadId && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 18px 10px" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Showing this load only</span>
            <button
              onClick={() => setFocusedLoadId(null)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}
            >
              Show All Loads
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: "0 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, padding: "9px 14px" }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (focusedLoadId) setFocusedLoadId(null); }}
              placeholder="Search terminal, location, or equipment…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 500 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 17, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>
        </div>

        {/* Date filter chips + share controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 18px 12px", flexWrap: "nowrap", overflowX: "auto" }}>
          {DATE_RANGES.map(({ label, days }) => {
            const active = activeDays === days;
            return (
              <button
                key={label}
                onClick={() => handleRangeChange(days)}
                style={{
                  padding: "5px 10px", borderRadius: 2, border: "1px solid", fontSize: 11, fontWeight: 800,
                  cursor: "pointer", letterSpacing: 0.3, transition: "all 120ms ease", flexShrink: 0,
                  background: active ? "rgba(255,255,255,0.10)" : "transparent",
                  borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                  color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
                }}
              >
                {label}
              </button>
            );
          })}

          {/* Share + row-management controls — enabled only when a load is selected */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
            {(["copy", "text", "email"] as const).map((type) => {
              const enabled = !!selectedId;
              const label = type === "copy" ? (copied ? "✓" : "COPY") : type === "text" ? "TEXT" : "EMAIL";
              return (
                <button
                  key={type}
                  disabled={!enabled}
                  onClick={type === "copy" ? handleCopy : type === "text" ? handleSMS : handleEmail}
                  style={{
                    padding: "5px 9px", borderRadius: 2, fontSize: 11, fontWeight: 800, letterSpacing: 0.3, flexShrink: 0,
                    cursor: enabled ? "pointer" : "default", transition: "all 150ms ease",
                    border: enabled ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.08)",
                    background: enabled ? "rgba(255,255,255,0.07)" : "transparent",
                    color: enabled ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.18)",
                  }}
                >
                  {label}
                </button>
              );
            })}
            {onRestoreLoad && (
              <button
                disabled={!selectedId}
                onClick={() => setConfirmMode("restore")}
                style={{
                  padding: "5px 9px", borderRadius: 2, fontSize: 11, fontWeight: 800, letterSpacing: 0.3, flexShrink: 0,
                  cursor: selectedId ? "pointer" : "default", transition: "all 150ms ease",
                  border: selectedId ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.08)",
                  background: selectedId ? "rgba(255,255,255,0.07)" : "transparent",
                  color: selectedId ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.18)",
                }}
              >
                RESTORE
              </button>
            )}
            {onDeleteLoad && (
              <button
                disabled={!selectedId}
                onClick={() => setConfirmMode("delete")}
                style={{
                  padding: "5px 9px", borderRadius: 2, fontSize: 11, fontWeight: 800, letterSpacing: 0.3, flexShrink: 0,
                  cursor: selectedId ? "pointer" : "default", transition: "all 150ms ease",
                  border: selectedId ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(255,255,255,0.08)",
                  background: selectedId ? "rgba(239,68,68,0.10)" : "transparent",
                  color: selectedId ? "#ef4444" : "rgba(255,255,255,0.18)",
                }}
              >
                DELETE
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
          {loading && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ padding: "13px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[78, 30].map((w, j) => (
                    <div key={j} style={{
                      height: j === 0 ? 13 : 13, width: `${w}%`, borderRadius: 2,
                      background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)",
                      backgroundSize: "600px 100%", animation: "_ptShimmer 1.4s ease-in-out infinite",
                      animationDelay: `${j * 0.07}s`,
                    }} />
                  ))}
                </div>
              ))}
            </div>
          )}
          {!loading && error && (
            <div style={{ padding: "24px 18px", textAlign: "center", color: "#ef4444", fontSize: 14 }}>{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
              {search ? "No loads match your search" : activeDays ? `No loads in the last ${activeDays} days` : "No loads yet"}
            </div>
          )}
          {!loading && !error && filtered.map((row) => (
            <LoadRow
              key={row.load_id}
              row={row}
              expanded={expandedId === row.load_id}
              selected={selectedId === row.load_id}
              onToggle={() => handleToggle(row.load_id, row.planned_snapshot, row.product_temp_f)}
              lines={linesCache[row.load_id]}
              linesLoading={!!linesLoading[row.load_id]}
              terminalCatalog={terminalCatalog}
              combos={combos}
            />
          ))}
          <div style={{ height: 28 }} />
        </div>
      </div>

      {/* Restore/Delete confirm overlay */}
      {confirmMode && selectedRow && (
        <div
          onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 320, background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>
              {confirmMode === "delete" ? "Delete this load?" : "Restore this load?"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
              {confirmMode === "delete"
                ? "This permanently removes it from My Loads. This can't be undone."
                : "This replaces your current plan in the Planner with this load's equipment, terminal, and compartment selections."}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => setConfirmMode(null)} disabled={deleteBusy}
                style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button aria-busy={!!(deleteBusy)} type="button" onClick={confirmMode === "delete" ? confirmDelete : confirmRestore} disabled={deleteBusy}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 2, border: "none",
                  background: confirmMode === "delete" ? "#ef4444" : "#fff",
                  color: confirmMode === "delete" ? "#fff" : "#000",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}>
                {confirmMode === "delete" ? (deleteBusy ? "Deleting…" : "Delete") : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
