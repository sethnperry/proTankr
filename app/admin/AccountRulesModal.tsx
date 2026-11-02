"use client";
// app/admin/AccountRulesModal.tsx
//
// Company Dashboard → Accounts. Rules by account (a customer or shipper name): who is emailed when a matching load
// is complete, which documents go, and how long after. Also the recent sends, with a retry for a failed one. Admin only.
// Matching and checks are in lib/accounts/accountRules.ts; the sending is a server run (lib/accounts/server.ts).

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { DOC_KINDS, parseEmails, ruleProblem, type DocKind, type MatchField, type MatchMode, type Rule } from "@/lib/accounts/accountRules";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", fontSize: 15, background: "#0a0a0b", color: "#fff", border: `1px solid ${HAIR}`, boxSizing: "border-box", marginBottom: 8 };
const lab: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, margin: "8px 0 4px" };
const btn: React.CSSProperties = { padding: "13px 16px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: "#fff", border: `1px solid ${HAIR}` };
type Send = { rule_id: string; trip_id: string; status: "sent" | "failed"; sent_at: string; to_emails: string[]; error: string | null };
type Form = { id: string | null; name: string; field: MatchField; mode: MatchMode; matchText: string; emails: string; documents: DocKind[]; delayMinutes: string };
const blank = (): Form => ({ id: null, name: "", field: "customer", mode: "equals", matchText: "", emails: "", documents: ["ptd"], delayMinutes: "0" });

export default function AccountRulesModal({ open, onClose, companyId, userId }: { open: boolean; onClose: () => void; companyId: string; userId: string | null }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [sends, setSends] = useState<Send[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      supabase.from("account_rules").select("*").eq("company_id", companyId).order("name"),
      supabase.from("account_rule_sends").select("rule_id, trip_id, status, sent_at, to_emails, error").eq("company_id", companyId).order("sent_at", { ascending: false }).limit(30),
    ]);
    if (r.error) setErr(r.error.message);
    setRules((r.data ?? []) as Rule[]); setSends((s.data ?? []) as Send[]);
  }, [companyId]);
  useEffect(() => { if (open) { setForm(null); setErr(null); void load(); } }, [open, load]);

  const save = async () => {
    if (!form) return;
    const p = ruleProblem({ name: form.name, matchText: form.matchText, emails: form.emails, documents: form.documents, delayMinutes: form.delayMinutes });
    if (p) return setErr(p);
    setBusy(true); setErr(null);
    const row = { company_id: companyId, name: form.name.trim(), match_field: form.field, match_mode: form.mode, match_text: form.matchText.trim(), emails: parseEmails(form.emails), documents: form.documents, delay_minutes: form.delayMinutes.trim() === "" ? 0 : Number(form.delayMinutes), created_by: userId };
    const res = form.id ? await supabase.from("account_rules").update(row).eq("rule_id", form.id) : await supabase.from("account_rules").insert(row);
    setBusy(false);
    if (res.error) return setErr(res.error.message);
    setForm(null); await load();
  };
  const toggle = async (r: Rule) => { await supabase.from("account_rules").update({ is_active: !r.is_active }).eq("rule_id", r.rule_id); await load(); };
  const remove = async (r: Rule) => { if (!window.confirm(`Delete "${r.name}"?`)) return; await supabase.from("account_rules").delete().eq("rule_id", r.rule_id); await load(); };
  const retry = async (s: Send) => { await supabase.from("account_rule_sends").delete().eq("rule_id", s.rule_id).eq("trip_id", s.trip_id); await load(); };
  const ruleName = (id: string) => rules.find((r) => r.rule_id === id)?.name ?? "Rule";

  if (form) {
    const set = (p: Partial<Form>) => setForm({ ...form, ...p });
    return (
      <FullscreenModal open={open} title={form.id ? "Edit rule" : "New account rule"} onClose={() => { setForm(null); setErr(null); }} footer={null}>
        <div style={lab}>Rule name</div><input style={inp} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="First American" />
        <div style={lab}>Match the load's</div>
        <CustomSelect value={form.field} onChange={(v) => set({ field: v as MatchField })} options={[{ value: "customer", label: "Customer" }, { value: "shipper", label: "Shipper" }, { value: "either", label: "Customer or shipper" }]} />
        <div style={lab}>Name</div>
        <input style={inp} value={form.matchText} onChange={(e) => set({ matchText: e.target.value })} placeholder="First American" />
        <CustomSelect value={form.mode} onChange={(v) => set({ mode: v as MatchMode })} options={[{ value: "equals", label: "Exactly (ignoring case and punctuation)" }, { value: "contains", label: "Contains" }]} />
        <div style={lab}>Email these addresses (comma or space between)</div>
        <textarea style={{ ...inp, minHeight: 70 }} value={form.emails} onChange={(e) => set({ emails: e.target.value })} placeholder="orders@customer.com" />
        <div style={lab}>Send</div>
        {DOC_KINDS.map((d) => {
          const on = form.documents.includes(d.value);
          return <button key={d.value} type="button" onClick={() => set({ documents: on ? form.documents.filter((x) => x !== d.value) : [...form.documents, d.value] })} style={{ ...ghost, display: "block", width: "100%", textAlign: "left", marginBottom: 6, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" }}>{on ? "✓ " : ""}{d.label}</button>;
        })}
        <div style={lab}>Wait after the load completes (minutes, 0 = right away)</div>
        <input style={inp} inputMode="numeric" value={form.delayMinutes} onChange={(e) => set({ delayMinutes: e.target.value })} />
        {err && <div style={{ color: "#f87171", fontSize: 13, margin: "6px 0" }}>{err}</div>}
        <button type="button" style={{ ...btn, width: "100%", marginTop: 6 }} disabled={busy} onClick={() => void save()}>Save rule</button>
      </FullscreenModal>
    );
  }

  return (
    <FullscreenModal open={open} title="Accounts" onClose={onClose} footer={null}>
      <div style={{ color: MUTE, fontSize: 13, marginBottom: 12 }}>When a load for a matching customer or shipper is complete, ProTankr emails the people you list. Each load is sent once per rule. Every load needs a shipper and a customer for this to work.</div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}
      <button type="button" style={{ ...btn, width: "100%", marginBottom: 16 }} onClick={() => { setForm(blank()); setErr(null); }}>+ New rule</button>
      {rules.length === 0 && <div style={{ color: MUTE, fontSize: 14 }}>No rules yet.</div>}
      {rules.map((r) => (
        <div key={r.rule_id} style={{ border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 12, marginBottom: 8, opacity: r.is_active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 15 }}><span>{r.name}</span><span style={{ color: MUTE, fontWeight: 600, fontSize: 12 }}>{r.is_active ? "On" : "Off"}</span></div>
          <div style={{ color: MUTE, fontSize: 13, margin: "3px 0 8px" }}>{r.match_field === "either" ? "Customer or shipper" : r.match_field} {r.match_mode === "equals" ? "is" : "contains"} “{r.match_text}” → {r.emails.join(", ")}{r.delay_minutes ? ` · after ${r.delay_minutes} min` : ""}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={{ ...ghost, flex: 1, padding: "9px 0" }} onClick={() => setForm({ id: r.rule_id, name: r.name, field: r.match_field, mode: r.match_mode, matchText: r.match_text, emails: r.emails.join(", "), documents: r.documents, delayMinutes: String(r.delay_minutes) })}>Edit</button>
            <button type="button" style={{ ...ghost, flex: 1, padding: "9px 0" }} onClick={() => void toggle(r)}>{r.is_active ? "Turn off" : "Turn on"}</button>
            <button type="button" style={{ ...ghost, flex: 1, padding: "9px 0", color: "#f87171" }} onClick={() => void remove(r)}>Delete</button>
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, margin: "22px 0 6px" }}>Recent sends</div>
      {sends.length === 0 && <div style={{ color: MUTE, fontSize: 14 }}>Nothing sent yet.</div>}
      {sends.map((s) => (
        <div key={`${s.rule_id}${s.trip_id}`} style={{ padding: "8px 0", borderTop: `1px solid ${HAIR}`, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700 }}>{ruleName(s.rule_id)}</span>
            <span style={{ color: s.status === "sent" ? "#4ade80" : "#f87171" }}>{s.status === "sent" ? "Sent" : s.error === "sending" ? "Sending…" : "Failed"} · {new Date(s.sent_at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
          <div style={{ color: MUTE }}>{s.to_emails.join(", ")}</div>
          {s.status === "failed" && s.error && s.error !== "sending" && <div style={{ color: "#f87171" }}>{s.error}</div>}
          {s.status === "failed" && <button type="button" onClick={() => void retry(s)} style={{ background: "none", border: "none", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", padding: "4px 0" }}>Retry</button>}
        </div>
      ))}
    </FullscreenModal>
  );
}
