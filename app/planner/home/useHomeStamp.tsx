"use client";
// app/planner/home/useHomeStamp.tsx
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

import { requestHosRefresh } from "@/lib/telematics/useMyHos";
import { capturePosition } from "@/lib/position/capturePosition";
import { useEffect, useMemo } from "react";

import { supabase } from "@/lib/supabase/client";

import { topUnread, totalUnread, type SquawkCtx, type SquawkType } from "@/lib/squawk/squawk";
import { playChirp, useMyArea, useSquawkAlerts } from "@/lib/squawk/useSquawk";

import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import { DELAY_EVENT, delayEventPayload, delayIssueCode, legForStep, loggedDelays, readRunningDelay, writeRunningDelay, type RunningDelay, endRunningDelay, attachPendingDelays, INSTANT_CODES, logInstantDelay, SHOP_CODE } from "@/lib/trips/delays";
import { newId } from "@/lib/trips/tripStore";

import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { kindsOf } from "@/lib/trips/deliveryLocations";

import { applyStartLoad, buildStartLoad, lastShipperCustomer, openTripForDriver, dispatchedForDriver, beginDispatched, truckBeginMiles, tripChildren, type StartLoadDelivery } from "@/lib/trips/tripLogic";
import { addPickup, addTripOrder, setPickupOrder, onBoard } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripRow } from "@/lib/trips/types";

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

import { reportDelayIssue, submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";

import { clearDeliveryDraft, type DeliveryProgress, type FinishDeliverySubmit, type ProductInfo } from "../components/trip/DeliveryDashboard";

import { conflicts, usedOrderNumbers } from "@/lib/trips/refs";
import { serverOrderConflicts } from "@/lib/trips/refCheck";
import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";

import { checkAddPickup, grossColor, LEGAL_GROSS_LBS } from "@/lib/trips/addPickupCheck";
import { topOffPlan, roughLbsPerGal } from "@/lib/trips/splash";
import { getTripSplash, setTripSplash, type TripSplash } from "@/lib/trips/tripSplash";
import { markAddingPickup, releaseAddingPickup } from "@/lib/trips/pickerIntent";
import { isSplashable, splashPickupPlans, refineSecondStop, type StagedPlanned } from "@/lib/trips/splashRows";

import { type OrderChoice } from "../components/trip/OrderChooser";

import { headingToTerminal, parkedPreloads, storeActivity } from "@/lib/trips/dashboardCards";

import { snoozed, telematicsStart } from "@/lib/shifts/autoStart";

import { readShopDown, writeShopDown, SHOP_BLOCK, type ShopDown } from "@/lib/trips/shopDown";

import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";

import { useStampContext } from "../hooks/useStampContext";

import { rememberLastEquipment } from "@/lib/equipment/lastEquipment";

import { beginTripShift, offDutyAsk, telematicsLive } from "@/lib/shifts/dutyStatus";

import { useOtherCarriers, useStoreDeliveries, useTerminalStatus } from "../hooks/useDashboardCards";

import { LOOK } from "./dashLook";

import { addTrailerAlert, clearTrailerAlerts, fetchTrailerAlerts, sendPendingTrailerAlerts, type TrailerAlert } from "@/lib/trips/trailerAlerts";

import { openAccessSteps, useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";

import { EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";

import { beginPatch } from "@/lib/moves/dispatchedMoves";
import { type ExpGroup, type ExpRow } from "./DashboardSheets";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import type { useHomeSteps } from "./useHomeSteps";

export function useHomeStamp(p: ReturnType<typeof useHomeSteps>) {
  const { askArrivalStatus, addDraft, addSawPicker, addTermPending, askTruckStatus, catchUp, children, clock, compSizes, companyId, currentGross, currentTarget, emptyMoves, locList, location, locations, onCancelSubmit, openTrip, orderPickup, parkStampRef, placedTerminals, productInfo, setAddBusy, setAddDraft, setAddOpen, setAddTermPending, setNotice, setOrderBusy, setOrderErr, setOrderPickup, setSplashOpen, setStampAsk, shell, shift, snap, stampAsk, store, syncNow, terminalName, trailerId, tripSplash, tripTrailerId, trips, truckChanged, truckId, userId } = p;

  // ── Odometer stamp: cancel a load / end a shift ────────────────────────────
  // Where the truck is when the load is cancelled: the rack the driver is still at, else GPS (see useStampContext).
  const stampRack = useMemo(() => {
    if (stampAsk?.kind !== "cancel" || !snap) return null;
    const p = snap.pickups.find((x) => x.arrived_at && !x.left_at && x.outcome !== "no_load");
    if (!p) return null;
    const loc = locations.find((l) => kindsOf(l).includes("terminal") && l.name.trim().toLowerCase() === String(p.name ?? "").trim().toLowerCase());
    return { id: loc?.location_id ?? null, text: [p.name, [p.city, p.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || null };
  }, [stampAsk, snap, locations]);
  const stampCtx = useStampContext({ active: !!stampAsk && !!truckId, truckId, locations, terminalPlaceId: stampRack?.id ?? null, terminalText: stampRack?.text ?? null });
  const stampPlaceLabel = (() => {
    if (stampCtx.placeId) { const l = locations.find((x) => x.location_id === stampCtx.placeId); if (l) return l.name; }
    return stampCtx.placeText;
  })();
  const stampFloor = stampAsk?.kind === "cancel" ? openTrip?.begin_miles ?? null : emptyMoves.current?.begin_miles ?? null;
  const confirmStamp = async (odo: number) => {
    const ask = stampAsk;
    if (!ask) return;
    const at = new Date().toISOString();
    // Every odometer stamp is also a position capture (the pop-out already has a fix).
    if (!shell.setupSession) void capturePosition({ userId: shell.authUserId, companyId, truckId, trailerId, cause: ask.kind === "shift" ? "shift_end" : ask.kind, odometer: odo, lat: stampCtx.lat, lon: stampCtx.lon, at });
    if (ask.kind === "cancel") {
      setStampAsk(null);
      await onCancelSubmit({ ...ask.v, endMiles: odo });
      if (truckId) {
        emptyMoves.begin({ truckId, trailerId, kind: trailerId ? "empty_return" : "bobtail", from: { id: stampCtx.placeId, text: stampCtx.placeText }, to: { id: null, text: null }, beginMiles: odo, at: ask.v.cancelledAt || at, source: stampCtx.guess === odo ? "geotab" : "app" });
      }
      return;
    }
    if (ask.kind === "move_begin") {
      setStampAsk(null);
      // A dispatched move begins: the planned row gets its real start, odometer, place and equipment.
      if (ask.plannedId && truckId) {
        const planned = emptyMoves.moves.find((x) => x.move_id === ask.plannedId);
        if (planned) emptyMoves.beginPlanned({ ...beginPatch(planned, { atIso: at, truckId, trailerId: trailerId ?? null, beginMiles: odo }), from_place_id: stampCtx.placeId, from_text: stampCtx.placeText, source: stampCtx.guess === odo ? "geotab" : "app" });
        return;
      }
      if (truckId) emptyMoves.begin({ truckId, trailerId, kind: trailerId ? "empty_return" : "bobtail", from: { id: stampCtx.placeId, text: stampCtx.placeText }, to: { id: null, text: null }, beginMiles: odo, at, source: stampCtx.guess === odo ? "geotab" : "app" });
      return;
    }
    if (ask.kind === "move_end") {
      setStampAsk(null);
      const mv = emptyMoves.current;
      if (mv) endMoveAndMark(mv.move_id, odo, { id: stampCtx.placeId, text: stampCtx.placeText }, at);
      void askArrivalStatus();
      return;
    }
    // End shift: the shift record carries the same stamp, and an open move ends here.
    const startedAt = shift.current?.startedAt ?? null;
    if (userId && truckId) rememberLastEquipment(userId, { truckId, trailerId: trailerId ?? null }); // parking lets go of the truck; Begin Trip offers it again
    parkStampRef.current = { lat: stampCtx.lat, lon: stampCtx.lon, label: stampPlaceLabel, placeId: stampCtx.placeId };
    setStampAsk(null);
    shift.end({ odometer: odo, lat: stampCtx.lat, lon: stampCtx.lon, place_id: stampCtx.placeId, place_text: stampPlaceLabel, location_source: stampCtx.source, odometer_source: stampCtx.guess === odo ? "truck" : "typed" });
    requestHosRefresh({ chaseMin: 15 }); // the duty status follows the driver's change in Drive within a minute or so
    const m = emptyMoves.current;
    if (m) emptyMoves.end(m.move_id, odo, { id: stampCtx.placeId, text: stampCtx.placeText }, at);
    // Anything the truck did that the app didn't see is asked about first; then the truck's status.
    if (truckId && startedAt) void catchUp.begin({ truckId, from: startedAt, to: at, endOdo: odo }, () => void askTruckStatus(startedAt));
    else void askTruckStatus(startedAt);
  };
  // A move that ends at a maintenance place leaves its equipment there: the trailer if it came with one, else the truck.
  // Marks it "Out of service / Maintenance" at that place (status and pin), the same record the equipment status window writes.
  const endMoveAndMark = (moveId: string, endMiles: number | null, to?: { id: string | null; text: string | null }, endedAt?: string) => {
    emptyMoves.end(moveId, endMiles, to, endedAt);
    const m = emptyMoves.moves.find((x) => x.move_id === moveId);
    const place = to?.id ? locations.find((l) => l.location_id === to.id) : null;
    if (!m || !place || !kindsOf(place).includes("maintenance")) return;
    const unit: ["truck" | "trailer", string] | null = m.trailer_id && m.kind !== "bobtail" ? ["trailer", m.trailer_id] : m.truck_id ? ["truck", m.truck_id] : null;
    if (!unit) return;
    void (async () => {
      try {
        const { error } = await supabase.rpc("set_equipment_status", {
          p_unit_kind: unit[0], p_unit_id: unit[1], p_status: "deadline",
          p_region: place.region ?? null, p_local_area: place.local_area ?? null,
          p_notes: `At ${place.name}`, p_sub_status: "Maintenance",
        });
        if (error) throw error;
        if (place.lat != null && place.lon != null) {
          await supabase.rpc("park_equipment", {
            p_truck_id: unit[0] === "truck" ? unit[1] : null, p_trailer_id: unit[0] === "trailer" ? unit[1] : null,
            p_lat: place.lat, p_lon: place.lon, p_label: place.name, p_place_id: place.location_id,
          });
        }
        setNotice({ text: `${unit[0] === "trailer" ? "Trailer" : "Truck"} marked in maintenance at ${place.name}.`, tripId: null });
      } catch (e) { console.warn("[move] shop status failed:", e); }
    })();
  };
  // An empty move ends where the next trip begins: its beginning miles and starting-from.
  useEffect(() => {
    const m = emptyMoves.current;
    if (!m || !openTrip?.started_at || Date.parse(openTrip.started_at) < Date.parse(m.started_at)) return;
    emptyMoves.end(m.move_id, openTrip.begin_miles ?? null, { id: null, text: [openTrip.start_city, openTrip.start_state].filter(Boolean).join(", ") || null }, openTrip.started_at);
  }, [emptyMoves.current?.move_id, openTrip?.trip_id, openTrip?.started_at]);
  useEffect(() => {
    if (!snap || !companyId) return;
    for (const p of snap.pickups) {
      const tid = p.terminal_id ? String(p.terminal_id) : "";
      if (!p.arrived_at || !tid || placedTerminals.current.has(tid)) continue;
      placedTerminals.current.add(tid);
      void supabase.rpc("ensure_terminal_place", { p_company_id: companyId, p_terminal_id: tid }).then(({ error }) => { if (error) placedTerminals.current.delete(tid); else void locList.reload(); });
    }
  }, [snap, companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const aboardRows = useMemo(() => (snap ? onBoard(snap.compLoads) : []), [snap]);
  const aboard = useMemo(() => {
    const m: Record<number, { product_id: string | null; gallons: number | null; rows?: number }> = {};
    // A compartment splash blended has two loads: the first product, the gallons together, and a row count.
    for (const c of aboardRows) {
      const g = c.gross_gallons != null ? Number(c.gross_gallons) : null;
      const old = m[c.comp_number];
      m[c.comp_number] = old
        ? { product_id: old.product_id, gallons: g != null || old.gallons != null ? (old.gallons ?? 0) + (g ?? 0) : null, rows: (old.rows ?? 1) + 1 }
        : { product_id: c.product_id, gallons: g, rows: 1 };
    }
    return m;
  }, [aboardRows]);
  // What the trailer last carried, for empty compartments (residue).
  const trailerHdr = useTrailerHeaderData([tripTrailerId], `${openTrip?.status ?? ""}|${aboardRows.length}`);
  const residue = (tripTrailerId ? trailerHdr.residue[tripTrailerId] : undefined) ?? {};
  const compCount = Object.keys(compSizes).length;
  // A compartment with nothing aboard that last held something is residue.
  const hasResidue = Object.keys(compSizes).map(Number).some((n) => !aboard[n] && !!residue[n]);
  // The trailer, full width like a header to its card; the gross (or Residue / Empty) goes under it.
  const trailerBar = compCount > 0 ? <TrailerHeader variant="bar" trailerId={tripTrailerId} loaded={Object.fromEntries(Object.entries(aboard).map(([n, a]) => [Number(n), a.product_id]))} data={trailerHdr} /> : null;
  const trailerLabel = compCount === 0 ? null : aboardRows.length > 0 && currentGross != null ? (
    <span className="dash-num" style={{ fontSize: 19, fontWeight: 900, color: truckChanged ? "#fbbf24" : grossColor(currentGross, currentTarget), whiteSpace: "nowrap" }}>
      {currentGross.toLocaleString("en-US")}
      <span style={{ fontSize: 10, fontWeight: 700, color: LOOK.muted, marginLeft: 3, letterSpacing: "0.08em" }}>LBS</span>
    </span>
  ) : (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: LOOK.muted, whiteSpace: "nowrap" }}>
      {aboardRows.length > 0 ? "" : hasResidue ? "RESIDUE" : "EMPTY"}
    </span>
  );
  const addCheck = useMemo(() => checkAddPickup({
    compNumbers: Object.keys(compSizes).map(Number),
    onBoard: aboardRows,
    gross: currentGross,
    target: currentTarget,
  }), [compSizes, aboardRows, currentGross, currentTarget]);
  const primaryOrderId = children?.primaryOrder?.order_id ?? null;
  const defaultOrder = (): OrderChoice => primaryOrderId ? { kind: "existing", orderId: primaryOrderId } : { kind: "new", number: "" };
  // An order choice → an order id on this trip. A new number is checked
  // against the company's other live trips, then added (or matched to one
  // already on this trip). Null = keep the primary order.
  const resolveOrder = async (choice: OrderChoice): Promise<{ orderId: string | null } | { error: string }> => {
    if (!store || !openTrip) return { error: "No trip." };
    if (choice.kind === "existing") return { orderId: choice.orderId === primaryOrderId ? null : choice.orderId };
    const num = choice.number.trim();
    if (!num) return { error: "Enter the order number." };
    const local = usedOrderNumbers(trips, store.list("trip_orders", () => true), openTrip.trip_id);
    const taken = conflicts([num], local);
    if (!taken.length && companyId) taken.push(...(await serverOrderConflicts(companyId, [num], openTrip.trip_id)));
    if (taken.length) return { error: `Order ${taken[0]} is already on another trip.` };
    const id = addTripOrder(store, { tripId: openTrip.trip_id, orderNumber: num, newId });
    return { orderId: id === primaryOrderId ? null : id };
  };
  const openAddPickup = () => {
    setOrderErr(null);
    setAddDraft({ stage: "comps", comps: addCheck.emptyComps.length === 1 ? [...addCheck.emptyComps] : [], products: {}, order: defaultOrder() });
    setAddOpen(true);
  };
  const addPickTerminal = () => {
    markAddingPickup();
    setAddOpen(false);
    setAddTermPending(true);
    if (location.selectedCity) shell.setTermOpen(true);
    else shell.setLocOpen(true);
  };
  useEffect(() => {
    if (!addTermPending) return;
    const pickerOpen = shell.termOpen || shell.locOpen || shell.rackPickerOpen || shell.rackResolving;
    if (pickerOpen) { addSawPicker.current = true; return; }
    if (!addSawPicker.current) return;
    addSawPicker.current = false;
    setAddTermPending(false);
    releaseAddingPickup();
    setAddDraft((d) => ({ ...d, stage: location.selectedTerminalId ? "products" : "comps" }));
    setAddOpen(true);
  }, [addTermPending, shell.termOpen, shell.locOpen, shell.rackPickerOpen, shell.rackResolving, location.selectedTerminalId]);
  const openSplash = () => setSplashOpen(true);
  const splashNums = Object.keys(compSizes).map(Number).sort((a, b) => b - a);
  const splashRoomLbs = currentGross != null ? Math.max(0, LEGAL_GROSS_LBS - currentGross) : null;
  const confirmAddPickup = async () => {
    if (!store || !userId || !openTrip) return;
    const plans = topOffPlan(addDraft.comps.map((n) => ({
      n, aboardProductId: aboard[n]?.product_id ?? null, aboardGallons: aboard[n]?.gallons ?? 0, max: compSizes[n] || 0,
      pct: tripSplash[n]?.pct ?? addDraft.pct ?? 0, additiveProductId: tripSplash[n]?.additiveProductId ?? null, topProductId: addDraft.products[n] ?? null,
    })), splashRoomLbs, (id) => roughLbsPerGal(productInfo(id).name));
    const plannedComps = addDraft.comps
      .filter((n) => !!addDraft.products[n])
      .map((n) => {
        if (!addDraft.splash) return { comp_number: n, product_id: addDraft.products[n] };
        const pct = tripSplash[n]?.pct ?? addDraft.pct ?? 0;
        return { comp_number: n, product_id: addDraft.products[n], splash: { pct, aboard: aboard[n]?.gallons ?? 0, add: plans.get(n)?.add ?? 0 } };
      })
      .filter((c) => !addDraft.splash || (c.splash?.add ?? 0) > 0);
    if (!plannedComps.length) return;
    setAddBusy(true);
    setOrderErr(null);
    const res = await resolveOrder(addDraft.order);
    setAddBusy(false);
    if ("error" in res) { setOrderErr(res.error); return; }
    addPickup(store, {
      userId, tripId: openTrip.trip_id,
      terminalId: location.selectedTerminalId || null,
      rackId: location.selectedRackId || null,
      name: terminalName,
      city: location.selectedCity || null,
      state: location.selectedState || null,
      plannedComps,
      orderId: res.orderId,
      ...clock(),
    });
    setAddOpen(false);
    setNotice({ text: `${addDraft.splash ? "Splash blend" : "Pickup"} added at ${terminalName ?? "the terminal"}. Tap Arrive when you get there.`, tripId: null });
    void syncNow();
  };
  const savePickupOrder = async (choice: OrderChoice) => {
    if (!store || !userId || !orderPickup) return;
    setOrderBusy(true);
    setOrderErr(null);
    const res = await resolveOrder(choice);
    setOrderBusy(false);
    if ("error" in res) { setOrderErr(res.error); return; }
    setPickupOrder(store, { userId, pickup: orderPickup, orderId: res.orderId, ...clock() });
    setOrderPickup(null);
    void syncNow();
  };
  return { ...p, stampCtx, stampPlaceLabel, stampFloor, confirmStamp, endMoveAndMark, aboardRows, aboard, trailerHdr, trailerBar, trailerLabel, addCheck, defaultOrder, openAddPickup, addPickTerminal, openSplash, splashNums, splashRoomLbs, confirmAddPickup, savePickupOrder } as const;
}
