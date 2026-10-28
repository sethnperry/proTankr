"use client";
// app/admin/FleetUtilizationModal.tsx
//
// Phase 3 of the payload-utilization system: the fleet view, replacing
// UnderloadingDashboardModal.tsx. See docs/incentive-redesign-plan.md.
//
// This file is the data half only; the presentation lives in
// FleetUtilizationView.tsx so it can be rendered outside a browser.
//
// The concept is unchanged from the benchmark-era dashboard it replaces --
// "how much capacity is this fleet leaving on the table" -- but the data
// source is completely different, and three things follow from that:
//
//  1. NO `incentive_settings.enabled` GATE. The old dashboard showed a "turn
//     Incentives on and set a benchmark" empty state, because without a
//     manager-entered benchmark there was genuinely nothing to compute. The
//     capacity engine needs no benchmark and no configuration at all, and the
//     spec is explicit (sections 9/21, TEST K) that measurement must never
//     read `enabled`. A company that has configured nothing still gets real
//     numbers here.
//
//  2. NOT A LEADERBOARD (spec section 17). The per-driver table is sorted by
//     NAME, never by score, and carries no rank. This deliberately reverses
//     the old dashboard's own "sorted by gallons desc, not alphabetical -- a
//     leaderboard framing fits the number that justifies the subscription"
//     decision. Utilization is shaped by dispatch, terminal allocation and
//     equipment as much as by the driver, so ranking drivers on it produces a
//     blame chart wearing a scoreboard's clothes.
//
//  3. EXCLUDED LOADS ARE SHOWN, NEVER FOLDED IN (sections 10/11). A load over
//     the legal limit, or capped by someone else, cannot raise or lower the
//     fleet number. It surfaces as its own count so the figure above it stays
//     honest about what it does and doesn't cover.
//
// Audience is admin + lead + dispatch, unchanged from the dashboard it
// replaces -- enforced by load_utilization_staff_read (is_company_staff),
// not by this component.

import { lastDays, rangeBounds, type DateRange } from "@/lib/reports/dateRange";
import React, { useMemo, useState } from "react";

import DriverGroupPicker from "./DriverGroupPicker";
import { FleetUtilizationView, type FleetTotals } from "./FleetUtilizationView";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import {
  groupUtilizationByDriver,
  useCompanyHeadroom,
  useFleetPeriodUtilization,
} from "@/lib/capacity/useUtilization";

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
};

export default function FleetUtilizationModal({ open, onClose, companyId }: Props) {
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [driverFilter, setDriverFilter] = useState<Set<string> | null>(null);
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);

  const { since, until } = useMemo(() => {
    if (!range) return { since: "1970-01-01T00:00:00.000Z", until: undefined };
    const b = rangeBounds(range);
    return { since: b.fromIso, until: b.toIso };
  }, [range]);

  const fleet = useFleetPeriodUtilization(open ? companyId : null, since, until);
  const headroom = useCompanyHeadroom(open ? companyId : null, since, until);

  // load_utilization is never cleaned up when a driver leaves the company, so
  // without the roster filter a departed driver's loads would keep landing in
  // the fleet total forever. Same reasoning (and same fix) as the dashboard
  // this replaces. `null` filter means "everyone currently on the roster".
  const { members } = useCompanyRoster(companyId);
  const currentMemberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  const nameById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.user_id, m.display_name])),
    [members]
  );

  const visibleRows = useMemo(
    () => fleet.rows.filter(
      (r) => currentMemberIds.has(r.driver_id) && (driverFilter === null || driverFilter.has(r.driver_id))
    ),
    [fleet.rows, currentMemberIds, driverFilter]
  );

  const drivers = useMemo(
    () => groupUtilizationByDriver(visibleRows, nameById),
    [visibleRows, nameById]
  );

  // Summed from the per-driver groups rather than reusing fleet.summary, which
  // covers every driver including ones the admin has filtered out. One source
  // of truth for the headline and the rows under it.
  const totals = useMemo<FleetTotals>(() => {
    let eligible = 0, safety = 0, constraint = 0, incomplete = 0;
    let available = 0, actual = 0, unused = 0;
    for (const g of drivers) {
      eligible += g.summary.eligible_loads;
      safety += g.summary.excluded_safety;
      constraint += g.summary.excluded_constraint;
      incomplete += g.summary.excluded_incomplete_data;
      available += g.summary.available_gallons;
      actual += g.summary.actual_gallons;
      unused += g.summary.unused_gallons;
    }
    return {
      eligible, safety, constraint, incomplete, available, actual, unused,
      pct: available > 0 ? (actual / available) * 100 : null,
    };
  }, [drivers]);

  if (!open) return null;

  const err = (fleet.error ?? headroom.error) as Error | null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <FleetUtilizationView
        onClose={onClose}
        companyId={companyId}
        onRangeChange={setRange}
        driverFilterCount={driverFilter === null ? null : driverFilter.size}
        rosterSize={currentMemberIds.size}
        onOpenDriverPicker={() => setDriverPickerOpen(true)}
        loading={fleet.isLoading}
        totals={totals}
        drivers={drivers}
        headroom={headroom.data ?? null}
        errorMessage={err ? err.message : null}
      />

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
