"use client";
// app/planner/home/useHomeDelays.tsx
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

import { useCallback, useEffect, useMemo } from "react";

import { supabase } from "@/lib/supabase/client";

import { topUnread, totalUnread, type SquawkCtx, type SquawkType } from "@/lib/squawk/squawk";
import { playChirp, useMyArea, useSquawkAlerts } from "@/lib/squawk/useSquawk";

import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import { delayIssueCode, legForStep, loggedDelays, readRunningDelay, writeRunningDelay, type RunningDelay, endRunningDelay, attachPendingDelays, INSTANT_CODES, logInstantDelay, SHOP_CODE } from "@/lib/trips/delays";

import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { type LatLon } from "@/lib/trips/deliveryLocations";

import { useActiveOutageBanner } from "../hooks/useTerminalOutageReports";

import { applyStartLoad, buildStartLoad, lastShipperCustomer, openTripForDriver, dispatchedForDriver, beginDispatched, truckBeginMiles, tripChildren, type StartLoadDelivery } from "@/lib/trips/tripLogic";
import { activePickup, handoffCandidate, onBoard, parkedTripOnTrailer, plannedDeliveries, tripSnapshot } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripRow } from "@/lib/trips/types";
import type { StartLoadValues } from "../components/StartLoadSheet";

import { useTruckReading, fetchTruckShipments, fetchTruckReading } from "@/lib/telematics/useTruckReading";

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

import { useTripEquipment } from "../hooks/useTripEquipment";

import { submitOutageReport } from "../hooks/useTerminalOutageReports";

import { needsGaugingAnswer } from "@/lib/trips/gaugingAsk";

import { clearDeliveryDraft, type DeliveryProgress, type FinishDeliverySubmit, type ProductInfo } from "../components/trip/DeliveryDashboard";

import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";

import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";

import { checkAddPickup, grossColor, LEGAL_GROSS_LBS } from "@/lib/trips/addPickupCheck";
import { topOffPlan, roughLbsPerGal, mergeBlendRows, blendPct, blendLabel, offTarget, validPct } from "@/lib/trips/splash";
import { getTripSplash, setTripSplash, type TripSplash } from "@/lib/trips/tripSplash";
import { markAddingPickup, releaseAddingPickup } from "@/lib/trips/pickerIntent";
import { isSplashable, splashPickupPlans, refineSecondStop, type StagedPlanned } from "@/lib/trips/splashRows";

import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { headingToTerminal, parkedPreloads } from "@/lib/trips/dashboardCards";

import { snoozed, telematicsStart } from "@/lib/shifts/autoStart";

import { writeShopDown } from "@/lib/trips/shopDown";

import { useSecondSeat } from "../hooks/useSecondSeat";
import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";

import { beginTripShift, offDutyAsk, telematicsLive } from "@/lib/shifts/dutyStatus";

import { useOtherCarriers, useStoreDeliveries, useTerminalStatus } from "../hooks/useDashboardCards";
import { useCompanyRoster } from "../hooks/useCompanyRoster";

import { LOOK, useScrollBackdrop } from "./dashLook";

import { useEmailTripPackage } from "@/lib/trips/useTripPackagePrefs";
import { fetchTrailerAlerts, sendPendingTrailerAlerts } from "@/lib/trips/trailerAlerts";

import { openAccessSteps, useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";

import { EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";

import { type ExpGroup, type ExpRow } from "./DashboardSheets";

import { initialsOf } from "../components/trip/DashboardCards";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import type { useHomeBase } from "./useHomeBase";

export function useHomeDelays(p: ReturnType<typeof useHomeBase>) {
  const { shift, lastShiftEndedMs, companyId, equipment, location, locations, openTrip, openingPlanner, openingReport, repairFromDelay, resumeDraft, router, runningDelay, setAutoArrive, setBackBusy, setBlockNotice, setGaugingAsk, setNotice, setOpeningPlanner, setOpeningReport, setRackSheetOpen, setRepairOpen, setResumeDraft, setRunningDelay, setSheetOpen, setShopDown, setStoredLocId, setTrailerNotes, sheetOpen, shell, shopDown, snap, startDelayRef, state, step, store, storedLocId, syncNow, terminalCatalog, terminals, trailerId, trips, userId } = p;

  useEffect(() => {
    if (userId) setRunningDelay(readRunningDelay(userId));
  }, [userId]);
  // A delay never outlives the shift: when the shift has ended, stop it at the moment the shift ended.
  useEffect(() => {
    if (!runningDelay || shift.current || !lastShiftEndedMs) return;
    const started = Date.parse(runningDelay.startedAt);
    if (Number.isFinite(started) && lastShiftEndedMs >= started) endDelay(new Date(lastShiftEndedMs).toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningDelay, shift.current, lastShiftEndedMs]);
  // Plan Review's Rack Delay starts one from the Planner overlay: pick it up here.
  useEffect(() => {
    const h = () => { if (userId) setRunningDelay(readRunningDelay(userId)); };
    window.addEventListener("protankr:delay", h);
    return () => window.removeEventListener("protankr:delay", h);
  }, [userId]);
  // No trip yet (waiting on dispatch): the delay is kept and goes onto the next trip's timeline.
  const delayLeg = !openTrip || step.kind === "start" ? "pre_trip" as const : legForStep(step.kind);
  const endDelay = (atIso?: string) => {
    if (!store || !userId) return;
    if (endRunningDelay(store, userId, atIso)) { setRunningDelay(null); void syncNow(); }
  };
  const askGauging = (terminalId: string | null | undefined) => {
    if (!terminalId) return;
    const t = (terminalCatalog ?? []).find((x) => String(x.terminal_id) === String(terminalId));
    if (t && needsGaugingAnswer(t)) setGaugingAsk({ id: String(t.terminal_id), name: t.terminal_name ?? "this terminal" });
  };
  const startDelay = (code: string, note: string | null) => {
    if (!userId || !delayLeg) return;
    const d: RunningDelay = {
      tripId: delayLeg === "pre_trip" ? "" : openTrip?.trip_id ?? "", leg: delayLeg, code, note, startedAt: new Date().toISOString(),
      // The "planner" step (Begin Loading) carries no pickup of its own: use the rack the driver is waiting at.
      pickupId: "pickup" in step ? step.pickup.pickup_id : (snap?.pickups.find((p) => p.arrived_at && !p.load_id && !p.left_at && !p.outcome)?.pickup_id ?? null),
      deliveryId: "delivery" in step ? step.delivery.delivery_id : null,
    };
    // Truck Down is a moment, not a wait: stamp it, then open the report (the shop timer starts with "At the shop").
    if (INSTANT_CODES.has(code)) {
      if (store) logInstantDelay(store, userId, d);
      repairFromDelay.current = true;
      setRepairOpen(true);
      void syncNow();
      return;
    }
    writeRunningDelay(userId, d);
    setRunningDelay(d);
    // Long line / rack down / terminal issue at the rack also warn other drivers heading there.
    const issue = delayIssueCode(code);
    const pk = "pickup" in step ? step.pickup : null;
    if (code === "gauging" && delayLeg === "at_rack") askGauging(pk?.terminal_id ? String(pk.terminal_id) : snap?.pickups.find((p) => p.arrived_at && !p.left_at && !p.outcome)?.terminal_id as string | undefined);
    if (issue && delayLeg === "at_rack" && pk?.terminal_id && companyId) {
      void submitOutageReport({
        terminalId: String(pk.terminal_id), selectedRackId: pk.rack_id ?? null, productIds: [], reportType: issue,
        companyId, userId, truckLabel: equipment.currentTruckName ?? "",
      }).then((r) => { if (r.error) console.warn("[trips] rack delay report failed (non-fatal):", r.error); });
    }
  };
  // The trip has started: delays from before it (waiting on dispatch) go onto its timeline.
  useEffect(() => {
    if (!store || !userId || !openTrip || openTrip.status === "draft") return;
    if (attachPendingDelays(store, userId, openTrip.trip_id) > 0) { setRunningDelay(readRunningDelay(userId)); void syncNow(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, userId, openTrip?.trip_id, openTrip?.status]);
  startDelayRef.current = startDelay;
  const backInService = async () => {
    if (!userId || !shopDown) return;
    setBackBusy(true);
    const { error } = await supabase.rpc("set_equipment_status", { p_unit_kind: shopDown.unitKind, p_unit_id: shopDown.unitId, p_status: "in_use", p_notes: null, p_sub_status: null });
    setBackBusy(false);
    if (error) { setBlockNotice({ title: "Couldn't clear Deadline", text: error.message }); return; }
    if (runningDelay?.code === SHOP_CODE) endDelay();
    writeShopDown(userId, null); setShopDown(null);
    setNotice({ text: `${shopDown.unitKind === "truck" ? "Truck" : "Trailer"} ${shopDown.unitName} is back in service. Pick your equipment again.`, tripId: null });
    openEquipment();
  };
  const tripDelays = useMemo(
    () => (store && openTrip ? loggedDelays(store.list("trip_events", (e) => e.trip_id === openTrip.trip_id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, openTrip?.trip_id, state],
  );
  useEffect(() => {
    if (shell.loadOverlayOpen) { setOpeningPlanner(false); setOpeningReport(false); }
  }, [shell.loadOverlayOpen]);
  useEffect(() => {
    if (!openingPlanner && !openingReport) return;
    const t = window.setTimeout(() => { setOpeningPlanner(false); setOpeningReport(false); }, 10000);
    return () => window.clearTimeout(t);
  }, [openingPlanner, openingReport]);
  // "Arrived at Delivery" from the load report, opened over this screen.
  useEffect(() => {
    const h = () => setAutoArrive(true);
    window.addEventListener("protankr:arrive", h);
    return () => window.removeEventListener("protankr:arrive", h);
  }, []);
  // A load parked on the trailer this driver holds (theirs after a layover, or
  // someone else's for a slip seat).
  const parked = !openTrip ? parkedTripOnTrailer(trips, trailerId) : null;
  // Another driver's open trip on this trailer. A parked preload always comes first (it is the one to take), and a
  // trip whose deliveries are all done with nothing aboard is finished, not something to take over.
  const handoffRaw = !openTrip && !parked && userId ? handoffCandidate(trips, trailerId, userId) : null;
  const handoff = (() => {
    if (!handoffRaw || !store) return handoffRaw;
    const sn = tripSnapshot(store, handoffRaw.trip_id);
    const live = sn.deliveries.filter((d) => d.status !== "cancelled");
    return live.length > 0 && live.every((d) => d.status === "complete") && onBoard(sn.compLoads).length === 0 ? null : handoffRaw;
  })();
  const emailPkg = useEmailTripPackage(userId || null);
  const reloadTrailerAlerts = () => { if (trailerId) void fetchTrailerAlerts(trailerId).then(setTrailerNotes); else setTrailerNotes([]); };
  useEffect(() => { void sendPendingTrailerAlerts().then(reloadTrailerAlerts); }, [trailerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const parkedSnap = useMemo(
    () => (store && parked ? tripSnapshot(store, parked.trip_id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, parked?.trip_id, state],
  );

  // ── Current terminal (the Planner's) ───────────────────────────────────────
  const terminalName = useMemo(() => {
    const id = String(location.selectedTerminalId || "");
    if (!id) return null;
    const t = terminals.terminals.find((x) => String(x.terminal_id) === id)
      ?? terminals.terminalCatalog.find((x) => String(x.terminal_id) === id);
    return t?.terminal_name ? String(t.terminal_name) : "Terminal";
  }, [location.selectedTerminalId, terminals.terminals, terminals.terminalCatalog]);
  const placeLabel = [location.selectedCity, location.selectedState].filter(Boolean).join(", ");
  const pickupLabel = terminalName ? `${terminalName}${placeLabel ? ` · ${placeLabel}` : ""}` : null;

  // Geotab shows who is behind the wheel: a steering wheel by the numbers when that is you, and a second-seat line when it is someone else.
  const secondSeat = useSecondSeat(userId).seat;
  const behindWheel = false; // no tracker: "behind the wheel" is not inferred anymore
  const equipmentLabel = equipment.equipmentLabel
    ?? (equipment.isBobtail ? `Truck ${equipment.currentTruckName ?? ""} (bobtail)`.trim() : secondSeat ? `Second seat · Truck ${secondSeat.truckName ?? ""}${secondSeat.driverName ? ` · driver ${secondSeat.driverName}` : ""}` : "No equipment selected");

  // Near Me measures from the pickup terminal (§4).
  const origin = useMemo<LatLon | null>(() => {
    const p = snap ? activePickup(snap.pickups) ?? [...snap.pickups].reverse().find((x) => x.terminal_id) : null;
    const id = String(p?.terminal_id || location.selectedTerminalId || "");
    const t = id ? terminalCatalog.find((x) => String(x.terminal_id) === id) : null;
    return t && t.lat != null && t.lon != null ? { lat: Number(t.lat), lon: Number(t.lon) } : null;
  }, [snap, location.selectedTerminalId, terminalCatalog]);

  // ── Terminal alerts (outage reports at the pickup terminal) ──────────────
  // Same reports as the header ticker, but for the trip's pickup terminal,
  // and every product's reports when no plan has been made yet this session.
  const alertTerminalId = useMemo(() => {
    // The driver's own pick (Switch Terminal, the terminal list) wins; the
    // trip's pickup is only the fallback. Picking a terminal follows the
    // pickup on arrival anyway, so the two normally agree.
    if (location.selectedTerminalId) return String(location.selectedTerminalId);
    const p = snap ? activePickup(snap.pickups) ?? [...snap.pickups].reverse().find((x) => x.terminal_id) : null;
    return String(p?.terminal_id || "") || null;
  }, [snap, location.selectedTerminalId]);
  const alertProducts = useMemo<Set<string> | "all">(
    () => (shell.plannedProductIds.size > 0 ? shell.plannedProductIds : "all"),
    [shell.plannedProductIds],
  );
  const terminalAlerts = useActiveOutageBanner(alertTerminalId, userId || null, alertProducts);

  // ── Readout cards ─────────────────────────────────────────────────────────
  const statusTerminalName = useMemo(() => {
    if (!alertTerminalId) return null;
    const t = terminalCatalog.find((x) => String(x.terminal_id) === alertTerminalId);
    return t?.terminal_name ? String(t.terminal_name) : terminalName;
  }, [alertTerminalId, terminalCatalog, terminalName]);
  const statusRackId = useMemo(() => {
    const p = snap ? activePickup(snap.pickups) : null;
    if (p?.rack_id && String(p.terminal_id ?? "") === alertTerminalId) return p.rack_id;
    return String(location.selectedTerminalId || "") === alertTerminalId ? location.selectedRackId ?? null : null;
  }, [snap, alertTerminalId, location.selectedTerminalId, location.selectedRackId]);
  const terminalStatus = useTerminalStatus(alertTerminalId, statusRackId);
  const fleet = useFleetTrips(companyId);
  const myDelivery = snap ? plannedDeliveries(snap.deliveries)[0] ?? null : null;
  // The To Rack chip follows where this trip is loading (its active pickup), else the terminal picked.
  const myPickup = snap ? activePickup(snap.pickups) : null;
  const rackTerminalId = String(myPickup?.terminal_id || "") || alertTerminalId;
  const toMyTerminal = useMemo(() => headingToTerminal(fleet.trips, rackTerminalId, userId), [fleet.trips, rackTerminalId, userId]);
  // My own truck counts too: headed to this rack until I've left it, and
  // headed to the drop while loaded with a delivery set.
  const meToRack = !!myPickup && !!rackTerminalId && String(myPickup.terminal_id ?? "") === rackTerminalId;
  const rackStatus = useTerminalStatus(rackTerminalId, myPickup?.rack_id && String(myPickup.terminal_id ?? "") === rackTerminalId ? myPickup.rack_id : null);
  const rackAlerts = useActiveOutageBanner(rackTerminalId, userId || null, "all");
  const rackName = useMemo(() => {
    const t = rackTerminalId ? terminalCatalog.find((x) => String(x.terminal_id) === rackTerminalId) : null;
    return t?.terminal_name ? String(t.terminal_name) : "Terminal";
  }, [rackTerminalId, terminalCatalog]);
  // At the rack but loading hasn't started: the rack window shows the arrival and the Begin Loading button.
  const arrivalPickup = snap?.pickups.find((p) => p.arrived_at && !p.begin_at && !p.left_at && !p.outcome) ?? null;
  // Opens Plan Review. Nothing is stamped here: Begin Loading in Plan Review is the one place the start time is set.
  const startLoading = () => {
    if (!store || !arrivalPickup) return;
    setOpeningPlanner(true);
    setRackSheetOpen(false);
    shell.postPlannerIntent("begin");
  };
  // Plan Review's back arrow (before Begin Loading) comes back here, without a question.
  useEffect(() => {
    const h = () => { if (arrivalPickup) setRackSheetOpen(true); };
    window.addEventListener("protankr:openRackSheet", h);
    return () => window.removeEventListener("protankr:openRackSheet", h);
  }, [arrivalPickup?.pickup_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rackCity = useMemo(() => {
    const t = rackTerminalId ? terminalCatalog.find((x) => String(x.terminal_id) === rackTerminalId) : null;
    return t?.city ? String(t.city) : "";
  }, [rackTerminalId, terminalCatalog]);
  const otherToRack = useOtherCarriers("terminal", rackTerminalId);
  const rackCount = toMyTerminal.length + otherToRack.length + (meToRack ? 1 : 0);
  const nearbyParked = useMemo(() => parkedPreloads(fleet.trips, trailerId), [fleet.trips, trailerId]);
  const completedDeliveries = useMemo(
    () => Object.values(state.rows.trip_deliveries ?? {}).filter((d: any) => d.status === "complete").length,
    [state],
  );
  // The driver's delivery location: the trip's next delivery when there is
  // one, else the last one picked here (kept per user on this phone).
  const deliveryKey = userId ? `proTankr:u:${userId}:deliveryLocation` : null;
  useEffect(() => {
    if (!deliveryKey) return;
    try { setStoredLocId(window.localStorage.getItem(deliveryKey)); } catch { /* storage blocked */ }
  }, [deliveryKey]);
  const rememberDelivery = useCallback((id: string | null) => {
    setStoredLocId(id);
    if (!deliveryKey) return;
    try {
      if (id) window.localStorage.setItem(deliveryKey, id);
      else window.localStorage.removeItem(deliveryKey);
    } catch { /* storage blocked */ }
  }, [deliveryKey]);
  useEffect(() => {
    if (myDelivery?.location_id && myDelivery.location_id !== storedLocId) rememberDelivery(myDelivery.location_id);
  }, [myDelivery?.location_id, storedLocId, rememberDelivery]);
  const selectedLocId = myDelivery?.location_id ?? storedLocId;
  const selectedLoc = selectedLocId ? locations.find((l) => l.location_id === selectedLocId) ?? null : null;
  const recent = useStoreDeliveries(selectedLoc?.location_id ?? null, completedDeliveries);
  const roster = useCompanyRoster(companyId);
  // "SP 25184": my initials and truck, for my own rows.
  const myLabel = [initialsOf(roster.members.find((m) => m.user_id === userId)?.display_name), equipment.currentTruckName].filter(Boolean).join(" - ") || "You";
  const statusPlace = useMemo(() => {
    const t = alertTerminalId ? terminalCatalog.find((x) => String(x.terminal_id) === alertTerminalId) : null;
    return t ? [t.city, t.state].filter(Boolean).join(", ") || null : null;
  }, [alertTerminalId, terminalCatalog]);

  // ── Mid-trip equipment change (warning + truck change record) ────────────
  const tripEquip = useTripEquipment({ state, store, syncNow }, userId);
  const { tripLoaded, truckChanged, currentGross, currentTarget, openEquipment } = tripEquip;
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("resume") !== "trip") return;
    params.delete("resume");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    const d = takeTripDraft(userId);
    const slot = takeDetourSlot();
    if (d) { setResumeDraft({ ...d, planSlot: slot ?? d.planSlot }); setSheetOpen(true); }
  }, [userId]);
  useEffect(() => { if (!sheetOpen && resumeDraft) setResumeDraft(null); }, [sheetOpen, resumeDraft]);
  const planDetour = (what: "new" | number, v: StartLoadValues) => {
    if (!userId) return;
    saveTripDraft(userId, v);
    router.push(`/planner?plan=1&detour=${what === "new" ? "new" : `edit&slot=${what}`}`);
  };
  const editing = !!openTrip && !p.addingLoad;

  // Terminals picked on the dashboard are ahead of time: the rack is asked on Arrive.
  useEffect(() => {
    shell.setDeferRackPick(true);
    return () => shell.setDeferRackPick(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ...p, delayLeg, endDelay, askGauging, startDelay, backInService, tripDelays, parked, handoff, emailPkg, reloadTrailerAlerts, parkedSnap, terminalName, pickupLabel, behindWheel, equipmentLabel, origin, terminalAlerts, fleet, myDelivery, rackTerminalId, rackStatus, rackAlerts, rackName, arrivalPickup, startLoading, rackCity, rackCount, nearbyParked, completedDeliveries, rememberDelivery, selectedLocId, selectedLoc, tripEquip, tripLoaded, truckChanged, currentGross, currentTarget, openEquipment, planDetour, editing } as const;
}
