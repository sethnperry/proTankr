"use client";
// app/planner/components/fuel/FuelEditSheet.tsx
//
// Edit or delete a saved fuel stop, after the fact (Fuel History). Open to the
// driver who logged it and company admins (fuel_purchases RLS). Amounts edit
// only where the payment row is visible to this user.

import React, { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { KIND_LABEL, RECEIPT_BUCKET, fmtStamp, type FuelPayment, type FuelPurchase, type PayKind } from "@/lib/fuel/types";

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.10)";
const lab: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
const input: React.CSSProperties = {
  width: "100%", padding: "11px", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)",
  color: "#fff", fontSize: 16, boxSizing: "border-box", borderRadius: 0, colorScheme: "dark",
};
const box: React.CSSProperties = { border: `1px solid ${hair}`, background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 12 };
const primary: React.CSSProperties = { width: "100%", padding: "15px 0", border: "none", background: "#fff", color: "#000", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", cursor: "pointer" };
const secondary: React.CSSProperties = { ...primary, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" };

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const str = (v: number | string | null | undefined) => (v == null ? "" : String(v));
const num = (s: string): number | null => {
  const n = Number(s.replace(/[,$]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ ...lab, marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

export default function FuelEditSheet({ row, payment, canEditMoney, onClose, onSaved, onDeleted }: {
  row: FuelPurchase;
  payment: FuelPayment | null;
  canEditMoney: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [f, setF] = useState({
    started: toLocal(row.started_at), finished: toLocal(row.finished_at),
    odometer: str(row.odometer), gallons: str(row.diesel_gallons), full: !!row.filled_to_full,
    pump: row.pump_number ?? "", storeName: row.store_name ?? "", storeNumber: row.store_number ?? "",
    city: row.city ?? "", state: row.state ?? "", notes: row.notes ?? "",
    payKind: (row.pay_kind ?? "cash") as PayKind,
    total: str(payment?.total_amount),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const startedAt = fromLocal(f.started);
      if (!startedAt) throw new Error("Enter the start time.");
      const finishedAt = fromLocal(f.finished);
      if (finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) throw new Error("Finished is before started.");
      const { error } = await supabase.from("fuel_purchases").update({
        started_at: startedAt, finished_at: finishedAt,
        odometer: num(f.odometer), diesel_gallons: num(f.gallons), filled_to_full: f.full,
        pump_number: f.pump.trim() || null, store_name: f.storeName.trim() || null, store_number: f.storeNumber.trim() || null,
        city: f.city.trim() || null, state: f.state.trim().toUpperCase() || null, notes: f.notes.trim() || null,
        pay_kind: f.payKind, updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (error) throw error;
      if (canEditMoney) {
        const total = num(f.total);
        const g = num(f.gallons);
        const ppg = g && total != null ? Math.round((total / g) * 1000) / 1000 : null;
        const personal = f.payKind === "personal_card" || f.payKind === "cash";
        const money = { total_amount: total, price_per_gallon: ppg, is_personal: personal, updated_at: new Date().toISOString() };
        const r = payment
          ? await supabase.from("fuel_purchase_payments").update(money).eq("purchase_id", row.id)
          : await supabase.from("fuel_purchase_payments").insert({ purchase_id: row.id, company_id: row.company_id, ...money });
        if (r.error) throw r.error;
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't save.");
    }
    setBusy(false);
  };

  const del = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from("fuel_purchases").delete().eq("id", row.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    if (payment?.receipt_path) void supabase.storage.from(RECEIPT_BUCKET).remove([payment.receipt_path]);
    setBusy(false);
    onDeleted();
  };

  return (
    <FullscreenModal open title="Edit Fuel Stop" onClose={onClose} footer={null}>
      <div style={box}>
        <F label="Started"><input type="datetime-local" style={input} value={f.started} onChange={(e) => set({ started: e.target.value })} /></F>
        <F label="Finished"><input type="datetime-local" style={input} value={f.finished} onChange={(e) => set({ finished: e.target.value })} /></F>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
          <F label="Odometer"><input style={input} inputMode="numeric" value={f.odometer} onChange={(e) => set({ odometer: e.target.value })} /></F>
          <F label="Diesel gallons"><input style={input} inputMode="decimal" value={f.gallons} onChange={(e) => set({ gallons: e.target.value })} /></F>
        </div>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Filled to full</span>
          <input type="checkbox" checked={f.full} onChange={(e) => set({ full: e.target.checked })} style={{ width: 22, height: 22 }} />
        </label>
      </div>

      <div style={box}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px", gap: 10 }}>
          <F label="Store"><input style={input} value={f.storeName} onChange={(e) => set({ storeName: e.target.value })} /></F>
          <F label="Store #"><input style={input} value={f.storeNumber} onChange={(e) => set({ storeNumber: e.target.value })} /></F>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 70px 80px", gap: 10 }}>
          <F label="City"><input style={input} value={f.city} onChange={(e) => set({ city: e.target.value })} /></F>
          <F label="ST"><input style={input} maxLength={2} value={f.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} /></F>
          <F label="Pump #"><input style={input} inputMode="numeric" value={f.pump} onChange={(e) => set({ pump: e.target.value })} /></F>
        </div>
      </div>

      <div style={box}>
        <div style={{ ...lab, marginBottom: 8 }}>Paid with</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: canEditMoney ? 12 : 0 }}>
          {(["rfid", "company_account", "fuel_card", "personal_card", "cash"] as PayKind[]).map((k) => (
            <button key={k} type="button" onClick={() => set({ payKind: k })}
              style={{ border: `1px solid ${f.payKind === k ? "#fff" : hair}`, background: f.payKind === k ? "#fff" : "transparent", color: f.payKind === k ? "#000" : "#fff", padding: "8px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {canEditMoney && (
          <F label="Total cost $"><input style={input} inputMode="decimal" value={f.total} onChange={(e) => set({ total: e.target.value })} /></F>
        )}
      </div>

      <F label="Note"><input style={input} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></F>

      {err && <div style={{ color: "#f87171", fontSize: 13, margin: "6px 0 10px" }}>{err}</div>}
      <button aria-busy={!!(busy)} type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "SAVE CHANGES"}</button>
      <button type="button" style={{ ...secondary, marginTop: 10 }} disabled={busy} onClick={onClose}>Cancel</button>

      {confirmDelete ? (
        <div style={{ ...box, marginTop: 20, borderColor: "rgba(248,113,113,0.45)" }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Delete this fuel stop?</div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
            {fmtStamp(row.finished_at ?? row.started_at)}{row.store_name ? ` · ${row.store_name}` : ""}. This removes it from fuel history and MPG, along with any receipt.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button type="button" style={{ ...secondary, padding: "13px 0", fontSize: 15 }} onClick={() => setConfirmDelete(false)}>Keep</button>
            <button type="button" style={{ ...primary, padding: "13px 0", fontSize: 15, background: "#f87171", color: "#000" }} disabled={busy} onClick={() => void del()}>Delete</button>
          </div>
        </div>
      ) : (
        <button type="button" style={{ border: "none", background: "transparent", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "block", margin: "22px auto 0" }}
          onClick={() => setConfirmDelete(true)}>
          Delete fuel stop
        </button>
      )}
    </FullscreenModal>
  );
}
