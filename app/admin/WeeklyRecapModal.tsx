"use client";
// app/admin/WeeklyRecapModal.tsx
//
// Company Dashboard -> Weekly Recap. Completed weeks newest first (the last 12 kept), each opening to the five pages:
// region summary, driver table, delay ledger, driver patterns, system lens. PDF download, email to admin and dispatch
// users, and (admins) regenerate and the time allowances every report follows. Admin and dispatch only.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DEFAULT_RECAP_SETTINGS, type RecapSettings } from "@/lib/recap/types";
import type { Recap } from "@/lib/recap/report";
import { BUCKET_LABEL } from "@/lib/recap/time";

const HAIR = "rgba(255,255,255,0.14)", MUTE = "rgba(255,255,255,0.55)", SURFACE = "#121213";
const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, margin: "18px 0 6px" };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0a0a0b", border: `1px solid ${HAIR}`, color: "#fff", fontSize: 16, padding: "10px 12px", borderRadius: 0, colorScheme: "dark" };
const btn = (primary: boolean): React.CSSProperties => ({ width: "100%", padding: "14px 0", fontSize: 14, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", marginTop: 10, border: primary ? "none" : `1px solid ${HAIR}`, background: primary ? "#fff" : "transparent", color: primary ? "#000" : "#fff" });
const chip = (on: boolean): React.CSSProperties => ({ padding: "8px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", border: `1px solid ${on ? "#fff" : HAIR}`, background: on ? "#fff" : "#0a0a0b", color: on ? "#000" : "rgba(255,255,255,0.85)", whiteSpace: "nowrap" });

const hm = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
const sgn = (n: number | null | undefined, unit = "") => (n == null ? "" : `${n > 0 ? "▲" : "▼"} ${Math.abs(n) >= 100 ? Math.round(Math.abs(n)).toLocaleString("en-US") : Math.abs(n).toFixed(1)}${unit}`);

type Stored = { week_start: string; generated_at: string; regenerated_at: string | null };
type Page = "summary" | "drivers" | "ledger" | "patterns" | "system";
const PAGES: [Page, string][] = [["summary", "Region"], ["drivers", "Drivers"], ["ledger", "Delays"], ["patterns", "Patterns"], ["system", "System"]];

const ALLOWANCE_FIELDS: { key: keyof RecapSettings; label: string; help: string; unit: string }[] = [
  { key: "startAllowanceMin", label: "Start-of-shift allowance", help: "Shift start to the first event: assumed pre-trip, credited.", unit: "min" },
  { key: "betweenAllowanceMin", label: "Between-trip allowance", help: "Paperwork, a mid-shift pre-trip, waiting on dispatch.", unit: "min" },
  { key: "endAllowanceMin", label: "End-of-shift allowance", help: "Last event to the end tap: post-trip and paperwork.", unit: "min" },
  { key: "shiftGrayCapMin", label: "Per-shift gray-zone cap", help: "Most gray-zone time credited in one shift.", unit: "min" },
  { key: "endTailCapMin", label: "Late end tap cap", help: "A shift left running past its last event counts only this much; the rest is a late end tap.", unit: "min" },
  { key: "lateAnswerCredit", label: "Late answer credit", help: "Credit for a delay reason given after the fact (0 to 1).", unit: "x" },
  { key: "corroborationDrivers", label: "Peers to verify a wait", help: "Other drivers at least 25% over standard at the same place and hour.", unit: "drivers" },
  { key: "minDrivers", label: "Drivers per standard", help: "Distinct drivers a standard needs before it is used.", unit: "drivers" },
];

async function call(action: string, body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  return fetch("/api/recap", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ action, ...body }) });
}

/** The completed weeks to list: the last 12 Mondays before the current week. */
function lastWeeks(): string[] {
  const now = new Date(); const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back - 7);
  return Array.from({ length: 12 }, (_, i) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - 7 * i); return x.toISOString().slice(0, 10); });
}
const weekLabel = (w: string) => { const a = new Date(`${w}T12:00:00Z`), b = new Date(a); b.setUTCDate(b.getUTCDate() + 6); const f = (x: Date) => x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); return `${f(a)} – ${f(b)}`; };

function Table({ head, rows, widths }: { head: string[]; rows: (string | React.ReactNode)[][]; widths?: string }) {
  const cols = widths ?? `2fr ${"1fr ".repeat(head.length - 1)}`.trim();
  return (
    <div style={{ border: `1px solid ${HAIR}`, background: SURFACE, overflowX: "auto" }}>
      <div style={{ minWidth: head.length > 5 ? 640 : 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "8px 10px", borderBottom: `1px solid ${HAIR}`, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE }}>{head.map((h) => <div key={h}>{h}</div>)}</div>
        {rows.length === 0 && <div style={{ padding: 12, color: MUTE, fontSize: 13 }}>Nothing to show.</div>}
        {rows.map((r, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "9px 10px", borderTop: i ? "1px solid rgba(255,255,255,0.06)" : undefined, fontSize: 13, alignItems: "center" }}>{r.map((c, j) => <div key={j} style={{ overflow: "hidden", textOverflow: "ellipsis", color: j ? "rgba(255,255,255,0.85)" : "#fff", fontWeight: j ? 500 : 700 }}>{c}</div>)}</div>)}
      </div>
    </div>
  );
}

export default function WeeklyRecapModal({ open, onClose, companyId, canEdit }: { open: boolean; onClose: () => void; companyId: string; canEdit: boolean }) {
  const [stored, setStored] = useState<Record<string, Stored>>({});
  const [week, setWeek] = useState<string | null>(null);
  const [report, setReport] = useState<Recap | null>(null);
  const [page, setPage] = useState<Page>("summary");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [view, setView] = useState<"weeks" | "email" | "settings">("weeks");
  const [staff, setStaff] = useState<{ name: string; email: string; role: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [settings, setSettings] = useState<{ enabled: boolean; recipients: string; tz: string; send_at: string; version: number; allowances: Partial<RecapSettings> }>({ enabled: false, recipients: "", tz: "America/New_York", send_at: "04:00", version: 1, allowances: {} });
  const [log, setLog] = useState<{ changed_at: string; new_value: Record<string, number> }[]>([]);

  const weeks = useMemo(lastWeeks, []);
  const loadStored = useCallback(async () => {
    const { data } = await supabase.from("weekly_recaps").select("week_start, generated_at, regenerated_at").eq("company_id", companyId).order("week_start", { ascending: false }).limit(60);
    setStored(Object.fromEntries(((data ?? []) as Stored[]).map((r) => [r.week_start, r])));
  }, [companyId]);
  useEffect(() => { if (open) { setWeek(null); setReport(null); setView("weeks"); setMsg(null); void loadStored(); } }, [open, loadStored]);

  const openWeek = async (w: string) => {
    setMsg(null); setBusy(`open${w}`);
    const { data } = await supabase.from("weekly_recaps").select("report").eq("company_id", companyId).eq("week_start", w).maybeSingle();
    setBusy(null);
    if (data) { setReport((data as { report: Recap }).report); setWeek(w); setPage("summary"); }
  };
  const generate = async (w: string) => {
    setBusy(`gen${w}`); setMsg(null);
    const r = await call("generate", { companyId, weekStart: w });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? "Couldn't build that week." });
    await loadStored(); await openWeek(w);
  };
  const download = async () => {
    if (!week) return;
    setBusy("pdf");
    const r = await call("pdf", { companyId, weekStart: week });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: (await r.json().catch(() => ({}))).error ?? "Couldn't make the PDF." });
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a"); a.href = url; a.download = `WeeklyRecap-${week}.pdf`; a.click(); URL.revokeObjectURL(url);
  };
  const openEmail = async () => {
    setView("email"); setMsg(null);
    const r = await call("staff", { companyId });
    const j = await r.json().catch(() => ({}));
    setStaff(j.staff ?? []); setPicked([]);
  };
  const sendEmail = async () => {
    setBusy("email");
    const r = await call("email", { companyId, weekStart: week, to: picked });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: `Sent to ${(j.to ?? []).join(", ")}.` } : { ok: false, text: j.error ?? "Couldn't send." });
    if (r.ok) setView("weeks");
  };
  const openSettings = async () => {
    setView("settings"); setMsg(null);
    const [s, l] = await Promise.all([
      supabase.from("weekly_recap_settings").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("weekly_recap_settings_log").select("changed_at, new_value").eq("company_id", companyId).order("changed_at", { ascending: false }).limit(5),
    ]);
    const row = s.data as { enabled: boolean; recipients: string[]; tz: string; send_at: string; version: number; allowances: Partial<RecapSettings> } | null;
    if (row) setSettings({ enabled: row.enabled, recipients: (row.recipients ?? []).join(", "), tz: row.tz, send_at: row.send_at, version: row.version, allowances: row.allowances ?? {} });
    setLog((l.data ?? []) as typeof log);
  };
  const saveSettings = async () => {
    setBusy("save"); setMsg(null);
    const r = await call("settings", { companyId, settings: { enabled: settings.enabled, recipients: settings.recipients.split(/[\s,;]+/).filter(Boolean), tz: settings.tz, send_at: settings.send_at, allowances: settings.allowances } });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: "Saved. Changes apply from the next report." } : { ok: false, text: j.error ?? "Couldn't save." });
  };

  const title = view === "settings" ? "Time allowances" : view === "email" ? "Email the recap" : week && report ? weekLabel(week) : "Weekly Recap";
  const back = week || view !== "weeks" ? () => { if (view !== "weeks") setView("weeks"); else { setWeek(null); setReport(null); } } : undefined;

  return (
    <FullscreenModal open={open} title={title} onClose={back ?? onClose} footer={null}
      headerRight={!week && view === "weeks" && canEdit ? <button type="button" onClick={() => void openSettings()} style={{ background: "none", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Allowances</button> : undefined}>
      {msg && <div style={{ marginBottom: 12, fontSize: 14, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}

      {view === "weeks" && !week && (
        <>
          <div style={{ fontSize: 14, color: MUTE, marginBottom: 14 }}>How well each driver used the week's time, and where the delays came from. Admin and dispatch only; drivers never see it.</div>
          <div style={{ display: "grid", gap: 8 }}>
            {weeks.map((w) => {
              const has = stored[w];
              return (
                <div key={w} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${HAIR}`, background: SURFACE, padding: "12px 14px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{weekLabel(w)}</div>
                    <div style={{ fontSize: 12, color: MUTE }}>{has ? `Built ${new Date(has.regenerated_at ?? has.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${has.regenerated_at ? " (regenerated)" : ""}` : "Not built yet"}</div>
                  </div>
                  {has
                    ? <button type="button" style={chip(true)} aria-busy={busy === `open${w}`} onClick={() => void openWeek(w)}>Open</button>
                    : canEdit ? <button type="button" style={chip(false)} aria-busy={busy === `gen${w}`} onClick={() => void generate(w)}>Build</button> : <span style={{ fontSize: 12, color: MUTE }}>Not built</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "weeks" && week && report && (
        <>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>{PAGES.map(([k, l]) => <button key={k} type="button" style={chip(page === k)} onClick={() => setPage(k)}>{l}</button>)}</div>
          <div style={{ marginTop: 12 }}>
            {page === "summary" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                  {report.tiles.map((t) => (
                    <div key={t.label} style={{ border: `1px solid ${HAIR}`, background: SURFACE, padding: "12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE }}>{t.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{t.value}</div>
                      <div style={{ fontSize: 12, color: MUTE }}>{t.sub ?? ""}{t.change != null ? ` ${t.sub ? "· " : ""}${sgn(t.change)}` : ""}</div>
                    </div>
                  ))}
                </div>
                <div style={label}>Top causes of lost time</div>
                <Table head={["Cause", "Time lost"]} rows={report.topCauses.map((c) => [c.cause, hm(c.lostMin)])} widths="2fr 1fr" />
                {report.recognition.length > 0 && <div style={{ marginTop: 14, fontSize: 13, color: MUTE }}>Highest ATR with complete evidence: {report.recognition.map((x) => `${x.name} ${x.atr.toFixed(1)}%`).join(", ")}</div>}
              </>
            )}
            {page === "drivers" && (
              <>
                <Table head={["Driver", "Shifts", "ATR", "vs avg", "Recovery", "Under", "Unclaimed", "Review"]} widths="1.6fr .6fr 1fr .8fr .9fr .6fr 1fr 1.6fr"
                  rows={report.drivers.map((d) => [d.name + (d.estimate ? " *" : ""), String(d.shifts), d.insufficient ? "insufficient data" : d.atr == null ? "-" : `${d.atr.toFixed(1)}%`, sgn(d.atrChange), d.recovery == null ? "-" : `${d.recovery.toFixed(1)}%`, String(d.loadsUnder), `${hm(d.unclaimedMin)}${d.largestUnclaimed ? ` · ${d.largestUnclaimed}` : ""}`, d.chips.join(", ") || "-"])} />
                <div style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>ATR is the share of on-duty time that was standard-pace work or a verified wait. * = no Geotab link, so on-duty time is the app shift (an estimate). Recovery % is Plan Utilization: gallons loaded against gallons available.</div>
              </>
            )}
            {page === "ledger" && (
              <>
                <div style={label}>Hours lost by cause</div>
                <Table head={["Cause", "Time lost"]} rows={report.ledger.causes.map((c) => [c.cause, hm(c.lostMin)])} widths="2fr 1fr" />
                <div style={label}>By place</div>
                <Table head={["Place", "Visits", "Lost", "Avg", "Drivers", "vs prior"]} widths="2fr .7fr 1fr .8fr .8fr 1fr"
                  rows={report.ledger.places.map((p) => [p.label, String(p.visits), hm(p.lostMin), `${p.avgExcess.toFixed(0)} min`, String(p.drivers), p.trend == null ? "" : sgn(p.trend, " min")])} />
                <div style={label}>By time of day</div>
                <Table head={["Window", "Time lost"]} widths="2fr 1fr" rows={[[0, 6], [6, 9], [9, 15], [15, 19], [19, 24]].map(([a, b], i) => [BUCKET_LABEL[i], hm(report.ledger.heat.reduce((n, row) => n + row.slice(a, b).reduce((x, y) => x + y, 0), 0))])} />
              </>
            )}
            {page === "patterns" && (
              <>
                <Table head={["Driver", "Pattern", "Evidence", "Avg lost", "Suggested action"]} widths="1.2fr 1fr 1.8fr .8fr 2fr" rows={report.patterns.map((p) => [p.name, p.kind, p.evidence, `${p.avgMinLost.toFixed(0)} min`, p.action])} />
                <div style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>A pattern shows only when it holds on enough shifts. These are for review, never discipline.</div>
              </>
            )}
            {page === "system" && (
              <>
                <div style={label}>Rack hops by terminal</div>
                <Table head={["Terminal", "Hops", "Why"]} widths="2fr 1fr 2fr" rows={report.system.allocationHops.map((x) => [x.label, x.value, x.detail ?? ""])} />
                <div style={label}>Empty runs by lane</div>
                <Table head={["Lane", "Time", "Runs"]} widths="2fr 1fr 1fr" rows={report.system.deadhead.map((x) => [x.label, x.value, x.detail ?? ""])} />
                <div style={label}>Time spent at terminals</div>
                <Table head={["Terminal", "Share", "Visits"]} widths="2fr 1.4fr 2fr" rows={report.system.terminals.map((x) => [x.label, x.value, x.detail ?? ""])} />
                {report.system.notes.map((n) => <div key={n} style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>{n}</div>)}
              </>
            )}
          </div>
          <div style={{ fontSize: 11, color: MUTE, marginTop: 16 }}>Standards {report.standardsVersion} · {Math.round(report.completeness * 100)}% of shifts with Geotab linked · Confidential, internal</div>
          <button type="button" style={btn(true)} aria-busy={busy === "pdf"} onClick={() => void download()}>Download PDF</button>
          <button type="button" style={btn(false)} onClick={() => void openEmail()}>Email PDF</button>
          {canEdit && <button type="button" style={btn(false)} aria-busy={busy === `gen${week}`} onClick={() => void generate(week!)}>Regenerate this week</button>}
        </>
      )}

      {view === "email" && (
        <>
          <div style={{ fontSize: 14, color: MUTE }}>The PDF goes as an attachment, never a link, to the admin and dispatch users you pick.</div>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {staff.map((s) => { const on = picked.includes(s.email); return (
              <button key={s.email} type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.email) : [...p, s.email]))} style={{ ...chip(on), textAlign: "left", padding: "12px 14px", fontSize: 15 }}>{s.name} <span style={{ opacity: 0.6, fontWeight: 500 }}>· {s.role} · {s.email}</span></button>
            ); })}
            {staff.length === 0 && <div style={{ color: MUTE, fontSize: 13 }}>No admin or dispatch users found.</div>}
          </div>
          <button type="button" style={btn(true)} disabled={!picked.length || busy === "email"} aria-busy={busy === "email"} onClick={() => void sendEmail()}>{busy === "email" ? "Sending…" : `Send to ${picked.length || "…"}`}</button>
        </>
      )}

      {view === "settings" && (
        <>
          <div style={{ fontSize: 14, color: MUTE }}>What time is allowed, set once: the driver index and this report read the same numbers. A change applies from the next report and is logged. Version {settings.version}.</div>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, fontSize: 16, fontWeight: 800 }}>
            Send it every Monday <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))} style={{ width: 24, height: 24 }} />
          </label>
          <div style={label}>Send to (admin and dispatch emails)</div>
          <input value={settings.recipients} onChange={(e) => setSettings((s) => ({ ...s, recipients: e.target.value }))} placeholder="manager@company.com" inputMode="email" autoCapitalize="none" style={field} />
          <div style={label}>Sent at</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="time" value={settings.send_at} onChange={(e) => setSettings((s) => ({ ...s, send_at: e.target.value }))} style={{ ...field, flex: 1 }} />
            <select value={settings.tz} onChange={(e) => setSettings((s) => ({ ...s, tz: e.target.value }))} style={{ ...field, flex: 1 }}>{[["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"], ["America/Los_Angeles", "Pacific"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          {ALLOWANCE_FIELDS.map((f) => (
            <div key={f.key}>
              <div style={label}>{f.label} ({f.unit})</div>
              <input inputMode="decimal" value={String(settings.allowances[f.key] ?? DEFAULT_RECAP_SETTINGS[f.key])} onChange={(e) => setSettings((s) => ({ ...s, allowances: { ...s.allowances, [f.key]: e.target.value === "" ? 0 : Number(e.target.value) } }))} style={field} />
              <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>{f.help}</div>
            </div>
          ))}
          {log.length > 0 && <><div style={label}>Recent changes</div>{log.map((l, i) => <div key={i} style={{ fontSize: 12, color: MUTE }}>{new Date(l.changed_at).toLocaleString("en-US")}</div>)}</>}
          <button type="button" style={btn(true)} disabled={busy === "save"} aria-busy={busy === "save"} onClick={() => void saveSettings()}>{busy === "save" ? "Saving…" : "Save"}</button>
        </>
      )}
    </FullscreenModal>
  );
}
