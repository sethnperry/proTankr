"use client";
// app/planner/components/trip/DeliveryDashboard.tsx
//
// The delivery screen (docs/trip-workflow-design.md §8, §9), opened when the
// driver arrives at a delivery. Laid out like the Planner: the trailer's
// compartments as bars, each with a drop-into picker underneath (a store tank
// for that product, or Retain to keep it aboard for the next leg). Then one
// big button that walks the drop:
//
//   Drop / Pump Off   → start time (now, editable; delay reason if late)
//   Tank readings     → optional, from each product's readings row: before
//                       for every store tank of that product, then after
//                       (prefilled before + what went in, when in gallons).
//                       If the company requires them, Finish opens the first
//                       missing product instead of the finish form.
//   Finish Delivery   → depart time, ending miles on the last stop, driver
//                       signature → Complete (or Complete · Next Leg when
//                       anything is retained or another stop is planned)
//
// The consignee signature is its own button (optional unless the company
// requires it); its pop-out fills the screen when the phone is turned
// sideways. Progress (start time, tank picks, readings) is saved to the trip
// as the driver goes; Retain and the consignee signature are kept on the
// phone until Finish.

import React, { useEffect, useMemo, useState } from "react";
import ValueEntryOverlay from "@/app/planner/components/ValueEntryOverlay";
import { productColorFor } from "@/app/planner/utils/productColor";
import { useIsLandscape } from "@/app/planner/hooks/useOrientation";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import {
  delayMinutes,
  needsDelayReason,
  suggestTank,
  timesProblem,
  type DeliveredCompartment,
  type DeliveryTankReading,
  type StepTimes,
} from "@/lib/trips/tripFlow";
import {
  DISCREPANCY_COLOR,
  fmtSignedGallons,
  prefillAfter,
  tankDiscrepancy,
  tanksForProduct,
  type Discrepancy,
  type ReadingUnit,
} from "@/lib/trips/tankReadings";
import type { LocationTank } from "@/lib/trips/deliveryLocations";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripDeliveryTankRow } from "@/lib/trips/types";
import type { DelayReason, TripSettings } from "@/lib/trips/useTripData";
import {
  DelayReasonField,
  SignatureAccept,
  SignaturePad,
  delayReasonOk,
  fieldInput,
  fmtTime,
  fromLocalInput,
  muted,
  numOrNull,
  primaryBtn,
  sectionCard,
  toLocalInput,
} from "./tripUi";

export type FinishDeliverySubmit = {
  times: StepTimes;
  delayReasonId: string | null;
  delayNote: string | null;
  delivered: DeliveredCompartment[];
  retained: DeliveredCompartment[];
  tanks: DeliveryTankReading[];
  consigneeName: string | null;
  consigneeSignature: string | null;
  signed: boolean;
  endMiles: number | null;
};

export type DeliveryProgress = {
  beginAt?: string;
  delayReasonId?: string | null;
  delayNote?: string | null;
  tanks?: DeliveryTankReading[];
  compTanks?: { compartment_load_id: string; tank_number: string | null }[];
};

export type ProductInfo = { name: string; code: string; hex: string | null };

const RETAIN = "__retain__";

type Reading = { before: string; after: string };
type Step = { productIdx: number; phase: "before" | "after" };
type Draft = {
  choice: Record<string, string>;
  unit: ReadingUnit;
  extraTanks: { tank_number: string; product_id: string | null }[];
  water: Record<string, string>;
  waterTanks: string[];
  consigneeName: string;
  consigneeSig: string | null;
};

const draftKey = (deliveryId: string) => `proTankr:delivery:${deliveryId}`;
function readDraft(deliveryId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(deliveryId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(deliveryId: string, d: Draft) {
  try {
    localStorage.setItem(draftKey(deliveryId), JSON.stringify(d));
  } catch {
    /* private mode: the trip rows still hold the saved progress */
  }
}
export function clearDeliveryDraft(deliveryId: string) {
  try {
    localStorage.removeItem(draftKey(deliveryId));
  } catch {
    /* ignore */
  }
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const pill = (on: boolean): React.CSSProperties => ({
  padding: "7px 12px", borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.7)",
});
const miniLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4, textTransform: "uppercase" };
const optionBtn: React.CSSProperties = {
  width: "100%", textAlign: "left", padding: "14px 14px", borderRadius: 6, fontSize: 16, fontWeight: 700,
  border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer",
};

function DiscrepancyLine({ d, big }: { d: Discrepancy; big?: boolean }) {
  return (
    <div style={{ fontSize: big ? 14 : 12, color: d.level === "ok" ? muted : DISCREPANCY_COLOR[d.level], fontWeight: d.level === "ok" ? 500 : 700 }}>
      Tanks rose {Math.round(d.rise).toLocaleString("en-US")} gal · delivered {Math.round(d.delivered).toLocaleString("en-US")} ·{" "}
      <span style={{ color: DISCREPANCY_COLOR[d.level] }}>{fmtSignedGallons(d.diff)}</span>
    </div>
  );
}

// Small centered card over everything (the drop-into picker).
function OptionCard({ title, dotColor, children, onClose }: { title: string; dotColor?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: 24, paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 320, maxHeight: "calc(100dvh - 48px)", overflowY: "auto", boxSizing: "border-box",
        background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, padding: 20,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
          {dotColor && <span style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
          {title}
        </div>
        {children}
        <button type="button" onClick={onClose} style={{ marginTop: 4, padding: "12px 0", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function DeliveryDashboard({
  open, title, delivery, compartments, laterAboard, trailerId, savedTanks, locationTanks, settings, reasons,
  otherPlanned, beginMiles, productInfo, signature, onSaveSignature, onSaveProgress, onSubmit, onPark, onClose,
}: {
  // Park Preloaded, offered until Drop / Pump Off begins.
  onPark?: () => void;
  open: boolean;
  title: string;
  delivery: TripDeliveryRow;
  compartments: TripCompartmentLoadRow[]; // aboard and headed here (or unassigned)
  laterAboard: TripCompartmentLoadRow[]; // aboard, headed to another stop
  trailerId: string | null;
  savedTanks: TripDeliveryTankRow[];
  locationTanks: LocationTank[];
  settings: TripSettings;
  reasons: DelayReason[];
  otherPlanned: number; // planned deliveries after this one
  beginMiles: number | null;
  productInfo: (id: string | null) => ProductInfo;
  signature: string | null;
  onSaveSignature: (path: string) => Promise<void>;
  onSaveProgress: (p: DeliveryProgress) => void;
  onSubmit: (v: FinishDeliverySubmit) => void;
  onClose: () => void;
}) {
  const landscape = useIsLandscape(480);
  const [trailerComps, setTrailerComps] = useState<{ comp_number: number; max_gallons: number }[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [unit, setUnit] = useState<ReadingUnit>("gallons");
  const [extraTanks, setExtraTanks] = useState<{ tank_number: string; product_id: string | null }[]>([]);
  const [water, setWater] = useState<Record<string, string>>({});
  const [waterTanks, setWaterTanks] = useState<string[]>([]);
  const [consigneeName, setConsigneeName] = useState("");
  const [consigneeSig, setConsigneeSig] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Pop-outs
  const [pickFor, setPickFor] = useState<string | null>(null); // compartment_load_id
  const [newTankFor, setNewTankFor] = useState<string | null>(null);
  const [newTankText, setNewTankText] = useState("");
  const [beginOpen, setBeginOpen] = useState(false);
  // "recap": opened by Finish Delivery, continues into the finish window.
  // "edit": the "Drop began" row, just saves.
  const [beginMode, setBeginMode] = useState<"recap" | "edit">("edit");
  const [beginText, setBeginText] = useState("");
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [beginErr, setBeginErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [stepErr, setStepErr] = useState<string | null>(null);
  const [waterOpen, setWaterOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [departText, setDepartText] = useState("");
  const [endMiles, setEndMiles] = useState("");
  const [signed, setSigned] = useState(false);
  const [finishErr, setFinishErr] = useState<string | null>(null);
  const [consigneeOpen, setConsigneeOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cSig, setCSig] = useState<string | null>(null);
  const [cErr, setCErr] = useState<string | null>(null);
  const onCSig = React.useCallback((p: string | null) => setCSig(p), []);

  // Trailer compartment sizes, for the bar widths.
  useEffect(() => {
    if (!open || !trailerId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("trailer_compartments").select("comp_number, max_gallons").eq("trailer_id", trailerId);
      if (!cancelled && data) {
        setTrailerComps((data as any[]).map((r) => ({ comp_number: Number(r.comp_number), max_gallons: Number(r.max_gallons ?? 0) })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, trailerId]);

  // Load saved progress when the screen opens.
  useEffect(() => {
    if (!open) {
      setHydrated(false);
      return;
    }
    const d = readDraft(delivery.delivery_id);
    const r: Record<string, Reading> = {};
    const w: Record<string, string> = {};
    for (const t of savedTanks) {
      r[t.tank_number] = { before: str(t.before_reading), after: str(t.after_reading) };
      if (t.water_reading != null) w[t.tank_number] = str(t.water_reading);
    }
    setReadings(r);
    setWater(d?.water ?? w);
    setWaterTanks(d?.waterTanks ?? Object.keys(w));
    setUnit(savedTanks.find((t) => t.reading_unit)?.reading_unit ?? d?.unit ?? "gallons");
    const extra = d?.extraTanks ?? [];
    for (const t of savedTanks) {
      if (!extra.some((x) => x.tank_number === t.tank_number)) extra.push({ tank_number: t.tank_number, product_id: t.product_id });
    }
    setExtraTanks(extra);
    setConsigneeName(d?.consigneeName ?? delivery.consignee_name ?? "");
    setConsigneeSig(d?.consigneeSig ?? delivery.consignee_signature ?? null);
    const ch: Record<string, string> = {};
    for (const c of compartments) {
      ch[c.compartment_load_id] = d?.choice?.[c.compartment_load_id]
        ?? c.tank_number ?? suggestTank(c.product_id, locationTanks) ?? "";
    }
    setChoice(ch);
    setPickFor(null);
    setStep(null);
    setFinishOpen(false);
    setBeginOpen(false);
    setConsigneeOpen(false);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, delivery.delivery_id]);

  // New compartments (a reroute brought one here) get a default pick.
  useEffect(() => {
    if (!open || !hydrated) return;
    setChoice((m) => {
      let changed = false;
      const next = { ...m };
      for (const c of compartments) {
        if (next[c.compartment_load_id] == null) {
          next[c.compartment_load_id] = c.tank_number ?? suggestTank(c.product_id, locationTanks) ?? "";
          changed = true;
        }
      }
      return changed ? next : m;
    });
  }, [open, hydrated, compartments, locationTanks]);

  // Keep the phone-only parts of the draft.
  useEffect(() => {
    if (!open || !hydrated) return;
    writeDraft(delivery.delivery_id, { choice, unit, extraTanks, water, waterTanks, consigneeName, consigneeSig });
  }, [open, hydrated, delivery.delivery_id, choice, unit, extraTanks, water, waterTanks, consigneeName, consigneeSig]);

  const rows = useMemo(() => [...compartments].sort((a, b) => a.comp_number - b.comp_number), [compartments]);
  const gross = (c: TripCompartmentLoadRow) => Number(c.gross_gallons ?? c.net_gallons ?? 0);
  const delivered = rows.filter((c) => choice[c.compartment_load_id] && choice[c.compartment_load_id] !== RETAIN);
  const retained = rows.filter((c) => choice[c.compartment_load_id] === RETAIN);
  const unpicked = rows.filter((c) => !choice[c.compartment_load_id]);
  const dropped = !!delivery.begin_at;
  const pumpOff = delivery.delivery_type === "pump_off";
  const dropWord = pumpOff ? "Pump Off" : "Drop";
  const nextLeg = retained.length > 0 || otherPlanned > 0;
  const isLast = !nextLeg;
  const unitSuffix = unit === "gallons" ? "gal" : "in";

  // Products dropped here, each with every store tank that holds it plus any
  // tank a compartment was sent into.
  const products = useMemo(() => {
    const ids: (string | null)[] = [];
    for (const c of delivered) if (!ids.includes(c.product_id)) ids.push(c.product_id);
    return ids.map((pid) => {
      const comps = delivered.filter((c) => c.product_id === pid);
      const tanks = tanksForProduct(pid, locationTanks, extraTanks);
      for (const c of comps) {
        const t = choice[c.compartment_load_id];
        if (t && !tanks.includes(t)) tanks.push(t);
      }
      return { productId: pid, comps, tanks, gallons: comps.reduce((t, c) => t + gross(c), 0) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivered.map((c) => `${c.compartment_load_id}:${choice[c.compartment_load_id]}`).join("|"), locationTanks, extraTanks]);
  const allTanks = useMemo(() => [...new Set(products.flatMap((p) => p.tanks))], [products]);

  const intoTank = (n: string) => delivered.filter((c) => choice[c.compartment_load_id] === n).reduce((t, c) => t + gross(c), 0);
  const pairsFor = (tanks: string[]) => tanks.map((n) => ({ before: numOrNull(readings[n]?.before ?? ""), after: numOrNull(readings[n]?.after ?? "") }));
  const discrepancyFor = (p: (typeof products)[number]) => tankDiscrepancy(p.gallons, pairsFor(p.tanks), unit);
  const readingsDone = (p: (typeof products)[number]) =>
    p.tanks.length > 0 && pairsFor(p.tanks).every((x) => x.before != null && x.after != null);

  const setReading = (num: string, patch: Partial<Reading>) =>
    setReadings((m) => ({ ...m, [num]: { ...{ before: "", after: "" }, ...m[num], ...patch } }));

  const buildTanks = (): DeliveryTankReading[] => {
    const saved = new Set(savedTanks.map((t) => t.tank_number));
    const out: DeliveryTankReading[] = [];
    for (const p of products) {
      for (const n of p.tanks) {
        const before = numOrNull(readings[n]?.before ?? "");
        const after = numOrNull(readings[n]?.after ?? "");
        const w = waterTanks.includes(n) ? numOrNull(water[n] ?? "") : null;
        if (before == null && after == null && w == null && !saved.has(n)) continue;
        if (out.some((t) => t.tank_number === n)) continue;
        out.push({ tank_number: n, product_id: p.productId, before_reading: before, after_reading: after, water_reading: w, reading_unit: unit });
      }
    }
    return out;
  };
  const compTanks = () => rows.map((c) => {
    const v = choice[c.compartment_load_id];
    return { compartment_load_id: c.compartment_load_id, tank_number: v && v !== RETAIN ? v : null };
  });

  // ── Drop-into picker ───────────────────────────────────────────────────────
  const pickRow = pickFor ? rows.find((c) => c.compartment_load_id === pickFor) ?? null : null;
  const pickInfo = pickRow ? productInfo(pickRow.product_id) : null;
  const pickTanks = pickRow
    ? (() => {
        const ts = tanksForProduct(pickRow.product_id, locationTanks, extraTanks);
        const cur = choice[pickRow.compartment_load_id];
        if (cur && cur !== RETAIN && !ts.includes(cur)) ts.push(cur);
        return ts;
      })()
    : [];
  const choose = (id: string, v: string) => {
    setChoice((m) => ({ ...m, [id]: v }));
    setPickFor(null);
    if (dropped) onSaveProgress({ compTanks: [{ compartment_load_id: id, tank_number: v === RETAIN ? null : v }] });
  };
  const addNewTank = () => {
    const n = newTankText.trim();
    const row = newTankFor ? rows.find((c) => c.compartment_load_id === newTankFor) : null;
    if (!n || !row) return;
    setExtraTanks((xs) => (xs.some((x) => x.tank_number === n && x.product_id === row.product_id) ? xs : [...xs, { tank_number: n, product_id: row.product_id }]));
    choose(row.compartment_load_id, n);
    setNewTankFor(null);
    setNewTankText("");
  };

  // ── Drop / Pump Off: start time ────────────────────────────────────────────
  const arrivedAt = delivery.arrived_at ?? delivery.begin_at ?? new Date().toISOString();
  const beginIso = fromLocalInput(beginText) || "";
  const beginTimes: StepTimes = { arrivedAt, beginAt: beginIso || arrivedAt, leftAt: beginIso || arrivedAt };
  // Gallons going into each tank (for closing the order in dispatch), in tank order.
  const tankTotals = useMemo(() => {
    const m = new Map<string, { tank: string; productId: string | null; comps: number[]; gross: number; net: number; netAll: boolean }>();
    for (const c of delivered) {
      const t = choice[c.compartment_load_id];
      const e = m.get(t) ?? { tank: t, productId: c.product_id, comps: [], gross: 0, net: 0, netAll: true };
      e.comps.push(c.comp_number);
      e.gross += gross(c);
      const n = c.net_gallons == null ? NaN : Number(c.net_gallons);
      if (Number.isFinite(n)) e.net += n; else e.netAll = false;
      m.set(t, e);
    }
    return [...m.values()].sort((a, b) => a.tank.localeCompare(b.tank, undefined, { numeric: true }));
  }, [delivered, choice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop / Pump Off: tapped before getting out. Stamps the start time and
  // nothing else; the recap of how it went comes at Finish Delivery.
  const tapDrop = () => {
    if (rows.length === 0) return;
    onSaveProgress({ beginAt: new Date().toISOString(), compTanks: compTanks() });
  };
  const openRecap = () => {
    if (unpicked.length) {
      setPickFor(unpicked[0].compartment_load_id);
      return;
    }
    openBegin("recap");
  };
  const openBegin = (mode: "recap" | "edit" = "edit") => {
    setBeginErr(null);
    setBeginMode(mode);
    setBeginText(toLocalInput(delivery.begin_at ?? new Date().toISOString()));
    setReasonId(delivery.delay_reason_id ?? null);
    setNote(delivery.delay_note ?? "");
    setBeginOpen(true);
  };
  const saveBegin = () => {
    if (!beginIso) return setBeginErr("Enter the time.");
    if (Date.parse(beginIso) < Date.parse(arrivedAt)) return setBeginErr(`Can't be before you arrived (${fmtTime(arrivedAt)}).`);
    if (!delayReasonOk(beginTimes, settings.delivery_delay_threshold_minutes, reasonId, note)) return setBeginErr("Pick a delay reason.");
    const need = needsDelayReason(delayMinutes(arrivedAt, beginIso), settings.delivery_delay_threshold_minutes);
    onSaveProgress({
      beginAt: beginIso,
      delayReasonId: need ? reasonId : null,
      delayNote: need && !reasonId ? note.trim() || null : null,
      compTanks: compTanks(),
    });
    setBeginOpen(false);
    if (beginMode === "recap") openFinish();
  };

  // ── Tank readings ──────────────────────────────────────────────────────────
  const cur = step ? products[step.productIdx] : null;
  const curName = cur ? productInfo(cur.productId).name : "";
  const closeReadings = () => {
    setStep(null);
    onSaveProgress({ tanks: buildTanks() });
  };
  const fillAfters = (p: (typeof products)[number]) => {
    setReadings((m) => {
      const next = { ...m };
      for (const n of p.tanks) {
        const r = next[n] ?? { before: "", after: "" };
        if (r.after.trim()) continue;
        const v = prefillAfter(numOrNull(r.before), intoTank(n), unit);
        if (v != null) next[n] = { ...r, after: String(v) };
      }
      return next;
    });
  };
  const goBack = () => {
    setStepErr(null);
    if (!step) return;
    if (step.phase === "after") return setStep({ ...step, phase: "before" });
    if (step.productIdx > 0) return setStep({ productIdx: step.productIdx - 1, phase: "after" });
    closeReadings();
  };
  const goNext = () => {
    if (!step || !cur) return;
    if (cur.tanks.length === 0) return setStepErr("Pick a tank for this product first.");
    setStepErr(null);
    if (step.phase === "before") {
      fillAfters(cur);
      return setStep({ ...step, phase: "after" });
    }
    if (step.productIdx < products.length - 1) return setStep({ productIdx: step.productIdx + 1, phase: "before" });
    closeReadings();
  };
  const stepFields = cur && step
    ? cur.tanks.map((n) => ({
        key: `${step.phase}:${n}`,
        label: `Tank ${n}`,
        value: readings[n]?.[step.phase] ?? "",
        onChange: (v: string) => setReading(n, { [step.phase]: v } as Partial<Reading>),
        suffix: unitSuffix,
        decimal: true,
      }))
    : [];
  const curDisc = cur ? discrepancyFor(cur) : null;
  const stepFooter = cur && step ? (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {step.phase === "before" && (
        <div>
          <div style={{ ...miniLabel, marginBottom: 6 }}>Reading in</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={pill(unit === "gallons")} onClick={() => setUnit("gallons")}>Gallons</button>
            <button type="button" style={pill(unit === "inches")} onClick={() => setUnit("inches")}>Inches</button>
          </div>
        </div>
      )}
      {step.phase === "after" && (curDisc
        ? <DiscrepancyLine d={curDisc} big />
        : unit === "inches"
          ? <div style={{ fontSize: 12, color: muted }}>Inches can&apos;t be compared to the load. Dispatch converts them with the tank chart.</div>
          : null)}
    </div>
  ) : null;
  const stepHint = cur && step
    ? step.phase === "before"
      ? cur.tanks.length > 1 ? `Every ${curName} tank, even ones you're not dropping into.` : undefined
      : unit === "gallons" ? "Prefilled with before + what went in. Fix it to match the receipt." : undefined
    : undefined;

  const waterFields = waterTanks.filter((n) => allTanks.includes(n)).map((n) => ({
    key: `w:${n}`, label: `Tank ${n}`, value: water[n] ?? "", decimal: true, suffix: "in",
    onChange: (v: string) => setWater((m) => ({ ...m, [n]: v })),
  }));
  const waterEntered = waterTanks.filter((n) => allTanks.includes(n) && numOrNull(water[n] ?? "") != null);

  // ── Consignee ──────────────────────────────────────────────────────────────
  const openConsignee = () => {
    setCName(consigneeName);
    setCSig(consigneeSig);
    setCErr(null);
    setConsigneeOpen(true);
  };
  const applyConsignee = () => {
    if (!cName.trim()) return setCErr("Print the consignee's name.");
    if (!cSig) return setCErr("They need to sign.");
    setConsigneeName(cName.trim());
    setConsigneeSig(cSig);
    setConsigneeOpen(false);
  };

  // ── Finish ─────────────────────────────────────────────────────────────────
  const openFinish = () => {
    // Company requires readings: Finish opens the first product still missing
    // them instead of the finish form.
    if (settings.require_tank_readings) {
      const missing = products.findIndex((p) => !readingsDone(p));
      if (missing >= 0) {
        setStepErr("Tank readings are required before you can finish.");
        setStep({ productIdx: missing, phase: "before" });
        return;
      }
    }
    setFinishErr(null);
    setDepartText(toLocalInput(new Date().toISOString()));
    setEndMiles("");
    setSigned(false);
    setFinishOpen(true);
  };
  const departIso = fromLocalInput(departText) || "";
  const submit = () => {
    const times: StepTimes = { arrivedAt, beginAt: delivery.begin_at ?? arrivedAt, leftAt: departIso };
    const tp = timesProblem(times);
    if (tp) return setFinishErr(tp);
    if (delivered.length === 0) return setFinishErr(`Pick a tank for at least one compartment. Nothing was dropped here.`);
    if (unpicked.length) return setFinishErr(`Pick a tank or Retain for C${unpicked.map((c) => c.comp_number).join(", C")}.`);
    if (settings.require_tank_readings && products.some((p) => !readingsDone(p))) return setFinishErr("Enter before and after readings for every tank.");
    if (settings.require_consignee_signature && !consigneeSig) return setFinishErr("Get the consignee's signature first.");
    let miles: number | null = null;
    if (isLast) {
      miles = numOrNull(endMiles);
      if (miles == null) return setFinishErr("Enter ending miles.");
      if (beginMiles != null && miles < beginMiles) return setFinishErr(`Ending miles can't be less than beginning (${beginMiles}).`);
    }
    if (!signed) return setFinishErr("Accept your signature to finish.");
    const toDc = (c: TripCompartmentLoadRow, tank: string | null): DeliveredCompartment => ({
      compartment_load_id: c.compartment_load_id, comp_number: c.comp_number, product_id: c.product_id, tank_number: tank,
    });
    onSubmit({
      times,
      delayReasonId: delivery.delay_reason_id ?? null,
      delayNote: delivery.delay_note ?? null,
      delivered: delivered.map((c) => toDc(c, choice[c.compartment_load_id])),
      retained: retained.map((c) => toDc(c, null)),
      tanks: buildTanks(),
      consigneeName: consigneeName.trim() || null,
      consigneeSignature: consigneeSig,
      signed,
      endMiles: miles,
    });
  };

  // ── Compartment bars (Planner look, right to left) ─────────────────────────
  const barSlots = useMemo(() => {
    const nums = new Set<number>(trailerComps.map((c) => c.comp_number));
    for (const c of [...rows, ...laterAboard]) nums.add(c.comp_number);
    const list = [...nums].sort((a, b) => b - a).map((n) => {
      const here = rows.find((c) => c.comp_number === n) ?? null;
      const later = here ? null : laterAboard.find((c) => c.comp_number === n) ?? null;
      const row = here ?? later;
      const max = trailerComps.find((c) => c.comp_number === n)?.max_gallons || (row ? gross(row) : 0) || 1;
      return { n, here, later, max };
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailerComps, rows, laterAboard]);
  const totalMax = barSlots.reduce((t, s) => t + s.max, 0) || 1;
  const nBars = barSlots.length || 1;
  const gap = landscape ? 12 : nBars >= 5 ? 10 : 16;
  const barH = landscape ? "100px" : nBars >= 5 ? "min(110px, 20vw)" : nBars >= 4 ? "min(120px, 22vw)" : "min(130px, 25vw)";

  const tanksDoneAll = products.length > 0 && products.every(readingsDone);
  const bigLabel = dropped ? "Finish Delivery" : dropWord;
  const bigDetail = dropped
    ? unpicked.length
      ? `${pumpOff ? "Pumping" : "Dropping"} since ${fmtTime(delivery.begin_at)} · pick a tank or Retain for C${unpicked.map((c) => c.comp_number).join(", C")}`
      : `${pumpOff ? "Pumping" : "Dropping"} since ${fmtTime(delivery.begin_at)} · tap when you're done`
    : `Arrived ${fmtTime(arrivedAt)} · tap before you get out to ${pumpOff ? "pump off" : "drop"}`;

  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      {/* Compartments */}
      <div style={{ ...sectionCard, padding: "14px 10px" }}>
        {barSlots.length === 0 ? (
          <div style={{ fontSize: 14, color: muted }}>Nothing aboard for this delivery.</div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", gap, alignItems: "flex-start", width: "100%" }}>
            {barSlots.map((s) => {
              const row = s.here ?? s.later;
              const info = row ? productInfo(row.product_id) : null;
              const color = info ? info.hex ?? productColorFor(info.name) : "rgba(255,255,255,0.08)";
              const g = row ? gross(row) : 0;
              const fill = row ? Math.max(0, Math.min(1, g / s.max)) * 0.96 : 0;
              const w = `calc(${((s.max / totalMax) * 100).toFixed(4)}% - ${(((nBars - 1) * gap) / nBars).toFixed(2)}px)`;
              const ch = s.here ? choice[s.here.compartment_load_id] ?? "" : "";
              const dim = !s.here;
              return (
                <div key={s.n} style={{ width: w, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", opacity: dim ? 0.4 : 1 }}>
                  <div style={{ fontSize: "clamp(11px, 2.4vw, 13px)", fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>{s.n}</div>
                  <div style={{ width: "100%", height: barH, background: "rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fill * 100}%`, background: color }} />
                  </div>
                  <div style={{ marginTop: 5, fontSize: "clamp(11px, 2.8vw, 14px)", fontWeight: 800, color: info ? info.hex ?? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)", letterSpacing: 0.3 }}>
                    {info ? info.code : "MT"}
                  </div>
                  <div style={{ marginTop: 2, fontSize: "clamp(10px, 2.4vw, 13px)", fontWeight: 600, color: g > 0 ? "rgba(140,140,140,0.9)" : "rgba(255,255,255,0.12)" }}>
                    {g > 0 ? Math.round(g).toLocaleString("en-US") : "—"}
                  </div>
                  {s.here ? (
                    <button type="button" onClick={() => setPickFor(s.here!.compartment_load_id)}
                      style={{
                        marginTop: 8, width: "100%", minWidth: 0, padding: "8px 2px", borderRadius: 6, cursor: "pointer",
                        fontSize: "clamp(11px, 2.8vw, 13px)", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        border: ch ? "1px solid rgba(255,255,255,0.25)" : "1px solid #fbbf24",
                        background: ch === RETAIN ? "rgba(147,197,253,0.12)" : "rgba(255,255,255,0.04)",
                        color: ch === RETAIN ? "#93c5fd" : ch ? "#fff" : "#fbbf24",
                      }}>
                      {ch === RETAIN ? "Retain" : ch ? `Tank ${ch}` : "Tank ▾"}
                    </button>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 11, color: muted, padding: "8px 0" }}>{s.later ? "Next stop" : ""}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {retained.length > 0 && (
          <div style={{ fontSize: 12, color: "#93c5fd", marginTop: 12, textAlign: "center" }}>
            Retained compartments stay aboard. Complete, then pick the next delivery or Park preloaded for another driver.
          </div>
        )}
      </div>

      {/* Readings + consignee */}
      <div style={{ ...sectionCard, padding: 0 }}>
        {dropped && (
          <button type="button" onClick={() => openBegin("edit")} style={rowBtn}>
            <span style={{ color: muted, width: 110 }}>{pumpOff ? "Pump off" : "Drop"} began</span>
            <span style={{ flex: 1 }}>{fmtTime(delivery.begin_at)}</span>
            <span style={{ color: muted }}>Edit ›</span>
          </button>
        )}
        {products.map((p, i) => {
          const info = productInfo(p.productId);
          const d = discrepancyFor(p);
          const done = readingsDone(p);
          return (
            <button key={p.productId ?? `none${i}`} type="button" onClick={() => { setStepErr(null); setStep({ productIdx: i, phase: "before" }); }}
              style={{ ...rowBtn, display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: info.hex ?? productColorFor(info.name), flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>{info.name} readings</span>
                <span style={{ fontSize: 13, color: done ? muted : dropped ? "#fbbf24" : muted, fontWeight: done ? 500 : 700 }}>
                  {done ? `${p.tanks.length} tank${p.tanks.length === 1 ? "" : "s"}${unit === "inches" ? " · in" : ""} ✓` : settings.require_tank_readings ? "Enter ›" : "Optional ›"}
                </span>
              </div>
              {d && <div style={{ marginTop: 4, paddingLeft: 18 }}><DiscrepancyLine d={d} /></div>}
            </button>
          );
        })}
        {products.length > 0 && (
          <button type="button" onClick={() => { if (waterTanks.length === 0 && allTanks.length === 1) setWaterTanks(allTanks); setWaterOpen(true); }}
            style={{ ...rowBtn, color: waterEntered.length ? "#60a5fa" : muted, fontSize: 13, fontWeight: 700 }}>
            {waterEntered.length ? `Water: ${waterEntered.map((n) => `Tank ${n} ${water[n]} in`).join(", ")} ›` : "Water present? Tap to record"}
          </button>
        )}
        <button type="button" onClick={openConsignee} style={{ ...rowBtn, borderBottom: "none" }}>
          <span style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900,
            background: consigneeSig ? "#22c55e" : "transparent", color: "#000",
            border: consigneeSig ? "none" : "1.5px solid rgba(255,255,255,0.3)",
          }}>
            {consigneeSig ? "✓" : ""}
          </span>
          <span style={{ flex: 1, fontWeight: 700 }}>
            Consignee signature{consigneeSig && consigneeName ? ` · ${consigneeName}` : ""}
          </span>
          <span style={{ color: settings.require_consignee_signature && !consigneeSig ? "#fbbf24" : muted, fontSize: 13 }}>
            {consigneeSig ? "Redo ›" : settings.require_consignee_signature ? "Required ›" : "Optional ›"}
          </span>
        </button>
      </div>

      <button type="button" onClick={dropped ? openRecap : tapDrop} disabled={rows.length === 0}
        style={{ ...primaryBtn, fontSize: 20, padding: "20px 0", opacity: rows.length === 0 ? 0.5 : 1 }}>
        {bigLabel}
      </button>
      <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 6 }}>
        {bigDetail}
        {dropped && products.length > 0 && !tanksDoneAll && settings.require_tank_readings ? " · tank readings required" : ""}
      </div>
      {!dropped && onPark && (
        <button type="button" onClick={onPark}
          style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", color: "#93c5fd", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Not dropping here? Park preloaded
        </button>
      )}

      {/* Drop-into picker */}
      {pickRow && pickInfo && (
        <OptionCard title={`C${pickRow.comp_number} · ${pickInfo.code} · drop into`} dotColor={pickInfo.hex ?? productColorFor(pickInfo.name)} onClose={() => setPickFor(null)}>
          {pickTanks.length === 0 && <div style={{ fontSize: 13, color: muted }}>No saved {pickInfo.name} tank here yet.</div>}
          {pickTanks.map((n) => (
            <button key={n} type="button" onClick={() => choose(pickRow.compartment_load_id, n)}
              style={{ ...optionBtn, borderColor: choice[pickRow.compartment_load_id] === n ? "#fff" : optionBtn.border as string }}>
              Tank {n}
            </button>
          ))}
          <button type="button" onClick={() => { setNewTankFor(pickRow.compartment_load_id); setNewTankText(""); setPickFor(null); }}
            style={{ ...optionBtn, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
            + Other tank #
          </button>
          <button type="button" onClick={() => choose(pickRow.compartment_load_id, RETAIN)}
            style={{ ...optionBtn, color: "#93c5fd", borderColor: choice[pickRow.compartment_load_id] === RETAIN ? "#93c5fd" : "rgba(147,197,253,0.35)" }}>
            Retain on trailer
            <div style={{ fontSize: 12, fontWeight: 500, color: muted, marginTop: 2 }}>Keep it aboard for the next leg</div>
          </button>
        </OptionCard>
      )}

      <ValueEntryOverlay
        open={!!newTankFor}
        title="Tank number"
        fields={[{ key: "t", label: "Tank", value: newTankText, onChange: setNewTankText, text: true }]}
        onCancel={() => setNewTankFor(null)}
        submitLabel="Use"
        onSubmit={addNewTank}
      />

      {/* Start time */}
      <ValueEntryOverlay
        open={beginOpen}
        title={beginMode === "recap" ? `${dropWord} recap` : `${dropWord} · start time`}
        fields={[]}
        footer={
          <div style={{ width: "100%" }}>
            {tankTotals.length > 0 && (
              <div style={{ marginBottom: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ ...miniLabel, marginBottom: 4 }}>Into each tank</div>
                {tankTotals.map((t) => {
                  const info = productInfo(t.productId);
                  return (
                    <div key={t.tank} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 0", fontSize: 14 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: info.hex ?? productColorFor(info.name) }} />
                      <span style={{ fontWeight: 800 }}>Tank {t.tank}</span>
                      <span style={{ color: muted, fontSize: 12, flex: 1, minWidth: 0 }}>{info.code} · C{[...t.comps].sort((a, b) => a - b).join(", C")}</span>
                      <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                        {Math.round(t.gross).toLocaleString("en-US")} gal
                        {t.netAll && t.net > 0 && <span style={{ color: muted, fontWeight: 600, fontSize: 12 }}> · net {Math.round(t.net).toLocaleString("en-US")}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <input type="datetime-local" value={beginText} onChange={(e) => setBeginText(e.target.value)} style={{ ...fieldInput, marginBottom: 10 }} />
            <DelayReasonField times={beginTimes} threshold={settings.delivery_delay_threshold_minutes} reasons={reasons} kind="delivery"
              reasonId={reasonId} note={note} onChange={(id, n) => { setReasonId(id); setNote(n); }} />
          </div>
        }
        hint={`Arrived ${fmtTime(arrivedAt)}`}
        error={beginErr}
        onCancel={() => setBeginOpen(false)}
        submitLabel={beginMode === "recap" ? "Continue" : "Save"}
        onSubmit={saveBegin}
      />

      <ValueEntryOverlay
        open={!!cur && !!step}
        title={cur && step ? `${curName}${cur.tanks.length === 1 ? ` · Tank ${cur.tanks[0]}` : ""} · ${step.phase === "before" ? "Before" : "After"}` : ""}
        dotColor={cur ? productInfo(cur.productId).hex ?? productColorFor(curName) : undefined}
        fields={stepFields}
        footer={stepFooter}
        hint={stepHint}
        error={stepErr}
        cancelLabel={step && (step.phase === "after" || step.productIdx > 0) ? "‹ Back" : "Close"}
        onCancel={goBack}
        submitLabel={step && step.phase === "after" && step.productIdx === products.length - 1 ? "Done" : "Next"}
        onSubmit={goNext}
      />

      <ValueEntryOverlay
        open={waterOpen}
        title="Water (inches)"
        fields={waterFields}
        footer={
          <div style={{ width: "100%" }}>
            <div style={{ ...miniLabel, marginBottom: 6 }}>Tanks with water</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allTanks.map((n) => {
                const on = waterTanks.includes(n);
                return (
                  <button key={n} type="button" style={pill(on)} onClick={() => setWaterTanks((ts) => (on ? ts.filter((x) => x !== n) : [...ts, n]))}>
                    Tank {n}
                  </button>
                );
              })}
            </div>
            {allTanks.length === 0 && <div style={{ fontSize: 12, color: muted }}>Pick tanks for the compartments first.</div>}
            {waterTanks.length > 0 && (
              <button type="button" onClick={() => { setWaterTanks([]); setWater({}); setWaterOpen(false); onSaveProgress({ tanks: buildTanks() }); }}
                style={{ marginTop: 10, background: "transparent", border: "none", padding: 0, color: muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                No water after all, clear it
              </button>
            )}
          </div>
        }
        cancelLabel="Close"
        onCancel={() => setWaterOpen(false)}
        submitLabel="Done"
        onSubmit={() => { setWaterOpen(false); onSaveProgress({ tanks: buildTanks() }); }}
      />

      {/* Finish */}
      <ValueEntryOverlay
        open={finishOpen}
        title="Finish Delivery"
        fields={isLast ? [{ key: "miles", label: "Enter ending miles", value: endMiles, onChange: setEndMiles, decimal: true, showLabel: true }] : []}
        footer={
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
            {isLast && beginMiles != null && <div style={{ fontSize: 12, color: muted, marginTop: -6 }}>Beginning: {beginMiles.toLocaleString("en-US")}</div>}
            <div>
              <div style={{ ...miniLabel, marginBottom: 4 }}>Finished</div>
              <input type="datetime-local" value={departText} onChange={(e) => setDepartText(e.target.value)} style={fieldInput} />
            </div>
            {retained.length > 0 && (
              <div style={{ fontSize: 12, color: "#93c5fd" }}>
                C{retained.map((c) => c.comp_number).join(", C")} stay aboard. You&apos;ll pick the next delivery after this.
              </div>
            )}
            <SignatureAccept savedPath={signature} onSave={onSaveSignature} accepted={signed} onAccept={setSigned} who="the delivering driver" />
          </div>
        }
        error={finishErr}
        onCancel={() => setFinishOpen(false)}
        submitLabel={nextLeg ? "Complete · Next Leg" : "Complete"}
        onSubmit={submit}
      />

      {/* Consignee signature: a card in portrait, the whole screen sideways */}
      {consigneeOpen && (
        <div onClick={() => setConsigneeOpen(false)} style={{
          position: "fixed", inset: 0, zIndex: 520, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: landscape ? "stretch" : "flex-start", justifyContent: "center",
          padding: landscape ? 0 : 24, paddingTop: landscape ? 0 : "calc(env(safe-area-inset-top, 0px) + 24px)",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: landscape ? "none" : 420, boxSizing: "border-box",
            background: "#161616", border: landscape ? "none" : "1px solid rgba(255,255,255,0.12)", borderRadius: landscape ? 0 : 4,
            padding: landscape ? "calc(env(safe-area-inset-top, 0px) + 10px) calc(env(safe-area-inset-right, 0px) + 16px) 10px calc(env(safe-area-inset-left, 0px) + 16px)" : 20,
            display: "flex", flexDirection: "column", gap: 10, overflowY: "auto",
          }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap" }}>Consignee</div>
              <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Printed name"
                style={{ ...fieldInput, flex: 1, padding: "8px 10px", fontSize: 16 }} />
            </div>
            <SignaturePad key={consigneeOpen ? "open" : "closed"} onChange={onCSig} fill={landscape} initial={consigneeSig} />
            {!landscape && <div style={{ fontSize: 11, color: muted }}>Turn the phone sideways for a bigger pad.</div>}
            {cErr && <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>{cErr}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setConsigneeOpen(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              {consigneeSig && (
                <button type="button" onClick={() => { setConsigneeName(""); setConsigneeSig(null); setConsigneeOpen(false); }}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "1px solid rgba(248,113,113,0.5)", background: "transparent", color: "#f87171", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Remove
                </button>
              )}
              <button type="button" onClick={applyConsignee} style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </FullscreenModal>
  );
}

const rowBtn: React.CSSProperties = {
  width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
  background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
  padding: "14px 14px", color: "#fff", fontSize: 14, cursor: "pointer",
};
