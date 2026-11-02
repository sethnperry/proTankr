"use client";
// app/admin/TerminalWorkModal.tsx
//
// Company Dashboard → Terminal work. Billable terminal time per terminal and period: every timed record with the
// driver, terminal, activity and product, and whether it is billable (the activity's default, or an admin's
// override marked with *). Tap a row to override billable or not, with a note; every override is kept. The
// activity defaults are set here too. Admin only (billing). Thin data wrapper around the shared report shell.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PeriodPicker } from "@/lib/ui/PeriodPicker";
import { lastDays, rangeBounds, type DateRange } from "@/lib/reports/dateRange";
import { emailReportPdf } from "@/lib/reports/emailReport";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { ACTIVITIES, activityLabel, billableDefault, byTerminal, clock, historyOf, reportRows, workColumns, workFilters, workSummary, type Activity, type Override, type TerminalWorkRow, type WorkReportRow } from "@/lib/terminalwork/terminalWork";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const btn = (on?: boolean): React.CSSProperties => ({ flex: 1, padding: "12px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

export default function TerminalWorkModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [rows, setRows] = useState<TerminalWorkRow[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [defaults, setDefaults] = useState<Partial<Record<Activity, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<WorkReportRow | null>(null);
  const [note, setNote] = useState("");
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const { members } = useCompanyRoster(open ? companyId : null);
  const products = useProductsCatalog().data;
  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Driver";
  const productOf = (id: string | null) => { const p = id ? products.find((x: any) => x.product_id === id) : null; return p ? String((p as any).display_name || (p as any).product_name || "") : ""; };

  const load = async () => {
    setLoading(true); setError(null);
    let q = supabase.from("terminal_work").select("*").eq("company_id", companyId).order("started_at", { ascending: false }).limit(3000);
    if (range) { const b = rangeBounds(range); q = q.gte("started_at", b.fromIso).lt("started_at", b.toIso); }
    const [w, o, d] = await Promise.all([q, supabase.from("terminal_work_overrides").select("work_id, billable, note, set_by, set_at").eq("company_id", companyId), supabase.from("terminal_work_defaults").select("activity, billable").eq("company_id", companyId)]);
    if (w.error) setError(w.error.message); else setRows((w.data ?? []) as TerminalWorkRow[]);
    setOverrides((o.data ?? []) as Override[]);
    setDefaults(Object.fromEntries(((d.data ?? []) as { activity: Activity; billable: boolean }[]).map((r) => [r.activity, r.billable])));
    setLoading(false);
  };
  useEffect(() => { if (open && companyId) void load(); }, [open, companyId, range?.start, range?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const report = useMemo(() => reportRows(rows, overrides, Date.now()), [rows, overrides]);
  const columns = useMemo(() => workColumns(nameOf, productOf), [members, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(() => workFilters(nameOf), [members]); // eslint-disable-line react-hooks/exhaustive-deps

  const override = async (billable: boolean) => {
    if (!sel) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("terminal_work_overrides").insert({ work_id: sel.work_id, company_id: companyId, billable, note: note.trim() || null, set_by: u.user?.id });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setNote(""); setSel(null); await load();
  };
  const setDefault = async (a: Activity, billable: boolean) => {
    await supabase.from("terminal_work_defaults").upsert({ company_id: companyId, activity: a, billable }, { onConflict: "company_id,activity" });
    setDefaults((d) => ({ ...d, [a]: billable }));
  };

  return (
    <>
      <ReportShell open={open && !sel && !setup} title="Terminal work" onClose={onClose} rows={report} columns={columns} filters={filters} getKey={(r) => r.work_id}
        onOpenRow={(r) => { setSel(r); setNote(""); }} summary={workSummary} loading={loading} error={error} empty="No terminal work in this period." fileName="terminal_work"
        onEmailPdf={(doc) => void emailReportPdf(doc)} periodSlot={<PeriodPicker companyId={companyId} userId={undefined} allowAll onChange={setRange} />}>
        <div style={{ marginBottom: 12 }}>
          {byTerminal(report).map((t) => (
            <div key={t.terminal} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: `1px solid ${HAIR}`, fontSize: 13 }}>
              <span style={{ flex: 1, fontWeight: 700 }}>{t.terminal}</span>
              <span className="dash-num" style={{ color: "#4ade80" }}>{clock(t.billable)} billable</span>
              <span className="dash-num" style={{ color: MUTE }}>{clock(t.notBillable)} not</span>
            </div>
          ))}
          <button type="button" style={{ ...btn(), flex: "none", width: "100%", marginTop: 10 }} onClick={() => setSetup(true)}>Billable defaults per activity</button>
        </div>
      </ReportShell>

      <FullscreenModal open={!!sel} title="Terminal work" onClose={() => setSel(null)} footer={null}>
        {sel && (
          <div>
            <div style={{ fontSize: 13, color: MUTE }}>{nameOf(sel.user_id)} · {new Date(sel.started_at).toLocaleString("en-US")}</div>
            <div style={{ fontSize: 18, fontWeight: 800, margin: "4px 0" }}>{activityLabel(sel.activity)}</div>
            <div style={{ fontSize: 14 }}>{sel.terminal_name}{productOf(sel.product_id) ? ` · ${productOf(sel.product_id)}` : ""}</div>
            <div className="dash-num" style={{ fontSize: 30, fontWeight: 900, margin: "8px 0" }}>{sel.ended_at ? clock(sel.minutes) : "running"}</div>
            {sel.note && <div style={{ fontSize: 14, marginBottom: 8 }}>{sel.note}</div>}
            <div style={{ fontSize: 13, color: MUTE }}>Default when it started: {sel.billable ? "billable" : "not billable"}. In force: <b style={{ color: "#fff" }}>{sel.effective ? "billable" : "not billable"}</b>{sel.overridden ? " (overridden)" : ""}.</div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional, kept with the change)"
              style={{ width: "100%", boxSizing: "border-box", margin: "14px 0 8px", padding: 10, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.28)", border: `1px solid ${HAIR}`, borderRadius: 0 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={busy} style={btn(sel.effective)} onClick={() => void override(true)}>Billable</button>
              <button type="button" disabled={busy} style={btn(!sel.effective)} onClick={() => void override(false)}>Not billable</button>
            </div>
            {historyOf(sel.work_id, overrides).length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, marginBottom: 6 }}>History</div>
                {historyOf(sel.work_id, overrides).map((h) => (
                  <div key={h.set_at} style={{ fontSize: 13, padding: "5px 0", borderTop: `1px solid ${HAIR}` }}>
                    {h.billable ? "Billable" : "Not billable"} · {h.set_by ? nameOf(h.set_by) : "Admin"} · {new Date(h.set_at).toLocaleString("en-US")}{h.note ? ` — ${h.note}` : ""}
                  </div>
                ))}
              </div>
            )}
            {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{error}</div>}
          </div>
        )}
      </FullscreenModal>

      <FullscreenModal open={setup} title="Billable defaults" onClose={() => setSetup(false)} footer={null}>
        <div style={{ fontSize: 13, color: MUTE, marginBottom: 12 }}>What a new timer starts as. It's only a default; you can override any record.</div>
        {ACTIVITIES.map((a) => {
          const on = billableDefault(a.value, defaults);
          return (
            <div key={a.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: `1px solid ${HAIR}` }}>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{a.label}</span>
              <button type="button" style={{ ...btn(on), flex: "none", width: 110 }} onClick={() => void setDefault(a.value, true)}>Billable</button>
              <button type="button" style={{ ...btn(!on), flex: "none", width: 110 }} onClick={() => void setDefault(a.value, false)}>Not</button>
            </div>
          );
        })}
      </FullscreenModal>
    </>
  );
}
