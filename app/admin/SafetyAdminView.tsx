"use client";
// app/admin/SafetyAdminView.tsx
//
// Safety meetings for admins: Meetings (schedule the next one in a series, start, end, close, open the roster),
// Series (create and edit: every N days, Zoom link, the PowerPoint) and Settings (how long records are kept).
// Presentational: rows in, callbacks out, no data code.

import React, { useState } from "react";
import { ModeSwitch } from "@/app/planner/components/dash/DashChrome";
import { meetingState, nextToSchedule, seriesProblem, type Meeting, type Series } from "@/lib/safety/safetyMeeting";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const field: React.CSSProperties = { boxSizing: "border-box", padding: 10, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.28)", border: `1px solid ${HAIR}`, borderRadius: 0, width: "100%", colorScheme: "dark" };
const btn = (on?: boolean): React.CSSProperties => ({ padding: "10px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });
const STATE_LABEL = { scheduled: "Scheduled", open: "Open: drivers can sign", ended: "Ended: still open for sign-in", closed: "Closed" } as const;

export type SeriesForm = { id: string | null; title: string; intervalDays: string; startsOn: string; zoomUrl: string; notes: string; file: File | null; attachmentName: string | null };
export type SafetyTab = "meetings" | "series" | "settings";

export function SafetyAdminView(p: {
  tab: SafetyTab; onTab: (t: SafetyTab) => void;
  series: Series[]; meetings: Meeting[]; today: string;
  signedCount: (meetingId: string) => string;
  onSchedule: (s: Series) => void;
  onAdHoc: () => void;
  onStart: (m: Meeting) => void; onEnd: (m: Meeting) => void; onClose: (m: Meeting) => void; onRoster: (m: Meeting) => void;
  onSaveSeries: (f: SeriesForm) => Promise<string | null>;
  onToggleSeries: (s: Series) => void;
  retentionYears: number; onSaveRetention: (years: number) => void;
  busy: boolean; error: string | null;
}) {
  const blank: SeriesForm = { id: null, title: "", intervalDays: "30", startsOn: p.today, zoomUrl: "", notes: "", file: null, attachmentName: null };
  const [form, setForm] = useState<SeriesForm | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [years, setYears] = useState(String(p.retentionYears));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <ModeSwitch mode={p.tab} modes={[{ id: "meetings", label: "Meetings" }, { id: "series", label: "Series" }, { id: "settings", label: "Settings" }]} onMode={p.onTab} />
      </div>
      {p.error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{p.error}</div>}

      {p.tab === "meetings" && (
        <>
          {p.series.filter((s) => s.is_active).map((s) => {
            const next = nextToSchedule(s, p.meetings, p.today);
            return <button key={s.series_id} type="button" disabled={p.busy} style={{ ...btn(true), width: "100%", marginBottom: 8, padding: "13px 0" }} onClick={() => p.onSchedule(s)}>Schedule {s.title} · {next}</button>;
          })}
          <button type="button" disabled={p.busy} style={{ ...btn(), width: "100%", marginBottom: 14 }} onClick={p.onAdHoc}>Hold a meeting now</button>
          {p.meetings.map((m) => {
            const st = meetingState(m);
            return (
              <div key={m.meeting_id} style={{ border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 12, marginBottom: 8, opacity: st === "closed" ? 0.6 : 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>{m.title}</span>
                  <span className="dash-num" style={{ fontSize: 13, color: "#fbbf24" }}>{p.signedCount(m.meeting_id)}</span>
                </div>
                <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{m.scheduled_for} · {STATE_LABEL[st]}{m.started_at ? ` · started ${when(m.started_at)}` : ""}{m.ended_at ? ` · ended ${when(m.ended_at)}` : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {st === "scheduled" && <button type="button" style={btn(true)} onClick={() => p.onStart(m)}>Start meeting</button>}
                  {st === "open" && <button type="button" style={btn(true)} onClick={() => p.onEnd(m)}>End meeting</button>}
                  {(st === "open" || st === "ended") && <button type="button" style={btn()} onClick={() => p.onClose(m)}>Close sign-in</button>}
                  <button type="button" style={btn()} onClick={() => p.onRoster(m)}>Roster</button>
                </div>
              </div>
            );
          })}
          {p.meetings.length === 0 && <div style={{ color: MUTE }}>No meetings yet. Create a series first, then schedule it here.</div>}
        </>
      )}

      {p.tab === "series" && (
        <>
          {!form && <button type="button" style={{ ...btn(true), width: "100%", marginBottom: 12, padding: "13px 0" }} onClick={() => { setForm(blank); setErr(null); }}>New series</button>}
          {form && (
            <div style={{ border: `1px solid ${HAIR}`, padding: 14, marginBottom: 14 }}>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title, e.g. Monthly safety meeting" style={{ ...field, marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <label style={{ flex: 1, fontSize: 12, color: MUTE }}>Every (days)<input value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} inputMode="numeric" style={{ ...field, marginTop: 4 }} /></label>
                <label style={{ flex: 1.4, fontSize: 12, color: MUTE }}>First meeting<input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} style={{ ...field, marginTop: 4 }} /></label>
              </div>
              <input value={form.zoomUrl} onChange={(e) => setForm({ ...form, zoomUrl: e.target.value })} placeholder="Zoom link (optional)" style={{ ...field, marginBottom: 8 }} />
              <label style={{ display: "block", fontSize: 12, color: MUTE, marginBottom: 8 }}>PowerPoint (optional){form.attachmentName && !form.file ? ` · now: ${form.attachmentName}` : ""}
                <input type="file" accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} style={{ display: "block", marginTop: 4, color: "#fff" }} />
              </label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Topic or notes (optional)" style={{ ...field, minHeight: 60, fontFamily: "inherit" }} />
              {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" disabled={p.busy} style={{ ...btn(true), flex: 1 }} onClick={async () => { const e = seriesProblem(form) ?? (await p.onSaveSeries(form)); if (e) setErr(e); else setForm(null); }}>{p.busy ? "Saving…" : "Save series"}</button>
                <button type="button" style={btn()} onClick={() => setForm(null)}>Cancel</button>
              </div>
            </div>
          )}
          {p.series.map((s) => (
            <div key={s.series_id} style={{ border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 12, marginBottom: 8, opacity: s.is_active ? 1 : 0.55 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: MUTE }}>Every {s.interval_days} days from {s.starts_on}{s.attachment_name ? ` · ${s.attachment_name}` : ""}{s.zoom_url ? " · Zoom" : ""}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button type="button" style={btn()} onClick={() => { setForm({ id: s.series_id, title: s.title, intervalDays: String(s.interval_days), startsOn: s.starts_on, zoomUrl: s.zoom_url ?? "", notes: "", file: null, attachmentName: s.attachment_name }); setErr(null); }}>Edit</button>
                <button type="button" style={btn()} onClick={() => p.onToggleSeries(s)}>{s.is_active ? "Stop series" : "Restart"}</button>
              </div>
            </div>
          ))}
        </>
      )}

      {p.tab === "settings" && (
        <div style={{ border: `1px solid ${HAIR}`, padding: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>How long records are kept</div>
          <div style={{ fontSize: 13, color: MUTE, margin: "4px 0 10px", lineHeight: 1.5 }}>Employment plus this many years. This is the company's stated policy; nothing is deleted automatically. Check the retention your own rules require.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={years} onChange={(e) => setYears(e.target.value)} inputMode="numeric" style={{ ...field, width: 90 }} />
            <span style={{ color: MUTE }}>years after employment ends</span>
          </div>
          <button type="button" style={{ ...btn(true), marginTop: 12 }} onClick={() => { const n = Math.round(Number(years)); if (Number.isFinite(n) && n >= 0 && n <= 30) p.onSaveRetention(n); }}>Save</button>
        </div>
      )}
    </div>
  );
}
