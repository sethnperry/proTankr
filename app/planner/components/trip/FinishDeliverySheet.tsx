"use client";
// app/planner/components/trip/FinishDeliverySheet.tsx
//
// Finish Delivery (docs/trip-workflow-design.md §8, §9): which compartments
// were delivered, tank readings, the three times, consignee and driver
// signatures, and ending miles on the last delivery. Compartments left
// unchecked can be sent to another delivery (split); on the last delivery
// anything still aboard is kept as Retained.
//
// Tank readings are entered in pop-out windows, one product at a time:
// before readings for EVERY store tank of that product (plus which tank each
// compartment went into), then after readings. The total rise is compared to
// what was delivered (lib/trips/tankReadings.ts). Readings can be switched to
// inches when the tank monitor is down. Water is an optional pop-out.

import React, { useEffect, useMemo, useState } from "react";
import ValueEntryOverlay from "@/app/planner/components/ValueEntryOverlay";
import { productColorFor } from "@/app/planner/utils/productColor";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import {
  defaultStepTimes,
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
  TimesEditor,
  dashedBtn,
  delayReasonOk,
  fieldInput,
  muted,
  numOrNull,
  primaryBtn,
  sectionCard,
  sectionTitle,
} from "./tripUi";

export type FinishDeliverySubmit = {
  times: StepTimes;
  delayReasonId: string | null;
  delayNote: string | null;
  delivered: DeliveredCompartment[];
  tanks: DeliveryTankReading[];
  consigneeName: string | null;
  consigneeSignature: string | null;
  signed: boolean;
  endMiles: number | null;
};


type CompRow = {
  id: string;
  comp: number;
  productId: string | null;
  gallons: number | null; // shown on the row (net, else gross)
  gross: number | null; // compared to the tank rise
  checked: boolean;
  tank: string;
};
type Reading = { before: string; after: string };
type Step = { productIdx: number; phase: "before" | "after" };

const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const pill = (on: boolean): React.CSSProperties => ({
  padding: "7px 12px", borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.7)",
});
const miniLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4, textTransform: "uppercase" };

function DiscrepancyLine({ d, big }: { d: Discrepancy; big?: boolean }) {
  return (
    <div style={{ fontSize: big ? 14 : 12, color: d.level === "ok" ? muted : DISCREPANCY_COLOR[d.level], fontWeight: d.level === "ok" ? 500 : 700 }}>
      Tanks rose {Math.round(d.rise).toLocaleString("en-US")} gal · delivered {Math.round(d.delivered).toLocaleString("en-US")} ·{" "}
      <span style={{ color: DISCREPANCY_COLOR[d.level] }}>{fmtSignedGallons(d.diff)}</span>
    </div>
  );
}

export function FinishDeliverySheet({
  open, title, delivery, compartments, savedTanks, locationTanks, settings, reasons, isLast, beginMiles,
  productName, signature, onSaveSignature, onSplit, onSubmit, onClose,
}: {
  open: boolean;
  title: string;
  delivery: TripDeliveryRow;
  compartments: TripCompartmentLoadRow[]; // aboard and headed here (or unassigned)
  savedTanks: TripDeliveryTankRow[]; // readings already entered for this delivery
  locationTanks: LocationTank[]; // the saved location's tanks
  settings: TripSettings;
  reasons: DelayReason[];
  isLast: boolean;
  beginMiles: number | null;
  productName: (id: string | null) => string;
  signature: string | null;
  onSaveSignature: (path: string) => Promise<void>;
  onSplit: (compartmentLoadIds: string[]) => void;
  onSubmit: (v: FinishDeliverySubmit) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CompRow[]>([]);
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [unit, setUnit] = useState<ReadingUnit>("gallons");
  // Tanks typed in (no saved location tank for the product) or read before.
  const [extraTanks, setExtraTanks] = useState<{ tank_number: string; product_id: string | null }[]>([]);
  const [water, setWater] = useState<Record<string, string>>({});
  const [waterTanks, setWaterTanks] = useState<string[]>([]);
  const [step, setStep] = useState<Step | null>(null);
  const [waterOpen, setWaterOpen] = useState(false);
  const [newTank, setNewTank] = useState("");
  const [stepErr, setStepErr] = useState<string | null>(null);
  const [times, setTimes] = useState<StepTimes>(() => defaultStepTimes(new Date(), 0, null));
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [consignee, setConsignee] = useState("");
  const [consigneeSig, setConsigneeSig] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [endMiles, setEndMiles] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimes(defaultStepTimes(new Date(), settings.begin_offset_minutes, delivery.arrived_at));
    setReasonId(null);
    setNote("");
    setConsignee(delivery.consignee_name ?? "");
    setConsigneeSig(null);
    setSigned(false);
    setEndMiles("");
    setErr(null);
    setStep(null);
    setWaterOpen(false);
    setNewTank("");
    const r: Record<string, Reading> = {};
    const w: Record<string, string> = {};
    for (const t of savedTanks) {
      r[t.tank_number] = { before: str(t.before_reading), after: str(t.after_reading) };
      if (t.water_reading != null) w[t.tank_number] = str(t.water_reading);
    }
    setReadings(r);
    setWater(w);
    setWaterTanks(Object.keys(w));
    setUnit(savedTanks.find((t) => t.reading_unit)?.reading_unit ?? "gallons");
    setExtraTanks(savedTanks.map((t) => ({ tank_number: t.tank_number, product_id: t.product_id })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Compartment rows follow the list (a split removes rows); edits are kept by id.
  useEffect(() => {
    if (!open) return;
    setRows((prev) => {
      const old = new Map(prev.map((r) => [r.id, r]));
      return [...compartments].sort((a, b) => a.comp_number - b.comp_number).map((c) => old.get(c.compartment_load_id) ?? {
        id: c.compartment_load_id,
        comp: c.comp_number,
        productId: c.product_id,
        gallons: c.net_gallons ?? c.gross_gallons,
        gross: c.gross_gallons ?? c.net_gallons,
        checked: true,
        tank: c.tank_number ?? suggestTank(c.product_id, locationTanks) ?? "",
      });
    });
  }, [open, compartments, locationTanks]);

  const delivered = rows.filter((r) => r.checked);
  const unchecked = rows.filter((r) => !r.checked);

  // Products delivered here, in compartment order, each with every store tank
  // that holds it.
  const products = useMemo(() => {
    const ids: (string | null)[] = [];
    for (const r of delivered) if (!ids.includes(r.productId)) ids.push(r.productId);
    return ids.map((pid) => {
      const comps = delivered.filter((r) => r.productId === pid);
      return {
        productId: pid,
        comps,
        tanks: tanksForProduct(pid, locationTanks, extraTanks),
        gallons: comps.reduce((t, r) => t + (r.gross ?? 0), 0),
      };
    });
  }, [delivered, locationTanks, extraTanks]);

  // A compartment's tank: what was picked, else the product's only tank.
  const compTank = (r: CompRow) => {
    if (r.tank.trim()) return r.tank.trim();
    const p = products.find((x) => x.productId === r.productId);
    return p && p.tanks.length === 1 ? p.tanks[0] : "";
  };

  const pairsFor = (tanks: string[]) => tanks.map((n) => ({ before: numOrNull(readings[n]?.before ?? ""), after: numOrNull(readings[n]?.after ?? "") }));
  const discrepancyFor = (p: (typeof products)[number]) => tankDiscrepancy(p.gallons, pairsFor(p.tanks), unit);
  const readingsDone = (p: (typeof products)[number]) =>
    p.tanks.length > 0 && pairsFor(p.tanks).every((x) => x.before != null && x.after != null);
  const allTanks = useMemo(() => [...new Set(products.flatMap((p) => p.tanks))], [products]);

  const delayNeeded = needsDelayReason(delayMinutes(times.arrivedAt, times.beginAt), settings.delivery_delay_threshold_minutes);
  const pumpOff = delivery.delivery_type === "pump_off";
  const unitSuffix = unit === "gallons" ? "gal" : "in";

  const setReading = (num: string, patch: Partial<Reading>) =>
    setReadings((m) => ({ ...m, [num]: { ...{ before: "", after: "" }, ...m[num], ...patch } }));

  // ── Reading pop-outs ───────────────────────────────────────────────────────
  const cur = step ? products[step.productIdx] : null;
  const curName = cur ? productName(cur.productId) : "";

  const goBack = () => {
    setStepErr(null);
    if (!step) return;
    if (step.phase === "after") return setStep({ ...step, phase: "before" });
    if (step.productIdx > 0) return setStep({ productIdx: step.productIdx - 1, phase: "after" });
    setStep(null);
  };
  const goNext = () => {
    if (!step || !cur) return;
    if (cur.tanks.length === 0) return setStepErr("Add the tank number first.");
    if (step.phase === "before" && cur.tanks.length > 1 && cur.comps.some((r) => !r.tank.trim())) {
      return setStepErr("Pick the tank each compartment went into.");
    }
    setStepErr(null);
    if (step.phase === "before") return setStep({ ...step, phase: "after" });
    if (step.productIdx < products.length - 1) return setStep({ productIdx: step.productIdx + 1, phase: "before" });
    setStep(null);
  };
  const addTank = () => {
    const n = newTank.trim();
    if (!n || !cur) return;
    setExtraTanks((xs) => (xs.some((x) => x.tank_number === n && x.product_id === cur.productId) ? xs : [...xs, { tank_number: n, product_id: cur.productId }]));
    setNewTank("");
    setStepErr(null);
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
  const stepTitle = cur && step
    ? `${curName}${cur.tanks.length === 1 ? ` · Tank ${cur.tanks[0]}` : ""} · ${step.phase === "before" ? "Before drop" : "After drop"}`
    : "";
  const curDisc = cur ? discrepancyFor(cur) : null;

  const stepFooter = cur && step ? (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {step.phase === "before" && (
        <>
          <div>
            <div style={{ ...miniLabel, marginBottom: 6 }}>Reading in</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={pill(unit === "gallons")} onClick={() => setUnit("gallons")}>Gallons</button>
              <button type="button" style={pill(unit === "inches")} onClick={() => setUnit("inches")}>Inches</button>
            </div>
          </div>
          {cur.tanks.length > 1 && (
            <div>
              <div style={{ ...miniLabel, marginBottom: 6 }}>Dropped into</div>
              {cur.comps.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, width: 30 }}>C{r.comp}</span>
                  {cur.tanks.map((n) => (
                    <button key={n} type="button" style={pill(r.tank.trim() === n)}
                      onClick={() => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, tank: n } : x)))}>
                      {n}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input value={newTank} onChange={(e) => setNewTank(e.target.value)} placeholder={cur.tanks.length ? "Another tank #" : "Tank #"}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTank(); } }}
              style={{ ...fieldInput, flex: 1, padding: "8px 10px", fontSize: 15 }} />
            <button type="button" onClick={addTank} style={pill(false)}>Add tank</button>
          </div>
        </>
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
      ? cur.tanks.length > 1 ? `Enter every ${curName} tank, even ones you're not dropping into.` : undefined
      : cur.tanks.length > 1 ? "Every tank again, from the after receipt." : undefined
    : undefined;

  // ── Water pop-out ──────────────────────────────────────────────────────────
  const waterFields = waterTanks.filter((n) => allTanks.includes(n)).map((n) => ({
    key: `w:${n}`, label: `Tank ${n}`, value: water[n] ?? "", decimal: true, suffix: "in",
    onChange: (v: string) => setWater((m) => ({ ...m, [n]: v })),
  }));
  const waterEntered = waterTanks.filter((n) => allTanks.includes(n) && numOrNull(water[n] ?? "") != null);

  const submit = () => {
    const tp = timesProblem(times);
    if (tp) return setErr(tp);
    if (!delayReasonOk(times, settings.delivery_delay_threshold_minutes, reasonId, note)) return setErr("Pick a delay reason.");
    if (delivered.length === 0) return setErr("Check the compartments you delivered here.");
    if (settings.require_tank_readings) {
      if (products.some((p) => !readingsDone(p))) return setErr("Enter before and after readings for every tank.");
      if (delivered.some((r) => !compTank(r))) return setErr("Pick the tank each compartment went into.");
    }
    if (settings.require_consignee_signature && (!consignee.trim() || !consigneeSig)) {
      return setErr("The consignee needs to print their name and sign.");
    }
    let miles: number | null = null;
    if (isLast) {
      miles = numOrNull(endMiles);
      if (miles == null) return setErr("Enter ending miles.");
      if (beginMiles != null && miles < beginMiles) return setErr(`Ending miles can't be less than beginning (${beginMiles}).`);
    }
    if (!signed) return setErr("Accept your signature to finish.");
    const saved = new Set(savedTanks.map((t) => t.tank_number));
    const tanks: DeliveryTankReading[] = [];
    for (const p of products) {
      for (const n of p.tanks) {
        const before = numOrNull(readings[n]?.before ?? "");
        const after = numOrNull(readings[n]?.after ?? "");
        const w = waterTanks.includes(n) ? numOrNull(water[n] ?? "") : null;
        if (before == null && after == null && w == null && !saved.has(n)) continue;
        if (tanks.some((t) => t.tank_number === n)) continue;
        tanks.push({ tank_number: n, product_id: p.productId, before_reading: before, after_reading: after, water_reading: w, reading_unit: unit });
      }
    }
    onSubmit({
      times,
      delayReasonId: delayNeeded ? reasonId : null,
      delayNote: delayNeeded && !reasonId ? note.trim() || null : null,
      delivered: delivered.map((r) => ({
        compartment_load_id: r.id, comp_number: r.comp, product_id: r.productId, tank_number: compTank(r) || null,
      })),
      tanks,
      consigneeName: consignee.trim() || null,
      consigneeSignature: consigneeSig,
      signed,
      endMiles: miles,
    });
  };

  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      <div style={sectionCard}>
        <div style={sectionTitle}>Compartments delivered here</div>
        {rows.length === 0 && <div style={{ fontSize: 14, color: muted }}>Nothing aboard for this delivery.</div>}
        {rows.map((r) => {
          const t = r.checked ? compTank(r) : "";
          return (
            <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
              <input type="checkbox" checked={r.checked} style={{ width: 22, height: 22 }}
                onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, checked: e.target.checked } : x)))} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>C{r.comp} · {productName(r.productId)}</div>
                {r.gallons != null && <div style={{ fontSize: 12, color: muted }}>{Math.round(r.gallons).toLocaleString("en-US")} gal</div>}
              </div>
              {t && <div style={{ fontSize: 13, color: muted, whiteSpace: "nowrap" }}>→ Tank {t}</div>}
            </label>
          );
        })}
        {unchecked.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>
              {isLast ? "Unchecked compartments stay aboard as Retained, or send them to another delivery:" : "Unchecked compartments stay on the next delivery, or:"}
            </div>
            <button type="button" onClick={() => onSplit(unchecked.map((r) => r.id))} style={{ ...dashedBtn, marginTop: 8 }}>
              Send C{unchecked.map((r) => r.comp).join(", C")} to another delivery
            </button>
          </>
        )}
      </div>

      {products.length > 0 && (
        <div style={sectionCard}>
          <div style={sectionTitle}>Tank readings{settings.require_tank_readings ? "" : " (optional)"}</div>
          {products.map((p, i) => {
            const name = productName(p.productId);
            const d = discrepancyFor(p);
            const done = readingsDone(p);
            return (
              <button key={p.productId ?? `none${i}`} type="button" onClick={() => { setStepErr(null); setStep({ productIdx: i, phase: "before" }); }}
                style={{ width: "100%", textAlign: "left", display: "block", background: "transparent", border: "none", borderTop: i ? "1px solid rgba(255,255,255,0.06)" : "none", padding: "10px 0", color: "#fff", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: productColorFor(name), flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>{name}</span>
                  <span style={{ fontSize: 13, color: done ? muted : "#fff", fontWeight: done ? 500 : 700 }}>
                    {done ? `${p.tanks.length} tank${p.tanks.length === 1 ? "" : "s"}${unit === "inches" ? " · inches" : ""}` : "Enter ›"}
                  </span>
                </div>
                {d && <div style={{ marginTop: 4, paddingLeft: 18 }}><DiscrepancyLine d={d} /></div>}
              </button>
            );
          })}
          <button type="button" onClick={() => { setStepErr(null); setStep({ productIdx: 0, phase: "before" }); }} style={{ ...dashedBtn, marginTop: 8 }}>
            {products.every(readingsDone) ? "Review tank readings" : "Enter tank readings"}
          </button>
          <button type="button" onClick={() => { if (waterTanks.length === 0 && allTanks.length === 1) setWaterTanks(allTanks); setWaterOpen(true); }}
            style={{ marginTop: 10, background: "transparent", border: "none", padding: 0, color: waterEntered.length ? "#60a5fa" : muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {waterEntered.length
              ? `Water: ${waterEntered.map((n) => `Tank ${n} ${water[n]} in`).join(", ")} ›`
              : "Water present? Tap to record"}
          </button>
        </div>
      )}

      <div style={sectionCard}>
        <div style={sectionTitle}>Times</div>
        <TimesEditor times={times} onChange={setTimes} beginLabel={pumpOff ? "Began pumping" : "Began delivery"} />
        <DelayReasonField times={times} threshold={settings.delivery_delay_threshold_minutes} reasons={reasons} kind="delivery"
          reasonId={reasonId} note={note} onChange={(id, n) => { setReasonId(id); setNote(n); }} />
      </div>

      <div style={sectionCard}>
        <div style={sectionTitle}>Consignee{settings.require_consignee_signature ? "" : " (optional)"}</div>
        <input value={consignee} onChange={(e) => setConsignee(e.target.value)} placeholder="Printed name" style={{ ...fieldInput, marginBottom: 8 }} />
        <SignaturePad onChange={setConsigneeSig} />
      </div>

      {isLast && (
        <div style={sectionCard}>
          <div style={sectionTitle}>Ending miles</div>
          {beginMiles != null && <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>Beginning: {beginMiles.toLocaleString("en-US")}</div>}
          <input value={endMiles} onChange={(e) => setEndMiles(e.target.value)} inputMode="numeric" style={fieldInput} />
        </div>
      )}

      <div style={sectionCard}>
        <div style={sectionTitle}>Delivering driver</div>
        <SignatureAccept savedPath={signature} onSave={onSaveSignature} accepted={signed} onAccept={setSigned} who="the delivering driver" />
      </div>

      {err && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{err}</div>}
      <button type="button" onClick={submit} style={primaryBtn}>Finish Delivery</button>

      <ValueEntryOverlay
        open={!!cur && !!step}
        title={stepTitle}
        dotColor={cur ? productColorFor(curName) : undefined}
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
                  <button key={n} type="button" style={pill(on)}
                    onClick={() => setWaterTanks((ts) => (on ? ts.filter((x) => x !== n) : [...ts, n]))}>
                    Tank {n}
                  </button>
                );
              })}
            </div>
            {allTanks.length === 0 && <div style={{ fontSize: 12, color: muted }}>Enter tank readings first so the tanks are listed.</div>}
            {waterTanks.length > 0 && (
              <button type="button" onClick={() => { setWaterTanks([]); setWater({}); setWaterOpen(false); }}
                style={{ marginTop: 10, background: "transparent", border: "none", padding: 0, color: muted, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                No water after all, clear it
              </button>
            )}
          </div>
        }
        cancelLabel="Close"
        onCancel={() => setWaterOpen(false)}
        submitLabel="Done"
        onSubmit={() => setWaterOpen(false)}
      />
    </FullscreenModal>
  );
}
