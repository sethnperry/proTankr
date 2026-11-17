"use client";
// app/planner/home/useHomeParkAccess.tsx
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

import React, { useEffect, useMemo } from "react";

import type { TripPickupRow } from "@/lib/trips/types";

import { supabase } from "@/lib/supabase/client";

import { canReachDestination } from "@/lib/ui/driver/navDestinations";

import { topUnread, totalUnread, type SquawkCtx, type SquawkType } from "@/lib/squawk/squawk";
import { playChirp, useMyArea, useSquawkAlerts } from "@/lib/squawk/useSquawk";

import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import { DELAY_EVENT, delayEventPayload, delayIssueCode, legForStep, loggedDelays, readRunningDelay, writeRunningDelay, type RunningDelay, endRunningDelay, attachPendingDelays, INSTANT_CODES, logInstantDelay, SHOP_CODE } from "@/lib/trips/delays";

import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { airMiles, kindsOf, locationTitle, type LatLon } from "@/lib/trips/deliveryLocations";

import { applyStartLoad, buildStartLoad, lastShipperCustomer, openTripForDriver, dispatchedForDriver, beginDispatched, truckBeginMiles, tripChildren, type StartLoadDelivery } from "@/lib/trips/tripLogic";
import { activePickup, addPickup, canPark, arriveDelivery, arrivePickup, closePickupNoLoad, otherTripsAboard, onBoard, parkTrip, resumeTrip, plannedDeliveries, takeOverTrip } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripRow } from "@/lib/trips/types";

import { useTruckReading, fetchTruckShipments, fetchTruckReading } from "@/lib/telematics/useTruckReading";

import { shouldNotifyHosTrip, type Level } from "@/lib/telematics/hosTripNotify";
import { notifyPermission, showNotification, type NotifyPermission } from "@/lib/ui/notify";

import { DROP_STOP_MIN, LOAD_STOP_MIN, remainingDriveMin, tripHosCheck } from "@/lib/telematics/progress";
import { recordArrivalPoint, useArrivalSuggestion, type ArrivalTarget } from "@/lib/telematics/useArrivalSuggestion";
import { fetchPresets, getTripPlan, slotLetter } from "@/lib/trips/tripPlan";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";
import { readPlannedMeta } from "@/lib/dispatch/compPlan";
import { writePicks, type SupplierPick } from "@/lib/suppliers/picks";
import { saveTripDraft, takeTripDraft, takeDetourSlot } from "@/lib/trips/planDetour";
import { getTripSupplier, sameSupplier, seedTerminalPicks, setTripSupplier, type TripSupplier } from "@/lib/trips/tripSupplier";
import { readPicks, groupPicks } from "@/lib/suppliers/picks";

import { type ParkSubmit } from "../components/trip/ParkSheet";

import { reportDelayIssue, submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";

import { clearDeliveryDraft } from "../components/trip/DeliveryDashboard";

import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";

import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";

import { LEGAL_GROSS_LBS } from "@/lib/trips/addPickupCheck";
import { roughLbsPerGal, blendPct, blendLabel, offTarget, validPct } from "@/lib/trips/splash";
import { setTripSplash, type TripSplash } from "@/lib/trips/tripSplash";
import { markAddingPickup, releaseAddingPickup } from "@/lib/trips/pickerIntent";
import { isSplashable, splashPickupPlans, refineSecondStop, type StagedPlanned } from "@/lib/trips/splashRows";

import { productColorFor } from "../utils/productColor";

import { storeActivity } from "@/lib/trips/dashboardCards";

import { telematicsStart } from "@/lib/shifts/autoStart";

import { SHOP_BLOCK } from "@/lib/trips/shopDown";

import { useGeotabEquipment, useSecondSeat } from "../hooks/useGeotabEquipment";
import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";

import { beginTripShift } from "@/lib/shifts/dutyStatus";

import { useOtherCarriers } from "../hooks/useDashboardCards";

import { LOOK, useScrollBackdrop } from "./dashLook";

import { addTrailerAlert, clearTrailerAlerts, fetchTrailerAlerts, sendPendingTrailerAlerts, type TrailerAlert } from "@/lib/trips/trailerAlerts";

import { useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";
import { isoToday_ } from "../utils/dates";
import { EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";

import { type ExpGroup, type ExpRow } from "./DashboardSheets";

import { useUnitAlerts } from "../hooks/useDashboardCards";

import type { UnitAlertSummary } from "@/lib/equipment/unitAlerts";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import type { useHomeRacks } from "./useHomeRacks";

export function useHomeParkAccess(p: ReturnType<typeof useHomeRacks>) {
  const { aboard, aboardRows, alignPlannerToPickup, answerStop, arrival, arriveAtRef, askEquipment, askFuelFirst, askShiftStart, beginDispatchedLoad, clock, compSizes, companyId, deliveryName, dispatchedList, dutyStop, endDelay, equipment, expirations, fleet, fuelOn, handoff, handoffAcked, handoffName, hookup, lastShiftEndedMs, learnArrival, location, myDelivery, myHos, openDelivery, openTrip, parkOpen, parked, productInfo, productName, selectedLoc, setBlockNotice, setBreakTick, setDropSiteOpen, setError, setExpSheetOpen, setFinishOpen, setHandoffAcked, setHandoffName, setLoadedOpen, setMyRegion, setNextRackPending, setNotice, setOpeningPlanner, setParkOpen, setParkRegions, setPicker, setRackSheetOpen, setSheetOpen, setSheetPresets, setSplashOpen, setSplashTermPending, setTripSplashState, setTruckSheetWatch, setUnitAlertsOpen, sheetOpen, sheetPresets, shell, shift, shopDown, snap, splashNums, splashRoomLbs, splashSawPicker, splashTermPending, step, store, syncNow, terminalCatalog, terminalName, terminals, trailerId, tripSplash, truckId, truckIdLive, unitAlertsOpen, userId, wrapEl } = p;

  // Arrival is never stamped automatically: a truck inside a stop's fence may be fueling or waiting on a delay.
  // The driver is asked (the card below, or the duty-log stop card) and answers.

  const confirmDetectedArrival = () => {
    if (!arrival.suggest) return;
    arriveAtRef.current = new Date(arrival.suggest.sinceMs);
    try { onBigButton(); } finally { arriveAtRef.current = null; }
  };
  const confirmDutyArrival = () => {
    if (!dutyStop) return;
    arriveAtRef.current = new Date(dutyStop.at);
    answerStop(dutyStop.at);
    try { onBigButton(); } finally { arriveAtRef.current = null; }
  };
  useEffect(() => {
    const id = handoff?.driver_id ?? (parked && parked.parked_by !== userId ? parked.parked_by ?? parked.driver_id : null);
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: [id] });
      const row = ((data ?? []) as any[]).find((r) => r?.user_id === id);
      if (!cancelled) setHandoffName(row?.display_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [handoff?.driver_id, parked?.parked_by, parked?.driver_id, userId]);
  useEffect(() => {
    const id = window.setInterval(() => setBreakTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, []);
  // Truck / trailer alert squares: permits + service coming due.
  const truckAlerts = useUnitAlerts("truck", truckId, companyId, undefined, hookup?.engineHours ?? null);
  const trailerAlerts = useUnitAlerts("trailer", trailerId, companyId);
  useEffect(() => { setTruckSheetWatch(unitAlertsOpen === "truck"); }, [unitAlertsOpen]);
  // Everyone in the company with the SELECTED store on their trip: delivering there, loaded and on the way, or
  // planned. My own trip is included (from the server list, or from this phone when it hasn't synced yet).
  const otherToStore = useOtherCarriers("location", selectedLoc?.location_id ?? null);
  const storeLive = useMemo(() => {
    const list = storeActivity(fleet.trips, fleet.dispatched, selectedLoc?.location_id ?? null, userId);
    if (selectedLoc && myDelivery?.location_id === selectedLoc.location_id && openTrip && !list.some((x) => x.isMine)) {
      const by = new Map<string | null, number>();
      for (const c of aboardRows) by.set(c.product_id, (by.get(c.product_id) ?? 0) + Number(c.gross_gallons ?? 0));
      list.unshift({
        tripId: openTrip.trip_id, isMine: true, driverName: null, truckName: null, plannedStartAt: null,
        trailerId: openTrip.trailer_id ?? null, loaded: Object.fromEntries(aboardRows.map((c) => [c.comp_number, c.product_id])),
        state: myDelivery.arrived_at ? "delivering" : aboardRows.length > 0 ? "enroute" : "loading",
        products: [...by].map(([productId, gallons]) => ({ productId, gallons })),
      });
    }
    for (const o of otherToStore) {
      list.push({
        tripId: o.tripId, isMine: false, driverName: o.who, truckName: null, plannedStartAt: null, trailerId: null, loaded: {},
        state: o.arrived ? "delivering" : o.comps.length > 0 ? "enroute" : "loading", products: [], external: { comps: o.comps, initials: o.initials },
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherToStore, fleet.trips, fleet.dispatched, selectedLoc?.location_id, userId, myDelivery?.location_id, myDelivery?.arrived_at, openTrip?.trip_id, aboardRows]);
  // Trucks actually on the way (begun); dispatched loads nobody has begun yet are not counted.
  const dropCount = storeLive.filter((x) => x.state !== "planned").length;
  // 1 (usually just me) is white; more than one truck going there is red.
  const countColor = (n: number) => (n === 0 ? LOOK.muted : n === 1 ? "#fff" : "#f87171");
  const loadLine = (c: TripCompartmentLoadRow) =>
    `C${c.comp_number} · ${productName(c.product_id)}${c.gross_gallons != null ? ` · ${Math.round(Number(c.gross_gallons)).toLocaleString("en-US")} gal` : ""}`;
  const onBoardLines = (compLoads: TripCompartmentLoadRow[] | undefined) =>
    onBoard(compLoads ?? []).sort((a, b) => a.comp_number - b.comp_number).map(loadLine);
  const showPark = !!snap && canPark(openTrip, step, onBoard(snap.compLoads).length > 0);
  // Dispatch told the driver to park this load: the big button becomes "Park it".
  const parkRequested = !!openTrip?.park_requested_at && showPark;
  // Another driver parked this trailer and you took it over: tell the new driver what is aboard.
  const handoffKey = openTrip?.handoff_at ? `proTankr:handoffAck:${openTrip.trip_id}:${openTrip.handoff_at}` : null;
  const handoffAlert = !!openTrip?.handoff_at && openTrip.driver_id === userId && handoffKey !== handoffAcked && (() => { try { return !localStorage.getItem(handoffKey!); } catch { return true; } })();
  const dismissHandoff = () => { try { if (handoffKey) localStorage.setItem(handoffKey, "1"); } catch { /* storage blocked */ } setHandoffAcked(handoffKey); };
  useEffect(() => {
    if (!parkOpen || !companyId || !userId) return;
    let off = false;
    (async () => {
      const [r, me] = await Promise.all([
        supabase.from("equipment_regions").select("name").eq("company_id", companyId).eq("is_active", true).order("name"),
        supabase.from("profiles").select("region").eq("user_id", userId).maybeSingle(),
      ]);
      if (off) return;
      setParkRegions(((r.data ?? []) as any[]).map((x) => String(x.name)));
      setMyRegion(((me.data as any)?.region as string | null) ?? null);
    })();
    return () => { off = true; };
  }, [parkOpen, companyId, userId]);
  const doPark = (v: ParkSubmit) => {
    if (!store || !userId || !openTrip) return;
    for (const d of snap?.deliveries ?? []) {
      if (d.status === "planned" && d.arrived_at && !d.begin_at) clearDeliveryDraft(d.delivery_id);
    }
    parkTrip(store, { trip: openTrip, userId, ...v, ...clock() });
    setParkOpen(false);
    setFinishOpen(false);
    setNotice({ text: "Load parked. Start another trip when you're ready.", tripId: openTrip.trip_id });
    void syncNow();
  };
  truckIdLive.current = truckId ?? null;
  const doResume = () => {
    if (!store || !userId || !parked) return;
    resumeTrip(store, { trip: parked, userId, truckId: truckIdLive.current, ...clock() });
    void syncNow();
  };

  const onBigButton = () => {
    setNotice(null);
    if (!store || !userId) return;
    if (parkRequested) { setParkOpen(true); return; }
    switch (step.kind) {
      case "start":
        {
          // One trailer, one trip: another driver's open trip on it has to be taken over or closed first.
          if (handoff && !parked) { setNotice({ text: `${handoffName ?? "Another driver"} has an open trip on this trailer. Take it over, or have it closed, before starting a new one.`, tripId: null } as any); break; }
          // One trailer, one load: a trailer that already holds product on another live trip can't take a second load.
          if (trailerId && !parked) {
            void (async () => {
              const { data: ot } = await supabase.from("trips").select("trip_id, trailer_id, status, driver_id").eq("trailer_id", trailerId).in("status", ["draft", "loading", "in_transit", "delivering", "parked"]);
              const ids = ((ot ?? []) as { trip_id: string }[]).map((x) => x.trip_id);
              const { data: oc } = ids.length ? await supabase.from("trip_compartment_loads").select("trip_id, disposition").in("trip_id", ids).eq("disposition", "loaded") : { data: [] as { trip_id: string; disposition: string }[] };
              const blocking = otherTripsAboard((ot ?? []) as any, (oc ?? []) as any, trailerId, null);
              if (blocking.length) {
                const who = blocking[0].driver_id === userId ? "you" : (handoffName ?? "another driver");
                setNotice({ text: `This trailer already has product aboard on ${who === "you" ? "your other" : `${who}'s`} trip. Take that trip over (or resume it), or have it closed, before loading again.`, tripId: null });
                return;
              }
              proceedStart();
            })();
            return;
          }
          proceedStart();
          function proceedStart() {
          // A load parked on this trailer is resumed (or taken over), never a new trip: same shift and truck steps first.
          const proceed = parked
            ? () => void askEquipment(() => doResume())
            : () => void askEquipment(() => askFuelFirst(() => {
              if (dispatchedList.length) { beginDispatchedLoad(); return; }
              setError(null);
              setSheetOpen(true);
            }));
          // Telematics connected and on duty: the shift is already running (or starts now at that time), no window.
          const need = beginTripShift(myHos, Date.now());
          if (!need.ask) {
            if (!shift.current) {
              const t = telematicsStart({ hos: myHos, nowMs: Date.now(), shiftOpen: false, lastEndedMs: lastShiftEndedMs, declinedSince: null });
              shift.start(t ? new Date(t.atMs).toISOString() : undefined, "geotab");
            }
            proceed();
          } else askShiftStart(need.reason, proceed, { always: true });
          }
        }
        break;
      case "planner":
        if (shopDown) { setBlockNotice(SHOP_BLOCK); break; }
        // Arrived but loading not begun: back to the arrival window (its back arrow can leave it), not straight into Plan Review.
        {
          const wp0 = snap?.pickups.find((p) => p.arrived_at && !p.begin_at && !p.left_at && !p.outcome);
          if (wp0) { alignPlannerToPickup(wp0); setRackSheetOpen(true); break; }
        }
        // A delay at the rack (gauging, a long line) keeps running: it ends when loading really begins (below), not
        // when the driver taps Begin Loading, which may only open the Planner to fix the plan.
        setOpeningPlanner(true);
        // The Planner can be on another terminal (or none) after a rack hop or an undo: put it on this pickup's.
        // An arrival stamped automatically at the gate never asked which rack, and a terminal with several racks has no
        // product list until one is picked (every product then looks unavailable): ask now, before Plan Review.
        {
          const wp = snap?.pickups.find((p) => p.arrived_at && !p.load_id && !p.left_at && !p.outcome);
          if (wp) alignPlannerToPickup(wp);
          void (async () => {
            try {
              // A rack that was deleted since the arrival (a rack made by mistake) no longer counts: ask again.
              let rackOk = !!wp?.rack_id;
              if (wp?.rack_id) {
                try {
                  const { data } = await supabase.from("terminal_racks").select("rack_id").eq("rack_id", wp.rack_id).maybeSingle();
                  rackOk = !!data;
                } catch { /* offline: keep it */ }
              }
              if (wp?.terminal_id && !rackOk) {
                const rackId = await shell.askRack(String(wp.terminal_id));
                store.put("trip_pickups", { pickup_id: wp.pickup_id, rack_id: rackId || null }); // a terminal with no racks answers "", which is not a uuid
              } else if (wp?.rack_id) {
                shell.location.setSelectedRackId(wp.rack_id);
              }
            } finally {
              void syncNow();
              // Loading not started yet: the rack window comes first (arrival time, products, Begin Loading). Once it has
              // started, Plan Review opens right over this screen (the Planner host stays mounted in the layout). If there
              // is no plan, or it can't start, the host sends the driver to the Planner instead.
              shell.postPlannerIntent("begin");
            }
          })();
        }
        break;
      case "arrive_pickup": {
        if (shopDown) { setBlockNotice(SHOP_BLOCK); break; }
        if (fuelOn) { setBlockNotice({ title: "Finish fueling first", text: "You can't arrive while a fuel stop is running. Finish fueling, then tap Arrive." }); break; }
        endDelay();
        learnArrival();
        // Arrived: straight to the Planner to build the load, on this
        // pickup's terminal (the Planner may still be on an earlier one).
        // Which rack isn't known until the driver is there, so it's asked now.
        setOpeningPlanner(true);
        arrivePickup(store, { userId, pickup: step.pickup, ...clock() });
        const loc = shell.location;
        const pk = step.pickup;
        alignPlannerToPickup(pk);
        void (async () => {
          try {
            if (pk.terminal_id && !pk.rack_id) {
              const rackId = await shell.askRack(String(pk.terminal_id));
              if (rackId) store.put("trip_pickups", { pickup_id: pk.pickup_id, rack_id: rackId });
            } else if (pk.rack_id) {
              loc.setSelectedRackId(pk.rack_id);
            }
          } finally {
            void syncNow();
            // The rack window opens first, not Plan Review: Begin Loading there stamps the real start time.
            setOpeningPlanner(false);
            setRackSheetOpen(true);
          }
        })();
        break;
      }
      case "loaded":
        setLoadedOpen(true);
        break;
      case "next_rack":
        setNextRackPending(true);
        if (location.selectedCity) shell.setTermOpen(true);
        else shell.setLocOpen(true);
        break;
      case "add_delivery":
        setPicker({ mode: "add" });
        break;
      case "arrive_delivery":
        if (fuelOn) { setBlockNotice({ title: "Finish fueling first", text: "You can't arrive while a fuel stop is running. Finish fueling, then tap Arrive." }); break; }
        endDelay();
        learnArrival();
        // Arrived: only the time is stamped. Nothing opens; the button becomes
        // Finish Delivery, and the sequence starts when the driver taps it.
        arriveDelivery(store, { userId, delivery: step.delivery, ...clock() });
        void syncNow();
        setDropSiteOpen(true);
        break;
      case "finish_delivery":
        openDelivery();
        break;
    }
  };

  const doTakeOver = () => {
    if (!store || !userId || !handoff) return;
    takeOverTrip(store, { userId, trip: handoff, truckId: truckIdLive.current, ...clock() });
    void syncNow();
  };

  // Every expiration in one chip, grouped by type. Truck and trailer come from
  // their own alerts (permits plus service); the rest from the shared list.
  const expGroups: ExpGroup[] = (() => {
    const rows = (type: string): ExpRow[] => expirations.activeItems.filter((i) => i.entityType === type).map((i) => ({
      key: i.id, name: i.entityName, sub: i.entitySubtitle,
      detail: i.expired ? `Expired ${-i.daysLeft}d ago` : `${i.daysLeft} days`,
      state: (i.expired ? "expired" : i.daysLeft <= EXP_WARN_DAYS ? "expiring" : "soon") as ExpiryState,
    }));
    const unit = (s: UnitAlertSummary, w: string): ExpRow[] => s.alerts.map((a, n) => ({ key: `${w}${n}`, name: a.name, sub: a.kind === "permit" ? "Permit" : "Service", detail: a.detail, state: a.state }));
    return [
      { title: "Terminals", rows: rows("terminal") },
      { title: "Credentials", rows: rows("credential") },
      { title: "Badges", rows: rows("badge") },
      { title: "Cards", rows: rows("card") },
      { title: "Truck", rows: unit(truckAlerts, "truck"), more: { label: "Odometer & details", onClick: () => { setExpSheetOpen(false); setUnitAlertsOpen("truck"); } } },
      { title: "Trailer", rows: unit(trailerAlerts, "trailer") },
    ];
  })();
  const expTotal = expGroups.reduce((n, g) => n + g.rows.length, 0);
  const expWorst = (["expired", "expiring", "soon"] as ExpiryState[]).find((st) => expGroups.some((g) => g.rows.some((r) => r.state === st))) ?? null;
  const canCards = canReachDestination("cards", shell.role, shell.isSuperAdmin, shell.isSolo ?? false);

  // ── Look (see dashLook.tsx) ───────────────────────────────────────────────
  const L = LOOK;
  const card: React.CSSProperties = { ...L.primary, padding: 14 };
  useScrollBackdrop(wrapEl, L);

  // ── Terminal access readiness ─────────────────────────────────────────────
  // Access steps underway (driver_terminal_qualifications + requirements).
  const accessQuals = useAccessQualifications(userId).data;
  const stepsByTerminal = (() => {
    const m = new Map<string, ReturnType<typeof accessSteps>>();
    for (const [tid, e] of accessQuals ?? []) {
      if (!inProgress(e.prog)) continue;
      m.set(tid, requirementsComplete(e.req) ? accessSteps(e.req, e.prog, e.loadsCompleted) : []);
    }
    return m;
  })();
  // The city the driver picked (Planner/terminal list), else the trip's
  // pickup city. The pickup keeps its caret when it's in the shown city.
  const readinessPlace = (() => {
    const p = snap ? activePickup(snap.pickups) : null;
    const pickupId = p?.terminal_id ? String(p.terminal_id) : null;
    if (location.selectedCity) return { city: location.selectedCity, state: location.selectedState || "", pickupId };
    const t = pickupId ? terminalCatalog.find((x) => String(x.terminal_id) === pickupId) : null;
    return { city: String(t?.city ?? ""), state: String(t?.state ?? ""), pickupId };
  })();
  // Every terminal in the city, with this driver's last carded date if any.
  const readiness = (() => {
    const rows: ReadinessInput[] = [];
    const seen = new Set<string>();
    const add = (t: any) => {
      const id = String(t?.terminal_id ?? "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      rows.push({
        terminalId: id,
        name: String(t.terminal_name ?? "Terminal"),
        city: (t.city ?? null) as string | null,
        state: (t.state ?? null) as string | null,
        renewalDays: Number(t.renewal_days ?? 90) || 90,
        cardedOn: terminals.accessDateByTerminalId[id] ?? null,
        steps: stepsByTerminal.has(id)
          ? (() => {
              const st = stepsByTerminal.get(id)!;
              // Not set up yet: one empty "next" line until the questions are answered.
              const states = st.length ? st.map((x) => x.state) : (["next"] as const).slice();
              return { done: st.filter((x) => x.state === "done").length, total: Math.max(1, st.length), states };
            })()
          : null,
      });
    };
    for (const t of terminalCatalog) add(t);
    for (const t of terminals.terminals) add(t);
    return terminalReadiness(rows, { city: readinessPlace.city, state: readinessPlace.state, todayIso: isoToday_(), pickupTerminalId: readinessPlace.pickupId });
  })();
  const readinessLabel = [readinessPlace.city, readinessPlace.state].filter(Boolean).join(", ") || null;
  // A bar on the access strip opens that terminal's screen; with none it goes to the picker.
  const openTerminalList = (terminalId: string | null) => {
    if (terminalId) { shell.chooseTerminal(terminalId); shell.setTerminalHubOpen(true); return; }
    shell.setHubAfterPick(true);
    if (location.selectedCity) shell.setTermOpen(true);
    else shell.setLocOpen(true);
  };

  const pickups = snap?.pickups ?? [];
  const liveDeliveries = (snap?.deliveries ?? []).filter((d) => d.status !== "cancelled");
  const anyDelivered = liveDeliveries.some((d) => d.status === "complete");
  useEffect(() => {
    if (!sheetOpen && !openTrip?.trip_id) return;
    let alive = true;
    void fetchPresets(userId, equipment.selectedComboId ?? null, Object.keys(compSizes).map(Number)).then((p) => { if (alive) setSheetPresets(p); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen, openTrip?.trip_id, userId, equipment.selectedComboId]);
  // The plan for this trip: the preset picked at Begin Trip, else the compartment plan dispatch set on a pickup.
  // Shown under the shipper line so what to load is never read off the trailer's residue colors.
  const planLine = (() => {
    if (!openTrip) return null;
    const stored = getTripPlan(userId || null, openTrip.trip_id);
    const slot = stored?.slot ?? null;
    if (stored?.snapshot) return { label: `Plan ${slotLetter(stored.slot)}`, comps: stored.snapshot.comps };
    const preset = slot ? sheetPresets.find((p) => p.slot === slot) : null;
    if (preset) return { label: `Plan ${slotLetter(preset.slot)}`, comps: preset.comps };
    const pk = pickups.find((p) => !p.left_at && p.outcome !== "no_load" && p.planned_comps);
    const meta = pk ? readPlannedMeta(pk.planned_comps) : null;
    if (!meta || !meta.size) return null;
    const nums = [...new Set([...Object.keys(compSizes).map(Number), ...meta.keys()])].sort((a, b) => b - a);
    const comps = nums.map((n) => meta.get(n)?.product_id ?? null);
    const match = findMatchingPlan(sheetPresets, layoutFromProducts(Object.fromEntries(nums.map((n) => [n, meta.get(n)?.product_id ?? null])), nums));
    return { label: match ? `Plan ${slotLetter(match.slot)}` : "Plan", comps };
  })();

  const chipFor = (id: string | null) => { const info = id ? productInfo(id) : null; return info ? { code: info.code, color: info.hex ?? productColorFor(info.name) } : null; };
  const baseByComp: Record<number, string> = {};
  planLine?.comps.forEach((id, i) => { if (id && splashNums[i] != null) baseByComp[splashNums[i]] = id; });
  const splashPlanProp = Object.fromEntries(Object.entries(tripSplash).filter(([n]) => baseByComp[Number(n)]).map(([n, v]) => [n, { additiveProductId: v.additiveProductId, baseProductId: baseByComp[Number(n)], pct: v.pct }]));
  // The splash pair: the ethanol pickup carries only additive entries; the base pickup is the plan's other open stop.
  const isSplashPickup = (p: TripPickupRow) => !!p.planned_comps?.length && p.planned_comps.every((c) => !!c.splash && tripSplash[c.comp_number]?.additiveProductId === c.product_id);
  const splashPickup = pickups.find((p) => isSplashPickup(p) && p.outcome !== "no_load") ?? null;
  const baseStop = splashPickup ? [...pickups].filter((p) => p.pickup_id !== splashPickup.pickup_id && p.outcome !== "no_load").sort((x, y) => x.seq - y.seq)[0] ?? null : null;
  const splashComps = splashNums.filter((n) => baseByComp[n] && isSplashable(productInfo(baseByComp[n]).name));
  // Nothing aboard yet: the weight a splash load may add is the legal gross less the empty rig, so staging stays under it.
  const splashPlanWeight = () => {
    const tare = equipment.selectedCombo?.tare_lbs != null ? Number(equipment.selectedCombo.tare_lbs) : null;
    if (aboardRows.length > 0 || tare == null || !Number.isFinite(tare)) return {};
    return { roomLbs: Math.max(0, LEGAL_GROSS_LBS - tare), lbsPerGal: (id: string | null) => roughLbsPerGal(id ? productInfo(id).name : "") };
  };
  const splashSpecs = () => splashComps.map((n) => ({ n, size: compSizes[n] || 0, base: baseByComp[n] }));
  const saveSplash = (sp: TripSplash) => {
    setSplashOpen(false);
    if (!store || !userId || !openTrip) return;
    const hadStop = !!splashPickup;
    if (!Object.keys(sp).length) {
      setTripSplash(userId, openTrip.trip_id, {});
      setTripSplashState({});
      if (splashPickup && !splashPickup.load_id) closePickupNoLoad(store, { userId, pickup: splashPickup, reason: "other", note: "Splash blend removed", arrivedAt: null, leftAt: new Date().toISOString(), ...clock() });
      if (baseStop && !baseStop.load_id) store.put("trip_pickups", { pickup_id: baseStop.pickup_id, planned_comps: null as any });
      void syncNow();
      return;
    }
    setTripSplash(userId, openTrip.trip_id, sp);
    setTripSplashState(sp);
    if (hadStop && splashPickup && baseStop) {
      const plans = splashPickupPlans({ comps: splashSpecs(), splash: sp, ...splashPlanWeight() });
      store.put("trip_pickups", { pickup_id: splashPickup.pickup_id, planned_comps: plans.splash as any });
      store.put("trip_pickups", { pickup_id: baseStop.pickup_id, planned_comps: plans.base as any });
      void syncNow();
      return;
    }
    // Next: the terminal that sells the ethanol, picked the way "+ Another pickup" picks one.
    splashSawPicker.current = false;
    markAddingPickup();
    setSplashTermPending(true);
    if (location.selectedCity) shell.setTermOpen(true); else shell.setLocOpen(true);
  };
  useEffect(() => {
    if (!splashTermPending) return;
    const pickerOpen = shell.termOpen || shell.locOpen || shell.rackPickerOpen || shell.rackResolving;
    if (pickerOpen) { splashSawPicker.current = true; return; }
    if (!splashSawPicker.current) return;
    splashSawPicker.current = false;
    setSplashTermPending(false);
    releaseAddingPickup();
    if (!store || !userId || !openTrip || !location.selectedTerminalId) return;
    const plans = splashPickupPlans({ comps: splashSpecs(), splash: tripSplash, ...splashPlanWeight() });
    const base = [...pickups].filter((p) => !p.load_id && !p.left_at && p.outcome !== "no_load").sort((x, y) => x.seq - y.seq)[0];
    if (base) store.put("trip_pickups", { pickup_id: base.pickup_id, planned_comps: plans.base as any });
    addPickup(store, {
      userId, tripId: openTrip.trip_id, terminalId: location.selectedTerminalId || null, rackId: location.selectedRackId || null,
      name: terminalName, city: location.selectedCity || null, state: location.selectedState || null,
      plannedComps: plans.splash, orderId: null, ...clock(),
    });
    setNotice({ text: `Splash pickup added at ${terminalName ?? "the terminal"}. Use the arrows on the card to change which terminal loads first.`, tripId: null });
    void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splashTermPending, shell.termOpen, shell.locOpen, shell.rackPickerOpen, shell.rackResolving]);
  const swapSplashOrder = () => {
    if (!store || !splashPickup || !baseStop) return;
    if (splashPickup.arrived_at || baseStop.arrived_at || splashPickup.load_id || baseStop.load_id) return;
    store.put("trip_pickups", { pickup_id: splashPickup.pickup_id, seq: baseStop.seq });
    store.put("trip_pickups", { pickup_id: baseStop.pickup_id, seq: splashPickup.seq });
    void syncNow();
  };
  // After the first stop loads, re-work the second stop's gallons from what is really aboard.
  useEffect(() => {
    if (!store || !splashPickup || !baseStop) return;
    const [first, second] = splashPickup.seq < baseStop.seq ? [splashPickup, baseStop] : [baseStop, splashPickup];
    if (!first.load_id || second.load_id || second.left_at || !second.planned_comps?.length) return;
    const map: Record<number, { product_id: string | null; gallons: number }> = {};
    for (const [n, a] of Object.entries(aboard)) map[Number(n)] = { product_id: a.product_id, gallons: a.gallons ?? 0 };
    const next = refineSecondStop({ planned: second.planned_comps as StagedPlanned[], aboard: map, splash: tripSplash, sizes: compSizes, roomLbs: splashRoomLbs, lbsPerGal: (id) => roughLbsPerGal(id ? productInfo(id).name : "") });
    if (!next) return;
    store.put("trip_pickups", { pickup_id: second.pickup_id, planned_comps: next as any });
    void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splashPickup?.pickup_id, baseStop?.pickup_id, baseStop?.load_id, splashPickup?.load_id, aboardRows.length, splashRoomLbs]);
  // Finished blends more than a point off their target.
  const blendWarnings = Object.entries(tripSplash).flatMap(([k, sp]) => {
    const rows = aboardRows.filter((r) => r.comp_number === Number(k));
    if (rows.length < 2) return [];
    const add = rows.filter((r) => r.product_id === sp.additiveProductId).reduce((t, r) => t + (r.gross_gallons ?? 0), 0);
    const base = rows.filter((r) => r.product_id !== sp.additiveProductId).reduce((t, r) => t + (r.gross_gallons ?? 0), 0);
    const pct = blendPct(add, base);
    return pct != null && offTarget(pct, sp.pct) ? [{ comp: Number(k), pct, target: sp.pct, text: `C${k} is ${blendLabel(pct)} (${pct.toFixed(1)}%), target ${sp.pct}%` }] : [];
  });
  // The driver's way out of an off-target blend: take the blend as loaded (the PTD then records what is really in the
  // compartment), or, when it came up short and the trailer can still load, add more ethanol.
  const keepBlendAsLoaded = (comp: number, pct: number) => {
    const sp = tripSplash[comp];
    const next = Math.round(pct * 10) / 10;
    if (!userId || !openTrip || !sp || !validPct(next)) return;
    const updated = { ...tripSplash, [comp]: { ...sp, pct: next } };
    setTripSplash(userId, openTrip.trip_id, updated);
    setTripSplashState(updated);
  };
  // The most recent load on this trip, for the Load Report link.
  const lastLoadId = [...pickups].filter((p) => p.load_id && (p.outcome === "loaded" || p.left_at)).sort((a, b) => b.seq - a.seq)[0]?.load_id ?? null;
  // The place whose notes the Site notes link opens: the terminal once the trip is underway, the drop site once loaded.
  const notesSite = (() => {
    if (!openTrip || !snap) return null;
    if (aboardRows.length > 0 && !activePickup(snap.pickups)) {
      const d = plannedDeliveries(snap.deliveries)[0];
      return d?.location_id ? { kind: "location" as const, id: d.location_id, title: deliveryName(d), word: "Drop site notes" } : null;
    }
    const pk = activePickup(snap.pickups) ?? [...snap.pickups].sort((a, b) => a.seq - b.seq).find((p) => !p.left_at && p.outcome !== "no_load");
    return pk?.terminal_id ? { kind: "terminal" as const, id: String(pk.terminal_id), title: pk.name ?? "Terminal", word: "Terminal notes" } : null;
  })();
  return { ...p, confirmDetectedArrival, confirmDutyArrival, onBigButton, truckAlerts, trailerAlerts, dropCount, countColor, loadLine, onBoardLines, showPark, parkRequested, handoffAlert, dismissHandoff, doPark, doTakeOver, expGroups, expTotal, expWorst, L, card, stepsByTerminal, readiness, readinessLabel, openTerminalList, pickups, liveDeliveries, anyDelivered, planLine, chipFor, baseByComp, splashPlanProp, splashPickup, baseStop, splashComps, saveSplash, swapSplashOrder, blendWarnings, keepBlendAsLoaded, lastLoadId, notesSite } as const;
}
