"use client";
// app/planner/components/trip/LoadedSheet.tsx
//
// "Loaded" (docs/trip-workflow-design.md §5, §7, §9): the driver confirms the
// BOL, supplier, per-compartment gallons, and the three times. Gross, temp
// and API come from the Planner's Log the Load; net is calculated from them
// and can be edited to match the BOL.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { calculateNetGallons, netMethodForProduct } from "@/lib/trips/netGallons";
import {
  defaultStepTimes,
  delayMinutes,
  needsDelayReason,
  timesProblem,
  type LoadedCompartmentEdit,
  type StepTimes,
} from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripOrderRow, TripPickupRow } from "@/lib/trips/types";
import type { DelayReason, TripSettings } from "@/lib/trips/useTripData";
import {
  DelayReasonField,
  SignatureAccept,
  TimesEditor,
  delayReasonOk,
  fieldInput,
  fieldLabel,
  linkBtn,
  muted,
  numOrNull,
  primaryBtn,
  sectionCard,
  sectionTitle,
  smallInput,
} from "./tripUi";

export type LoadedSubmit = {
  times: StepTimes;
  delayReasonId: string | null;
  delayNote: string | null;
  odometer: number | null;
  compartments: LoadedCompartmentEdit[];
  signed: boolean;
};

type Row = {
  id: string;
  comp: number;
  productId: string | null;
  orderId: string | null;
  bol: string; // per-row override; blank = the shared BOL
  gross: string;
  net: string;
  netTouched: boolean;
  temp: string;
  api: string;
};

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

export function LoadedSheet({
  open, pickup, compLoads, orders, settings, reasons, needsOdometer, productName,
  signature, onSaveSignature, onSubmit, onClose,
}: {
  open: boolean;
  pickup: TripPickupRow;
  compLoads: TripCompartmentLoadRow[]; // this pickup's, not cancelled
  orders: TripOrderRow[];
  settings: TripSettings;
  reasons: DelayReason[];
  needsOdometer: boolean;
  productName: (id: string | null) => string;
  signature: string | null;
  onSaveSignature: (path: string) => Promise<void>;
  onSubmit: (v: LoadedSubmit) => void;
  onClose: () => void;
}) {
  const [bol, setBol] = useState("");
  const [supplier, setSupplier] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [times, setTimes] = useState<StepTimes>(() => defaultStepTimes(new Date(), 0, null));
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [odometer, setOdometer] = useState("");
  const [signed, setSigned] = useState(false);
  const [perRowBol, setPerRowBol] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Seed every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const sorted = [...compLoads].sort((a, b) => a.comp_number - b.comp_number);
    const bols = [...new Set(sorted.map((c) => c.bol_number).filter(Boolean))] as string[];
    setBol(bols[0] ?? "");
    setPerRowBol(bols.length > 1);
    setSupplier(sorted.find((c) => c.supplier)?.supplier ?? "");
    setRows(sorted.map((c) => ({
      id: c.compartment_load_id,
      comp: c.comp_number,
      productId: c.product_id,
      orderId: c.order_id,
      bol: bols.length > 1 ? c.bol_number ?? "" : "",
      gross: str(c.gross_gallons),
      net: str(c.net_gallons ?? c.net_calculated_gallons),
      netTouched: c.net_gallons != null && c.net_calculated_gallons != null && c.net_gallons !== c.net_calculated_gallons,
      temp: str(c.temp_f),
      api: str(c.api),
    })));
    const t = pickup.begin_at && pickup.left_at
      ? { arrivedAt: pickup.arrived_at ?? pickup.begin_at, beginAt: pickup.begin_at, leftAt: pickup.left_at }
      : defaultStepTimes(new Date(), settings.begin_offset_minutes, pickup.arrived_at);
    setTimes(t);
    setReasonId(pickup.delay_reason_id);
    setNote(pickup.delay_note ?? "");
    setOdometer(str(pickup.odometer));
    setSigned(false);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const calcFor = (r: Row) =>
    calculateNetGallons(numOrNull(r.gross), numOrNull(r.api), numOrNull(r.temp), netMethodForProduct(productName(r.productId)));

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      // Gross/temp/API changes recalculate net unless the driver typed one.
      if (!next.netTouched && ("gross" in patch || "temp" in patch || "api" in patch)) {
        const c = calcFor(next);
        next.net = c == null ? next.net : String(c);
      }
      return next;
    }));

  const delayNeeded = needsDelayReason(delayMinutes(times.arrivedAt, times.beginAt), settings.loading_delay_threshold_minutes);
  const totals = useMemo(() => rows.reduce(
    (a, r) => ({ gross: a.gross + (numOrNull(r.gross) ?? 0), net: a.net + (numOrNull(r.net) ?? 0) }),
    { gross: 0, net: 0 },
  ), [rows]);

  const submit = () => {
    const tp = timesProblem(times);
    if (tp) return setErr(tp);
    if (!delayReasonOk(times, settings.loading_delay_threshold_minutes, reasonId, note)) return setErr("Pick a delay reason.");
    const missingBol = rows.some((r) => !(perRowBol ? r.bol.trim() : bol.trim()));
    if (missingBol) return setErr("Enter the BOL number.");
    if (rows.some((r) => !(numOrNull(r.gross)! > 0))) return setErr("Every compartment needs gross gallons.");
    if (needsOdometer && numOrNull(odometer) == null) return setErr("Enter the odometer.");
    if (!signed) return setErr("Accept your signature to finish.");
    onSubmit({
      times,
      delayReasonId: delayNeeded ? reasonId : null,
      delayNote: delayNeeded && !reasonId ? note.trim() || null : null,
      odometer: needsOdometer ? numOrNull(odometer) : pickup.odometer,
      signed,
      compartments: rows.map((r) => ({
        compartment_load_id: r.id,
        comp_number: r.comp,
        product_id: r.productId,
        order_id: r.orderId,
        bol_number: (perRowBol ? r.bol : bol).trim() || null,
        supplier: supplier.trim() || null,
        gross_gallons: numOrNull(r.gross),
        net_gallons: numOrNull(r.net),
        net_calculated_gallons: calcFor(r),
        temp_f: numOrNull(r.temp),
        api: numOrNull(r.api),
      })),
    });
  };

  return (
    <FullscreenModal open={open} title={`Loaded${pickup.name ? ` · ${pickup.name}` : ""}`} onClose={onClose} footer={null}>
      <div style={sectionCard}>
        <div style={sectionTitle}>Bill of lading</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={fieldLabel}>BOL #</div>
            <input value={bol} onChange={(e) => setBol(e.target.value)} disabled={perRowBol} inputMode="text"
              style={{ ...fieldInput, opacity: perRowBol ? 0.4 : 1 }} placeholder={perRowBol ? "Per compartment" : ""} />
          </div>
          <div>
            <div style={fieldLabel}>Supplier</div>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={fieldInput} />
          </div>
        </div>
        <button type="button" onClick={() => setPerRowBol((v) => !v)} style={{ ...linkBtn, marginTop: 8, color: muted }}>
          {perRowBol ? "One BOL for every compartment" : "Different BOL per compartment"}
        </button>
      </div>

      <div style={sectionCard}>
        <div style={sectionTitle}>Compartments</div>
        {rows.length === 0 && <div style={{ fontSize: 14, color: muted }}>No compartments logged.</div>}
        {rows.map((r) => {
          const calc = calcFor(r);
          return (
            <div key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                C{r.comp} · {productName(r.productId)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {([["Gross", "gross"], ["Net", "net"], ["°F", "temp"], ["API", "api"]] as const).map(([lbl, key]) => (
                  <div key={key}>
                    <div style={{ ...fieldLabel, marginBottom: 4 }}>{lbl}</div>
                    <input value={r[key]} inputMode="decimal"
                      onChange={(e) => update(r.id, key === "net" ? { net: e.target.value, netTouched: true } : { [key]: e.target.value } as Partial<Row>)}
                      style={smallInput} />
                  </div>
                ))}
              </div>
              {calc != null && r.netTouched && numOrNull(r.net) !== calc && (
                <button type="button" onClick={() => update(r.id, { net: String(calc), netTouched: false })}
                  style={{ ...linkBtn, marginTop: 6, color: muted }}>
                  Calculated net {calc.toLocaleString("en-US")} · use it
                </button>
              )}
              {calc == null && <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>Enter net from the BOL.</div>}
              {(perRowBol || orders.length > 1) && (
                <div style={{ display: "grid", gridTemplateColumns: perRowBol && orders.length > 1 ? "1fr 1fr" : "1fr", gap: 6, marginTop: 8 }}>
                  {perRowBol && (
                    <input value={r.bol} onChange={(e) => update(r.id, { bol: e.target.value })} placeholder="BOL #" style={smallInput} />
                  )}
                  {orders.length > 1 && (
                    <select value={r.orderId ?? ""} onChange={(e) => update(r.id, { orderId: e.target.value || null })} style={smallInput}>
                      {orders.map((o) => <option key={o.order_id} value={o.order_id}>Order {o.order_number || "—"}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 14, fontWeight: 700 }}>
          <span>Total</span>
          <span>{Math.round(totals.gross).toLocaleString("en-US")} gross · {Math.round(totals.net).toLocaleString("en-US")} net</span>
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionTitle}>Times</div>
        <TimesEditor times={times} onChange={setTimes} beginLabel="Began loading" />
        <DelayReasonField times={times} threshold={settings.loading_delay_threshold_minutes} reasons={reasons} kind="loading"
          reasonId={reasonId} note={note} onChange={(id, n) => { setReasonId(id); setNote(n); }} />
      </div>

      {needsOdometer && (
        <div style={sectionCard}>
          <div style={sectionTitle}>Odometer</div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>This pickup is in a different city from the last one.</div>
          <input value={odometer} onChange={(e) => setOdometer(e.target.value)} inputMode="numeric" style={fieldInput} />
        </div>
      )}

      <div style={sectionCard}>
        <div style={sectionTitle}>Loading driver</div>
        <SignatureAccept savedPath={signature} onSave={onSaveSignature} accepted={signed} onAccept={setSigned} who="the loading driver" />
      </div>

      {err && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{err}</div>}
      <button type="button" onClick={submit} style={primaryBtn}>Confirm Loaded</button>
    </FullscreenModal>
  );
}
