"use client";
// app/planner/components/trip/FinishDeliverySheet.tsx
//
// Finish Delivery (docs/trip-workflow-design.md §8, §9): which compartments
// went into which tank, tank readings, the three times, consignee and driver
// signatures, and ending miles on the last delivery. Compartments left
// unchecked can be sent to another delivery (split); on the last delivery
// anything still aboard is kept as Retained.

import React, { useEffect, useMemo, useState } from "react";
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
  fieldLabel,
  muted,
  numOrNull,
  primaryBtn,
  sectionCard,
  sectionTitle,
  smallInput,
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

type CompRow = { id: string; comp: number; productId: string | null; gallons: number | null; checked: boolean; tank: string };
type TankRow = { before: string; after: string; water: string };

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

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
  const [tankReadings, setTankReadings] = useState<Record<string, TankRow>>({});
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
    const readings: Record<string, TankRow> = {};
    for (const t of savedTanks) {
      readings[t.tank_number] = { before: str(t.before_reading), after: str(t.after_reading), water: str(t.water_reading) };
    }
    setTankReadings(readings);
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
        checked: true,
        tank: c.tank_number ?? suggestTank(c.product_id, locationTanks) ?? "",
      });
    });
  }, [open, compartments, locationTanks]);

  const delivered = rows.filter((r) => r.checked);
  const unchecked = rows.filter((r) => !r.checked);
  const tankNumbers = useMemo(() => [...new Set(delivered.map((r) => r.tank.trim()).filter(Boolean))], [delivered]);
  const tankProduct = (num: string) =>
    delivered.find((r) => r.tank.trim() === num)?.productId
    ?? locationTanks.find((t) => t.tank_number === num)?.product_id ?? null;
  const delayNeeded = needsDelayReason(delayMinutes(times.arrivedAt, times.beginAt), settings.delivery_delay_threshold_minutes);
  const pumpOff = delivery.delivery_type === "pump_off";

  const setTank = (num: string, patch: Partial<TankRow>) =>
    setTankReadings((m) => ({ ...m, [num]: { ...{ before: "", after: "", water: "" }, ...m[num], ...patch } }));

  const submit = () => {
    const tp = timesProblem(times);
    if (tp) return setErr(tp);
    if (!delayReasonOk(times, settings.delivery_delay_threshold_minutes, reasonId, note)) return setErr("Pick a delay reason.");
    if (delivered.length === 0) return setErr("Check the compartments you delivered here.");
    if (settings.require_tank_readings) {
      if (delivered.some((r) => !r.tank.trim())) return setErr("Enter a tank for every delivered compartment.");
      const missing = tankNumbers.some((n) => numOrNull(tankReadings[n]?.before ?? "") == null || numOrNull(tankReadings[n]?.after ?? "") == null);
      if (missing) return setErr("Enter before and after readings for every tank.");
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
    onSubmit({
      times,
      delayReasonId: delayNeeded ? reasonId : null,
      delayNote: delayNeeded && !reasonId ? note.trim() || null : null,
      delivered: delivered.map((r) => ({
        compartment_load_id: r.id, comp_number: r.comp, product_id: r.productId, tank_number: r.tank.trim() || null,
      })),
      tanks: tankNumbers.map((n) => ({
        tank_number: n,
        product_id: tankProduct(n),
        before_reading: numOrNull(tankReadings[n]?.before ?? ""),
        after_reading: numOrNull(tankReadings[n]?.after ?? ""),
        water_reading: numOrNull(tankReadings[n]?.water ?? ""),
      })),
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
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <input type="checkbox" checked={r.checked} style={{ width: 22, height: 22 }}
              onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, checked: e.target.checked } : x)))} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>C{r.comp} · {productName(r.productId)}</div>
              {r.gallons != null && <div style={{ fontSize: 12, color: muted }}>{Math.round(r.gallons).toLocaleString("en-US")} gal</div>}
            </div>
            <input value={r.tank} placeholder="Tank #" disabled={!r.checked}
              onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, tank: e.target.value } : x)))}
              style={{ ...smallInput, width: 90, opacity: r.checked ? 1 : 0.4 }} />
          </div>
        ))}
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

      {tankNumbers.length > 0 && (
        <div style={sectionCard}>
          <div style={sectionTitle}>Tank readings{settings.require_tank_readings ? "" : " (optional)"}</div>
          {tankNumbers.map((n) => (
            <div key={n} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Tank {n} · {productName(tankProduct(n))}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {([["Before", "before"], ["After", "after"], ["Water", "water"]] as const).map(([lbl, key]) => (
                  <div key={key}>
                    <div style={{ ...fieldLabel, marginBottom: 4 }}>{lbl}</div>
                    <input value={tankReadings[n]?.[key] ?? ""} inputMode="decimal"
                      onChange={(e) => setTank(n, { [key]: e.target.value } as Partial<TankRow>)} style={smallInput} />
                  </div>
                ))}
              </div>
            </div>
          ))}
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
    </FullscreenModal>
  );
}
