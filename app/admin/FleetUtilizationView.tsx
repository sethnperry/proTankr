// app/admin/FleetUtilizationView.tsx
//
// The fleet dashboard's presentation, with no data fetching in it. Split from
// FleetUtilizationModal.tsx for the same reason UtilizationReportModal.tsx is
// shaped this way: a component that imports the Supabase client cannot be
// rendered outside a browser, and rendering it is what caught a real crash in
// Phase 2 (a numeric arriving as a string threw on .toFixed and took the whole
// modal down -- something typechecking cannot see).
//
// Every rule this view encodes is from docs/incentive-redesign-plan.md, not
// styling preference. See FleetUtilizationModal.tsx's header for the three
// that matter most: no `enabled` gate, no leaderboard ordering, and excluded
// loads shown rather than folded in.

import React from "react";

import {
  UTILIZATION_ACTUAL_WORD,
  UTILIZATION_METRIC_LABEL,
  type DriverUtilizationGroup,
  type HeadroomSummary,
} from "@/lib/capacity/computeUtilization";

const LABEL = "rgba(255,255,255,0.4)";
const MUTED = "rgba(255,255,255,0.45)";

export const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 7, border: "1px solid",
    fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3, flexShrink: 0,
    background: active ? "rgba(255,255,255,0.10)" : "transparent",
    borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
    color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
  };
}

function gal(n: number) {
  return Math.round(Number(n) || 0).toLocaleString();
}

/** Percentages arrive from PostgREST via aggregation and are already numbers,
 *  but this stays defensive on purpose: the one crash Phase 2 shipped was a
 *  bare .toFixed() on a value the type said was a number and the database
 *  said was a string. */
function pct(n: number | null | undefined) {
  return n == null || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(1)}%`;
}

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: color ?? "rgba(255,255,255,0.85)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

export type FleetTotals = {
  eligible: number;
  safety: number;
  constraint: number;
  incomplete: number;
  available: number;
  actual: number;
  unused: number;
  pct: number | null;
};

export type FleetUtilizationViewProps = {
  onClose: () => void;
  rangeDays: number;
  onRangeChange: (days: number) => void;
  driverFilterCount: number | null;
  rosterSize: number;
  onOpenDriverPicker: () => void;
  loading: boolean;
  totals: FleetTotals;
  drivers: DriverUtilizationGroup[];
  headroom: HeadroomSummary | null;
  errorMessage: string | null;
};

export function FleetUtilizationView({
  onClose, rangeDays, onRangeChange, driverFilterCount, rosterSize,
  onOpenDriverPicker, loading, totals, drivers, headroom, errorMessage,
}: FleetUtilizationViewProps) {
  const excludedTotal = totals.safety + totals.constraint + totals.incomplete;
  const showHeadroom = headroom != null && headroom.loads > 0 && headroom.headroom_gallons >= 1;

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Fleet {UTILIZATION_METRIC_LABEL}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
      </div>

      <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {RANGES.map((r) => (
          <button key={r.label} type="button" onClick={() => onRangeChange(r.days)} style={chipStyle(rangeDays === r.days)}>
            {r.label}
          </button>
        ))}
        {/* Meaningless with one driver on the roster -- hidden rather than
            shown disabled, same as the equivalent chip in PayrollReportModal.tsx. */}
        {rosterSize > 1 && (
          <button type="button" onClick={onOpenDriverPicker} style={{ ...chipStyle(driverFilterCount !== null), marginLeft: "auto" }}>
            {driverFilterCount === null ? "All Drivers" : `${driverFilterCount} of ${rosterSize} Drivers`}
          </button>
        )}
      </div>

      <div style={{ padding: "18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 22, flexWrap: "wrap" }}>
        <Stat
          label="Fleet utilization"
          value={pct(totals.pct)}
          color="#4ade80"
          sub={`${totals.eligible.toLocaleString()} load${totals.eligible === 1 ? "" : "s"} measured`}
        />
        <Stat label="Unused capacity" value={gal(totals.unused)} sub={`of ${gal(totals.available)} gal available`} />
        <Stat label={`Gallons ${UTILIZATION_ACTUAL_WORD}`} value={gal(totals.actual)} />
      </div>

      {/* Headroom -- opportunity, never shortfall, and never shown to a driver.
          Staff-only by placement: this lives behind /admin. */}
      {showHeadroom && (
        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(74,222,128,0.04)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Headroom to the legal limit
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#4ade80", marginTop: 2 }}>
            +{gal(headroom!.headroom_gallons)} gal
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
            What this fleet could have carried over the same loads if its weight target were raised
            to the legal limit. {headroom!.target_limited_loads.toLocaleString()} of{" "}
            {headroom!.loads.toLocaleString()} loads were capped by the target rather than by tank
            volume. Denser app usage at your terminals means fresher API and temperature readings,
            which is what makes a higher target safe — raising it is always an explicit decision,
            never automatic.
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px" }}>
        {loading ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "24px 0" }}>Loading…</div>
        ) : drivers.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "24px 0", lineHeight: 1.6 }}>
            No measured loads in this range. Utilization is recorded automatically when a driver
            completes a load — there is nothing to turn on.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drivers.map((d) => (
              <div key={d.driver_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{d.display_name}</div>
                  <div style={{ fontSize: 11, color: LABEL, marginTop: 1 }}>
                    {d.summary.eligible_loads} measured
                    {d.total_loads > d.summary.eligible_loads && ` · ${d.total_loads - d.summary.eligible_loads} not counted`}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: d.summary.utilization_pct != null ? "#4ade80" : MUTED }}>
                    {pct(d.summary.utilization_pct)}
                  </div>
                  <div style={{ fontSize: 11, color: LABEL, marginTop: 1 }}>{gal(d.summary.unused_gallons)} gal unused</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Counted, never scored -- a load excluded for safety or an external
            cap is deliberately absent from every figure above. */}
        {excludedTotal > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
            <strong style={{ color: "rgba(255,255,255,0.7)" }}>
              {excludedTotal} load{excludedTotal === 1 ? "" : "s"} not counted
            </strong>{" "}
            in the figures above.
            {totals.safety > 0 && ` ${totals.safety} exceeded a safety limit.`}
            {totals.constraint > 0 && ` ${totals.constraint} capped by an external constraint of unknown size.`}
            {totals.incomplete > 0 && ` ${totals.incomplete} missing the data needed to establish capacity.`}
          </div>
        )}

        {errorMessage && <div style={{ marginTop: 12, fontSize: 12, color: "#ef4444" }}>{errorMessage}</div>}
      </div>
    </div>
  );
}
