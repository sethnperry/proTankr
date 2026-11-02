"use client";
// app/admin/PerDiemModal.tsx
//
// Company Dashboard → Per diem. The days drivers claimed, by driver and period, with where (city and state) and
// whether it came from the truck's GPS, their trips, or the driver. Admins read; only drivers claim their own
// days. Thin data wrapper around the shared report shell.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { PeriodPicker } from "@/lib/ui/PeriodPicker";
import { lastDays, type DateRange } from "@/lib/reports/dateRange";
import { emailReportPdf } from "@/lib/reports/emailReport";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { claimedOnly, daysPerDriver, perDiemColumns, perDiemFilters, type PerDiemRow } from "@/lib/perdiem/perDiem";

export default function PerDiemModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [rows, setRows] = useState<PerDiemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.display_name])), [members]);
  const nameOf = (id: string) => nameById[id] ?? "Driver";

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setLoading(true); setError(null);
    let q = supabase.from("per_diem_days").select("user_id, day, city, state, source, status").eq("company_id", companyId).eq("status", "claimed").order("day", { ascending: false }).limit(5000);
    if (range) q = q.gte("day", range.start).lte("day", range.end);
    void q.then(({ data, error: e }) => { if (!alive) return; if (e) setError(e.message); else setRows((data ?? []) as PerDiemRow[]); setLoading(false); });
    return () => { alive = false; };
  }, [open, companyId, range?.start, range?.end]);

  const columns = useMemo(() => perDiemColumns(nameOf), [nameById]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(() => perDiemFilters(nameOf), [nameById]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ReportShell open={open} title="Per diem" onClose={onClose} rows={rows} columns={columns} filters={filters} getKey={(r) => `${r.user_id}|${r.day}`}
      loading={loading} error={error} empty="No per diem days claimed in this period." fileName="per_diem" onEmailPdf={(doc) => void emailReportPdf(doc)}
      summary={(r) => [{ label: "Days", value: String(claimedOnly(r).length) }, { label: "Drivers", value: String(daysPerDriver(r).size) }]}
      periodSlot={<PeriodPicker companyId={companyId} userId={undefined} allowAll onChange={setRange} />} />
  );
}
