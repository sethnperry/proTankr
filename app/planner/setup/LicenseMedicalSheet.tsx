"use client";
// app/planner/setup/LicenseMedicalSheet.tsx
//
// Quick entry for the setup checklist: license number, class, state and expiry, and the medical card expiry.
// Writes the same rows the Cards tab's Credentials screen edits (driver_licenses / driver_medical_cards), so
// everything else (hazmat, endorsements, photos) stays there and nothing is asked twice.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DateField } from "@/lib/ui/DateField";
import { supabase } from "@/lib/supabase/client";

const MUTED = "rgba(255,255,255,0.55)";
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MUTED, margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" };
const chip = (on: boolean): React.CSSProperties => ({ flex: 1, padding: "11px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", borderRadius: 2, border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.18)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

export function LicenseMedicalSheet({ open, userId, companyId, onClose }: { open: boolean; userId: string | null; companyId: string | null; onClose: () => void }) {
  const [num, setNum] = useState(""); const [cls, setCls] = useState(""); const [st, setSt] = useState(""); const [exp, setExp] = useState("");
  const [med, setMed] = useState("");
  const [licId, setLicId] = useState<string | null>(null); const [medId, setMedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    setErr(null);
    void (async () => {
      const [l, m] = await Promise.all([
        supabase.from("driver_licenses").select("id, license_number, license_class, state_code, expiration_date").eq("user_id", userId).limit(1).maybeSingle(),
        supabase.from("driver_medical_cards").select("id, expiration_date").eq("user_id", userId).limit(1).maybeSingle(),
      ]);
      const L = l.data as { id: string; license_number: string | null; license_class: string | null; state_code: string | null; expiration_date: string | null } | null;
      const M = m.data as { id: string; expiration_date: string | null } | null;
      setLicId(L?.id ?? null); setNum(L?.license_number ?? ""); setCls(L?.license_class ?? ""); setSt(L?.state_code ?? ""); setExp(L?.expiration_date ?? "");
      setMedId(M?.id ?? null); setMed(M?.expiration_date ?? "");
    })();
  }, [open, userId]);

  const save = async () => {
    if (!userId || !companyId) return;
    setBusy(true); setErr(null);
    const now = new Date().toISOString();
    const lic = { license_number: num.trim(), license_class: cls, state_code: st.trim().toUpperCase().slice(0, 2), expiration_date: exp || null };
    const l = num.trim() || exp || cls || st
      ? await (licId ? supabase.from("driver_licenses").update({ ...lic, updated_at: now }).eq("id", licId).select("id")
        : supabase.from("driver_licenses").insert({ user_id: userId, company_id: companyId, endorsements: [], restrictions: [], hazmat_linked_to_license: false, ...lic }))
      : { error: null };
    const m = med
      ? await (medId ? supabase.from("driver_medical_cards").update({ expiration_date: med, updated_at: now }).eq("id", medId).select("id")
        : supabase.from("driver_medical_cards").insert({ user_id: userId, company_id: companyId, expiration_date: med, examiner_name: "", attached_to_license: false }))
      : { error: null };
    setBusy(false);
    // An update that matches no rows (blocked by permissions) returns no error, so check the rows came back.
    const gone = (r: { error: unknown; data?: unknown }, wrote: boolean, updating: boolean) => wrote && updating && !r.error && Array.isArray(r.data) && r.data.length === 0;
    const e = l.error ?? m.error;
    if (e) { setErr(e.message); return; }
    if (gone(l as any, !!(num.trim() || exp || cls || st), !!licId) || gone(m as any, !!med, !!medId)) { setErr("That didn't save. Tell your dispatcher so they can fix your account permissions."); return; }
    onClose();
  };

  return (
    <FullscreenModal open={open} title="License and medical" onClose={onClose}
      footer={<button type="button" disabled={busy} onClick={() => void save()} style={{ width: "100%", padding: "14px 0", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", background: "#fff", color: "#000", border: "none", borderRadius: 2, cursor: "pointer" }}>{busy ? "Saving…" : "Save"}</button>}>
      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.4 }}>The numbers and dates, so your expiry alerts work. Hazmat, endorsements and photos can be added later under Cards.</div>
      <div style={label}>License number</div>
      <input style={input} value={num} onChange={(e) => setNum(e.target.value)} autoCapitalize="characters" autoComplete="off" />
      <div style={label}>Class</div>
      <div style={{ display: "flex", gap: 8 }}>{["A", "B", "C"].map((c) => <button key={c} type="button" style={chip(cls === c)} onClick={() => setCls(c)}>{c}</button>)}</div>
      <div style={label}>State</div>
      <input style={{ ...input, width: 90 }} value={st} maxLength={2} onChange={(e) => setSt(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" />
      <div style={label}>License expires</div>
      <DateField value={exp} onChange={setExp} title="License expires" />
      <div style={label}>Medical card expires</div>
      <DateField value={med} onChange={setMed} title="Medical card expires" />
      {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{err}</div>}
    </FullscreenModal>
  );
}
