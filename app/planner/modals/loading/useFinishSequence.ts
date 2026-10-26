"use client";
// app/planner/modals/loading/useFinishSequence.ts
//
// Finish Loading / Edit Load: one window per product (BOL, API, temp, gross, net), split loads, then times and signature on a trip.

import { useSequencePrefill } from "./useSequencePrefill";
import { useSequenceState } from "./useSequenceState";
import { numOrNull } from "../../components/trip/tripUi";
import { calculateNetGallons, netMethodForProduct } from "@/lib/trips/netGallons";
import { defaultStepTimes } from "@/lib/trips/tripFlow";
import { normalizeRef } from "@/lib/trips/refs";
import { buildBolGroups, distributeWhole, initialBolAssignment, type BolAssignment } from "@/lib/trips/bolGroups";
import { loadingOffset } from "@/lib/trips/useTripData";
import type { LoadingModalProps } from "./types";

import type { useLoadingBasics } from "./useLoadingBasics";

export function useFinishSequence(props: LoadingModalProps, b: ReturnType<typeof useLoadingBasics>) {
  const { productNameById, persistedCapForComp, report, onEditLoad, onLoaded, trip, editingReport, setEditingReport, orderedCompLines } = b;
  const st = useSequenceState(b);
  const {
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
  } = st;
  useSequencePrefill(b, st);
  // Reset all sequence state whenever the modal closes, so a re-open never
  // resumes a half-finished sequence from a previous load.
  function startLogSequence() {
    // The Finish Loading tap ends loading and starts travel to the delivery.
    finishTappedAt.current = new Date();
    if (trip) props.onFinishLoadingStart?.();
    if (orderedCompLines.length === 0) {
      onLoaded({});
      return;
    }
    setCompEntries({});
    setTripExtras({});
    setBolAssign({});
    setCompSeqIndex(0);
  }
  function startEditSequence() {
    if (!report) return;
    // Real bug caught before shipping: orderedCompLines still reflects the
    // PRE-update editingReport value here (setEditingReport is async, only
    // takes effect on the next render) -- checking it instead of
    // report.lines directly would wrongly fall through to "nothing to
    // edit" whenever the live plan (plannedLines) happens to be empty,
    // even though the report itself has real lines to edit.
    setEditingReport(true);
    if (report.lines.length === 0) {
      onEditLoad?.({});
      return;
    }
    setCompEntries({});
    setTripExtras({});
    // Compartments of one product already on different BOLs start split.
    const bols: Record<number, string | null> = {};
    if (trip) for (const l of report.lines) bols[l.comp] = trip.compDefaults[l.comp]?.bol ?? null;
    setBolAssign(
      initialBolAssignment(
        report.lines.map((l) => ({ comp: l.comp, productId: l.productId, gallons: l.gallons })),
        bols,
      ),
    );
    setCompSeqIndex(0);
  }
  function cancelLogSequence() {
    setCompSeqIndex(null);
    setEditingReport(false);
  }
  function goToPreviousCompStep() {
    if (compSeqIndex == null || compSeqIndex <= 0) return;
    setCompSeqIndex(compSeqIndex - 1);
  }

  // ── Split Load: assign one product's compartments to BOLs ───────────────
  function openSplit() {
    if (!seqGroup) return;
    const pid = seqGroup.productId;
    const draft: BolAssignment = {};
    for (const g of seqGroups) if (g.productId === pid) for (const c of g.comps) draft[c] = g.bolIndex;
    setSplitDraft(draft);
    setSplitProductId(pid);
  }
  function finishSplit() {
    const pid = splitProductId;
    if (!pid) return;
    const productComps = orderedCompLines.filter((l) => l.productId === pid).map((l) => l.comp);
    const next = { ...bolAssign };
    for (const c of productComps) next[c] = splitDraft[c] ?? 1;
    // The grouping changed, so this product's confirmed windows start over.
    setCompEntries((prev) => {
      const o = { ...prev };
      for (const c of productComps) delete o[c];
      return o;
    });
    setTripExtras((prev) => {
      const o = { ...prev };
      for (const c of productComps) delete o[c];
      return o;
    });
    setBolAssign(next);
    setSplitProductId(null);
    const regrouped = buildBolGroups(
      orderedCompLines.map((l) => ({ comp: l.comp, productId: l.productId, gallons: l.gallons })),
      next,
    );
    const firstIdx = regrouped.findIndex((g) => g.productId === pid);
    setCompSeqIndex(firstIdx >= 0 ? firstIdx : 0);
  }

  async function commitCompStep() {
    if (compSeqIndex == null || seqBusy) return;
    const group = seqGroups[compSeqIndex];
    if (!group) {
      setCompSeqIndex(null);
      return;
    }

    const gallonsN = parseFloat(seqGallons);
    const apiN = parseFloat(seqApi);
    const tempN = parseFloat(seqTemp);
    // Keep the window open on invalid input rather than advancing (or
    // completing) with garbage data.
    if (!Number.isFinite(gallonsN) || !Number.isFinite(apiN) || !Number.isFinite(tempN) || gallonsN < 0) {
      setSeqError("Enter API, temp and gross.");
      return;
    }

    // Sanity check against what these compartments can hold (a typo, not a
    // real BOL, is the only way past it). Editing a logged load skips it:
    // there's no live plan cap to bound against.
    if (!editingReport && persistedCapForComp) {
      const caps = group.comps.map((c) => persistedCapForComp(c));
      if (caps.every((c) => c != null)) {
        const hold = caps.reduce((t, c) => t + (c as number), 0);
        if (gallonsN > hold + 1) {
          setSeqError(
            `More than ${group.comps.length > 1 ? "these compartments hold" : "this compartment holds"} (${Math.round(hold).toLocaleString()} gal).`,
          );
          return;
        }
      }
    }

    let bol = "";
    let netN: number | null = null;
    if (trip) {
      bol = seqBol.trim();
      if (!bol) {
        setSeqError("Enter the BOL number.");
        return;
      }
      if (!seqSupplier.trim()) {
        setSeqError("Pick the supplier.");
        return;
      }
      netN = parseFloat(seqNetShown);
      if (!Number.isFinite(netN) || netN < 0) {
        setSeqError("Enter the net gallons.");
        return;
      }
      // A split exists because the BOLs differ.
      const key = normalizeRef(bol);
      const sameProductOther = seqGroups.some(
        (g, i) =>
          i !== compSeqIndex &&
          g.productId === group.productId &&
          tripExtras[g.comps[0]] &&
          normalizeRef(tripExtras[g.comps[0]].bol) === key,
      );
      if (sameProductOther) {
        setSeqError("Each split needs its own BOL number.");
        return;
      }
      if (!okBols.current.has(key)) {
        setSeqBusy(true);
        const dup = await trip.checkBols([bol]).catch(() => [] as string[]);
        setSeqBusy(false);
        if (dup.length) {
          setSeqError(`BOL ${bol} is already on another load.`);
          return;
        }
        okBols.current.add(key);
      }
    }

    // Spread the window's gross (and net) over its compartments by planned gallons.
    const weights = group.comps.map((c) => lineByComp.get(c)?.gallons ?? 0);
    const grossShares = distributeWhole(gallonsN, weights);
    const updated = { ...compEntries };
    group.comps.forEach((c, i) => {
      updated[c] = { gallons: grossShares[i], api: apiN, tempF: tempN };
    });
    setCompEntries(updated);

    let updatedExtras = tripExtras;
    if (trip && netN != null) {
      const netShares = distributeWhole(netN, grossShares);
      const calcShares = seqCalc != null ? distributeWhole(seqCalc, grossShares) : group.comps.map(() => null);
      updatedExtras = { ...tripExtras };
      group.comps.forEach((c, i) => {
        updatedExtras[c] = {
          bol,
          supplier: seqSupplier.trim(),
          supplierId: seqSupplierId,
          net: netShares[i],
          netCalculated: calcShares[i],
        };
      });
      setTripExtras(updatedExtras);
    }

    const isLast = compSeqIndex >= seqGroups.length - 1;
    if (isLast) {
      setCompSeqIndex(null);
      if (editingReport) {
        onEditLoad?.(updated, trip ? { byComp: updatedExtras } : undefined);
        setEditingReport(false);
      } else if (trip) {
        // On to the times window, then the signature. Begin is the Begin
        // Loading tap; depart is the Finish Loading tap.
        setTripTimes(
          trip.existingTimes ??
            defaultStepTimes(
              finishTappedAt.current ?? new Date(),
              loadingOffset(trip.settings),
              trip.arrivedAt,
              trip.beganAt,
              trip.departedAt ?? null,
            ),
        );
        setTripReasonId(trip.existingDelayReasonId);
        setTripNote(trip.existingDelayNote ?? "");
        setTripOdometer(trip.existingOdometer != null ? String(trip.existingOdometer) : "");
        setTripSigned(false);
        setTripStepError(null);
        setTripStep("times");
      } else {
        onLoaded(updated);
      }
    } else {
      setCompSeqIndex(compSeqIndex + 1);
    }
  }

  const seqCalc =
    trip && seqGroup
      ? calculateNetGallons(
          numOrNull(seqGallons),
          numOrNull(seqApi),
          numOrNull(seqTemp),
          netMethodForProduct(productNameById.get(seqGroup.productId) ?? null),
        )
      : null;
  const seqNetShown = seqNetTouched ? seqNet : seqCalc != null ? String(seqCalc) : seqNet;

  return {
    commitCompStep,
    compSeqIndex,
    setCompSeqIndex,
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
    seqBol,
    setSeqBol,
    seqSupplier,
    setSeqSupplier,
    setSeqSupplierId,
    seqNet,
    setSeqNet,
    seqNetTouched,
    setSeqNetTouched,
    seqError,
    setSeqError,
    seqBusy,
    seqFocus,
    setSeqFocus,
    pickingSupplier,
    setPickingSupplier,
    tripExtras,
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
    seqGroups,
    seqGroup,
    seqCalc,
    seqNetShown,
    startLogSequence,
    startEditSequence,
    cancelLogSequence,
    goToPreviousCompStep,
    openSplit,
    finishSplit,
  };
}
