"use client";
// app/admin/SafetyMeetingsModal.tsx
//
// Company Dashboard → Safety meetings. Thin data wrapper around SafetyAdminView and the shared report shell:
// loads the series, meetings and signatures, runs the meeting (start, end, close), schedules reminders through the
// one scheduler, and shows each meeting's roster (signed and not signed) with an audit export. Admin only.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { localDateOf } from "@/lib/worklog/time";
import { deviceTz } from "@/lib/reports/dateRange";
import { nextRunAfter } from "@/lib/notify/schedule";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { SignatureView } from "@/lib/ui/SignaturePad";
import { auditCsv, nextToSchedule, reminderDrafts, roster, rosterColumns, rosterFilters, unsignedCount, type Meeting, type Series, type Signature } from "@/lib/safety/safetyMeeting";
import { SafetyAdminView, type SafetyTab, type SeriesForm } from "./SafetyAdminView";

type Person = { user_id: string; name: string; role: string };

export default function SafetyMeetingsModal({ open, onClose, companyId, userId }: { open: boolean; onClose: () => void; companyId: string; userId: string | null }) {
  const tz = useMemo(() => deviceTz(), []);
  const today = localDateOf(Date.now(), tz);
  const { members } = useCompanyRoster(open ? companyId : null);
  const [tab, setTab] = useState<SafetyTab>("meetings");
  const [series, setSeries] = useState<Series[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [sigs, setSigs] = useState<(Signature & { meeting_id: string; signature: string })[]>([]);
  const [retention, setRetention] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rosterOf, setRosterOf] = useState<Meeting | null>(null);
  const [signerOpen, setSignerOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    const since = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
    const [s, m, uc, sg, st] = await Promise.all([
      supabase.from("safety_meeting_series").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("safety_meetings").select("*").eq("company_id", companyId).gte("scheduled_for", since).order("scheduled_for", { ascending: false }),
      supabase.from("user_companies").select("user_id, role").eq("company_id", companyId),
      supabase.from("safety_meeting_signatures").select("meeting_id, user_id, signed_at, signature").eq("company_id", companyId),
      supabase.from("safety_settings").select("retention_years").eq("company_id", companyId).maybeSingle(),
    ]);
    const err = [s, m, uc, sg].find((r) => r.error)?.error;
    if (err) setError(err.message);
    setSeries((s.data ?? []) as Series[]); setMeetings((m.data ?? []) as Meeting[]);
    setRoles(Object.fromEntries(((uc.data ?? []) as { user_id: string; role: string }[]).map((r) => [r.user_id, r.role])));
    setSigs((sg.data ?? []) as any[]);
    setRetention(Number((st.data as any)?.retention_years ?? 3));
  }, [companyId]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const people: Person[] = useMemo(() => members.map((m) => ({ user_id: m.user_id, name: m.display_name, role: roles[m.user_id] ?? "driver" })), [members, roles]);
  const rowsFor = (id: string) => roster(people, sigs.filter((x) => x.meeting_id === id));
  const signedCount = (id: string) => { const r = rowsFor(id); return `${r.length - unsignedCount(r)} of ${r.length} signed`; };

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); await load(); } catch (e: any) { setError(e?.message ?? "Something went wrong."); } setBusy(false); };

  const createMeeting = (o: { series_id: string | null; title: string; scheduled_for: string; zoom_url: string | null; attachment_path: string | null; attachment_name: string | null }, started: boolean) => run(async () => {
    const { data, error: e } = await supabase.from("safety_meetings").insert({ company_id: companyId, ...o, started_at: started ? new Date().toISOString() : null, held_by: started ? userId : null }).select("meeting_id, title, scheduled_for, zoom_url").single();
    if (e) throw e;
    // Reminders go through the one scheduler, never sent from here. A reminder whose time has passed is skipped.
    for (const d of reminderDrafts(data as any, tz)) {
      const next = nextRunAfter(d.cadence, Date.now());
      if (next == null) continue;
      const { error: se } = await supabase.from("notification_schedules").insert({ company_id: companyId, kind: d.kind, template_key: d.template_key, recipients: d.recipients, channels: d.channels, cadence: d.cadence, payload: d.payload, next_run_at: new Date(next).toISOString(), is_active: true, created_by: userId });
      if (se) throw se;
    }
  });

  const patch = (m: Meeting, p: Partial<Meeting> & { held_by?: string | null }) => run(async () => { const { error: e } = await supabase.from("safety_meetings").update(p).eq("meeting_id", m.meeting_id); if (e) throw e; });

  const saveSeries = async (f: SeriesForm): Promise<string | null> => {
    setBusy(true);
    try {
      let path: string | null = null, name: string | null = f.attachmentName;
      if (f.file) {
        path = `${companyId}/${crypto.randomUUID()}-${f.file.name.replace(/[^\w.\-]+/g, "_")}`;
        const up = await supabase.storage.from("safety-meetings").upload(path, f.file, { contentType: f.file.type || "application/octet-stream" });
        if (up.error) return up.error.message;
        name = f.file.name;
      }
      const row: any = { company_id: companyId, title: f.title.trim(), interval_days: Number(f.intervalDays), starts_on: f.startsOn, zoom_url: f.zoomUrl.trim() || null, notes: f.notes.trim() || null, created_by: userId, ...(path ? { attachment_path: path, attachment_name: name } : {}) };
      const res = f.id ? await supabase.from("safety_meeting_series").update(row).eq("series_id", f.id) : await supabase.from("safety_meeting_series").insert(row);
      if (res.error) return res.error.message;
      await load();
      return null;
    } finally { setBusy(false); }
  };

  const roster_ = rosterOf ? rowsFor(rosterOf.meeting_id) : [];
  const download = () => {
    if (!rosterOf) return;
    const blob = new Blob([auditCsv(rosterOf, roster_)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `safety_meeting_${rosterOf.scheduled_for}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const sigOf = (uid: string) => sigs.find((x) => x.meeting_id === rosterOf?.meeting_id && x.user_id === uid)?.signature ?? null;

  return (
    <>
      <FullscreenModal open={open && !rosterOf} title="Safety meetings" onClose={onClose} footer={null}>
        <SafetyAdminView tab={tab} onTab={setTab} series={series} meetings={meetings} today={today} signedCount={signedCount} busy={busy} error={error}
          onSchedule={(s) => void createMeeting({ series_id: s.series_id, title: s.title, scheduled_for: nextToSchedule(s, meetings, today), zoom_url: s.zoom_url, attachment_path: s.attachment_path, attachment_name: s.attachment_name }, false)}
          onAdHoc={() => void createMeeting({ series_id: null, title: "Safety meeting", scheduled_for: today, zoom_url: null, attachment_path: null, attachment_name: null }, true)}
          onStart={(m) => void patch(m, { started_at: new Date().toISOString(), held_by: userId })} onEnd={(m) => void patch(m, { ended_at: new Date().toISOString() })}
          onClose={(m) => void patch(m, { ended_at: m.ended_at ?? new Date().toISOString(), closed_at: new Date().toISOString() })} onRoster={setRosterOf}
          onSaveSeries={saveSeries} onToggleSeries={(s) => void run(async () => { await supabase.from("safety_meeting_series").update({ is_active: !s.is_active }).eq("series_id", s.series_id); })}
          retentionYears={retention} onSaveRetention={(n) => void run(async () => { const { error: e } = await supabase.from("safety_settings").upsert({ company_id: companyId, retention_years: n, updated_at: new Date().toISOString() }, { onConflict: "company_id" }); if (e) throw e; })} />
      </FullscreenModal>

      <ReportShell open={!!rosterOf && !signerOpen} title={rosterOf ? `Roster · ${rosterOf.scheduled_for}` : "Roster"} onClose={() => setRosterOf(null)} rows={roster_} columns={rosterColumns} filters={rosterFilters} getKey={(r) => r.user_id}
        onOpenRow={(r) => { if (r.signed) setSignerOpen(r.user_id); }} fileName={`safety_roster_${rosterOf?.scheduled_for ?? ""}`}
        summary={(r) => [{ label: "Signed", value: String(r.length - unsignedCount(r)) }, { label: "Not signed", value: String(unsignedCount(r)) }]} empty="No drivers.">
        <button type="button" onClick={download} style={{ width: "100%", marginBottom: 12, padding: "11px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff" }}>Audit export (with meeting times)</button>
      </ReportShell>
      <FullscreenModal open={!!signerOpen} title="Signature" onClose={() => setSignerOpen(null)} footer={null}>
        {signerOpen && sigOf(signerOpen) && <div style={{ color: "#fff", background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)", padding: 16 }}><div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{people.find((x) => x.user_id === signerOpen)?.name}</div><SignatureView path={sigOf(signerOpen)!} height={110} /></div>}
      </FullscreenModal>
    </>
  );
}
