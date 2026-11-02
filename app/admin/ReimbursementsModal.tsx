"use client";
// app/admin/ReimbursementsModal.tsx
//
// Company Dashboard → Reimbursements. Fuel the drivers paid for themselves (My Card, Cash), by driver and period,
// with CSV and PDF export. The records are made by the database when the driver finishes the stop; here an admin
// reviews them: tap a row to see the receipt and mark it approved, paid or denied. Thin data wrapper around the
// shared report shell.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PeriodPicker } from "@/lib/ui/PeriodPicker";
import { lastDays, rangeBounds, type DateRange } from "@/lib/reports/dateRange";
import { emailReportPdf } from "@/lib/reports/emailReport";
import { openStoredFile } from "@/lib/fuel/useFuelSetup";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { STATUS_LABEL, money, reimbursementColumns, reimbursementFilters, reimbursementSummary, type ReimbursementRow, type ReimbursementStatus } from "@/lib/reimbursements/reimbursements";

const btn = (on?: boolean): React.CSSProperties => ({ flex: 1, padding: "12px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

export default function ReimbursementsModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [rows, setRows] = useState<ReimbursementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<ReimbursementRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.display_name])), [members]);
  const nameOf = useCallback((id: string) => nameById[id] ?? "Driver", [nameById]);

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setLoading(true); setError(null);
    let q = supabase.from("reimbursements")
      .select("reimbursement_id, driver_id, amount, description, expense_date, receipt_path, status, note")
      .eq("company_id", companyId).order("expense_date", { ascending: false }).limit(2000);
    if (range) { const b = rangeBounds(range); q = q.gte("expense_date", b.fromIso).lt("expense_date", b.toIso); }
    void q.then(({ data, error: e }) => {
      if (!alive) return;
      if (e) setError(e.message); else setRows((data ?? []) as ReimbursementRow[]);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [open, companyId, range?.start, range?.end]);

  const columns = useMemo(() => reimbursementColumns(nameOf), [nameOf]);
  const filters = useMemo(() => reimbursementFilters(nameOf), [nameOf]);

  const decide = async (status: ReimbursementStatus) => {
    if (!sel) return;
    setBusy(true);
    const now = new Date().toISOString();
    const { data: u } = await supabase.auth.getUser();
    const patch: Record<string, unknown> = { status, decided_by: u.user?.id ?? null, decided_at: now, updated_at: now };
    if (status === "paid") patch.paid_at = now;
    const { error: e } = await supabase.from("reimbursements").update(patch).eq("reimbursement_id", sel.reimbursement_id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setRows((rs) => rs.map((r) => (r.reimbursement_id === sel.reimbursement_id ? { ...r, status } : r)));
    setSel(null);
  };

  return (
    <>
      <ReportShell
        open={open && !sel} title="Reimbursements" onClose={onClose}
        rows={rows} columns={columns} filters={filters} getKey={(r) => r.reimbursement_id}
        onOpenRow={setSel} summary={reimbursementSummary} loading={loading} error={error}
        empty="Nothing paid out of pocket in this period." fileName="reimbursements" onEmailPdf={(doc) => void emailReportPdf(doc)}
        periodSlot={<PeriodPicker companyId={companyId} userId={undefined} allowAll onChange={setRange} />}
      />
      <FullscreenModal open={!!sel} title="Reimbursement" onClose={() => setSel(null)} footer={null}>
        {sel && (
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{nameOf(sel.driver_id)}</div>
            <div className="dash-num" style={{ fontSize: 34, fontWeight: 900, margin: "4px 0" }}>{money(Number(sel.amount) || 0)}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{sel.description}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{new Date(sel.expense_date).toLocaleDateString("en-US")} · {STATUS_LABEL[sel.status]}</div>
            {sel.receipt_path
              ? <button type="button" style={{ ...btn(), flex: "none", width: "100%", marginTop: 16 }} onClick={() => void openStoredFile("fuel-receipts", sel.receipt_path!).catch(() => setError("Couldn't open the receipt."))}>View receipt</button>
              : <div style={{ marginTop: 16, color: "#fbbf24", fontSize: 13 }}>No receipt photo.</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" style={btn(sel.status === "approved")} disabled={busy} onClick={() => void decide("approved")}>Approve</button>
              <button type="button" style={btn(sel.status === "paid")} disabled={busy} onClick={() => void decide("paid")}>Paid</button>
              <button type="button" style={btn(sel.status === "denied")} disabled={busy} onClick={() => void decide("denied")}>Deny</button>
            </div>
            {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{error}</div>}
          </div>
        )}
      </FullscreenModal>
    </>
  );
}
