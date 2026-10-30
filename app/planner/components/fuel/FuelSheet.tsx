"use client";
// app/planner/components/fuel/FuelSheet.tsx
//
// The fuel island. Tapping Fuel already stamped the start time; this sheet is:
//   1. Payment grid: the company's methods in its order, then My card, Cash.
//      Methods that didn't work this stop are marked.
//   2a. RFID / company account pop-out: only what the pump asks for (truck,
//      employee ID, the driver's PIN for that method, the account number) and
//      the steps. Odometer and diesel gallons are the only entries. Finished Fueling ends the stop;
//      Pump Down asks where, which pump and what was wrong, then back to the
//      grid. The PIN is entered once and kept for that driver only.
//   2b. Company Card / My Card / Cash pop-out. Cards come from the driver's
//      Vault (Company Card / Personal Card categories): pick one if there are
//      several, then name on card, type, dots + last 4 (5 for Amex), PIN.
//      Odometer, Diesel / Diesel + DEF. Finished Fueling (to details) or Pump
//      Down (same report as RFID).
//   Every screen has Cancel fuel stop (themed confirm).
//   3. Pumping: the clock and Finish Fueling (end time). Pull forward, then:
//   4. Details: receipt photo first, then the store, gallons, amounts. Can be
//      finished later.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { openGuide, openStoredFile } from "@/lib/fuel/useFuelSetup";
import type { useFuelStop } from "@/lib/fuel/useFuelStop";
import { devicePosition, nearbyStores, STORE_RANGE_MI, type NearbyStore, type Pos } from "@/lib/fuel/nearbyStores";
import {
  completeStop, failedKeys, finishFueling, finishQuick, finishToDetails, missingForComplete, paymentAmounts, receiptRequired, recordFailedTry, recordPumpDown, startPumping,
  type FuelDetails, type PumpEntry,
} from "@/lib/fuel/fuelFlow";
import {
  KIND_LABEL, PUMP_ISSUES, fmtStamp, fmtTime, RECEIPT_BUCKET, isPersonal, isQuickKind, receiptPath,
  type FuelMethod, type FuelProducts, type FuelSettings, type PayKind,
} from "@/lib/fuel/types";
import { currentCity } from "@/lib/trips/startPlace";
import { resolveStopPlace } from "@/lib/fuel/stopPlace";
import { COMPANY_CARD, PERSONAL_CARD, maskCard, maskLast4, type VaultCard } from "@/lib/vault/cards";
import { openRows } from "@/lib/vault/client";
import { getVaultKey, onVaultKeyChange } from "@/lib/vault/session";
import { VaultUnlockInline } from "./VaultUnlockInline";

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


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ ...lab, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

type StoreVal = { storeName: string; storeNumber: string; city: string; state: string };
const storeKey = (name: string, num: string | null | undefined) => `${name.trim()}|${num ?? ""}`.toLowerCase();

// Saved stores near the phone as one-tap choices; the store fields only show
// after "+ Add store".
function StoreBlock({ title, value, onChange, nearby, locating, located, picked, onPick, adding, onAdd }: {
  title: string;
  value: StoreVal;
  onChange: (v: StoreVal) => void;
  nearby: NearbyStore[];
  locating: boolean;
  located: boolean;
  picked: string | null;
  onPick: (s: NearbyStore) => void;
  adding: boolean;
  onAdd: () => void;
}) {
  const chip = (on: boolean): React.CSSProperties => ({
    border: `1px solid ${on ? "#fff" : hair}`, background: on ? "#fff" : "rgba(255,255,255,0.05)", color: on ? "#000" : "#fff",
    padding: "9px 11px", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left",
  });
  return (
    <div style={box}>
      <div style={{ ...lab, marginBottom: 8 }}>{title}</div>
      {nearby.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {nearby.map((n) => {
            const on = picked === storeKey(n.store_name, n.store_number);
            return (
              <button key={storeKey(n.store_name, n.store_number)} type="button" style={chip(on)} onClick={() => onPick(n)}>
                {on ? "✓ " : ""}{n.store_name}{n.store_number ? ` #${n.store_number}` : ""}{n.city ? ` · ${n.city}` : ""}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>
          {locating ? "Finding stores near you…" : located ? `No saved stores within ${STORE_RANGE_MI} mi.` : "Location is off, so nearby stores can't show."}
        </div>
      )}
      {adding ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10 }}>
            <Field label="Store name"><input style={input} value={value.storeName} placeholder="Love's" onChange={(e) => onChange({ ...value, storeName: e.target.value })} /></Field>
            <Field label="Store #"><input style={input} value={value.storeNumber} onChange={(e) => onChange({ ...value, storeNumber: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
            <Field label="City"><input style={input} value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} /></Field>
            <Field label="ST"><input style={input} value={value.state} maxLength={2} onChange={(e) => onChange({ ...value, state: e.target.value.toUpperCase() })} /></Field>
          </div>
          {located && <div style={{ fontSize: 12, color: muted }}>Saved at this spot, so it shows next time you&apos;re here.</div>}
        </>
      ) : (
        <button type="button" style={link} onClick={onAdd}>+ Add store</button>
      )}
    </div>
  );
}

export default function FuelSheet({
  open, onClose, stop, settings, methods, userId, truckName, onDone, liveOdometer,
}: {
  liveOdometer?: number | null; // from the truck's telematics, when connected
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
  const [cardId, setCardIdState] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [driverNo, setDriverNo] = useState<string | null>(null);
  const [cards, setCards] = useState<VaultCard[]>([]);
  const [choosingCard, setChoosingCard] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  // RFID / company account
  const [pins, setPins] = useState<Record<string, string>>({});
  const [pinDraft, setPinDraft] = useState("");
  const [editPin, setEditPin] = useState(false);
  const [down, setDown] = useState(false);
  const [issue, setIssue] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [loc, setLoc] = useState<StoreVal>({ storeName: "", storeNumber: "", city: "", state: "" });
  const [quickGal, setQuickGal] = useState("");
  const [quickFull, setQuickFull] = useState(true);
  // Stores near the phone
  const [pos, setPos] = useState<Pos | null>(null);
  const [locating, setLocating] = useState(false);
  const [nearby, setNearby] = useState<NearbyStore[]>([]);
  const [picked, setPicked] = useState<NearbyStore | null>(null);
  const [addingStore, setAddingStore] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Details
  const [d, setD] = useState<FuelDetails>({ dieselGallons: "", filledToFull: true, storeName: "", storeNumber: "", city: "", state: "", notes: "", hasReceipt: false });
  const [total, setTotal] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!open || !userId) return;
    void supabase.from("profiles").select("employee_number").eq("user_id", userId).maybeSingle()
      .then(({ data }) => setDriverNo(((data as { employee_number?: string | null } | null)?.employee_number ?? "").trim() || null));
    // Card details are sealed in the Vault. Label, brand, expiry and last digits show without the key;
    // the name and PIN need it, so they fill in once the Vault is unlocked (and clear when it locks).
    const loadCards = () => void supabase.from("vault_entries").select("*")
      .eq("user_id", userId).in("category", [COMPANY_CARD, PERSONAL_CARD]).order("label")
      .then(async ({ data }) => setCards((await openRows(getVaultKey(), (data ?? []) as any[])) as unknown as VaultCard[]));
    loadCards();
    void supabase.from("driver_fuel_pins").select("method_id,pin").eq("user_id", userId)
      .then(({ data }) => setPins(Object.fromEntries(((data ?? []) as { method_id: string; pin: string }[]).map((r) => [r.method_id, r.pin]))));
    return onVaultKeyChange(loadCards);
  }, [open, userId]);

  // The card picked for this stop, kept on the phone until the stop is saved.
  const cardKey = p ? `proTankr:fuelCard:${p.id}` : null;
  useEffect(() => {
    if (!cardKey) return;
    try { setCardIdState(localStorage.getItem(cardKey)); } catch { /* storage off */ }
  }, [cardKey]);
  const setCardId = (id: string | null) => {
    setCardIdState(id);
    if (!cardKey) return;
    try { if (id) localStorage.setItem(cardKey, id); else localStorage.removeItem(cardKey); } catch { /* storage off */ }
  };
  const cardsFor = (k: PayKind | null) => cards.filter((c) => c.category === (k === "fuel_card" ? COMPANY_CARD : k === "personal_card" ? PERSONAL_CARD : "__none__"));
  const cardFor = (k: PayKind | null): VaultCard | null => {
    const list = cardsFor(k);
    return list.find((c) => c.id === cardId) ?? (list.length === 1 ? list[0] : null);
  };

  // Where the phone is, and the company's saved stores in range.
  const companyId = p?.company_id ?? null;
  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setLocating(true);
    void devicePosition().then(async (here) => {
      if (!alive) return;
      setPos(here);
      const list = here ? await nearbyStores(companyId, here).catch(() => []) : [];
      if (!alive) return;
      setNearby(list);
      setLocating(false);
    });
    return () => { alive = false; };
  }, [open, companyId]);

  // A store already on the stop (from a pump down): select it if it's nearby,
  // else show it in the fields.
  useEffect(() => {
    if (!p?.store_name || picked) return;
    const k = storeKey(p.store_name, p.store_number);
    const hit = nearby.find((n) => storeKey(n.store_name, n.store_number) === k);
    if (hit) { setPicked(hit); setAddingStore(false); } else setAddingStore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.store_name, nearby]);

  const pickStore = (n: NearbyStore) => {
    setPicked(n);
    setAddingStore(false);
    const v = { storeName: n.store_name, storeNumber: n.store_number ?? "", city: n.city ?? "", state: n.state ?? "" };
    setLoc(v);
    setD((x) => ({ ...x, ...v }));
  };
  const addStore = () => {
    setPicked(null);
    setAddingStore(true);
    setLoc((x) => ({ ...x, storeName: "", storeNumber: "" }));
    setD((x) => ({ ...x, storeName: "", storeNumber: "" }));
  };
  const storePos = (): Pos | null => (picked ? { lat: picked.lat, lon: picked.lon } : pos);

  // Pump down: prefill where from the stop, else the phone's city.
  useEffect(() => {
    if (!down || !p) return;
    setLoc((x) => ({ storeName: x.storeName || p.store_name || "", storeNumber: x.storeNumber || p.store_number || "", city: x.city || p.city || "", state: x.state || p.state || "" }));
    if (p.city) return;
    let alive = true;
    void currentCity().then((c) => { if (alive && c) setLoc((x) => (x.city ? x : { ...x, city: c.city, state: c.state ?? x.state })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [down, p?.id]);

  // Seed fields from the row when a stop opens or changes step.
  useEffect(() => {
    if (!p) return;
    setPump(p.pump_number ?? "");
    setOdo(p.odometer != null ? String(p.odometer) : "");
    setProducts(p.products ?? "diesel");
    setD((x) => ({
      ...x,
      dieselGallons: p.diesel_gallons != null ? String(p.diesel_gallons) : x.dieselGallons,
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
    const active = methods.filter((m) => m.is_active);
    const list: Choice[] = active.filter((m) => m.kind !== "fuel_card").map((m) => ({
      payKind: m.kind, method: m, label: m.name, sub: KIND_LABEL[m.kind],
    }));
    // Company card steps (if the admin set any) ride along with the tile.
    const cardSteps = active.find((m) => m.kind === "fuel_card") ?? null;
    const n = (cat: string) => cards.filter((c) => c.category === cat).length;
    const sub = (k: number) => (k === 0 ? "Add in Vault" : k === 1 ? "1 card" : `${k} cards`);
    list.push({ payKind: "fuel_card", method: cardSteps, label: "Company Card", sub: sub(n(COMPANY_CARD)) });
    list.push({ payKind: "personal_card", method: null, label: "My Card", sub: sub(n(PERSONAL_CARD)) });
    list.push({ payKind: "cash", method: null, label: "Cash", sub: "Out of pocket" });
    return list;
  }, [methods, cards]);

  // Hooks must all run before the early returns below, or finishing a stop (p goes null) crashes the screen.
  // The truck's own odometer fills the field when it's empty. Never overwrites a typed value.
  useEffect(() => {
    if (liveOdometer != null) setOdo((o) => (o.trim() ? o : String(liveOdometer)));
  }, [liveOdometer, p?.id, p?.status, p?.odometer, choice]);

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

  const finishedCard = () => run(async () => {
    if (!choice) return;
    if (!odo.trim()) { setErr("Enter the odometer."); return; }
    await stop.save(finishToDetails(p, { payKind: choice.payKind, methodId: choice.method?.id ?? null, odometer: odo, products }, new Date().toISOString()));
    closeChoice();
    setShowDetails(true);
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

  const closeChoice = () => { setChoice(null); setErr(null); setDown(false); setIssue(""); setIssueNote(""); setEditPin(false); setPinDraft(""); setChoosingCard(false); };

  const savePin = (methodId: string) => run(async () => {
    const pin = pinDraft.trim();
    if (!pin) { setErr("Enter your PIN."); return; }
    const { error } = await supabase.from("driver_fuel_pins").upsert({ user_id: userId, method_id: methodId, pin, updated_at: new Date().toISOString() });
    if (error) throw error;
    setPins((x) => ({ ...x, [methodId]: pin }));
    setEditPin(false);
    setPinDraft("");
  });

  const finishedQuick = () => run(async () => {
    if (!choice) return;
    if (!odo.trim()) { setErr("Enter the odometer."); return; }
    if (!quickGal.trim()) { setErr("Enter the gallons."); return; }
    const place = p.state ? null : await resolveStopPlace(p.truck_id);
    const done = finishQuick(p, { payKind: choice.payKind, methodId: choice.method?.id ?? null, odometer: odo, gallons: quickGal, filledToFull: quickFull, pos, city: place?.city, state: place?.state }, new Date().toISOString());
    const ok = await stop.complete(done, {
      is_personal: false, price_per_gallon: null, diesel_amount: null, def_amount: null, total_amount: null, vault_entry_id: null, receipt_path: null,
    });
    if (!ok) { setErr(stop.error ?? "Couldn't save. Try again when you have signal."); return; }
    const mins = Math.max(0, Math.round((Date.parse(done.finished_at!) - Date.parse(done.started_at)) / 60000));
    onDone?.(`Fuel saved ${fmtStamp(done.finished_at)} · ${mins} min at the pump`);
    closeChoice();
    setQuickGal("");
    setQuickFull(true);
    onClose();
  });

  const pumpDown = () => run(async () => {
    if (!choice) return;
    if (!pump.trim()) { setErr("Enter the pump number."); return; }
    if (!issue) { setErr("Pick what's wrong."); return; }
    if (issue === "Other" && !issueNote.trim()) { setErr("Say what's wrong."); return; }
    if (!loc.storeName.trim() && !loc.city.trim()) { setErr("Pick the store, or tap Add store."); return; }
    await stop.save(recordPumpDown(p, {
      payKind: choice.payKind, methodId: choice.method?.id ?? null, label: choice.label, pumpNumber: pump,
      issue: issue === "Other" ? issueNote : issue, storeName: loc.storeName, storeNumber: loc.storeNumber, city: loc.city, state: loc.state, pos: storePos(),
    }, new Date().toISOString()));
    closeChoice();
  });

  const personal = isPersonal(p.pay_kind);

  const pickReceipt = (f: File) => run(async () => {
    const path = receiptPath(p.company_id, userId, personal, f.name);
    const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, f, { contentType: f.type || "image/jpeg" });
    if (error) throw error;
    setReceipt(path);
    setD((x) => ({ ...x, hasReceipt: true }));
  });

  const needReceipt = receiptRequired(p.pay_kind, settings);
  const missing = missingForComplete(p, d, needReceipt, total);
  const save = () => run(async () => {
    if (missing.length) { setErr(`Still needed: ${missing.join(", ")}`); return; }
    const place = d.state.trim() ? null : await resolveStopPlace(p.truck_id);
    const done = completeStop(p, { ...d, state: d.state.trim() || place?.state || "", city: d.city.trim() || place?.city || "", pos: storePos() }, new Date().toISOString());
    const ok = await stop.complete(done, {
      is_personal: personal,
      ...paymentAmounts({ dieselGallons: d.dieselGallons, total }),
      vault_entry_id: cardFor(p.pay_kind)?.id ?? null,
      receipt_path: receipt,
    });
    if (!ok) { setErr(stop.error ?? "Couldn't save. Try again when you have signal."); return; }
    const mins = Math.max(0, Math.round((Date.parse(done.finished_at!) - Date.parse(done.started_at)) / 60000));
    onDone?.(`Fuel saved ${fmtStamp(done.finished_at)} · ${mins} min at the pump`);
    setShowDetails(false);
    setCardId(null);
    setReceipt(null);
    setTotal("");
    setD({ dieselGallons: "", filledToFull: true, storeName: "", storeNumber: "", city: "", state: "", notes: "", hasReceipt: false });
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

  // Cancel fuel stop, on every screen.
  const cancelEl = confirmCancel ? (
    <div style={{ ...box, marginTop: 20, borderColor: "rgba(248,113,113,0.45)" }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Cancel this fuel stop?</div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>
        Started {fmtStamp(p.started_at)}. The start time{(p.attempts ?? []).length ? " and the tries" : ""} will be deleted.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button type="button" style={{ ...secondary, padding: "13px 0", fontSize: 15 }} onClick={() => setConfirmCancel(false)}>Keep</button>
        <button type="button" style={{ ...primary, padding: "13px 0", fontSize: 15, background: "#f87171", color: "#000" }}
          onClick={() => {
            setConfirmCancel(false); closeChoice(); setShowDetails(false); setCardId(null);
            if (receipt) void supabase.storage.from(RECEIPT_BUCKET).remove([receipt]);
            setReceipt(null);
            void stop.discard(); onClose();
          }}>Cancel Stop</button>
      </div>
    </div>
  ) : (
    <button type="button" style={{ ...link, display: "block", margin: "24px auto 0", color: "#f87171", fontSize: 13 }}
      onClick={() => setConfirmCancel(true)}>
      Cancel fuel stop
    </button>
  );

  const chip = (on: boolean): React.CSSProperties => ({
    border: `1px solid ${on ? "#fff" : hair}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff",
    padding: "9px 11px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  });

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
          <div style={{ ...lab, marginBottom: 8 }}>Receipt{needReceipt ? " (required)" : " (optional)"}</div>
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

        <StoreBlock title="Store" value={d} onChange={(v) => setD({ ...d, ...v })} nearby={nearby} locating={locating} located={!!pos}
          picked={picked ? storeKey(picked.store_name, picked.store_number) : null} onPick={pickStore} adding={addingStore} onAdd={addStore} />

        <div style={box}>
          <div style={{ ...lab, marginBottom: 8 }}>Fuel</div>
          <Field label="Diesel gallons"><input style={input} inputMode="decimal" value={d.dieselGallons} onChange={(e) => setD({ ...d, dieselGallons: e.target.value })} /></Field>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Filled to full</span>
            <input type="checkbox" checked={d.filledToFull} onChange={(e) => setD({ ...d, filledToFull: e.target.checked })} style={{ width: 22, height: 22 }} />
          </label>
        </div>

        <div style={box}>
          <div style={{ ...lab, marginBottom: 8 }}>Cost{personal ? " · only you and your admin see this" : ""}</div>
          <Field label="Total cost $"><input style={input} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
        </div>

        <Field label="Note"><input style={input} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>

        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button aria-busy={!!(busy)} type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "SAVE FUEL STOP"}
        </button>
        <button type="button" style={{ ...link, display: "block", margin: "16px auto 0" }} onClick={onClose}>Finish later</button>
        {cancelEl}
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
          <div className="dash-num" style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1, marginTop: 6 }}>{fmtStamp(p.started_at)}</div>
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
        {cancelEl}
      </FullscreenModal>
    );
  }

  // ── Pump down (any method) ────────────────────────────────────────────────
  if (choice && down) {
    return (
      <FullscreenModal open={open} title="Pump Down" onClose={() => { setDown(false); setErr(null); }} footer={null}>
        <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>{choice.label} didn&apos;t work. Tell us where and why, then pick another way to pay.</div>
        <StoreBlock title="Where" value={loc} onChange={setLoc} nearby={nearby} locating={locating} located={!!pos}
          picked={picked ? storeKey(picked.store_name, picked.store_number) : null} onPick={pickStore} adding={addingStore} onAdd={addStore} />
        <Field label="Pump #"><input style={{ ...input, maxWidth: 140 }} inputMode="numeric" value={pump} onChange={(e) => setPump(e.target.value)} /></Field>
        <div style={{ ...lab, marginBottom: 8 }}>What&apos;s wrong</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {PUMP_ISSUES.map((k) => <button key={k} type="button" style={chip(issue === k)} onClick={() => setIssue(k)}>{k}</button>)}
        </div>
        {issue === "Other" && <Field label="Describe it"><input style={input} value={issueNote} onChange={(e) => setIssueNote(e.target.value)} /></Field>}
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button aria-busy={!!(busy)} type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void pumpDown()}>
          {busy ? "Saving…" : "SAVE · PICK ANOTHER WAY"}
        </button>
        {cancelEl}
      </FullscreenModal>
    );
  }

  // ── RFID / company account pop-out ────────────────────────────────────────
  if (choice && isQuickKind(choice.payKind) && choice.method) {
    const m = choice.method;
    const pin = pins[m.id];
    // Three numbers side by side, all the same size (long ones are clipped with an ellipsis, never shrunk).
    const big = (_v?: string | null): React.CSSProperties => ({ fontSize: 22, fontWeight: 900, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    const acct = m.kind === "company_account" && m.account_number ? m.account_number : null;
    const cell: React.CSSProperties = { background: "#0f0f10", padding: "12px 10px", minWidth: 0 };
    return (
      <FullscreenModal open={open} title={m.name} onClose={closeChoice} footer={null}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: hair, border: `1px solid ${hair}`, marginBottom: 12 }}>
          <div style={cell}>
            <div style={lab}>{acct ? "Account" : "Truck"}</div>
            <div className="dash-num" style={big()}>{acct ?? truckName ?? "—"}</div>
          </div>
          <div style={cell}>
            <div style={lab}>Employee ID</div>
            <div className="dash-num" style={big()}>{driverNo ?? "—"}</div>
          </div>
          <button type="button" style={{ ...cell, border: "none", color: "#fff", textAlign: "left", cursor: "pointer" }}
            onClick={() => { setPinDraft(pin ?? ""); setEditPin(true); setErr(null); }}>
            <div style={lab}>PIN{pin ? " ✎" : ""}</div>
            <div className="dash-num" style={{ ...big(), color: pin ? "#fff" : "#fbbf24" }}>{pin ?? "Add"}</div>
          </button>
        </div>
        {!driverNo && <div style={{ fontSize: 12, color: "#fbbf24", marginBottom: 10 }}>No employee ID on your profile. Add it in Settings → Profile.</div>}
        {(editPin || !pin) && (
          <div style={box}>
            <div style={{ ...lab, marginBottom: 8 }}>Your {m.name} PIN</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Entered once, shown here next time. Only you can see it.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...input, flex: 1 }} inputMode="numeric" autoComplete="off" value={pinDraft} onChange={(e) => setPinDraft(e.target.value)} />
              <button type="button" style={{ ...primary, width: 90, padding: 0 }} disabled={busy} onClick={() => void savePin(m.id)}>Save</button>
            </div>
            {pin && <button type="button" style={{ ...link, marginTop: 10 }} onClick={() => { setEditPin(false); setPinDraft(""); }}>Cancel</button>}
          </div>
        )}

        <div style={{ ...box, textAlign: "center" }}>
          <div style={lab}>Odometer</div>
          <input className="dash-num" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} placeholder="—"
            style={{ ...input, border: "none", background: "transparent", textAlign: "center", fontSize: 30, fontWeight: 900, letterSpacing: "0.04em", marginTop: 4, padding: 0 }} />
        </div>

        {m.steps.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {m.steps.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: 16, lineHeight: 1.4, marginBottom: 8 }}>
                <span className="dash-num" style={{ width: 22, flexShrink: 0, textAlign: "right", fontWeight: 900, color: muted }}>{i + 1}.</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        )}
        {m.guide_path && (
          <button type="button" style={{ ...link, marginBottom: 14 }} onClick={() => void openGuide(m.guide_path!).catch(() => {})}>📄 {m.guide_name ?? "Detailed steps"}</button>
        )}

        <Field label="Diesel gallons"><input style={input} inputMode="decimal" value={quickGal} onChange={(e) => setQuickGal(e.target.value)} /></Field>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Filled to full</span>
          <input type="checkbox" checked={quickFull} onChange={(e) => setQuickFull(e.target.checked)} style={{ width: 22, height: 22 }} />
        </label>

        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button aria-busy={!!(busy)} type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void finishedQuick()}>
          {busy ? "Saving…" : "FINISHED FUELING"}
        </button>
        <button type="button" style={{ ...secondary, marginTop: 10, color: "#fbbf24", borderColor: "rgba(251,191,36,0.5)" }} disabled={busy}
          onClick={() => { setErr(null); setDown(true); }}>
          PUMP DOWN
        </button>
        {cancelEl}
      </FullscreenModal>
    );
  }

  // ── Company Card / My Card / Cash pop-out ─────────────────────────────────
  if (choice) {
    const m = choice.method;
    const isCard = choice.payKind === "fuel_card" || choice.payKind === "personal_card";
    const list = cardsFor(choice.payKind);
    const card = cardFor(choice.payKind);
    const catLabel = choice.payKind === "fuel_card" ? "Company Card" : "Personal Card";
    const steps = m?.steps?.length ? m.steps : (choice.payKind === "cash"
      ? ["Tell the cashier your pump number", "Pay inside, then pump"]
      : ["Pay at the pump or inside with your card"]);
    const pickList = isCard && (choosingCard || (!card && list.length > 1));
    return (
      <FullscreenModal open={open} title={choice.label} onClose={closeChoice} footer={null}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: hair, border: `1px solid ${hair}`, marginBottom: 12 }}>
          <div style={{ background: "#0f0f10", padding: 12 }}>
            <div style={lab}>Truck</div>
            <div className="dash-num" style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{truckName ?? "—"}</div>
          </div>
          <div style={{ background: "#0f0f10", padding: 12 }}>
            <div style={lab}>Employee ID</div>
            <div className="dash-num" style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{driverNo ?? "—"}</div>
          </div>
        </div>

        {isCard && pickList && (
          <div style={box}>
            <div style={{ ...lab, marginBottom: 8 }}>Which card?</div>
            <div style={{ display: "grid", gap: 8 }}>
              {list.map((c) => (
                <button key={c.id} type="button" onClick={() => { setCardId(c.id); setChoosingCard(false); }}
                  style={{ border: `1px solid ${card?.id === c.id ? "#fff" : hair}`, background: "rgba(255,255,255,0.04)", color: "#fff", padding: "12px", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{c.label}</div>
                  <div style={{ fontSize: 13, color: muted }}>{[c.card_brand, maskLast4(c.card_last4) || maskCard(c.card_number, c.card_brand), c.card_name].filter(Boolean).join(" · ")}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {isCard && !pickList && card?.locked && userId && <VaultUnlockInline userId={userId} />}
        {isCard && !pickList && card && (
          <div style={{ ...box, background: "linear-gradient(135deg, #2a2a2c, #161618)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{card.label}</span>
              <span style={{ ...lab, color: "rgba(255,255,255,0.7)" }}>{card.card_brand ?? ""}</span>
            </div>
            <div className="dash-num" style={{ fontSize: 24, fontWeight: 900, letterSpacing: "0.08em", margin: "14px 0 10px" }}>
              {maskLast4(card.card_last4) || maskCard(card.card_number, card.card_brand) || "No number saved"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={lab}>Name on card</div>
                <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.card_name ?? "—"}</div>
              </div>
              {card.card_exp && (
                <div>
                  <div style={lab}>Exp</div>
                  <div className="dash-num" style={{ fontSize: 15, fontWeight: 700 }}>{card.card_exp}</div>
                </div>
              )}
              <div style={{ textAlign: "right" }}>
                <div style={lab}>PIN</div>
                <div className="dash-num" style={{ fontSize: 26, fontWeight: 900 }}>{card.card_pin ?? "—"}</div>
              </div>
            </div>
          </div>
        )}
        {isCard && (
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 13 }}>
            {list.length === 0 && <span style={{ color: "#fbbf24" }}>No {catLabel.toLowerCase()}s in your Vault yet.</span>}
            {list.length > 1 && !pickList && <button type="button" style={link} onClick={() => setChoosingCard(true)}>Change card</button>}
            <a href="/planner/vault" style={{ color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{list.length === 0 ? "Add one in the Vault" : `${catLabel}s in Vault ›`}</a>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          {steps.map((st, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 16, lineHeight: 1.4, marginBottom: 8 }}>
              <span className="dash-num" style={{ width: 22, flexShrink: 0, textAlign: "right", fontWeight: 900, color: muted }}>{i + 1}.</span>
              <span>{st}</span>
            </div>
          ))}
        </div>
        {m?.guide_path && (
          <button type="button" style={{ ...link, marginBottom: 14 }} onClick={() => void openGuide(m.guide_path!).catch(() => {})}>📄 {m.guide_name ?? "Detailed steps"}</button>
        )}

        <Field label="Odometer"><input style={input} inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {(["diesel", "diesel_def"] as FuelProducts[]).map((k) => (
            <button key={k} type="button" onClick={() => setProducts(k)}
              style={{ padding: "12px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", border: `1px solid ${products === k ? "#fff" : hair}`, background: products === k ? "#fff" : "transparent", color: products === k ? "#000" : "#fff" }}>
              {k === "diesel" ? "Diesel" : "Diesel + DEF"}
            </button>
          ))}
        </div>

        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button aria-busy={!!(busy)} type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void finishedCard()}>
          {busy ? "Saving…" : "FINISHED FUELING"}
        </button>
        <button type="button" style={{ ...secondary, marginTop: 10, color: "#fbbf24", borderColor: "rgba(251,191,36,0.5)" }} disabled={busy}
          onClick={() => { setErr(null); setDown(true); }}>
          PUMP DOWN
        </button>
        {cancelEl}
      </FullscreenModal>
    );
  }

  // ── Payment grid ──────────────────────────────────────────────────────────
  return (
    <FullscreenModal open={open} title="Fuel" onClose={onClose} footer={null}>
      {unsentNote}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={lab}>How are you paying?</span>
        <span style={{ textAlign: "right" }}>
          <span style={{ display: "block", fontSize: 11, color: muted }}>Started {fmtStamp(p.started_at)}</span>
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: hair, border: `1px solid ${hair}` }}>
        {choices.map((c) => {
          const tried = failed.has(c.method?.id ?? c.payKind);
          return (
            <button key={c.method?.id ?? c.payKind} type="button" className="dash-press" style={tile}
              onClick={() => { setErr(null); setChoosingCard(false); setChoice(c); }}>
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
          {p.attempts.map((a, i) => <div key={i}>✕ {fmtTime(a.at)} · {a.label}{a.pump_number ? ` · pump ${a.pump_number}` : ""}{a.issue ? ` · ${a.issue}` : ""}</div>)}
        </div>
      )}
      {companyGuide}
      {cancelEl}
    </FullscreenModal>
  );
}
