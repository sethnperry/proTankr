"use client";
// app/admin/EodReportModal.tsx
//
// Company Dashboard -> End of Day report. An admin turns it on, picks the regions, the emails it goes to and when.
// Each morning it sends the day before: a cover (highlights by area, loads and gallons per product, man hours, grey
// zone hours) then each driver's PTDs, for drivers who ended their day before midnight.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

const HAIR = "rgba(255,255,255,0.14)", MUTE = "rgba(255,255,255,0.55)";
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0a0a0b", border: `1px solid ${HAIR}`, color: "#fff", fontSize: 16, padding: "12px", borderRadius: 0, colorScheme: "dark" };
const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, margin: "18px 0 6px" };
const btn = (primary: boolean): React.CSSProperties => ({ width: "100%", padding: "15px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", marginTop: 12, border: primary ? "none" : `1px solid ${HAIR}`, background: primary ? "#fff" : "transparent", color: primary ? "#000" : "#fff" });
const ZONES = [["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"], ["America/Los_Angeles", "Pacific"]];

export default function EodReportModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [recipients, setRecipients] = useState("");
  const [sendAt, setSendAt] = useState("04:30");
  const [tz, setTz] = useState("America/New_York");
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    void (async () => {
      const [s, r, p] = await Promise.all([
        supabase.from("eod_report_settings").select("*").eq("company_id", companyId).maybeSingle(),
        supabase.from("equipment_regions").select("name").eq("company_id", companyId).eq("is_active", true),
        supabase.from("profiles").select("region"),
      ]);
      const row = s.data as { enabled: boolean; regions: string[]; recipients: string[]; send_at: string; tz: string } | null;
      if (row) { setEnabled(row.enabled); setRegions(row.regions ?? []); setRecipients((row.recipients ?? []).join(", ")); setSendAt(row.send_at); setTz(row.tz); }
      const names = new Set<string>([...((r.data ?? []) as { name: string }[]).map((x) => x.name), ...((p.data ?? []) as { region: string | null }[]).map((x) => x.region ?? "").filter(Boolean), ...(row?.regions ?? [])]);
      setOptions([...names].sort((a, b) => a.localeCompare(b)));
    })();
  }, [open, companyId]);

  const emails = recipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const bad = emails.find((x) => !/^\S+@\S+\.\S+$/.test(x));
  const save = async () => {
    if (bad) { setMsg({ ok: false, text: `"${bad}" isn't an email address.` }); return false; }
    setBusy("save"); setMsg(null);
    const { error } = await supabase.from("eod_report_settings").upsert({ company_id: companyId, enabled, regions, recipients: emails, send_at: sendAt, tz, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
    setBusy(null);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
    return !error;
  };
  const sendNow = async () => {
    if (!(await save())) return;
    setBusy("send"); setMsg(null);
    const { data } = await supabase.auth.getSession();
    const r = await fetch("/api/eod/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ companyId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    setMsg(!r.ok ? { ok: false, text: j.error ?? "Couldn't send." } : j.sent ? { ok: true, text: `Sent the ${j.date} report: ${j.loads} load${j.loads === 1 ? "" : "s"}, ${j.drivers} driver${j.drivers === 1 ? "" : "s"}.` } : { ok: false, text: j.reason ?? "Nothing to send." });
  };

  return (
    <FullscreenModal open={open} title="End of Day report" onClose={onClose} footer={null}>
      <div style={{ fontSize: 14, color: MUTE }}>Each morning, an email with yesterday's loads: a cover with the highlights by area, then each driver's PTDs. Only drivers who ended their day before midnight are in it.</div>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, fontSize: 16, fontWeight: 800 }}>
        Send it every day <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 24, height: 24 }} />
      </label>
      <div style={label}>Regions (none picked = every region)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.length === 0 && <span style={{ fontSize: 13, color: MUTE }}>No regions set up yet. Drivers' regions are set in their profiles.</span>}
        {options.map((o) => {
          const on = regions.includes(o);
          return <button key={o} type="button" onClick={() => setRegions((r) => (on ? r.filter((x) => x !== o) : [...r, o]))}
            style={{ padding: "9px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#fff" : HAIR}`, background: on ? "#fff" : "#0a0a0b", color: on ? "#000" : "rgba(255,255,255,0.85)" }}>{o}</button>;
        })}
      </div>
      <div style={label}>Send to</div>
      <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="manager@company.com, billing@company.com" inputMode="email" autoCapitalize="none" style={field} />
      <div style={label}>Sent at</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="time" value={sendAt} onChange={(e) => setSendAt(e.target.value)} style={{ ...field, flex: 1 }} />
        <select value={tz} onChange={(e) => setTz(e.target.value)} style={{ ...field, flex: 1 }}>{ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>Day boundaries (midnight) use this time zone.</div>
      {msg && <div style={{ marginTop: 14, fontSize: 14, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
      <button type="button" style={btn(true)} disabled={busy != null} aria-busy={busy === "save"} onClick={() => void save()}>{busy === "save" ? "Saving…" : "Save"}</button>
      <button type="button" style={btn(false)} disabled={busy != null} aria-busy={busy === "send"} onClick={() => void sendNow()}>{busy === "send" ? "Sending…" : "Send yesterday's report now"}</button>
    </FullscreenModal>
  );
}
