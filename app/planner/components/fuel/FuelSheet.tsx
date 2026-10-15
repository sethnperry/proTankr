"use client";
// app/planner/components/fuel/FuelSheet.tsx
//
// The fuel island. Tapping Fuel already stamped the start time; this sheet is:
//   1. Payment grid: the company's methods in its order, then My card, Cash.
//      Methods that didn't work this stop are marked.
//   2. Method pop-out: driver ID and truck number to key into the pump, the
//      company account number (also for the cashier), numbered pump steps, the
//      guide, pump #, odometer, Diesel / Diesel + DEF. Pump Running, or Didn't
//      Work (keeps the try and the pump number, back to the grid).
//   3. Pumping: the clock and Finish Fueling (end time). Pull forward, then:
//   4. Details: receipt photo first, then the store, gallons, amounts. Can be
//      finished later.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { openGuide, openStoredFile } from "@/lib/fuel/useFuelSetup";
import type { useFuelStop } from "@/lib/fuel/useFuelStop";
import { recentStores, type RecentStore } from "@/lib/fuel/useFuelStop";
import {
  completeStop, failedKeys, finishFueling, missingForComplete, paymentAmounts, recordFailedTry, startPumping,
  type FuelDetails, type PumpEntry,
} from "@/lib/fuel/fuelFlow";
import {
  KIND_LABEL, RECEIPT_BUCKET, isPersonal, receiptPath,
  type FuelMethod, type FuelProducts, type FuelSettings, type PayKind,
} from "@/lib/fuel/types";
import { currentCity } from "@/lib/trips/startPlace";

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.10)";
const tile: React.CSSProperties = {
  background: "#0f0f10", border: "none", color: "#fff", cursor: "pointer", padding: "16px 8px",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 92, textAlign: "center",
};
const box: React.CSSProperties = { border: `1px solid ${hair}`, background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 12 };
const lab: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
const input: React.CSSProperties = {
  width: "100%", padding: "12px", border: `1px solid rgba(255,255,255,0.18)`, background: "rgba(255,255,255,0.06)",
  color: "#fff", fontSize: 18, boxSizing: "border-box", borderRadius: 0,
};
const primary: React.CSSProperties = { width: "100%", padding: "17px 0", border: "none", background: "#fff", color: "#000", fontSize: 17, fontWeight: 900, letterSpacing: "0.04em", cursor: "pointer" };
const secondary: React.CSSProperties = { ...primary, background: "transparent", color: "#fff", border: `1px solid rgba(255,255,255,0.3)` };
const link: React.CSSProperties = { border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 };

type Choice = { payKind: PayKind; method: FuelMethod | null; label: string; sub: string | null };

function clock(fromIso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ ...lab, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

export default function FuelSheet({
  open, onClose, stop, settings, methods, userId, truckName, onDone,
}: {
  open: boolean;
  onClose: () => void;
  stop: ReturnType<typeof useFuelStop>;
  settings: FuelSettings | null;
  methods: FuelMethod[];
  userId: string;
  truckName: string | null;
  onDone?: (text: string) => void;
}) {
  const p = stop.active;
  const [now, setNow] = useState(() => Date.now());
  const [choice, setChoice] = useState<Choice | null>(null);
  const [pump, setPump] = useState("");
  const [odo, setOdo] = useState("");
  const [products, setProducts] = useState<FuelProducts>("diesel");
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [driverNo, setDriverNo] = useState<string | null>(null);
  const [vault, setVault] = useState<{ id: string; label: string; category: string | null }[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  // Details
  const [d, setD] = useState<FuelDetails>({ dieselGallons: "", defGallons: "", filledToFull: true, storeName: "", storeNumber: "", city: "", state: "", notes: "", hasReceipt: false });
  const [money, setMoney] = useState({ dieselAmount: "", defAmount: "", total: "", pricePerGallon: "" });
  const [receipt, setReceipt] = useState<string | null>(null);
  const [stores, setStores] = useState<RecentStore[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!open || !userId) return;
    void supabase.from("profiles").select("employee_number").eq("user_id", userId).maybeSingle()
      .then(({ data }) => setDriverNo(((data as { employee_number?: string | null } | null)?.employee_number ?? "").trim() || null));
    void supabase.from("vault_entries").select("id,label,category").eq("user_id", userId).order("label")
      .then(({ data }) => setVault((data ?? []) as { id: string; label: string; category: string | null }[]));
    void recentStores(userId).then(setStores);
  }, [open, userId]);

  // Seed fields from the row when a stop opens or changes step.
  useEffect(() => {
    if (!p) return;
    setPump(p.pump_number ?? "");
    setOdo(p.odometer != null ? String(p.odometer) : "");
    setProducts(p.products ?? "diesel");
    setD((x) => ({
      ...x,
      dieselGallons: p.diesel_gallons != null ? String(p.diesel_gallons) : x.dieselGallons,
      defGallons: p.def_gallons != null ? String(p.def_gallons) : x.defGallons,
      filledToFull: p.filled_to_full ?? x.filledToFull,
      storeName: p.store_name ?? x.storeName,
      storeNumber: p.store_number ?? x.storeNumber,
      city: p.city ?? x.city,
      state: p.state ?? x.state,
      notes: p.notes ?? x.notes,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, p?.status]);

  // Prefill city/state from the phone once the details screen shows.
  const detailsShown = !!p && (p.status === "details" || showDetails);
  useEffect(() => {
    if (!detailsShown || d.city) return;
    let alive = true;
    void currentCity().then((c) => { if (alive && c) setD((x) => (x.city ? x : { ...x, city: c.city, state: c.state ?? x.state })); });
    return () => { alive = false; };
  }, [detailsShown, d.city]);

  const choices: Choice[] = useMemo(() => {
    const list: Choice[] = methods.filter((m) => m.is_active).map((m) => ({
      payKind: m.kind, method: m, label: m.name,
      sub: m.kind === "fuel_card" ? (m.card_last4 ? `Card ••${m.card_last4}` : "Fuel card") : KIND_LABEL[m.kind],
    }));
    list.push({ payKind: "personal_card", method: null, label: "My Card", sub: "Out of pocket" });
    list.push({ payKind: "cash", method: null, label: "Cash", sub: "Out of pocket" });
    return list;
  }, [methods]);

  if (!open) return null;
  if (!p) {
    return (
      <FullscreenModal open={open} title="Fuel" onClose={onClose} footer={null}>
        <div style={{ color: muted, fontSize: 14 }}>{stop.ready ? "No fuel stop in progress." : "Loading…"}</div>
      </FullscreenModal>
    );
  }

  const failed = failedKeys(p);
  const entry = (c: Choice): PumpEntry => ({
    payKind: c.payKind, methodId: c.method?.id ?? null, label: c.label, pumpNumber: pump, odometer: odo, products,
  });

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e: any) { setErr(e?.message ?? "Something went wrong"); }
    setBusy(false);
  };

  const pumpRunning = () => run(async () => {
    if (!choice) return;
    if (!odo.trim()) { setErr("Enter the odometer."); return; }
    await stop.save(startPumping(p, entry(choice), new Date().toISOString()));
    setChoice(null);
  });

  const didntWork = () => run(async () => {
    if (!choice) return;
    if (!pump.trim()) { setErr("Enter the pump number first."); return; }
    await stop.save(recordFailedTry(p, entry(choice), new Date().toISOString()));
    setChoice(null);
  });

  const pumpingFailed = () => run(async () => {
    const m = methods.find((x) => x.id === p.method_id) ?? null;
    const c: Choice = { payKind: p.pay_kind ?? "cash", method: m, label: m?.name ?? KIND_LABEL[p.pay_kind ?? "cash"], sub: null };
    await stop.save(recordFailedTry(p, entry(c), new Date().toISOString()));
  });

  const finish = () => run(async () => {
    await stop.save(finishFueling(p, new Date().toISOString()));
    setShowDetails(true);
  });

  const personal = isPersonal(p.pay_kind);

  const pickReceipt = (f: File) => run(async () => {
    const path = receiptPath(p.company_id, userId, personal, f.name);
    const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, f, { contentType: f.type || "image/jpeg" });
    if (error) throw error;
    setReceipt(path);
    setD((x) => ({ ...x, hasReceipt: true }));
  });

  const missing = missingForComplete(p, d, !!settings?.require_receipt);
  const save = () => run(async () => {
    if (missing.length) { setErr(`Still needed: ${missing.join(", ")}`); return; }
    const done = completeStop(p, d, new Date().toISOString());
    const ok = await stop.complete(done, {
      is_personal: personal,
      ...paymentAmounts({ dieselGallons: d.dieselGallons, defGallons: d.defGallons, ...money }),
      vault_entry_id: p.pay_kind === "personal_card" ? vaultId : null,
      receipt_path: receipt,
    });
    if (!ok) { setErr(stop.error ?? "Couldn't save. Try again when you have signal."); return; }
    const mins = Math.max(0, Math.round((Date.parse(done.finished_at!) - Date.parse(done.started_at)) / 60000));
    onDone?.(`Fuel saved · ${mins} min at the pump`);
    setShowDetails(false);
    setReceipt(null);
    setMoney({ dieselAmount: "", defAmount: "", total: "", pricePerGallon: "" });
    setD({ dieselGallons: "", defGallons: "", filledToFull: true, storeName: "", storeNumber: "", city: "", state: "", notes: "", hasReceipt: false });
    onClose();
  });

  const companyGuide = settings?.guide_path ? (
    <button type="button" style={{ ...link, display: "block", margin: "14px auto 0" }} onClick={() => void openGuide(settings.guide_path!).catch(() => {})}>
      📄 {settings.guide_name ?? "Company fuel guide"}
    </button>
  ) : null;

  const unsentNote = stop.unsent ? (
    <div style={{ fontSize: 12, color: "#fbbf24", marginBottom: 10 }}>Saved on this phone · sends when there's signal</div>
  ) : null;

  // ── Details (after pulling forward) ───────────────────────────────────────
  if (detailsShown) {
    return (
      <FullscreenModal open={open} title="Fuel Details" onClose={onClose} footer={null}>
        {unsentNote}
        <div style={{ ...box, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: muted }}>At the pump</span>
          <span className="dash-num" style={{ fontWeight: 800 }}>
            {Math.round((Date.parse(p.finished_at ?? new Date(now).toISOString()) - Date.parse(p.started_at)) / 60000)} min
          </span>
        </div>

        <div style={box}>
          <div style={{ ...lab, marginBottom: 8 }}>Receipt{settings?.require_receipt ? " (required)" : " (optional)"}</div>
          {receipt ? (
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ color: "#4ade80", fontWeight: 800 }}>✓ Photo saved</span>
              <button type="button" style={link} onClick={() => void openStoredFile(RECEIPT_BUCKET, receipt).catch(() => {})}>View</button>
              <button type="button" style={{ ...link, color: "#f87171" }} onClick={() => { setReceipt(null); setD((x) => ({ ...x, hasReceipt: false })); }}>Retake</button>
            </div>
          ) : (
            <label style={{ ...secondary, display: "block", textAlign: "center", padding: "13px 0", fontSize: 15 }}>
              {busy ? "Uploading…" : "📷 Photo of Receipt"}
              <input type="file" accept="image/*" capture="environment" hidden disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickReceipt(f); }} />
            </label>
          )}
        </div>

        <div style={box}>
          <div style={{ ...lab, marginBottom: 8 }}>Store</div>
          {stores.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {stores.map((s, i) => (
                <button key={i} type="button" onClick={() => setD((x) => ({ ...x, storeName: s.store_name, storeNumber: s.store_number ?? "", city: s.city ?? x.city, state: s.state ?? x.state }))}
                  style={{ border: `1px solid ${hair}`, background: "rgba(255,255,255,0.05)", color: "#fff", padding: "7px 10px", fontSize: 13, cursor: "pointer" }}>
                  {s.store_name}{s.store_number ? ` #${s.store_number}` : ""}{s.city ? ` · ${s.city}` : ""}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10 }}>
            <Field label="Name"><input style={input} value={d.storeName} placeholder="Store name" onChange={(e) => setD({ ...d, storeName: e.target.value })} /></Field>
            <Field label="Store #"><input style={input} value={d.storeNumber} onChange={(e) => setD({ ...d, storeNumber: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
            <Field label="City"><input style={input} value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })} /></Field>
            <Field label="ST"><input style={input} value={d.state} maxLength={2} onChange={(e) => setD({ ...d, state: e.target.value.toUpperCase() })} /></Field>
          </div>
        </div>

        <div style={box}>
          <div style={{ ...lab, marginBottom: 8 }}>Fuel</div>
          <div style={{ display: "grid", gridTemplateColumns: p.products === "diesel_def" ? "1fr 1fr" : "1fr", gap: 10 }}>
            <Field label="Diesel gal"><input style={input} inputMode="decimal" value={d.dieselGallons} onChange={(e) => setD({ ...d, dieselGallons: e.target.value })} /></Field>
            {p.products === "diesel_def" && (
              <Field label="DEF gal"><input style={input} inputMode="decimal" value={d.defGallons} onChange={(e) => setD({ ...d, defGallons: e.target.value })} /></Field>
            )}
          </div>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Filled to full</span>
            <input type="checkbox" checked={d.filledToFull} onChange={(e) => setD({ ...d, filledToFull: e.target.checked })} style={{ width: 22, height: 22 }} />
          </label>
        </div>

        <div style={box}>
          <div style={{ ...lab, marginBottom: 8 }}>Amounts{personal ? " · only you and your admin see these" : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Diesel $"><input style={input} inputMode="decimal" value={money.dieselAmount} onChange={(e) => setMoney({ ...money, dieselAmount: e.target.value })} /></Field>
            <Field label="Price / gal"><input style={input} inputMode="decimal" value={money.pricePerGallon} onChange={(e) => setMoney({ ...money, pricePerGallon: e.target.value })} /></Field>
            {p.products === "diesel_def" && (
              <Field label="DEF $"><input style={input} inputMode="decimal" value={money.defAmount} onChange={(e) => setMoney({ ...money, defAmount: e.target.value })} /></Field>
            )}
            <Field label="Total $"><input style={input} inputMode="decimal" value={money.total} onChange={(e) => setMoney({ ...money, total: e.target.value })} /></Field>
          </div>
        </div>

        <Field label="Note"><input style={input} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>

        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "SAVE FUEL STOP"}
        </button>
        <button type="button" style={{ ...link, display: "block", margin: "16px auto 0" }} onClick={onClose}>Finish later</button>
      </FullscreenModal>
    );
  }

  // ── Pumping ───────────────────────────────────────────────────────────────
  if (p.status === "pumping") {
    const m = methods.find((x) => x.id === p.method_id);
    return (
      <FullscreenModal open={open} title="Fueling" onClose={onClose} footer={null}>
        {unsentNote}
        <div style={{ textAlign: "center", padding: "26px 0 18px" }}>
          <div style={lab}>At the pump</div>
          <div className="dash-num" style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.1, marginTop: 6 }}>{clock(p.started_at, now)}</div>
          <div style={{ color: muted, fontSize: 14, marginTop: 8 }}>
            {m?.name ?? KIND_LABEL[p.pay_kind ?? "cash"]}{p.pump_number ? ` · Pump ${p.pump_number}` : ""}{p.odometer != null ? ` · ${Number(p.odometer).toLocaleString("en-US")} mi` : ""}
          </div>
        </div>
        <button type="button" style={primary} disabled={busy} onClick={() => void finish()}>FINISH FUELING</button>
        <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 8 }}>Tap when the pump stops, then pull forward.</div>
        <button type="button" style={{ ...link, display: "block", margin: "22px auto 0", color: "#fbbf24" }} disabled={busy} onClick={() => void pumpingFailed()}>
          Pump stopped working? Try another way
        </button>
        {companyGuide}
      </FullscreenModal>
    );
  }

  // ── Method pop-out ────────────────────────────────────────────────────────
  if (choice) {
    const m = choice.method;
    const steps = m?.steps ?? (choice.payKind === "cash"
      ? ["Tell the cashier your pump number", "Pay inside, then pump"]
      : ["Pay at the pump or inside with your card"]);
    return (
      <FullscreenModal open={open} title={choice.label} onClose={() => { setChoice(null); setErr(null); }} footer={null}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: hair, border: `1px solid ${hair}`, marginBottom: 12 }}>
          <div style={{ background: "#0f0f10", padding: 12 }}>
            <div style={lab}>Driver ID</div>
            <div className="dash-num" style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{driverNo ?? "—"}</div>
          </div>
          <div style={{ background: "#0f0f10", padding: 12 }}>
            <div style={lab}>Truck</div>
            <div className="dash-num" style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{truckName ?? "—"}</div>
          </div>
        </div>
        {!driverNo && <div style={{ fontSize: 12, color: "#fbbf24", marginBottom: 10 }}>No driver ID on your profile. Add your employee number in Settings → Profile.</div>}

        {m?.kind === "company_account" && m.account_number && (
          <div style={{ ...box, textAlign: "center" }}>
            <div style={lab}>Account number</div>
            <div className="dash-num" style={{ fontSize: 30, fontWeight: 900, letterSpacing: "0.04em", marginTop: 4 }}>{m.account_number}</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>Or show this screen to the cashier.</div>
          </div>
        )}
        {m?.kind === "fuel_card" && (
          <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>
            PIN not stored here. Keep it in your <a href="/planner/vault" style={{ color: "#fff" }}>Vault</a>.
          </div>
        )}
        {choice.payKind === "personal_card" && vault.length > 0 && (
          <div style={box}>
            <div style={{ ...lab, marginBottom: 8 }}>Card from your Vault (optional)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {vault.map((v) => (
                <button key={v.id} type="button" onClick={() => setVaultId(vaultId === v.id ? null : v.id)}
                  style={{ border: `1px solid ${vaultId === v.id ? "#fff" : hair}`, background: vaultId === v.id ? "rgba(255,255,255,0.15)" : "transparent", color: "#fff", padding: "7px 10px", fontSize: 13, cursor: "pointer" }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 16, lineHeight: 1.4, marginBottom: 8 }}>
              <span className="dash-num" style={{ width: 22, flexShrink: 0, textAlign: "right", fontWeight: 900, color: muted }}>{i + 1}.</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
        {m?.guide_path && (
          <button type="button" style={{ ...link, marginBottom: 14 }} onClick={() => void openGuide(m.guide_path!).catch(() => {})}>📄 {m.guide_name ?? "Detailed steps"}</button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 10 }}>
          <Field label="Pump #"><input style={input} inputMode="numeric" value={pump} onChange={(e) => setPump(e.target.value)} /></Field>
          <Field label="Odometer"><input style={input} inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} /></Field>
        </div>
        {settings?.def_enabled !== false && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            {(["diesel", "diesel_def"] as FuelProducts[]).map((k) => (
              <button key={k} type="button" onClick={() => setProducts(k)}
                style={{ padding: "12px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", border: `1px solid ${products === k ? "#fff" : hair}`, background: products === k ? "#fff" : "transparent", color: products === k ? "#000" : "#fff" }}>
                {k === "diesel" ? "Diesel" : "Diesel + DEF"}
              </button>
            ))}
          </div>
        )}

        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button type="button" style={primary} disabled={busy} onClick={() => void pumpRunning()}>PUMP RUNNING</button>
        <button type="button" style={{ ...secondary, marginTop: 10, color: "#fbbf24", borderColor: "rgba(251,191,36,0.5)" }} disabled={busy} onClick={() => void didntWork()}>
          DIDN&apos;T WORK
        </button>
      </FullscreenModal>
    );
  }

  // ── Payment grid ──────────────────────────────────────────────────────────
  return (
    <FullscreenModal open={open} title="Fuel" onClose={onClose} footer={null}>
      {unsentNote}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={lab}>How are you paying?</span>
        <span className="dash-num" style={{ fontSize: 15, fontWeight: 800 }}>{clock(p.started_at, now)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: hair, border: `1px solid ${hair}` }}>
        {choices.map((c) => {
          const tried = failed.has(c.method?.id ?? c.payKind);
          return (
            <button key={c.method?.id ?? c.payKind} type="button" className="dash-press" style={tile}
              onClick={() => { setErr(null); setVaultId(null); setChoice(c); }}>
              <span style={{ fontSize: 14, fontWeight: 800, textDecoration: tried ? "line-through" : "none", opacity: tried ? 0.5 : 1 }}>{c.label}</span>
              <span style={{ fontSize: 11, color: tried ? "#f87171" : muted }}>{tried ? "Didn't work" : c.sub}</span>
            </button>
          );
        })}
        {Array.from({ length: (3 - (choices.length % 3)) % 3 }, (_, i) => <div key={`pad${i}`} style={{ background: "#0f0f10" }} />)}
      </div>
      {methods.length === 0 && (
        <div style={{ fontSize: 12, color: muted, marginTop: 10 }}>Your company hasn&apos;t set up fuel accounts yet (Company Dashboard → Fuel).</div>
      )}
      {(p.attempts ?? []).length > 0 && (
        <div style={{ fontSize: 12, color: muted, marginTop: 12 }}>
          {p.attempts.map((a, i) => <div key={i}>✕ {a.label}{a.pump_number ? ` · pump ${a.pump_number}` : ""}</div>)}
        </div>
      )}
      {companyGuide}
      <button type="button" style={{ ...link, display: "block", margin: "24px auto 0", color: "#f87171", fontSize: 13 }}
        onClick={() => { if (window.confirm("Cancel this fuel stop?")) { void stop.discard(); onClose(); } }}>
        Cancel fuel stop
      </button>
    </FullscreenModal>
  );
}
