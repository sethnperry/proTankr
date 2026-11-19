"use client";
// app/planner/home/useHomeRacks.tsx
//
// One slice of the Driver Dashboard's logic (see useHome.tsx for how the slices chain together).
// app/planner/home/useHome.tsx
//
// All of the Driver Dashboard's state, effects and handlers. Returns what the screen (HomeView) draws.

// app/planner/home/page.tsx
//
// Driver dashboard (trip workflow phase 2, docs/trip-workflow-design.md §9 and
// §14): where the driver's trip stands, one big button for the next step, and
// the everyday tools underneath.
//
// Everything about the trip is local-first: Start Load writes to the offline
// trip store (lib/trips) and syncs in the background, so a driver with no
// signal at the terminal still gets a working button.
//
// The big button walks the trip: Begin Trip → Arrived → (Planner) → Loaded →
// Arrived → Finish Delivery. The load itself is begun in the Planner, which
// attaches it to this trip (useLoadWorkflow -> linkLoadToOpenTrip).

import { useEffect, useMemo } from "react";

import { topUnread, totalUnread, type SquawkCtx, type SquawkType } from "@/lib/squawk/squawk";
import { playChirp, useMyArea, useSquawkAlerts } from "@/lib/squawk/useSquawk";

import { dashTourSeen } from "../components/tour/DashboardTour";

import { useStopAnswers } from "@/lib/trips/useStopAnswers";
import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import { DELAY_EVENT, delayEventPayload, type RunningDelay } from "@/lib/trips/delays";
import { newId } from "@/lib/trips/tripStore";

import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { airMiles, locationTitle } from "@/lib/trips/deliveryLocations";

import { applyStartLoad, buildStartLoad, lastShipperCustomer, openTripForDriver, dispatchedForDriver, beginDispatched, truckBeginMiles, tripChildren, type StartLoadDelivery } from "@/lib/trips/tripLogic";
import { unlinkCancelledLoad } from "@/lib/trips/tripLogic";
import { activePickup, arriveDelivery, undoableArrival, undoArrivePickup, undoArriveDelivery, closePickupNoLoad, canCancelLoad, onBoard } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripRow } from "@/lib/trips/types";

import { fetchTruckReading } from "@/lib/telematics/useTruckReading";

import { useDepartureWatch } from "@/lib/telematics/useDepartureWatch";

import { shouldNotifyHosTrip, type Level } from "@/lib/telematics/hosTripNotify";
import { notifyPermission, showNotification, type NotifyPermission } from "@/lib/ui/notify";

import { DROP_STOP_MIN, LOAD_STOP_MIN, remainingDriveMin, tripHosCheck } from "@/lib/telematics/progress";
import { recordArrivalPoint, useArrivalSuggestion, type ArrivalTarget } from "@/lib/telematics/useArrivalSuggestion";
import { fetchPresets, getTripPlan, setTripPlan, setTripPlanSnapshot, setTripQuick, nextSaveSlot, savePresetPlan, slotLetter, type PresetSummary } from "@/lib/trips/tripPlan";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";

import { writePicks, type SupplierPick } from "@/lib/suppliers/picks";
import { saveTripDraft, takeTripDraft, takeDetourSlot } from "@/lib/trips/planDetour";
import { getTripSupplier, sameSupplier, seedTerminalPicks, setTripSupplier, type TripSupplier } from "@/lib/trips/tripSupplier";
import { readPicks, groupPicks } from "@/lib/suppliers/picks";

import { type NoLoadSubmit } from "../components/trip/NoLoadSheet";

import { submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";
import { isTerminalIssueCode } from "@/lib/trips/terminalIssues";
import { cancelPlannedLoad } from "@/lib/supabase/load";

import { clearActivePlannedLoad } from "../utils/activePlannedLoad";

import { clearDeliveryDraft, type DeliveryProgress, type FinishDeliverySubmit, type ProductInfo } from "../components/trip/DeliveryDashboard";

import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";

import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";

import { checkAddPickup, grossColor, LEGAL_GROSS_LBS } from "@/lib/trips/addPickupCheck";
import { topOffPlan, roughLbsPerGal, mergeBlendRows, blendPct, blendLabel, offTarget, validPct } from "@/lib/trips/splash";
import { getTripSplash, setTripSplash, type TripSplash } from "@/lib/trips/tripSplash";
import { markAddingPickup, releaseAddingPickup } from "@/lib/trips/pickerIntent";
import { isSplashable, splashPickupPlans, refineSecondStop, type StagedPlanned } from "@/lib/trips/splashRows";

import { headingToTerminal, parkedPreloads, storeActivity } from "@/lib/trips/dashboardCards";

import type { ReasonPick } from "../components/reasons/ReasonChips";

import { snoozed, telematicsStart } from "@/lib/shifts/autoStart";

import { readShopDown, writeShopDown, SHOP_BLOCK, type ShopDown } from "@/lib/trips/shopDown";

import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";

import { offDutyAsk } from "@/lib/shifts/dutyStatus";

import { useOtherCarriers, useStoreDeliveries, useTerminalStatus } from "../hooks/useDashboardCards";

import { LOOK, useScrollBackdrop } from "./dashLook";

import { addTrailerAlert, clearTrailerAlerts, fetchTrailerAlerts, sendPendingTrailerAlerts, type TrailerAlert } from "@/lib/trips/trailerAlerts";

import { openAccessSteps, useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";

import { EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";

import { type ExpGroup, type ExpRow } from "./DashboardSheets";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import type { useHomeStamp } from "./useHomeStamp";

export function useHomeRacks(p: ReturnType<typeof useHomeStamp>) {
  const { addAnotherPickup, askEquipment, autoArrive, clock, companyId, delayLeg, deliveryName, equipment, fuel, fuelOn, fuelPending, handledStops, hopRef, location, locations, myHos, nextRackPending, nextRackSawPicker, offDutyDismissed, openDelivery, openTrip, productName, products, runningDelay, setAutoArrive, setBlockNotice, setDropSiteOpen, setFuelOpen, setFuelPending, setHandledStops, setNextRackPending, setNoLoadBusy, setNoLoadErr, setNoLoadOpen, setNotice, setOffDutyDismissed, setOffWhyOpen, setPicker, setStopClock, setStopFar, setTourOpen, setUndoConfirm, settings, shell, shift, shiftKey, snap, step, stopClock, stopFar, store, syncNow, terminalCatalog, trailerId, truckId, userId } = p;

  useEffect(() => {
    if (fuelPending && truckId) { setFuelPending(false); void tapFuel(); }
  }, [fuelPending, truckId]);

  // ── Couldn't load here / next rack ───────────────────────────────────────
  const workingPickup = snap ? activePickup(snap.pickups) : null;
  const canNoLoad = !!workingPickup && (!!workingPickup.arrived_at || !!workingPickup.load_id)
    && step.kind === "planner";
  const plannedProducts = useMemo(
    () => [...shell.plannedProductIds].map((id) => ({ productId: id, name: productName(id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shell.plannedProductIds, products],
  );

  const onNoLoadSubmit = async (v: NoLoadSubmit) => {
    if (!store || !userId || !companyId || !workingPickup) return;
    setNoLoadBusy(true);
    setNoLoadErr(null);
    const pickup = workingPickup;
    // A load started in the Planner at this rack is cancelled (the plan stays).
    if (pickup.load_id) {
      try {
        await cancelPlannedLoad(pickup.load_id);
      } catch (e) {
        console.warn("[trips] cancel planned load failed (non-fatal):", e);
      }
      clearActivePlannedLoad(userId);
    }
    closePickupNoLoad(store, {
      userId, pickup, reason: v.reason, note: v.note, arrivedAt: v.arrivedAt, leftAt: v.leftAt, ...clock(),
    });
    void syncNow();
    // Warn other drivers headed there. Best effort: the rack is already closed
    // on the trip either way.
    if (isTerminalIssueCode(v.reason) && pickup.terminal_id) {
      const { error: repErr } = await submitOutageReport({
        terminalId: pickup.terminal_id,
        selectedRackId: pickup.rack_id,
        productIds: v.productIds,
        reportType: v.reason as OutageReportType,
        companyId,
        userId,
        truckLabel: equipment.currentTruckName ?? "",
      });
      if (repErr) console.warn("[trips] terminal issue report failed (non-fatal):", repErr);
    }
    setNoLoadBusy(false);
    setNoLoadOpen(false);
    setNotice({ text: "Saved. Pick the next terminal.", tripId: null });
  };
  useEffect(() => {
    if (!nextRackPending) return;
    const pickerOpen = shell.termOpen || shell.locOpen || shell.rackPickerOpen || shell.rackResolving;
    if (pickerOpen) { nextRackSawPicker.current = true; return; }
    if (!nextRackSawPicker.current) return;
    nextRackSawPicker.current = false;
    setNextRackPending(false);
    if (location.selectedTerminalId) addAnotherPickup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextRackPending, shell.termOpen, shell.locOpen, shell.rackPickerOpen, shell.rackResolving, location.selectedTerminalId]);

  // Arrival detection: the stop the truck should be arriving at, from the trip's next step.
  const arrivalTarget = useMemo<ArrivalTarget | null>(() => {
    if (step.kind === "arrive_pickup" && step.pickup.terminal_id) {
      const t = terminalCatalog?.find((x) => String(x.terminal_id) === String(step.pickup.terminal_id));
      return { kind: "terminal", refId: String(step.pickup.terminal_id), name: step.pickup.name ?? t?.terminal_name ?? "the terminal",
        catalog: t?.lat != null && t?.lon != null ? { lat: Number(t.lat), lon: Number(t.lon) } : null };
    }
    if (step.kind === "arrive_delivery" && step.delivery.location_id) {
      const l = locations.find((x) => x.location_id === step.delivery.location_id);
      return { kind: "location", refId: step.delivery.location_id, name: l ? locationTitle(l) : "the store",
        catalog: l?.lat != null && l?.lon != null ? { lat: l.lat, lon: l.lon } : null };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, (step as any).pickup?.pickup_id, (step as any).delivery?.delivery_id, terminalCatalog, locations]);
  const arrival = useArrivalSuggestion({ companyId: companyId || null, truckId, target: arrivalTarget, enabled: !!arrivalTarget && !!openTrip && !fuelOn });
  const learnArrival = () => {
    if (arrivalTarget && companyId && userId) void recordArrivalPoint({ companyId, userId, truckId, target: arrivalTarget });
  };
  // Departure: while the truck sits at a stop it has arrived at, note when it really leaves.
  const atStop = useMemo(() => {
    if (!snap) return null;
    const pk = snap.pickups.find((p) => p.arrived_at && !p.left_at && p.outcome !== "no_load");
    if (pk?.terminal_id) {
      const t = terminalCatalog?.find((x) => String(x.terminal_id) === String(pk.terminal_id));
      return { key: pk.pickup_id, target: { kind: "terminal" as const, refId: String(pk.terminal_id), name: pk.name ?? t?.terminal_name ?? "the terminal",
        catalog: t?.lat != null && t?.lon != null ? { lat: Number(t.lat), lon: Number(t.lon) } : null } };
    }
    const dl = snap.deliveries.find((d) => d.arrived_at && !d.left_at && d.status !== "complete" && d.status !== "cancelled" && d.location_id);
    if (dl?.location_id) {
      const l = locations.find((x) => x.location_id === dl.location_id);
      return { key: dl.delivery_id, target: { kind: "location" as const, refId: dl.location_id, name: l ? locationTitle(l) : "the store",
        catalog: l?.lat != null && l?.lon != null ? { lat: l.lat, lon: l.lon } : null } };
    }
    return null;
  }, [snap, terminalCatalog, locations]);
  const autoStampOn = settings.auto_stamp_arrival !== false;
  // After an undone Arrive the truck is usually still at the stop; don't re-stamp or re-offer it.
  const noAutoKey = (id: string) => `proTankr:noAuto:${id}`;
  const stepStopId = step.kind === "arrive_pickup" ? step.pickup.pickup_id : step.kind === "arrive_delivery" ? step.delivery.delivery_id : null;
  const autoBlocked = (() => { try { return !!stepStopId && localStorage.getItem(noAutoKey(stepStopId)) === "1"; } catch { return false; } })();
  const undoable = snap ? undoableArrival(snap) : null;
  const undoName = undoable?.kind === "pickup" ? (undoable.pickup.name ?? "the terminal") : undoable?.kind === "delivery" ? "the store" : "";
  const doUndoArrival = () => {
    if (!store || !userId || !undoable) return;
    const id = undoable.kind === "pickup" ? undoable.pickup.pickup_id : undoable.delivery.delivery_id;
    try { localStorage.setItem(noAutoKey(id), "1"); } catch {}
    if (undoable.kind === "pickup") {
      // A plan previewed from the arrival window attached a planned load: detach it first (the orphaned plan row is cleared by the next load).
      if (undoable.pickup.load_id) unlinkCancelledLoad(store, { userId, loadId: undoable.pickup.load_id, now: new Date(), newId });
      undoArrivePickup(store, { userId, pickup: undoable.pickup, now: new Date(), newId });
    }
    else undoArriveDelivery(store, { userId, delivery: undoable.delivery, now: new Date(), newId });
    void syncNow();
    setUndoConfirm(false);
    setNotice({ text: "Arrival undone. Tap Arrive when you really get there.", tripId: null });
  };
  useDepartureWatch({ companyId: companyId || null, truckId, stopKey: atStop?.key ?? null, target: atStop?.target ?? null, enabled: !!atStop && autoStampOn });
  const { answers: stopAnswers, markApplied: markAnswerApplied } = useStopAnswers(userId);
  useEffect(() => { if (userId) setHandledStops(readHandledStops(userId)); }, [userId]);
  useEffect(() => { const t = window.setInterval(() => setStopClock(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const hopPickup = snap && step.kind === "planner" ? snap.pickups.find((p) => p.arrived_at && !p.left_at && p.outcome !== "no_load") ?? null : null;
  const dutyStopRaw = useMemo(() => {
    const waiting = step.kind === "arrive_pickup" || step.kind === "arrive_delivery";
    if (!openTrip || !snap || (!waiting && !hopPickup)) return null;
    const stamps = [openTrip.started_at, ...snap.pickups.flatMap((p) => [p.arrived_at, p.left_at]), ...snap.deliveries.flatMap((d) => [d.arrived_at, d.left_at])]
      .filter(Boolean).map((t) => Date.parse(t as string));
    // Not while another clock is running (fueling, a delay), and only once the stop is a few minutes old.
    if (fuelOn || runningDelay) return null;
    const afterMs = Math.max(0, ...stamps);
    // An answer tapped on the notification comes first, oldest first, on the stop's own time.
    const queued = stopAnswers.find((a) => Date.parse(a.stop_at) > afterMs && (a.kind === "hop") === !!hopPickup);
    if (queued) {
      const real = (myHos?.stops ?? []).find((x) => Math.abs(Date.parse(x.at) - Date.parse(queued.stop_at)) < 60_000);
      return { at: real?.at ?? new Date(queued.stop_at).toISOString(), code: real?.code ?? "ON", resumedAt: real?.resumedAt ?? null, answerId: queued.id, answer: queued.answer, reason: queued.reason, reported: !!queued.report_posted_at };
    }
    const aged = (myHos?.stops ?? []).filter((x) => stopClock - Date.parse(x.at) >= STOP_GRACE_MS);
    const p = pendingStop(aged, { afterMs, handled: handledStops, stillStopped: !hopPickup });
    return p ? { ...p, answerId: undefined as string | undefined, answer: undefined as "arrived" | "delay" | "yes" | "no" | undefined, reason: undefined as string | null | undefined, reported: false } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myHos?.stops, openTrip?.trip_id, snap, arrivalTarget, step.kind, handledStops, hopPickup?.pickup_id, fuelOn, runningDelay, stopClock, stopAnswers]);
  useEffect(() => {
    const st = dutyStopRaw;
    const target = arrivalTarget?.catalog ?? null;
    if (!st || st.answerId || hopPickup || !target || !truckId || stopFar[st.at] !== undefined) return;
    let off = false;
    void fetchTruckReading(truckId).then((r) => {
      if (off || !r || r.lat == null || r.lon == null) return;
      setStopFar((m) => ({ ...m, [st.at]: airMiles({ lat: r.lat!, lon: r.lon! }, target) > 1 }));
    });
    return () => { off = true; };
  }, [dutyStopRaw?.at, dutyStopRaw?.answerId, arrivalTarget?.catalog, truckId, hopPickup?.pickup_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dutyStop = dutyStopRaw && !dutyStopRaw.answerId && stopFar[dutyStopRaw.at] === true ? null : dutyStopRaw; // eslint-disable-line react-hooks/exhaustive-deps
  const tapFuel = async () => {
    // Fuel, scale or any other stop waits until the delivery you're at is finished.
    const openDrop = snap?.deliveries.find((d) => d.arrived_at && !d.left_at && d.status !== "complete" && d.status !== "cancelled");
    if (openDrop && !fuel.active) {
      setBlockNotice({ title: "Finish the delivery first", text: `You're at ${deliveryName(openDrop) ?? "the delivery"}. Finish the delivery (or undo the arrival if you haven't dropped yet) before you fuel.` });
      return;
    }
    // Fuel is per truck: with none held, pick one first (the stop starts once a truck is held).
    if (!fuel.active && !truckId) { setFuelPending(true); void askEquipment(() => {}, { needTrailer: false }); return; }
    // Starting a fuel stop answers "did you arrive?": that stop was the fuel stop, so it is never asked about again.
    if (!fuel.active && userId) {
      const ats = [...(myHos?.stops ?? []).map((x) => x.at), ...(dutyStop ? [dutyStop.at] : [])];
      for (const at of ats) markStopHandled(userId, at);
      setHandledStops((c) => new Set([...c, ...ats]));
      if (dutyStop?.answerId) markAnswerApplied(dutyStop.answerId);
    }
    if (!fuel.active) await fuel.start({ truckId: truckId ?? null, trailerId: trailerId ?? null, tripId: openTrip?.trip_id ?? null });
    setFuelOpen(true);
  };
  // A stop made while fueling was the fuel stop, not an arrival: it is never asked about afterwards.
  useEffect(() => {
    if (!fuel.active || !userId) return;
    for (const x of dropFuelStops(myHos?.stops ?? [], [{ started_at: fuel.active.started_at, completed_at: null }])) {
      if (!handledStops.has(x.at)) { markStopHandled(userId, x.at); setHandledStops((c) => new Set(c).add(x.at)); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuel.active?.id, myHos?.stops]);
  // Name for the card: a store picked by name only (no saved location) has no geofence target but still gets asked.
  const stopName = arrivalTarget?.name ?? (step.kind === "arrive_delivery" ? deliveryName(step.delivery) : null);
  useEffect(() => {
    if (!userId) return;
    if (new URLSearchParams(window.location.search).get("tour")) {
      setTourOpen(true);
      window.history.replaceState(null, "", "/planner/home");
      return;
    }
    if (dashTourSeen(userId) || !equipment.selectedComboId) return;
    let calm = 0;
    const t = window.setInterval(() => {
      const busy = document.querySelector('[role="dialog"]:not([aria-label="Dashboard tour"]), [data-onboarding-layer]');
      calm = busy ? 0 : calm + 1;
      if (calm >= 2) { window.clearInterval(t); setTourOpen(true); }
    }, 1500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, equipment.selectedComboId]);
  const sigDelivery = step.kind === "finish_delivery" && step.delivery.arrived_at ? step.delivery : null;
  // The "still working?" questions never come up while the truck is moving, and the idle one never comes up
  // during an open trip (a long wait at a rack or store is work). Only a quiet, trip-less shift gets asked.
  const drivingNow = !!myHos && myHos.nonDrivingSince == null && (myHos.driveLeftMin != null || myHos.dutyLeftMin != null);
  useEffect(() => { if (!userId) return; try { setOffDutyDismissed(localStorage.getItem(shiftKey("offDutyDismissed"))); } catch { /* storage blocked */ } }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const offAsk = offDutyAsk({ hos: myHos, nowMs: Date.now(), shiftOpen: !!shift.current, dismissedSince: offDutyDismissed });
  const stillWorking = () => { if (offAsk) setOffWhyOpen(true); else shift.keepGoing(); };
  const submitOffWhy = (pick: ReasonPick) => {
    if (!offAsk) { setOffWhyOpen(false); return; }
    shift.keepGoing({ off_duty: true, eld_status: offAsk.status, eld_since: offAsk.since, reason: pick.label, reason_id: pick.reasonId && !pick.reasonId.startsWith("default-") ? pick.reasonId : null, category: pick.category, note: pick.note?.trim() || null });
    setOffDutyDismissed(offAsk.since);
    try { localStorage.setItem(shiftKey("offDutyDismissed"), offAsk.since); } catch { /* storage blocked */ }
    setOffWhyOpen(false);
  };
  const shiftPromptShown = drivingNow ? null : shift.prompt === "long" ? "long" : offAsk && !runningDelay ? "off_duty" : shift.prompt === "idle" && openTrip ? null : shift.prompt;
  const canCancelNow = canCancelLoad(openTrip, onBoard(snap?.compLoads ?? []).length > 0);
  const arriveCardPending = !!dutyStop && !arrival.suggest && !!stopName && !!delayLeg && !hopPickup;
  const answerStop = (at: string) => {
    if (userId) markStopHandled(userId, at);
    setHandledStops((s) => new Set(s).add(at));
    const row = stopAnswers.find((a) => Math.abs(Date.parse(a.stop_at) - Date.parse(at)) < 60_000);
    if (row) void markAnswerApplied(row.id);
  };
  const logDutyDelay = (code: string, note: string | null) => {
    if (!store || !userId || !openTrip || !dutyStop || !delayLeg) return;
    const d: RunningDelay = {
      tripId: openTrip.trip_id, leg: delayLeg, code, note, startedAt: dutyStop.at,
      pickupId: "pickup" in step ? step.pickup.pickup_id : null, deliveryId: "delivery" in step ? step.delivery.delivery_id : null,
    };
    const end = dutyStop.resumedAt ?? new Date().toISOString();
    store.put("trip_events", { event_id: newId(), trip_id: d.tripId, event_type: DELAY_EVENT, occurred_at: end, actor_id: userId, pickup_id: d.pickupId, delivery_id: d.deliveryId, payload: delayEventPayload(d, end) });
    answerStop(dutyStop.at);
    void syncNow();
  };
  // Rack hopping: the rack is closed with the reason, the next one is picked, and it starts at the stop's time.
  const hopToAnotherRack = (reason: string, productIds: string[], reported?: boolean) => {
    if (!dutyStop || !hopPickup) return;
    const st = (myHos?.stops ?? []).find((x) => x.at === dutyStop.at);
    hopRef.current = { stop: { at: dutyStop.at, droveFrom: st?.droveFrom }, pickup: hopPickup, reason, productIds, skipReport: reported };
    answerStop(dutyStop.at);
    setNextRackPending(true);
    if (location.selectedCity) shell.setTermOpen(true); else shell.setLocOpen(true);
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("arrive") !== "1") return;
    setAutoArrive(true);
    params.delete("arrive");
    const q = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
  }, []);
  useEffect(() => {
    if (!autoArrive || !store || !userId || !openTrip) return;
    if (step.kind === "arrive_delivery") {
      arriveDelivery(store, { userId, delivery: step.delivery, ...clock() });
      void syncNow();
      setDropSiteOpen(true);
      setAutoArrive(false);
    } else if (step.kind === "finish_delivery") {
      openDelivery();
      setAutoArrive(false);
    } else if (step.kind === "add_delivery") {
      setPicker({ mode: "add" });
    } else {
      setAutoArrive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoArrive, step.kind, store, userId, openTrip?.trip_id]);
  return { ...p, tapFuel, workingPickup, canNoLoad, plannedProducts, onNoLoadSubmit, arrivalTarget, arrival, learnArrival, autoBlocked, undoable, undoName, doUndoArrival, hopPickup, dutyStop, stopName, sigDelivery, offAsk, stillWorking, submitOffWhy, shiftPromptShown, canCancelNow, arriveCardPending, answerStop, logDutyDelay, hopToAnotherRack } as const;
}
