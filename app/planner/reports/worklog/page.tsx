"use client";
// app/planner/reports/worklog/page.tsx
//
// Work Log report: a period picker, the log itself (same document the email uses), Print / Save PDF,
// and the period settings. The company admin sets the company's period; a driver can use their own.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { PrintPortal } from "../../trips/PtdDocument";
import { periodOptions, PERIOD_TITLE, isLongRange, type PeriodSettings } from "@/lib/reports/periodOptions";
import { loadWorklogInputs } from "@/lib/worklog/loadWorklogInputs";
import { buildWorklog, type Worklog } from "@/lib/worklog/buildWorklog";
import { renderWorklogBody } from "@/lib/worklog/renderWorklog";
import { localDateOf } from "@/lib/worklog/time";
import type { PayPeriodType } from "@/app/admin/payPeriods";

type Company = { period_type: PayPeriodType; anchor_date: string; send_after_days: number; tz: string };
const TYPES: [PayPeriodType, string][] = [["weekly", "Weekly"], ["biweekly", "Every 2 weeks"], ["semi_monthly", "Twice a month"], ["monthly", "Monthly"]];
const box: React.CSSProperties = { background: "#121213", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 2, padding: 12 };
const inp: React.CSSProperties = { width: "100%", background: "#0b0b0b", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2, padding: "9px 10px", fontSize: 14 };
const lbl: React.CSSProperties = { fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", margin: "10px 0 4px" };
const btn: React.CSSProperties = { background: "#fff", color: "#000", border: 0, borderRadius: 2, padding: "10px 14px", fontWeight: 800, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase" };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" };

export default function WorklogPage() {
  const router = useRouter();
  const shell = useCalculatorShell();
  const { effectiveUserId, companyId } = shell;
  const isAdmin = shell.role === "admin" || !!shell.isSuperAdmin;
  const deviceTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", []);

  const [company, setCompany] = useState<Company | null>(null);
  const [mine, setMine] = useState<{ type: PayPeriodType | null; anchor: string | null; email: boolean }>({ type: null, anchor: null, email: true });
  const [ready, setReady] = useState(false);
  const [periodId, setPeriodId] = useState("");
  const [log, setLog] = useState<Worklog | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [condensed, setCondensed] = useState(false);

  const tz = company?.tz || deviceTz;
  const effective: PeriodSettings | null = mine.type && mine.anchor ? { type: mine.type, anchor: mine.anchor } : company ? { type: company.period_type, anchor: company.anchor_date } : null;
  const today = localDateOf(Date.now(), tz);
  const options = useMemo(() => periodOptions(effective, today), [effective?.type, effective?.anchor, today]);

  const reload = async () => {
    if (!effectiveUserId) return;
    const [c, p] = await Promise.all([
      companyId ? supabase.from("company_report_period").select("period_type, anchor_date, send_after_days, tz").eq("company_id", companyId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("driver_pay_settings").select("pay_period_type, pay_period_anchor_date, worklog_email").eq("user_id", effectiveUserId).maybeSingle(),
    ]);
    setCompany((c.data as Company | null) ?? null);
    const pd = p.data as any;
    setMine({ type: pd?.pay_period_type ?? null, anchor: pd?.pay_period_anchor_date ?? null, email: pd?.worklog_email !== false });
    setReady(true);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [effectiveUserId, companyId]);
  useEffect(() => { if (ready && !periodId) setPeriodId(options[0]?.id ?? ""); }, [ready, options, periodId]);

  const range = useMemo(() => {
    if (periodId === "custom") return custom.start && custom.end && custom.start <= custom.end ? custom : null;
    const o = options.find((x) => x.id === periodId);
    return o ? { start: o.start, end: o.end } : null;
  }, [periodId, options, custom]);

  useEffect(() => {
    if (!range || !effectiveUserId) return;
    let dead = false;
    setBusy(true); setErr("");
    (async () => {
      try {
        const [{ trips, purchases }, { data: prof }] = await Promise.all([
          loadWorklogInputs(supabase as any, { userId: effectiveUserId, range, tz }),
          supabase.from("profiles").select("display_name").eq("user_id", effectiveUserId).maybeSingle(),
        ]);
        const title = periodId.startsWith("p:") && effective ? PERIOD_TITLE[effective.type] : periodId === "custom" ? "Custom" : options.find((o) => o.id === periodId)?.label.split(" (")[0] ?? "Work Log";
        const w = buildWorklog({ driverName: (prof as any)?.display_name ?? "", range, tz, title, trips, purchases });
        if (!dead) { setLog(w); setCondensed(isLongRange(range.start, range.end)); }
      } catch (e) { if (!dead) setErr((e as Error).message); }
      finally { if (!dead) setBusy(false); }
    })();
    return () => { dead = true; };
    /* eslint-disable-next-line */
  }, [range?.start, range?.end, effectiveUserId, tz]);

  const html = useMemo(() => (log ? renderWorklogBody(log, { mode: condensed ? "condensed" : "full" }) : ""), [log, condensed]);

  // settings state
  const [cs, setCs] = useState<Company>({ period_type: "weekly", anchor_date: "", send_after_days: 2, tz: deviceTz });
  const [ms, setMs] = useState<{ type: PayPeriodType | ""; anchor: string; email: boolean }>({ type: "", anchor: "", email: true });
  const [note, setNote] = useState("");
  useEffect(() => {
    if (company) setCs(company); else setCs((s) => ({ ...s, tz: deviceTz }));
    setMs({ type: mine.type ?? "", anchor: mine.anchor ?? "", email: mine.email });
  }, [company, mine, deviceTz]);

  const saveCompany = async () => {
    if (!companyId || !cs.anchor_date) { setNote("Pick a date a period started."); return; }
    const { error } = await supabase.from("company_report_period").upsert({ company_id: companyId, ...cs, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
    setNote(error ? error.message : "Company period saved."); if (!error) { setPeriodId(""); void reload(); }
  };
  const saveMine = async () => {
    if (!effectiveUserId) return;
    const useOwn = !!(ms.type && ms.anchor);
    const { error } = await supabase.from("driver_pay_settings").upsert({
      user_id: effectiveUserId, pay_period_type: useOwn ? ms.type : null, pay_period_anchor_date: useOwn ? ms.anchor : null, worklog_email: ms.email, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setNote(error ? error.message : "Saved."); if (!error) { setPeriodId(""); void reload(); }
  };

  return (
    <div>
      <button onClick={() => router.back()} style={{ background: "none", border: 0, color: "rgba(255,255,255,0.5)", fontSize: 13, padding: 0, marginBottom: 10 }}>‹ Reports</button>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Work Log</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2, marginBottom: 14 }}>Your trips, hours, miles and gallons by day.</div>

      <div style={{ ...box, marginBottom: 12 }}>
        <div style={{ ...lbl, marginTop: 0 }}>Period</div>
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} style={inp}>
          {options.some((o) => o.group === "period") && <optgroup label="Your periods">{options.filter((o) => o.group === "period").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>}
          <optgroup label="Calendar">{options.filter((o) => o.group === "calendar").map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}<option value="custom">Custom dates…</option></optgroup>
        </select>
        {periodId === "custom" && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} style={inp} />
            <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} style={inp} />
          </div>
        )}
        {range && isLongRange(range.start, range.end) && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
            <input type="checkbox" checked={condensed} onChange={(e) => setCondensed(e.target.checked)} /> Totals by month (shorter)
          </label>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button style={btn} disabled={!log} onClick={() => window.print()}>Print / Save PDF</button>
          <button style={ghost} onClick={() => setSettingsOpen((v) => !v)}>{settingsOpen ? "Hide settings" : "Period settings"}</button>
        </div>
      </div>

      {settingsOpen && (
        <div style={{ ...box, marginBottom: 12 }}>
          {isAdmin && (<>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: 14 }}>Company period</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Used for everyone who hasn't set their own. Drivers are emailed their log after each period ends.</div>
            <div style={lbl}>How often</div>
            <select value={cs.period_type} onChange={(e) => setCs({ ...cs, period_type: e.target.value as PayPeriodType })} style={inp}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <div style={lbl}>A date a period began (e.g. a Wednesday)</div>
            <input type="date" value={cs.anchor_date} onChange={(e) => setCs({ ...cs, anchor_date: e.target.value })} style={inp} />
            <div style={lbl}>Email goes out this many days after a period ends</div>
            <input type="number" min={0} max={14} value={cs.send_after_days} onChange={(e) => setCs({ ...cs, send_after_days: Math.max(0, Math.min(14, Number(e.target.value) || 0)) })} style={inp} />
            <div style={lbl}>Time zone</div>
            <input value={cs.tz} onChange={(e) => setCs({ ...cs, tz: e.target.value })} style={inp} />
            <div style={{ marginTop: 10 }}><button style={btn} onClick={saveCompany}>Save company period</button></div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.12)", margin: "16px 0" }} />
          </>)}
          <div style={{ fontWeight: 800, color: "#fff", fontSize: 14 }}>My period</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{company ? "Leave blank to use the company's period." : "Set the period your reports use."}</div>
          <div style={lbl}>How often</div>
          <select value={ms.type} onChange={(e) => setMs({ ...ms, type: e.target.value as PayPeriodType | "" })} style={inp}><option value="">Company period</option>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {ms.type && (<><div style={lbl}>A date a period began</div><input type="date" value={ms.anchor} onChange={(e) => setMs({ ...ms, anchor: e.target.value })} style={inp} /></>)}
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
            <input type="checkbox" checked={ms.email} onChange={(e) => setMs({ ...ms, email: e.target.checked })} /> Email me my Work Log after each period
          </label>
          <div style={{ marginTop: 10 }}><button style={btn} onClick={saveMine}>Save my settings</button></div>
          {note && <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{note}</div>}
        </div>
      )}

      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {busy && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Loading…</div>}
      {log && !busy && <div style={{ background: "#fff", borderRadius: 2, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: html }} />}
      {log && <PrintPortal><div dangerouslySetInnerHTML={{ __html: html }} /></PrintPortal>}
    </div>
  );
}
