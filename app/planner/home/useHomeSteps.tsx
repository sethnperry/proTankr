"use client";
// app/planner/home/useHomeSteps.tsx
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

import type { TripPickupRow } from "@/lib/trips/types";

import { supabase } from "@/lib/supabase/client";

import { topUnread, totalUnread, type SquawkCtx, type SquawkType } from "@/lib/squawk/squawk";
import { playChirp, useMyArea, useSquawkAlerts } from "@/lib/squawk/useSquawk";

import type { DropProduct } from "../components/trip/DropSiteSheet";
import { sortTankNames } from "@/lib/trips/tankReadings";

import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import { DELAY_EVENT, delayEventPayload, delayIssueCode, legForStep, loggedDelays, readRunningDelay, writeRunningDelay, type RunningDelay, endRunningDelay, attachPendingDelays, INSTANT_CODES, logInstantDelay, SHOP_CODE } from "@/lib/trips/delays";
import { newId } from "@/lib/trips/tripStore";

import { rememberTanks } from "@/lib/trips/useTripData";
import { airMiles, kindsOf, locationTitle, type LatLon } from "@/lib/trips/deliveryLocations";

import { applyStartLoad, buildStartLoad, lastShipperCustomer, openTripForDriver, dispatchedForDriver, beginDispatched, truckBeginMiles, tripChildren, type StartLoadDelivery } from "@/lib/trips/tripLogic";
import { undoBeginDelivery, activePickup, addPickup, arrivePickup, compartmentsForDelivery, closePickupNoLoad, cancelLoad, confirmLoaded, finishDelivery, onBoard, plannedDeliveries, rerouteDelivery, saveDeliveryProgress, splitToNewDelivery, type DeliveryDestination } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripRow } from "@/lib/trips/types";

import { type CancelTripSubmit } from "../components/trip/CancelTripSheet";
import { rackReasonFor } from "@/lib/trips/cancelReasons";

import { useTruckReading, useTruckReadingState, fetchTruckShipments, odometerStatus } from "@/lib/telematics/useTruckReading";
import { shipmentsForPickup } from "@/lib/telematics/shipmentMatch";

import { useMyHos } from "@/lib/telematics/useMyHos";
import { shouldNotifyHosTrip, type Level } from "@/lib/telematics/hosTripNotify";
import { notifyPermission, showNotification } from "@/lib/ui/notify";
import { pushEnabledHere } from "@/lib/push/subscribe";
import { BREAK_REST_MIN } from "@/lib/telematics/cycleRecap";

import { DROP_STOP_MIN, LOAD_STOP_MIN, remainingDriveMin, tripHosCheck } from "@/lib/telematics/progress";
import { recordArrivalPoint, useArrivalSuggestion, type ArrivalTarget } from "@/lib/telematics/useArrivalSuggestion";
import { fetchPresets, getTripPlan, setTripPlan, setTripPlanSnapshot, setTripQuick, nextSaveSlot, savePresetPlan, slotLetter, type PresetSummary } from "@/lib/trips/tripPlan";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";

import { writePicks, type SupplierPick } from "@/lib/suppliers/picks";
import { saveTripDraft, takeTripDraft, takeDetourSlot } from "@/lib/trips/planDetour";
import { getTripSupplier, sameSupplier, seedTerminalPicks, setTripSupplier, type TripSupplier } from "@/lib/trips/tripSupplier";
import { readPicks, groupPicks } from "@/lib/suppliers/picks";

import type { LoadedSubmit } from "../components/trip/LoadedSheet";

import { reportDelayIssue, submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";
import { isTerminalIssueCode } from "@/lib/trips/terminalIssues";
import { cancelPlannedLoad } from "@/lib/supabase/load";

import { clearActivePlannedLoad } from "../utils/activePlannedLoad";

import { clearDeliveryDraft, type DeliveryProgress, type FinishDeliverySubmit, type ProductInfo } from "../components/trip/DeliveryDashboard";

import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";

import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";

import { checkAddPickup, grossColor, LEGAL_GROSS_LBS } from "@/lib/trips/addPickupCheck";
import { mergeBlendRows } from "@/lib/trips/splash";
import { getTripSplash } from "@/lib/trips/tripSplash";
import { markAddingPickup, releaseAddingPickup } from "@/lib/trips/pickerIntent";
import { isSplashable, splashPickupPlans, refineSecondStop, type StagedPlanned } from "@/lib/trips/splashRows";

import { productColorFor } from "../utils/productColor";

import { headingToTerminal, parkedPreloads, storeActivity } from "@/lib/trips/dashboardCards";

import { telematicsStart } from "@/lib/shifts/autoStart";

import { readShopDown, writeShopDown, SHOP_BLOCK, type ShopDown } from "@/lib/trips/shopDown";

import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";

import { telematicsLive } from "@/lib/shifts/dutyStatus";

import { useStoreDeliveries } from "../hooks/useDashboardCards";

import { LOOK, useScrollBackdrop } from "./dashLook";

import { addTrailerAlert, clearTrailerAlerts } from "@/lib/trips/trailerAlerts";

import { openAccessSteps, useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";

import { EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";

import { type ExpGroup, type ExpRow } from "./DashboardSheets";

import { useFuelStop } from "@/lib/fuel/useFuelStop";
import { useFuelSetup } from "@/lib/fuel/useFuelSetup";
import { sendTripPackage } from "@/lib/trips/useTripPackagePrefs";
import { EXTRA_KEY } from "../components/trip/TripPackageSheet";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import type { useHomeDispatched } from "./useHomeDispatched";

export function useHomeSteps(p: ReturnType<typeof useHomeDispatched>) {
  const { emailPkg, arriveAtRef, askGauging, autoStarted, children, companyId, completedDeliveries, endDelay, equipment, finishOpen, freightOpen, fuelOpen, hopRef, lastHosLevel, lastShiftEndedMs, loadedOpen, locList, location, locations, moveOpen, notifyPerm, openTrip, picker, productName, products, reloadTrailerAlerts, rememberDelivery, runningDelay, serverPushOn, setBlockNotice, setCancelBusy, setCancelErr, setCancelOpen, setCompSizes, setDropSiteOpen, setFinishOpen, setFuelAsk, setHookupOkId, setLoadedGeoBols, setLoadedOpen, setNotice, setNotifyPerm, setPicker, setTripSplashState, sheetOpen, shell, shift, shiftAsk, snap, state, step, store, syncNow, terminalCatalog, terminalName, trailerId, tripSplash, truckId, truckSheetWatch, userId } = p;

  // Fuel stop: tapping Fuel stamps the start time right away.
  const fuel = useFuelStop(userId || null, companyId || null);
  const askFuelFirst = (go: () => void) => {
    if (fuel.active && fuel.active.status !== "complete" && !fuel.active.finished_at) setFuelAsk(() => go);
    else go();
  };
  // Fueling in progress (pump not finished yet). A stop left open only for its details doesn't count.
  const fuelOn = !!fuel.active && !fuel.active.finished_at;
  // Begin Loading couldn't start (the terminal has no products matching the plan): the Planner host leaves the message here.
  useEffect(() => {
    if (!shell.dashboardNotice) return;
    setBlockNotice(shell.dashboardNotice);
    shell.clearDashboardNotice();
  }, [shell.dashboardNotice]);
  const { reading: truckReading, failed: truckReadingFailed } = useTruckReadingState(truckId, sheetOpen || finishOpen || fuelOpen || freightOpen || moveOpen || truckSheetWatch, finishOpen ? 60_000 : undefined, fuelOpen); // fuel wants a fresh odometer; a stop that lasted minutes is fine from the cache
  // Hookup detection: which trailer Geotab says is on this truck, read once when the dashboard opens.
  const hookup = useTruckReading(truckId, !!truckId);
  // "It's right" is remembered for that truck and trailer, so the card doesn't come back every time the app opens.
  const hookupKey = userId && truckId ? `proTankr:u:${userId}:hookupOk:${truckId}` : null;
  useEffect(() => {
    if (!hookupKey) { setHookupOkId(null); return; }
    try { setHookupOkId(localStorage.getItem(hookupKey)); } catch { setHookupOkId(null); }
  }, [hookupKey]);
  useEffect(() => { setNotifyPerm(notifyPermission()); }, []);
  const myHos = useMyHos(companyId || null, !!companyId && !!userId);
  useEffect(() => {
    if (!userId || shiftAsk || !telematicsLive(myHos, Date.now())) return;
    const t = telematicsStart({ hos: myHos, nowMs: Date.now(), shiftOpen: !!shift.current, lastEndedMs: lastShiftEndedMs, declinedSince: null });
    if (!t || autoStarted.current === t.since) return;
    autoStarted.current = t.since;
    shift.start(new Date(t.atMs).toISOString(), "geotab");
  }, [myHos, shift.current, lastShiftEndedMs, userId, shiftAsk]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the truck is now (every two minutes while a trip is open), against the stops still ahead.
  const livePos = useTruckReading(truckId, !!openTrip && !!truckId, 120_000);
  const hosVsTrip = useMemo(() => {
    if (!myHos || !openTrip || !snap || !livePos || livePos.lat == null || livePos.lon == null) return null;
    const fresh = (iso: string | null | undefined, ms: number) => !!iso && Date.now() - Date.parse(iso) <= ms;
    if (!fresh(livePos.at, 10 * 60_000) || !fresh(myHos.at, 15 * 60_000)) return null;
    const racks = snap.pickups.filter((p) => !p.left_at && p.outcome !== "no_load").sort((a, b) => a.seq - b.seq);
    const drops = snap.deliveries.filter((d) => d.status !== "complete" && d.status !== "cancelled").sort((a, b) => a.seq - b.seq);
    const ll = (lat?: number | null, lon?: number | null) => (lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null);
    const stops = [
      ...racks.map((p) => { const t = terminalCatalog?.find((x) => String(x.terminal_id) === String(p.terminal_id)); return ll(t?.lat, t?.lon); }),
      ...drops.map((d) => { const l = locations.find((x) => x.location_id === d.location_id); return ll(l?.lat, l?.lon); }),
    ];
    if (!stops.length) return null;
    return tripHosCheck({
      driveLeftMin: myHos.driveLeftMin, dutyLeftMin: myHos.dutyLeftMin,
      remainingDriveMin: remainingDriveMin({ lat: livePos.lat, lon: livePos.lon }, stops),
      stopMin: racks.length * LOAD_STOP_MIN + drops.length * DROP_STOP_MIN,
    });
  }, [myHos, openTrip, snap, livePos, terminalCatalog, locations]);
  // Tell the driver (once per change) when the clocks stop covering the trip. The first look is a baseline.
  // Break chip helpers. Driving this far since the last 30-minute break is when waiting a few
  // minutes before starting the next load starts to matter, so that's when the sheet mentions it.
  const BREAK_DONE_MIN = BREAK_REST_MIN;
  const BREAK_NOTE_WHEN_LEFT_MIN = 180;
  const breakRestMin = myHos?.nonDrivingSince ? Math.max(0, Math.floor((Date.now() - Date.parse(myHos.nonDrivingSince)) / 60000)) : null;
  const breakCountsRed = !!openTrip && !!myHos?.nonDrivingSince && breakRestMin != null && breakRestMin < BREAK_DONE_MIN
    && !!openTrip.started_at && Date.parse(openTrip.started_at) >= Date.parse(myHos.nonDrivingSince);
  const breakNote = breakRestMin != null && breakRestMin < BREAK_DONE_MIN && myHos?.breakLeftMin != null && myHos.breakLeftMin <= BREAK_NOTE_WHEN_LEFT_MIN
    ? `Your 30-minute break is ${breakRestMin} min in. Wait ${BREAK_DONE_MIN - breakRestMin} more minute${BREAK_DONE_MIN - breakRestMin === 1 ? "" : "s"} and it's done.`
    : null;
  const hosLevel: Level | null = !myHos || !livePos ? null : hosVsTrip ? hosVsTrip.level : "ok";
  useEffect(() => { void pushEnabledHere().then((v) => { serverPushOn.current = v; }); }, [notifyPerm]);
  useEffect(() => {
    if (hosLevel === null) return;
    if (shouldNotifyHosTrip(lastHosLevel.current, hosLevel) && hosVsTrip && !serverPushOn.current) {
      void showNotification(hosLevel === "bad" ? "Your hours won't cover this trip" : "Your hours are tight for this trip", hosVsTrip.text, "protankr-hos-trip");
    }
    lastHosLevel.current = hosLevel;
  }, [hosLevel]); // eslint-disable-line react-hooks/exhaustive-deps
  const fuelSetup = useFuelSetup(fuelOpen ? companyId || null : null);
  const clock = () => ({ now: arriveAtRef.current ?? new Date(), newId });
  const onCancelSubmit = async (v: CancelTripSubmit) => {
    if (!store || !userId || !openTrip) return;
    setCancelBusy(true);
    setCancelErr(null);
    try {
      // Any load started in the Planner for this trip goes too.
      for (const p of store.list("trip_pickups", (x) => x.trip_id === openTrip.trip_id && !!x.load_id && !x.outcome)) {
        try {
          await cancelPlannedLoad(p.load_id as string);
        } catch (e) {
          console.warn("[trips] cancel planned load failed (non-fatal):", e);
        }
      }
      clearActivePlannedLoad(userId);
      cancelLoad(store, {
        trip: openTrip, userId, reasons: v.reasons, note: v.note, returnedTo: v.returnedTo,
        endMiles: v.endMiles, cancelledAt: v.cancelledAt, rackReason: rackReasonFor(v.reasons), ...clock(),
      });
      setCancelOpen(false);
      if (v.reasons.includes("terminal_gauging")) {
        const last = snap ? activePickup(snap.pickups) ?? [...snap.pickups].reverse().find((x) => x.terminal_id) : null;
        askGauging(last?.terminal_id ? String(last.terminal_id) : null);
      }
      void syncNow();
    } catch (e: any) {
      setCancelErr(e?.message ?? "Couldn't cancel the load.");
    } finally {
      setCancelBusy(false);
    }
  };

  // A delay at the rack ends only when loading begins (the Begin Loading button in Plan Review or here), when the driver
  // leaves for another rack or terminal (the pickup is closed with no load or left), or when the trip is cancelled.
  useEffect(() => {
    if (!runningDelay || runningDelay.leg !== "at_rack" || !snap) return;
    if (!openTrip || openTrip.trip_id !== runningDelay.tripId) { endDelay(); return; }
    const p = snap.pickups.find((x) => x.pickup_id === runningDelay.pickupId);
    if (!p) return;
    const started = Date.parse(runningDelay.startedAt);
    const left = p.left_at && Date.parse(p.left_at) >= started ? p.left_at : null;
    if (left || p.outcome === "no_load") endDelay(left ?? undefined);
  }, [runningDelay, snap, openTrip?.trip_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadedPickup = step.kind === "loaded" ? step.pickup : null;
  useEffect(() => {
    setLoadedGeoBols([]);
    if (!loadedOpen || !loadedPickup || !openTrip?.truck_id || !loadedPickup.arrived_at) return;
    let alive = true;
    const used = (Object.values(state.rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[])
      .filter((c) => c.pickup_id !== loadedPickup.pickup_id && c.bol_number).map((c) => String(c.bol_number));
    void fetchTruckShipments(openTrip.truck_id, new Date(Date.parse(loadedPickup.arrived_at) - 3600000).toISOString()).then((r) => {
      if (alive) setLoadedGeoBols(shipmentsForPickup(r, { arrivedAt: loadedPickup.arrived_at, leftAt: loadedPickup.left_at }, Date.now(), used).map((x) => x.documentNumber));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedOpen, loadedPickup?.pickup_id]);
  const finishDeliveryRow = step.kind === "finish_delivery" ? step.delivery : null;
  const siteDrops = useStoreDeliveries(finishDeliveryRow?.location_id ?? null, completedDeliveries);
  const openDelivery = () => (finishDeliveryRow && !finishDeliveryRow.begin_at ? setDropSiteOpen(true) : setFinishOpen(true));
  const beginDelivery = () => {
    if (!store || !finishDeliveryRow) return;
    const at = new Date().toISOString();
    endDelay(at);
    saveDeliveryProgress(store, { delivery: finishDeliveryRow, beginAt: at, newId });
    void syncNow();
  };
  // The back arrow in the begun drop window: take the Begin Delivery tap back; the arrival window is next.
  const undoBeginDeliveryNow = () => {
    if (!store || !userId || !finishDeliveryRow) return;
    undoBeginDelivery(store, { userId, delivery: finishDeliveryRow, now: new Date(), newId });
    void syncNow();
  };
  const finishFromDropSite = (volumes: Record<string, number>) => {
    if (!store || !finishDeliveryRow) return;
    const old = new Map(store.list("trip_delivery_tanks", (t) => t.delivery_id === finishDeliveryRow.delivery_id).map((t) => [t.tank_number, t]));
    const tanks = Object.entries(volumes).map(([n, v]) => ({
      tank_number: n, product_id: old.get(n)?.product_id ?? locList.tanks.find((t) => t.tank_number.trim() === n)?.product_id ?? null,
      before_reading: v, after_reading: old.get(n)?.after_reading ?? null, water_reading: old.get(n)?.water_reading ?? null, reading_unit: "gallons" as const,
    }));
    if (tanks.length) saveDeliveryProgress(store, { delivery: finishDeliveryRow, tanks, newId });
    setDropSiteOpen(false);
    setFinishOpen(true);
  };

  const onLoadedSubmit = (v: LoadedSubmit) => {
    if (!store || !userId || !companyId || !loadedPickup) return;
    confirmLoaded(store, {
      userId, companyId, trailerId, pickup: loadedPickup, ...v, ...clock(),
    });
    void reportDelayIssue({
      delayChoice: v.delayReasonId,
      terminalId: loadedPickup.terminal_id, rackId: loadedPickup.rack_id,
      productIds: v.compartments.map((c) => c.product_id).filter((x): x is string => !!x),
      companyId, userId, truckLabel: equipment.currentTruckName ?? "",
    });
    setLoadedOpen(false);
    
    setNotice({ text: step.kind === "loaded" ? "Loaded. Drive safe." : "Loading details saved.", tripId: null });
    void syncNow();
  };
  useEffect(() => { setTripSplashState(getTripSplash(userId || null, openTrip?.trip_id ?? null)); }, [userId, openTrip?.trip_id]);
  // A splash-blended compartment is one compartment at the drop; its second load is delivered with it.
  const mergedHere = (deliveryId: string) => mergeBlendRows(
    compartmentsForDelivery(snap?.compLoads ?? [], snap?.deliveries ?? [], deliveryId),
    Object.fromEntries(Object.entries(tripSplash).map(([n, v]) => [Number(n), v.additiveProductId])),
  );
  const onFinishSubmit = async (v0: FinishDeliverySubmit) => {
    // Not a silent return: the delivery screen is waiting on this, so say why it can't finish.
    if (!store || !userId || !companyId || !finishDeliveryRow || !openTrip) throw new Error("The trip isn't loaded on this phone yet. Close this window, reopen the delivery, and try again.");
    const hid = mergedHere(finishDeliveryRow.delivery_id).hidden;
    const more = <T extends { compartment_load_id: string }>(list: T[]): T[] => list.flatMap((c) => [c, ...(hid[c.compartment_load_id] ?? []).map((id) => ({ ...c, compartment_load_id: id }))]);
    const v: FinishDeliverySubmit = { ...v0, delivered: more(v0.delivered), retained: more(v0.retained), bioBlends: v0.bioBlends ? more(v0.bioBlends) : v0.bioBlends };
    const tripId = openTrip.trip_id;
    const { tripComplete } = finishDelivery(store, {
      userId, companyId, trailerId, delivery: finishDeliveryRow, ...v, ...clock(),
    });
    clearDeliveryDraft(finishDeliveryRow.delivery_id);
    endDelay();
    setFinishOpen(false);
    // Product left aboard: a big alert on this trailer for whoever takes it. A finished trip clears any old one.
    if (trailerId && v.retained.length > 0 && v.retainNote) {
      void addTrailerAlert({ company_id: companyId, trailer_id: trailerId, trip_id: tripId, note: v.retainNote, compartments: v.retained.map((c) => c.comp_number), created_by: userId }).then(() => reloadTrailerAlerts());
    } else if (trailerId && tripComplete) {
      void clearTrailerAlerts(trailerId, userId).then(() => reloadTrailerAlerts());
    }
    const orderNo = children?.primaryOrder?.order_number;
    // The email choices are made in Details; at the close the package goes out without another screen.
    if (tripComplete) {
      let extra: string[] = [];
      try { extra = (localStorage.getItem(EXTRA_KEY) ?? "").split(/[\s,;]+/).filter(Boolean).slice(0, 3); } catch { /* storage blocked */ }
      // The server reads the finished trip, so let it sync first. The "automatic copy" switch is checked by the server
      // (this screen's copy of it can be older than a change made in Details), and a trip is only ever sent once.
      void (async () => {
        try { await syncNow(); } catch { /* the send below says if it couldn't */ }
        const results = [await sendTripPackage(tripId, "auto")];
        if (extra.length) results.push(await sendTripPackage(tripId, "manual", extra));
        const bad = results.find((r) => !r.ok);
        if (bad && !bad.ok) setNotice({ text: `Trip complete, but the email didn't go out: ${bad.error}`, tripId });
      })();
    }
    setNotice(tripComplete
      ? { text: orderNo ? `Order ${orderNo} · Trip complete.` : "Trip complete.", tripId }
      : v.retained.length
        ? { text: "Delivery finished. Pick where the rest is going, or Park preloaded for another driver.", tripId: null }
        : { text: "Delivery finished.", tripId: null });
    void syncNow();
    if (finishDeliveryRow.location_id) {
      // Every tank used, with or without a reading (the first tank of a split is saved here).
      const seen = [
        ...v.delivered.flatMap((c) => (c.tank_number ? [{ tank_number: c.tank_number, product_id: c.product_id }] : [])),
        ...v.tanks.map((t) => ({ tank_number: t.tank_number, product_id: t.product_id })),
      ];
      await rememberTanks(finishDeliveryRow.location_id, seen, locList.tanks);
      void locList.reload();
    }
  };

  const onDeliveryProgress = (p: DeliveryProgress) => {
    if (!store || !finishDeliveryRow) return;
    saveDeliveryProgress(store, { delivery: finishDeliveryRow, ...p, newId });
    void syncNow();
    // A tank the driver adds at the drop is saved to the store right away, not only at Finish.
    const loc = finishDeliveryRow.location_id;
    if (loc) {
      const seen = [
        ...(p.compTanks ?? []).flatMap((c) => {
          const cl = snap?.compLoads.find((x) => x.compartment_load_id === c.compartment_load_id);
          return c.tank_number ? [{ tank_number: c.tank_number, product_id: cl?.product_id ?? null }] : [];
        }),
        ...(p.tanks ?? []).map((t) => ({ tank_number: t.tank_number, product_id: t.product_id ?? null })),
      ];
      if (seen.length) void rememberTanks(loc, seen, locList.tanks).then(() => locList.reload());
    }
  };
  const productInfo = (id: string | null): ProductInfo => {
    const p = id ? products.find((x) => x.product_id === id) : null;
    const name = productName(id);
    const hex = typeof p?.hex_code === "string" && p.hex_code.trim() ? p.hex_code.trim() : null;
    const code = String(p?.button_code ?? (name.split(" ")[0] || "PRD")).trim().toUpperCase();
    return { name, code, hex };
  };
  // The drop site's products: each with every store tank that holds it, its code color, and the gallons aboard for this stop.
  const dropProducts: DropProduct[] = !finishDeliveryRow?.location_id || !snap ? [] : (() => {
    const here = mergedHere(finishDeliveryRow.delivery_id).rows;
    const lastFor = (n: string) => {
      for (const x of siteDrops.items) {
        const t = x.tanks.find((y) => y.tankNumber === n);
        if (t) return t.unit === "gallons" ? t.after : null;
      }
      return null;
    };
    const ids: (string | null)[] = [];
    for (const c of here) if (!ids.includes(c.product_id)) ids.push(c.product_id);
    return ids.map((pid) => {
      const info = productInfo(pid);
      const names = sortTankNames(locList.tanks.filter((t) => t.location_id === finishDeliveryRow.location_id && t.is_active && pid && t.product_id === pid).map((t) => t.tank_number.trim()), null);
      return {
        id: pid, name: info.name, color: info.hex ?? productColorFor(info.name),
        gallons: here.filter((c) => c.product_id === pid).reduce((n, c) => n + (c.gross_gallons ?? 0), 0),
        tanks: names.map((n) => ({ number: n, capacity: locList.tanks.find((t) => t.location_id === finishDeliveryRow.location_id && t.tank_number.trim() === n)?.capacity_gallons ?? null, last: lastFor(n) })),
      };
    });
  })();

  const onPick = (to: DeliveryDestination) => {
    if (picker?.mode === "select") {
      if (to.locationId) rememberDelivery(to.locationId);
      const next = snap ? plannedDeliveries(snap.deliveries)[0] : null;
      if (store && userId && openTrip && snap) {
        if (next) {
          if (next.location_id !== to.locationId) rerouteDelivery(store, { userId, delivery: next, to, ...clock() });
        } else {
          splitToNewDelivery(store, {
            userId, tripId: openTrip.trip_id, compartmentLoadIds: onBoard(snap.compLoads).map((c) => c.compartment_load_id),
            to, fromDeliveryId: null, ...clock(),
          });
        }
        void syncNow();
      }
      setPicker(null);
      return;
    }
    if (!store || !userId || !openTrip || !picker || !snap) return;
    if (picker.mode === "reroute") {
      rerouteDelivery(store, { userId, delivery: picker.delivery, to, ...clock() });
    } else {
      const ids = picker.mode === "split" ? picker.ids : onBoard(snap.compLoads).map((c) => c.compartment_load_id);
      splitToNewDelivery(store, {
        userId, tripId: openTrip.trip_id, compartmentLoadIds: ids, to,
        fromDeliveryId: picker.mode === "split" ? picker.from : null, ...clock(),
      });
    }
    setPicker(null);
    void syncNow();
  };

  const addAnotherPickup = () => {
    if (!store || !userId || !openTrip) return;
    const hop = hopRef.current;
    hopRef.current = null;
    if (hop) {
      if (hop.pickup.load_id) { void cancelPlannedLoad(hop.pickup.load_id).catch(() => {}); clearActivePlannedLoad(userId); }
      closePickupNoLoad(store, { userId, pickup: hop.pickup, reason: hop.reason, note: null, arrivedAt: null, leftAt: hop.stop.droveFrom ?? hop.stop.at, ...clock() });
      // Warn other drivers headed to the rack just left. Best effort.
      if (isTerminalIssueCode(hop.reason) && hop.pickup.terminal_id && companyId && !hop.skipReport) {
        void submitOutageReport({
          terminalId: hop.pickup.terminal_id, selectedRackId: hop.pickup.rack_id, productIds: hop.productIds,
          reportType: hop.reason as OutageReportType, companyId, userId, truckLabel: equipment.currentTruckName ?? "",
        }).then(({ error: e }) => { if (e) console.warn("[trips] hop report failed (non-fatal):", e); });
      }
    }
    const newPickupId = addPickup(store, {
      userId, tripId: openTrip.trip_id,
      terminalId: location.selectedTerminalId || null,
      rackId: location.selectedRackId || null,
      name: terminalName,
      city: location.selectedCity || null,
      state: location.selectedState || null,
      ...clock(),
    });
    if (hop) arrivePickup(store, { userId, pickup: { pickup_id: newPickupId, trip_id: openTrip.trip_id } as TripPickupRow, ...clock(), now: new Date(hop.stop.at) });
    void syncNow();
    // After a rack hop, the new rack's sourcing is asked right away (each terminal has its own).
    if (hop) shell.postPlannerIntent("supplier");
  };

  // ── Add another pickup (partly loaded trailer) ───────────────────────────
  // The trailer's compartments, for the loaded strip and the add-pickup check.
  const tripTrailerId = openTrip?.trailer_id ?? trailerId;
  useEffect(() => {
    setCompSizes({});
    if (!tripTrailerId) return;
    let alive = true;
    void supabase.from("trailer_compartments").select("comp_number, max_gallons").eq("trailer_id", tripTrailerId).then(({ data }) => {
      if (!alive) return;
      const m: Record<number, number> = {};
      for (const r of (data ?? []) as any[]) {
        const n = Number(r.comp_number);
        if (Number.isFinite(n) && n > 0) m[n] = Number(r.max_gallons ?? 0);
      }
      setCompSizes(m);
    });
    return () => { alive = false; };
  }, [tripTrailerId]);
  return { ...p, undoBeginDeliveryNow, askFuelFirst, onCancelSubmit, fuel, fuelOn, truckReading, truckReadingFailed, hookup, hookupKey, myHos, hosVsTrip, breakCountsRed, breakNote, fuelSetup, clock, loadedPickup, finishDeliveryRow, openDelivery, beginDelivery, finishFromDropSite, onLoadedSubmit, mergedHere, onFinishSubmit, onDeliveryProgress, productInfo, dropProducts, onPick, addAnotherPickup, tripTrailerId } as const;
}
