"use client";
// app/admin/PaperLogsModal.tsx
//
// Company Dashboard → Paper logs. Days drivers kept on paper (ELD down, battery dead, roadside inspection), with
// why and the photos of the pages. Thin data wrapper around the shared report shell.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PeriodPicker } from "@/lib/ui/PeriodPicker";
import { lastDays, rangeBounds, type DateRange } from "@/lib/reports/dateRange";
import { openStoredFile } from "@/lib/fuel/useFuelSetup";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { PAPER_LOG_EVENT, paperLogColumns, paperLogFilters, type PaperLogRow } from "@/lib/shifts/paperLog";

export default function PaperLogsModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [rows, setRows] = useState<PaperLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<PaperLogRow | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.display_name])), [members]);
  const nameOf = (id: string) => nameById[id] ?? "Driver";

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setLoading(true); setError(null);
    let q = supabase.from("shift_events").select("event_id, user_id, occurred_at, payload").eq("company_id", companyId).eq("event_type", PAPER_LOG_EVENT).order("occurred_at", { ascending: false }).limit(1000);
    if (range) { const b = rangeBounds(range); q = q.gte("occurred_at", b.fromIso).lt("occurred_at", b.toIso); }
    void q.then(({ data, error: e }) => { if (!alive) return; if (e) setError(e.message); else setRows((data ?? []) as PaperLogRow[]); setLoading(false); });
    return () => { alive = false; };
  }, [open, companyId, range?.start, range?.end]);

  useEffect(() => {
    setPages([]);
    const id = sel?.payload.capture_id;
    if (!id) return;
    let alive = true;
    void supabase.from("form_captures").select("file_paths").eq("capture_id", id).maybeSingle().then(({ data }) => { if (alive) setPages(((data as any)?.file_paths ?? []) as string[]); });
    return () => { alive = false; };
  }, [sel]);

  const columns = useMemo(() => paperLogColumns(nameOf), [nameById]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(() => paperLogFilters(nameOf), [nameById]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ReportShell open={open && !sel} title="Paper logs" onClose={onClose} rows={rows} columns={columns} filters={filters} getKey={(r) => r.event_id}
        onOpenRow={setSel} loading={loading} error={error} empty="No paper logs in this period." fileName="paper_logs"
        summary={(r) => [{ label: "Days on paper", value: String(r.length) }]}
        periodSlot={<PeriodPicker companyId={companyId} userId={undefined} allowAll onChange={setRange} />} />
      <FullscreenModal open={!!sel} title="Paper log" onClose={() => setSel(null)} footer={null}>
        {sel && (
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{nameOf(sel.user_id)} · {new Date(sel.occurred_at).toLocaleString("en-US")}</div>
            <div style={{ fontSize: 18, fontWeight: 800, margin: "6px 0" }}>{sel.payload.reason}</div>
            {sel.payload.note && <div style={{ fontSize: 14 }}>{sel.payload.note}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              {pages.map((p, i) => (
                <button key={p} type="button" onClick={() => void openStoredFile("form-captures", p).catch(() => setError("Couldn't open the page."))}
                  style={{ padding: "11px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff" }}>Page {i + 1}</button>
              ))}
            </div>
            {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{error}</div>}
          </div>
        )}
      </FullscreenModal>
    </>
  );
}
