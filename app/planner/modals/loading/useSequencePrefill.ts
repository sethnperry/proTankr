"use client";
// app/planner/modals/loading/useSequencePrefill.ts
//
// Effects for the Finish Loading sequence: reset when the modal closes, prefill each window
// from what was confirmed, the report being edited, earlier windows and the last readings,
// and fill the BOL when the telematics shipment number arrives.

import type { useLoadingBasics } from "./useLoadingBasics";
import type { useSequenceState } from "./useSequenceState";
import { useEffect } from "react";

export function useSequencePrefill(b: ReturnType<typeof useLoadingBasics>, st: ReturnType<typeof useSequenceState>) {
  const { open, productInputs, trip, setEditingReport, reportEntryByComp, setGallonsTarget, setConfirmDelete } = b;
  const {
    compSeqIndex,
    setCompSeqIndex,
    setBolAssign,
    setSplitProductId,
    setSeqGallons,
    setSeqApi,
    setSeqTemp,
    compEntries,
    setCompEntries,
    seqBol,
    setSeqBol,
    setSeqSupplier,
    setSeqSupplierId,
    setSeqNet,
    setSeqNetTouched,
    setSeqError,
    setSeqBusy,
    setSeqFocus,
    setPickingSupplier,
    tripExtras,
    setTripExtras,
    okBols,
    setTripStep,
    seqGroups,
    lineByComp,
    seqGroup,
    seqGroupKey,
  } = st;
  useEffect(() => {
    if (!open) {
      setCompSeqIndex(null);
      setCompEntries({});
      setGallonsTarget(null);
      setEditingReport(false);
      setConfirmDelete(false);
      setTripExtras({});
      setTripStep(null);
      setSeqError(null);
      setSeqBusy(false);
      setPickingSupplier(false);
      setBolAssign({});
      setSplitProductId(null);
      okBols.current = new Set();
    }
  }, [open]);

  // Prefill the current window. Values already confirmed for its
  // compartments (the driver went Back) are shown as-is. Otherwise gross is
  // the planned gallons for those compartments; API/temp come from the
  // report being edited, else an earlier window of the same product, else
  // the last-observed/predicted values seeded into productInputs. BOL and
  // supplier carry over from the previous window when it's a different
  // product (one BOL usually covers the whole load); a split of the same
  // product starts blank because it's a different BOL by definition.
  useEffect(() => {
    if (compSeqIndex == null || !seqGroup) return;
    setSeqError(null);
    const comps = seqGroup.comps;
    const first = comps[0];
    const prevGroup = compSeqIndex > 0 ? seqGroups[compSeqIndex - 1] : null;

    if (trip) {
      const own = tripExtras[first];
      const def = trip.compDefaults[first];
      const prevExtra = prevGroup && prevGroup.productId !== seqGroup.productId ? tripExtras[prevGroup.comps[0]] : undefined;
      const geo = trip.geotabBols?.[seqGroup.bolIndex] ?? (seqGroup.bolCount <= 1 ? trip.geotabBols?.[0] : undefined);
      setSeqBol(own?.bol ?? def?.bol ?? geo ?? prevExtra?.bol ?? "");
      if (own) {
        setSeqSupplier(own.supplier);
        setSeqSupplierId(own.supplierId);
      } else if (def?.supplier) {
        setSeqSupplier(def.supplier);
        setSeqSupplierId(def.supplierId);
      } else {
        setSeqSupplier(prevExtra?.supplier ?? "");
        setSeqSupplierId(prevExtra?.supplierId ?? null);
      }
      const ownAll = comps.every((c) => tripExtras[c]);
      const defAll = comps.every((c) => trip.compDefaults[c]?.net != null);
      if (ownAll) {
        const net = comps.reduce((t, c) => t + (tripExtras[c].net ?? 0), 0);
        const calc = comps.reduce((t, c) => t + (tripExtras[c].netCalculated ?? 0), 0);
        setSeqNet(String(net));
        setSeqNetTouched(comps.some((c) => tripExtras[c].net !== tripExtras[c].netCalculated) && net !== calc);
      } else if (defAll && comps.some((c) => trip.compDefaults[c]?.netTouched)) {
        setSeqNet(String(comps.reduce((t, c) => t + (trip.compDefaults[c]?.net ?? 0), 0)));
        setSeqNetTouched(true);
      } else {
        setSeqNet("");
        setSeqNetTouched(false);
      }
      setSeqFocus("bol");
    } else {
      setSeqFocus("api");
    }

    if (comps.every((c) => compEntries[c])) {
      setSeqGallons(String(Math.round(comps.reduce((t, c) => t + compEntries[c].gallons, 0))));
      setSeqApi(String(compEntries[first].api));
      setSeqTemp(compEntries[first].tempF.toFixed(1));
      return;
    }

    setSeqGallons(String(Math.round(comps.reduce((t, c) => t + (lineByComp.get(c)?.gallons ?? 0), 0))));

    const ownReportEntry = reportEntryByComp.get(first);
    if (ownReportEntry && ownReportEntry.api != null && ownReportEntry.tempF != null) {
      setSeqApi(String(ownReportEntry.api));
      setSeqTemp(ownReportEntry.tempF.toFixed(1));
      return;
    }

    let inherited: { api: number; tempF: number } | null = null;
    for (let i = compSeqIndex - 1; i >= 0; i--) {
      const g = seqGroups[i];
      if (g.productId !== seqGroup.productId) continue;
      const entry = compEntries[g.comps[0]];
      if (entry) {
        inherited = { api: entry.api, tempF: entry.tempF };
        break;
      }
    }
    if (inherited) {
      setSeqApi(String(inherited.api));
      setSeqTemp(inherited.tempF.toFixed(1));
    } else {
      const pi = productInputs[seqGroup.productId];
      setSeqApi(pi?.api ? String(pi.api) : "");
      setSeqTemp(pi?.tempF != null ? Number(pi.tempF).toFixed(1) : "");
    }
    // Keyed on the window only -- re-seeding on every compEntries/
    // productInputs change would clobber what the driver is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compSeqIndex, seqGroupKey]);

  // The shipment number arrives a moment after the window opens: fill the BOL then, unless the driver has typed.
  useEffect(() => {
    if (!trip || compSeqIndex == null || !seqGroup || seqBol.trim()) return;
    const geo = trip.geotabBols?.[seqGroup.bolIndex] ?? (seqGroup.bolCount <= 1 ? trip.geotabBols?.[0] : undefined);
    if (geo) setSeqBol(geo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.geotabBols?.join(","), compSeqIndex]);
}
