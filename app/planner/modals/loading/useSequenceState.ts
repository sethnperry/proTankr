"use client";
// app/planner/modals/loading/useSequenceState.ts
//
// State for the Finish Loading sequence: the current window, what the driver has entered,
// BOL split, trip extras and the times / signature steps. No behaviour; useFinishSequence
// owns the effects and handlers.

import { useMemo, useState, useRef } from "react";
import type { StepTimes } from "@/lib/trips/tripFlow";
import { buildBolGroups, type BolAssignment } from "@/lib/trips/bolGroups";
import type { TripCompExtra } from "./types";
import type { useLoadingBasics } from "./useLoadingBasics";

export function useSequenceState(b: ReturnType<typeof useLoadingBasics>) {
  const { orderedCompLines } = b;
  // ── Finish Loading / Edit Load: one window per product ─────────────────
  // (2026-10-11) The driver enters what's on the BOL once per product, not
  // once per compartment: BOL # and supplier (trip mode), then API, temp,
  // gross and net. When one product came on more than one BOL, Split Load
  // assigns its compartments to BOL groups and each group gets its own
  // window. A window's gross and net are spread over its compartments by
  // planned gallons (lib/trips/bolGroups.ts), so onLoaded/onEditLoad still
  // get one entry per compartment, same shape as before.
  const [compSeqIndex, setCompSeqIndex] = useState<number | null>(null);
  const [bolAssign, setBolAssign] = useState<BolAssignment>({});
  const [splitProductId, setSplitProductId] = useState<string | null>(null);
  const [splitDraft, setSplitDraft] = useState<BolAssignment>({});
  const [seqGallons, setSeqGallons] = useState("");
  const [seqApi, setSeqApi] = useState("");
  const [seqTemp, setSeqTemp] = useState("");
  const [compEntries, setCompEntries] = useState<Record<number, { gallons: number; api: number; tempF: number }>>({});
  // Trip mode extras for the current window and the ones already confirmed.
  const [seqBol, setSeqBol] = useState("");
  const [seqSupplier, setSeqSupplier] = useState("");
  const [seqSupplierId, setSeqSupplierId] = useState<string | null>(null);
  const [seqNet, setSeqNet] = useState("");
  const [seqNetTouched, setSeqNetTouched] = useState(false);
  const [seqError, setSeqError] = useState<string | null>(null);
  const [seqBusy, setSeqBusy] = useState(false);
  const [seqFocus, setSeqFocus] = useState<string | null>(null);
  const [pickingSupplier, setPickingSupplier] = useState(false);
  const [tripExtras, setTripExtras] = useState<Record<number, TripCompExtra>>({});
  const okBols = useRef<Set<string>>(new Set());
  // After the products: the times window, then the signature window.
  const [tripStep, setTripStep] = useState<"times" | "sign" | null>(null);
  const [tripTimes, setTripTimes] = useState<StepTimes | null>(null);
  const [tripReasonId, setTripReasonId] = useState<string | null>(null);
  const [tripNote, setTripNote] = useState("");
  const [tripOdometer, setTripOdometer] = useState("");
  const [tripSigned, setTripSigned] = useState(false);
  const [tripStepError, setTripStepError] = useState<string | null>(null);
  const finishTappedAt = useRef<Date | null>(null);

  const seqGroups = useMemo(
    () =>
      buildBolGroups(
        orderedCompLines.map((l) => ({ comp: l.comp, productId: l.productId, gallons: l.gallons })),
        bolAssign,
      ),
    [orderedCompLines, bolAssign],
  );
  const lineByComp = useMemo(() => new Map(orderedCompLines.map((l) => [l.comp, l])), [orderedCompLines]);
  const seqGroup = compSeqIndex != null ? (seqGroups[compSeqIndex] ?? null) : null;
  const seqGroupKey = seqGroup ? `${seqGroup.productId}:${seqGroup.comps.join(",")}` : "";

  return {
    compSeqIndex,
    setCompSeqIndex,
    bolAssign,
    setBolAssign,
    splitProductId,
    setSplitProductId,
    splitDraft,
    setSplitDraft,
    seqGallons,
    setSeqGallons,
    seqApi,
    setSeqApi,
    seqTemp,
    setSeqTemp,
    compEntries,
    setCompEntries,
    seqBol,
    setSeqBol,
    seqSupplier,
    setSeqSupplier,
    seqSupplierId,
    setSeqSupplierId,
    seqNet,
    setSeqNet,
    seqNetTouched,
    setSeqNetTouched,
    seqError,
    setSeqError,
    seqBusy,
    setSeqBusy,
    seqFocus,
    setSeqFocus,
    pickingSupplier,
    setPickingSupplier,
    tripExtras,
    setTripExtras,
    okBols,
    tripStep,
    setTripStep,
    tripTimes,
    setTripTimes,
    tripReasonId,
    setTripReasonId,
    tripNote,
    setTripNote,
    tripOdometer,
    setTripOdometer,
    tripSigned,
    setTripSigned,
    tripStepError,
    setTripStepError,
    finishTappedAt,
    seqGroups,
    lineByComp,
    seqGroup,
    seqGroupKey,
  };
}
