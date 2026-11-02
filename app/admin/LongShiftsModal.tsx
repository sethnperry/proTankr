"use client";
// app/admin/LongShiftsModal.tsx
//
// Company Dashboard → Long shifts. Shifts over the company's limit in the last 30 days, with the driver's
// explanation (or "None"), filterable by region, driver and category. Thin wrapper around the report shell.

import React, { useMemo } from "react";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { longShiftColumns, longShiftFilters, unexplained, type LongShiftRow } from "@/lib/shifts/explanation";

export default function LongShiftsModal({ open, onClose, companyId, rows, maxHours, loading, error }: {
  open: boolean; onClose: () => void; companyId: string; rows: LongShiftRow[]; maxHours: number; loading: boolean; error: string | null;
}) {
  const { members } = useCompanyRoster(open ? companyId : null);
  const byId = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members]);
  const nameOf = (id: string) => byId[id]?.display_name ?? "Driver";
  const regionOf = (id: string) => (byId[id] as any)?.region ?? "";
  const columns = useMemo(() => longShiftColumns(nameOf), [byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(() => longShiftFilters(nameOf, regionOf), [byId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ReportShell open={open} title={`Shifts over ${maxHours} h`} onClose={onClose} rows={rows} columns={columns} filters={filters} getKey={(r) => r.key}
      loading={loading} error={error} empty="No long shifts in the last 30 days." fileName="long_shifts"
      summary={(r) => [{ label: "Long shifts", value: String(r.length) }, { label: "No explanation", value: String(unexplained(r).length) }]} />
  );
}
