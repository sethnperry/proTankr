"use client";
// app/admin/ScaleRecordsModal.tsx
//
// Company Dashboard → Scale records. Every weigh drivers recorded (private / CAT or DOT), by unit and driver,
// with citations findable in one filter. Tap a row for the figures, the citation, what the planner said at the
// time, and the ticket photos. Thin data wrapper around the shared report shell.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PeriodPicker } from "@/lib/ui/PeriodPicker";
import { lastDays, rangeBounds, type DateRange } from "@/lib/reports/dateRange";
import { emailReportPdf } from "@/lib/reports/emailReport";
import { openStoredFile } from "@/lib/fuel/useFuelSetup";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { scaleColumns, scaleFilters, scaleSummary, weighed, plannerDiff, type ScaleReportRow } from "@/lib/scale/scaleReport";
import { CITATION_LABEL, SCALE_TYPE_LABEL } from "@/lib/scale/scaleRecord";

const MUTE = "rgba(255,255,255,0.5)";
const line = (k: string, v: React.ReactNode) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 14 }}>
    <span style={{ color: MUTE }}>{k}</span><span style={{ fontWeight: 700, textAlign: "right" }}>{v}</span>
  </div>
);
const lb = (n: number | string | null | undefined) => (n == null ? "—" : `${Math.round(Number(n)).toLocaleString("en-US")} lbs`);

export default function ScaleRecordsModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [range, setRange] = useState<DateRange>(() => lastDays(90));
  const [rows, setRows] = useState<ScaleReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<ScaleReportRow | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.display_name])), [members]);
  const nameOf = (id: string | null) => (id ? nameById[id] ?? "Driver" : "");

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setLoading(true); setError(null);
    void (async () => {
      let q = supabase.from("weight_records")
        .select("weight_record_id, recorded_at, created_by, scale_type, heavy_weight_lbs, light_weight_lbs, planner_weight_lbs, citation, citation_detail, planner_snapshot, capture_id, notes, combo:equipment_combos(truck:trucks(truck_name), trailer:trailers(trailer_name))")
        .eq("company_id", companyId).order("recorded_at", { ascending: false }).limit(2000);
      if (range) { const b = rangeBounds(range); q = q.gte("recorded_at", b.fromIso).lt("recorded_at", b.toIso); }
      const { data, error: e } = await q;
      if (!alive) return;
      if (e) { setError(e.message); setLoading(false); return; }
      const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
      setRows(((data ?? []) as any[]).map((r) => {
        const c = one<any>(r.combo);
        const truck = one<any>(c?.truck)?.truck_name, trailer = one<any>(c?.trailer)?.trailer_name;
        return { ...r, unit: [truck ? `Truck ${truck}` : null, trailer ? `Trailer ${trailer}` : null].filter(Boolean).join(" / ") || "Unit" } as ScaleReportRow;
      }));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, companyId, range?.start, range?.end]);

  // The ticket photos for the row that is open.
  useEffect(() => {
    setPhotos([]);
    if (!sel?.capture_id) return;
    let alive = true;
    void supabase.from("form_captures").select("file_paths").eq("capture_id", sel.capture_id).maybeSingle().then(({ data }) => { if (alive) setPhotos(((data as any)?.file_paths ?? []) as string[]); });
    return () => { alive = false; };
  }, [sel]);

  const columns = useMemo(() => scaleColumns(nameOf), [nameById]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(() => scaleFilters(nameOf), [nameById]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ReportShell
        open={open && !sel} title="Scale records" onClose={onClose}
        rows={rows} columns={columns} filters={filters} getKey={(r) => r.weight_record_id}
        onOpenRow={setSel} summary={scaleSummary} loading={loading} error={error}
        empty="No scale records in this period." fileName="scale_records" onEmailPdf={(doc) => void emailReportPdf(doc)}
        periodSlot={<PeriodPicker companyId={companyId} userId={undefined} allowAll onChange={setRange} />}
      />
      <FullscreenModal open={!!sel} title="Scale record" onClose={() => setSel(null)} footer={null}>
        {sel && (
          <div>
            <div style={{ fontSize: 13, color: MUTE }}>{nameOf(sel.created_by)} · {sel.unit}</div>
            <div style={{ fontSize: 13, color: MUTE, marginBottom: 8 }}>{new Date(sel.recorded_at).toLocaleString("en-US")} · {SCALE_TYPE_LABEL[sel.scale_type]}</div>
            {line("Loaded weight", lb(sel.heavy_weight_lbs))}
            {line("Empty weight", lb(sel.light_weight_lbs))}
            {line(sel.light_weight_lbs != null ? "Net" : "Measured", lb(weighed(sel)))}
            {line("Planner net", lb(sel.planner_weight_lbs))}
            {plannerDiff(sel) != null && line("Difference", `${plannerDiff(sel)! > 0 ? "+" : ""}${plannerDiff(sel)} lbs`)}
            {sel.citation && (
              <div style={{ border: "1px solid rgba(239,68,68,0.5)", padding: 12, margin: "14px 0" }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#f87171" }}>Citation</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{CITATION_LABEL[sel.citation_detail?.kind ?? "other"]}{sel.citation_detail?.amount != null ? ` · $${sel.citation_detail.amount}` : ""}</div>
                {sel.citation_detail?.number && <div style={{ fontSize: 13, color: MUTE }}>No. {sel.citation_detail.number}</div>}
                {sel.citation_detail?.note && <div style={{ fontSize: 14, marginTop: 6 }}>{sel.citation_detail.note}</div>}
              </div>
            )}
            {sel.planner_snapshot && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, marginBottom: 4 }}>Planner at the time</div>
                {line("Tare", lb(sel.planner_snapshot.tare_lbs))}
                {line("Planned gross", lb(sel.planner_snapshot.planned_gross_lbs))}
                {line("Gross limit", lb(sel.planner_snapshot.gross_limit_lbs))}
                {sel.planner_snapshot.lines.map((l) => (
                  <div key={l.comp} style={{ fontSize: 13, color: MUTE, padding: "4px 0" }}>
                    C{l.comp} · {l.product ?? "?"} · {l.gallons != null ? `${Math.round(l.gallons)} gal` : "—"} · {l.temp_f != null ? `${Math.round(l.temp_f)}°F` : "—"} · {l.api != null ? `${l.api.toFixed(1)} API` : "—"}
                  </div>
                ))}
              </div>
            )}
            {sel.notes && <div style={{ marginTop: 12, fontSize: 14 }}>{sel.notes}</div>}
            {photos.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                {photos.map((p, i) => (
                  <button key={p} type="button" onClick={() => void openStoredFile("form-captures", p).catch(() => setError("Couldn't open the photo."))}
                    style={{ padding: "11px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff" }}>Ticket photo {i + 1}</button>
                ))}
              </div>
            )}
            {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{error}</div>}
          </div>
        )}
      </FullscreenModal>
    </>
  );
}
