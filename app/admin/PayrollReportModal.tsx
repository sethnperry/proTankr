"use client";
// app/admin/PayrollReportModal.tsx
//
// Period Report, rebuilt on load_utilization (Phase 4's concrete half).
// See docs/incentive-redesign-plan.md.
//
// This file kept its name and shell but changed data source completely: it
// used to read load_points (per-compartment recovered gallons/points from
// the benchmark-driven incentive system) and is now the period view of the
// capacity-driven utilization engine. The report itself is still never
// stored -- always computed live for the selected period; payroll_reports
// rows still only mark "this period was exported."
//
// Scope was decided explicitly ("same shape, new numbers"):
//
//  KEPT   period picker, driver-group filter, employee ID, roster-membership
//         filtering, CSV export with the blank "$ Amount" column (points ->
//         dollars stays entirely company-side; the app has no payout
//         calculator, per the original spec), driver -> per-load expansion.
//
//  GONE   per-compartment detail and inline edit-and-recalculate. Both were
//         load_points-shaped: load_utilization is one row per LOAD, not per
//         compartment, and edit_load_line/recalculate_load_points are
//         points-specific machinery. Utilization is re-derived from
//         load_lines by record_load_utilization at source, so correcting a
//         load after the fact is a different mechanism than the one that
//         existed here -- not a smaller version of it. Deliberately not
//         reimplemented on a guess.
//
//  GONE   the "points have changed since export" stale banner. It was driven
//         by flag_stale_payroll_reports, an AFTER UPDATE trigger on
//         load_points that only ever fired because editing could change
//         points post-export. With editing gone there is nothing to flag,
//         so a banner that can never appear would just be dead UI.
//
// Numbers come from groupUtilizationByDriver/aggregateUtilization -- the SAME
// pure functions behind the fleet dashboard and the driver's own card. That
// is the point: three surfaces, one implementation, so they cannot quote
// different figures for the same period. Percentages are gallon-weighted,
// never a mean of per-load percentages.

import React, { useEffect, useMemo, useState } from "react";

import DriverGroupPicker from "./DriverGroupPicker";
import { generatePayPeriods, type PayPeriod, type PayPeriodType } from "./payPeriods";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { UTILIZATION_ACTUAL_WORD } from "@/lib/capacity/computeUtilization";
import {
  groupUtilizationByDriver,
  useCompanyUtilization,
  type UtilizationRow,
} from "@/lib/capacity/useUtilization";
import { supabase } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
};

const INPUT: React.CSSProperties = {
  borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 13, padding: "8px 10px", boxSizing: "border-box" as const,
};

const LABEL = "rgba(255,255,255,0.4)";
const MUTED = "rgba(255,255,255,0.45)";

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function gal(n: number) {
  return Math.round(Number(n) || 0).toLocaleString();
}

/** Defensive for the same reason FleetUtilizationView is: the one crash this
 *  system has shipped was a bare .toFixed() on a value the type called a
 *  number and PostgREST delivered as a string. */
function pct(n: number | null | undefined) {
  return n == null || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(1)}%`;
}

/** Why a load carries no score, in the admin's words. Mirrors the driver-side
 *  report: an excluded load is explained, never silently dropped. */
function exclusionNote(row: UtilizationRow): string | null {
  switch (row.eligibility) {
    case "excluded_safety":
      return row.exception_reason ?? "Not counted — safety limit exceeded.";
    case "excluded_constraint":
      return row.exception_reason ?? "Not counted — capacity was limited externally.";
    case "excluded_incomplete_data":
      return "Not measured — capacity couldn't be established.";
    default:
      return null;
  }
}

export default function PayrollReportModal({ open, onClose, companyId }: Props) {
  const [error, setError] = useState<string | null>(null);

  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriod | null>(null);

  // Period SHAPE settings, folded in here from the deleted
  // IncentiveSettingsModal. They live with their primary consumer rather
  // than behind a second admin tile named confusingly close to this one
  // ("Report Period" next to "Period Report"). useUtilizationPeriod reads
  // the same two columns for the driver's own card, so changing them here
  // moves both surfaces together -- which is the point.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [periodType, setPeriodType] = useState<PayPeriodType>("biweekly");
  const [anchorDate, setAnchorDate] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const [employeeNumberById, setEmployeeNumberById] = useState<Record<string, string | null>>({});
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);

  // Current roster -- load_utilization is never cleaned up when a driver
  // leaves the company, so without this a departed driver's past periods
  // would keep showing up here forever. `null` driverFilter means "everyone
  // currently on the roster" (the default); narrower selections via
  // DriverGroupPicker are an explicit opt-in.
  const { members: rosterMembers } = useCompanyRoster(companyId);
  const currentMemberIds = useMemo(() => new Set(rosterMembers.map((m) => m.user_id)), [rosterMembers]);
  const nameById = useMemo(
    () => Object.fromEntries(rosterMembers.map((m) => [m.user_id, m.display_name])),
    [rosterMembers]
  );
  const [driverFilter, setDriverFilter] = useState<Set<string> | null>(null);
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);

  // ── Pay-period settings + generated periods ───────────────────────────────
  // Reads only the period SHAPE from incentive_settings, never `enabled` --
  // measurement must work for a company that has configured nothing
  // (docs/incentive-redesign-plan.md, TEST K).
  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("incentive_settings")
        .select("pay_period_type, pay_period_anchor_date")
        .eq("company_id", companyId)
        .maybeSingle();
      if (cancelled) return;
      const pt = (data?.pay_period_type ?? "biweekly") as PayPeriodType;
      const anchor = data?.pay_period_anchor_date ?? new Date().toISOString().slice(0, 10);
      setPeriodType(pt);
      setAnchorDate(anchor);
      const gen = generatePayPeriods(pt, anchor, 12);
      setPeriods(gen);
      setSelectedPeriod(gen[0] ?? null);
    })();
    return () => { cancelled = true; };
  }, [open, companyId]);

  // Same no-zone timestamp format the previous load_points version used, on
  // purpose: it resolves server-side as UTC, which is what useUtilizationPeriod
  // does too, so the Period Report and the driver's own card cover the same
  // window. The known UTC-vs-local-midnight edge is documented in CLAUDE.md
  // and belongs to both surfaces at once, not to this file alone.
  const since = selectedPeriod ? `${selectedPeriod.start}T00:00:00` : null;
  const until = selectedPeriod ? `${selectedPeriod.end}T23:59:59` : undefined;

  const query = useCompanyUtilization(open && selectedPeriod ? companyId : null, since, until);
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const loading = query.isLoading;

  useEffect(() => { setExpandedDriverId(null); }, [selectedPeriod]);

  // Employee IDs for whoever actually has loads this period. The roster
  // already supplies names, so this is the only per-driver lookup left.
  useEffect(() => {
    if (!open) return;
    const ids = Array.from(new Set(rows.map((r) => r.driver_id)));
    if (ids.length === 0) { setEmployeeNumberById({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("user_id, employee_number").in("user_id", ids);
      if (!cancelled) {
        setEmployeeNumberById(Object.fromEntries(((data ?? []) as any[]).map((p) => [p.user_id, p.employee_number ?? null])));
      }
    })();
    return () => { cancelled = true; };
  }, [open, rows]);

  const visibleRows = useMemo(
    () => rows.filter((r) => currentMemberIds.has(r.driver_id) && (driverFilter === null || driverFilter.has(r.driver_id))),
    [rows, currentMemberIds, driverFilter]
  );

  const drivers = useMemo(
    () => groupUtilizationByDriver(visibleRows, nameById),
    [visibleRows, nameById]
  );

  const loadsForDriver = useMemo(() => {
    if (!expandedDriverId) return [] as UtilizationRow[];
    return visibleRows
      .filter((r) => r.driver_id === expandedDriverId)
      .sort((a, b) => ((a.loaded_at ?? "") < (b.loaded_at ?? "") ? 1 : -1));
  }, [visibleRows, expandedDriverId]);

  async function savePeriodSettings() {
    setSavingSettings(true);
    setError(null);
    try {
      const { error: err } = await supabase.from("incentive_settings").upsert(
        { company_id: companyId, pay_period_type: periodType, pay_period_anchor_date: anchorDate || null },
        { onConflict: "company_id" }
      );
      if (err) throw err;
      const gen = generatePayPeriods(periodType, anchorDate || new Date().toISOString().slice(0, 10), 12);
      setPeriods(gen);
      setSelectedPeriod(gen[0] ?? null);
      setSettingsOpen(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleExportCsv() {
    if (!selectedPeriod) return;
    const header = ["Driver", "Employee ID", "Period", "Loads", "Utilization %", `Gallons ${UTILIZATION_ACTUAL_WORD}`, "Unused Gallons", "$ Amount"];
    const lines = [header.map(csvEscape).join(",")];
    for (const d of drivers) {
      lines.push([
        d.display_name,
        employeeNumberById[d.driver_id] ?? "",
        selectedPeriod.label,
        String(d.summary.eligible_loads),
        d.summary.utilization_pct != null ? d.summary.utilization_pct.toFixed(1) : "",
        Math.round(d.summary.actual_gallons).toString(),
        Math.round(d.summary.unused_gallons).toString(),
        "", // company fills its own rate -- the app deliberately has no payout calculator
      ].map((v) => csvEscape(String(v))).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `period_report_${selectedPeriod.start}_to_${selectedPeriod.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    const { error: insErr } = await supabase.from("payroll_reports").insert({
      company_id: companyId,
      period_start: selectedPeriod.start,
      period_end: selectedPeriod.end,
      generated_by: (await supabase.auth.getUser()).data.user?.id,
    });
    // Surfaced rather than swallowed: the CSV already downloaded, so failing
    // silently here would leave the admin believing the export was recorded.
    if (insErr) setError(`Export downloaded, but recording it failed: ${insErr.message}`);
  }

  if (!open) return null;

  const queryErr = query.error as Error | null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Period Report</div>
          <button type="button" onClick={() => setSettingsOpen((v) => !v)} aria-label="Period settings"
            style={{ background: "none", border: "none", color: settingsOpen ? "#fff" : "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "0 8px", flexShrink: 0 }}>
            Settings
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
          <select
            value={selectedPeriod ? `${selectedPeriod.start}|${selectedPeriod.end}` : ""}
            onChange={(e) => {
              const [start, end] = e.target.value.split("|");
              setSelectedPeriod(periods.find((p) => p.start === start && p.end === end) ?? null);
            }}
            style={{ ...INPUT, flex: 1, minWidth: 140 }}
          >
            {periods.map((p) => (
              <option key={`${p.start}|${p.end}`} value={`${p.start}|${p.end}`}>{p.label}</option>
            ))}
          </select>
          {/* Meaningless with one driver on the roster (the company is
              always effectively "just me") -- hidden rather than shown
              disabled, same treatment as the Users/Fleet Cards admin tiles
              for a solo company. Driven by real roster size, not the
              is_solo flag, which CLAUDE.md documents as an unreliable
              proxy for actual member count. */}
          {currentMemberIds.size > 1 && (
            <button type="button" onClick={() => setDriverPickerOpen(true)}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: driverFilter !== null ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}>
              {driverFilter === null ? "All Drivers" : `${driverFilter.size} of ${currentMemberIds.size} Drivers`}
            </button>
          )}
          <button type="button" onClick={handleExportCsv} disabled={loading || drivers.length === 0}
            style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}>
            Export CSV
          </button>
        </div>

        {settingsOpen && (
          <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 }}>
              Report period
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" }}>
              <select value={periodType} onChange={(e) => setPeriodType(e.target.value as PayPeriodType)} style={{ ...INPUT, flex: 1, minWidth: 130 }}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="semi_monthly">Semi-Monthly</option>
                <option value="monthly">Monthly</option>
              </select>
              <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} style={{ ...INPUT, flex: 1, minWidth: 130 }} />
              <button type="button" onClick={savePeriodSettings} disabled={savingSettings}
                style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.1)", color: "#4ade80", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                {savingSettings ? "Saving…" : "Save"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
              Sets the periods listed above, and the window the driver&apos;s own utilization average
              covers on the Planner. A company that sets nothing gets a rolling 30 days.
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px" }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
          ) : drivers.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0", lineHeight: 1.6 }}>
              No measured loads in this period. Utilization is recorded automatically when a driver
              completes a load — there is nothing to turn on.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {drivers.map((d) => {
                const isExpanded = expandedDriverId === d.driver_id;
                const empId = employeeNumberById[d.driver_id];
                const notCounted = d.total_loads - d.summary.eligible_loads;
                return (
                  <div key={d.driver_id} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
                    <div role="button" tabIndex={0} onClick={() => setExpandedDriverId(isExpanded ? null : d.driver_id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{d.display_name}</div>
                        <div style={{ fontSize: 11, color: LABEL, marginTop: 1 }}>
                          {empId ? `ID ${empId} · ` : ""}{d.summary.eligible_loads} measured
                          {notCounted > 0 && ` · ${notCounted} not counted`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: d.summary.utilization_pct != null ? "#4ade80" : MUTED }}>
                          {pct(d.summary.utilization_pct)}
                        </div>
                        <div style={{ fontSize: 11, color: LABEL, marginTop: 1 }}>
                          {gal(d.summary.actual_gallons)} gal · {gal(d.summary.unused_gallons)} unused
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {loadsForDriver.map((l) => {
                          const note = exclusionNote(l);
                          return (
                            <div key={l.load_id} style={{ padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                                <span style={{ color: "rgba(255,255,255,0.6)" }}>
                                  {l.loaded_at ? new Date(l.loaded_at).toLocaleDateString() : "—"}
                                </span>
                                <span style={{ color: note ? MUTED : "#4ade80", fontWeight: 700 }}>
                                  {note ? "—" : pct(l.utilization_pct)}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: LABEL, marginTop: 2 }}>
                                {gal(l.actual_gallons)} of {gal(l.effective_available_gallons)} gal available {UTILIZATION_ACTUAL_WORD}
                              </div>
                              {note && (
                                <div style={{ fontSize: 11, marginTop: 2, lineHeight: 1.4, color: l.eligibility === "excluded_safety" ? "#ef4444" : MUTED }}>
                                  {note}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(error || queryErr) && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#ef4444" }}>{error ?? queryErr?.message}</div>
          )}
        </div>
      </div>

      <DriverGroupPicker
        open={driverPickerOpen}
        onClose={() => setDriverPickerOpen(false)}
        companyId={companyId}
        selectedIds={driverFilter}
        onChange={setDriverFilter}
      />
    </div>
  );
}
