"use client";
// app/planner/home/useHomeDispatched.tsx
//
// One slice of the Driver Dashboard's logic (see useHome.tsx for how the slices chain together).
// app/planner/home/useHome.tsx
//
// All of the Driver Dashboard's state, effects and handlers. Returns what the screen (HomeView) draws.
import { cleanOdometer } from "@/lib/moves/emptyMoves";

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

import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { readLastEquipment, resolveLast, lastFromTrips } from "@/lib/equipment/lastEquipment";

import { topUnread, totalUnread, type SquawkCtx, type SquawkType } from "@/lib/squawk/squawk";
import { playChirp, useMyArea, useSquawkAlerts } from "@/lib/squawk/useSquawk";

import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import { DELAY_EVENT, delayEventPayload, delayIssueCode, legForStep, loggedDelays, readRunningDelay, writeRunningDelay, type RunningDelay, endRunningDelay, attachPendingDelays, INSTANT_CODES, logInstantDelay, SHOP_CODE } from "@/lib/trips/delays";
import { newId } from "@/lib/trips/tripStore";

import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { airMiles } from "@/lib/trips/deliveryLocations";

import { applyStartLoad, buildStartLoad, lastShipperCustomer, dispatchedForDriver, beginDispatched, truckBeginMiles, tripChildren, type StartLoadDelivery } from "@/lib/trips/tripLogic";
import { plannedDeliveries } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripRow } from "@/lib/trips/types";
import type { StartLoadValues } from "../components/StartLoadSheet";

import { useTruckReading, fetchTruckShipments, fetchTruckReading } from "@/lib/telematics/useTruckReading";

import { shouldNotifyHosTrip, type Level } from "@/lib/telematics/hosTripNotify";
import { notifyPermission, showNotification, type NotifyPermission } from "@/lib/ui/notify";

import { DROP_STOP_MIN, LOAD_STOP_MIN, remainingDriveMin, tripHosCheck } from "@/lib/telematics/progress";
import { recordArrivalPoint, useArrivalSuggestion, type ArrivalTarget } from "@/lib/telematics/useArrivalSuggestion";
import { fetchPresets, getTripPlan, setTripPlan, setTripPlanSnapshot, setTripQuick, nextSaveSlot, savePresetPlan } from "@/lib/trips/tripPlan";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";
import { readPlannedMeta } from "@/lib/dispatch/compPlan";
import { writePicks, type SupplierPick } from "@/lib/suppliers/picks";
import { saveTripDraft, takeTripDraft, takeDetourSlot } from "@/lib/trips/planDetour";
import { getTripSupplier, sameSupplier, seedTerminalPicks, setTripSupplier, type TripSupplier } from "@/lib/trips/tripSupplier";
import { readPicks, groupPicks } from "@/lib/suppliers/picks";
import { linkSupplierToTerminal } from "@/lib/suppliers/useTerminalSuppliers";

import { reportDelayIssue, submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";

import { clearDeliveryDraft, type DeliveryProgress, type FinishDeliverySubmit, type ProductInfo } from "../components/trip/DeliveryDashboard";

import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";
import { serverOrderConflicts } from "@/lib/trips/refCheck";
import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";

import { checkAddPickup, grossColor, LEGAL_GROSS_LBS } from "@/lib/trips/addPickupCheck";
import { topOffPlan, roughLbsPerGal, mergeBlendRows, blendPct, blendLabel, offTarget, validPct } from "@/lib/trips/splash";
import { getTripSplash, setTripSplash, type TripSplash } from "@/lib/trips/tripSplash";
import { markAddingPickup, releaseAddingPickup } from "@/lib/trips/pickerIntent";
import { isSplashable, splashPickupPlans, refineSecondStop, type StagedPlanned } from "@/lib/trips/splashRows";

import { headingToTerminal, parkedPreloads, storeActivity } from "@/lib/trips/dashboardCards";

import { snoozed, telematicsStart } from "@/lib/shifts/autoStart";

import { readShopDown, writeShopDown, SHOP_BLOCK, type ShopDown } from "@/lib/trips/shopDown";

import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";

import { beginEquipmentVerdict } from "@/lib/equipment/beginEquipment";

import { beginTripShift, offDutyAsk, telematicsLive } from "@/lib/shifts/dutyStatus";

import { useOtherCarriers, useStoreDeliveries, useTerminalStatus } from "../hooks/useDashboardCards";

import { LOOK, useScrollBackdrop } from "./dashLook";

import { addTrailerAlert, clearTrailerAlerts, fetchTrailerAlerts, sendPendingTrailerAlerts, type TrailerAlert } from "@/lib/trips/trailerAlerts";

import { openAccessSteps, useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";

import { EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";

import { type ExpGroup, type ExpRow } from "./DashboardSheets";

import { type DispatchedItem } from "./DispatchedCard";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import type { useHomeDelays } from "./useHomeDelays";

export function useHomeDispatched(p: ReturnType<typeof useHomeDelays>) {
  const { addingLoad, planEquip, setPlanEquip, setAddingLoad, children, compSizes, companyId, deliveryName, editing, emptyMoves, equipAsk, equipSawOpen, equipSwitching, equipment, location, locations, openTrip, parkStampRef, plannedNames, resumeAfterMove, resumeDraft, router, setBusy, setEquipAsk, setEquipSwitching, setError, setNotice, setPlannedNames, setSheetOpen, setVerifyActive, setVerifyTripId, sheetPresets, shell, snap, state, store, storedLocId, suppliers, syncNow, terminalName, trailerId, trips, truckId, userId, verifyActive, verifyBaseTerminal, verifyTripId } = p;

  // ── Loads dispatch planned for this driver ───────────────────────────────
  const dispatchedList = useMemo(() => (userId ? dispatchedForDriver(trips, userId) : []), [trips, userId]);
  useEffect(() => {
    const truckIds = [...new Set(dispatchedList.map((t) => t.planned_truck_id).filter(Boolean))] as string[];
    const trailerIds = [...new Set(dispatchedList.map((t) => t.planned_trailer_id).filter(Boolean))] as string[];
    if (!truckIds.length && !trailerIds.length) return;
    let off = false;
    (async () => {
      const [a, b] = await Promise.all([
        truckIds.length ? supabase.from("trucks").select("truck_id, truck_name").in("truck_id", truckIds) : Promise.resolve({ data: [] as any[] }),
        trailerIds.length ? supabase.from("trailers").select("trailer_id, trailer_name").in("trailer_id", trailerIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      if (off) return;
      const m: Record<string, string> = {};
      for (const r of (a.data ?? []) as any[]) m[r.truck_id] = r.truck_name;
      for (const r of (b.data ?? []) as any[]) m[r.trailer_id] = r.trailer_name;
      setPlannedNames(m);
    })();
    return () => { off = true; };
  }, [dispatchedList]);
  const dispatchedItems = useMemo<DispatchedItem[]>(() => {
    if (!store) return [];
    return dispatchedList.map((t) => {
      const ch = tripChildren(store, t.trip_id);
      const pk = ch.pickup;
      const del = ch.deliveries[0];
      const sup = pk?.supplier_id ? suppliers.find((x) => x.supplier_id === pk.supplier_id)?.name ?? null : null;
      const planned = [t.planned_truck_id, t.planned_trailer_id].some(Boolean);
      const eq = [t.planned_truck_id ? `Truck ${plannedNames[t.planned_truck_id] ?? "—"}` : null, t.planned_trailer_id ? `Trailer ${plannedNames[t.planned_trailer_id] ?? "—"}` : null].filter(Boolean).join(" · ");
      return {
        trip: t, order: ch.primaryOrder?.order_number ?? null, terminal: pk?.name ?? null,
        place: [pk?.city, pk?.state].filter(Boolean).join(", ") || null,
        supplier: sup, delivery: del ? deliveryName(del) : null,
        plannedEquipment: planned ? eq : null,
        equipmentDiffers: planned && ((t.planned_truck_id && truckId && t.planned_truck_id !== truckId) || (t.planned_trailer_id && trailerId && t.planned_trailer_id !== trailerId)) as boolean,
      };
    });
  }, [dispatchedList, store, suppliers, truckId, trailerId, state, plannedNames]);
  useEffect(() => {
    if (!equipSwitching) { equipSawOpen.current = false; return; }
    if (shell.equipOpen) { equipSawOpen.current = true; return; }
    if (!equipSawOpen.current) return;
    const a = equipAsk;
    setEquipSwitching(false);
    setEquipAsk(null);
    if (!a) return;
    const verdict = beginEquipmentVerdict({ hasCombo: !!equipment.selectedComboId, hasTruck: !!equipment.selectedComboId || equipment.isBobtail, hasTrailer: !!equipment.selectedComboId && !equipment.isBobtail, needTrailer: a.needTrailer });
    if (verdict === "go") a.then();
    else setNotice({ text: a.needTrailer ? "Pick a truck and trailer to begin the trip." : "Pick a truck first.", tripId: null });
  }, [equipSwitching, shell.equipOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const openEquipPicker = (go: () => void, needTrailer: boolean) => { setEquipAsk({ then: go, needTrailer }); setEquipSwitching(true); shell.setEquipOpen(true); };
  const askEquipment = async (go: () => void, opts?: { needTrailer?: boolean }) => {
    const needTrailer = opts?.needTrailer ?? true;
    if (!userId || !companyId || shell.setupSession) { go(); return; }
    const verdict = beginEquipmentVerdict({ hasCombo: !!equipment.selectedComboId, hasTruck: !!truckId || equipment.isBobtail, hasTrailer: !!trailerId && !equipment.isBobtail, needTrailer });
    if (verdict === "go") { go(); return; }
    openEquipPicker(go, needTrailer);
  };
  // After an empty move started from the bobtail suggestion ends with a trailer coupled, the Begin Trip sequence carries on.
  useEffect(() => {
    const go = resumeAfterMove.current;
    if (!go || emptyMoves.current || !trailerId) return;
    resumeAfterMove.current = null;
    go();
  }, [emptyMoves.current, trailerId]);
  const parkPreset = (() => {
    const st = parkStampRef.current;
    if (!st || st.lat == null || st.lon == null) return null;
    let best: { d: number; region: string | null; local_area: string | null } | null = null;
    for (const l of locations) {
      if (l.lat == null || l.lon == null || (!l.region && !l.local_area)) continue;
      const d = airMiles({ lat: st.lat, lon: st.lon }, { lat: Number(l.lat), lon: Number(l.lon) });
      if (d <= 0.3 && (!best || d < best.d)) best = { d, region: l.region ?? null, local_area: l.local_area ?? null };
    }
    return best;
  })();
  const savePark = async () => {
    const st = parkStampRef.current;
    parkStampRef.current = null;
    if (!st || st.lat == null || st.lon == null || !truckId) return;
    try {
      await supabase.rpc("park_equipment", { p_truck_id: truckId, p_trailer_id: trailerId ?? null, p_lat: st.lat, p_lon: st.lon, p_label: st.label, p_place_id: st.placeId });
    } catch { /* the pin is a convenience; parking itself already went through */ }
  };
  // Put the Planner's terminal (and rack) on a pickup's, when it isn't there already.
  const alignPlannerToPickup = (pk: { terminal_id?: string | null; state?: string | null; city?: string | null; rack_id?: string | null }) => {
    const loc = shell.location;
    if (pk.terminal_id && pk.terminal_id !== String(loc.selectedTerminalId || "")) {
      loc.skipResetRef.current = true;
      if (pk.state) loc.setSelectedState(pk.state);
      if (pk.city) loc.setSelectedCity(pk.city);
      loc.setSelectedTerminalId(pk.terminal_id);
      loc.setSelectedRackId(pk.rack_id ?? "");
      setTimeout(() => { loc.skipResetRef.current = false; }, 50);
    } else if (pk.rack_id && loc.selectedRackId !== pk.rack_id) {
      loc.setSelectedRackId(pk.rack_id);
    }
  };
  // Run earlier / later from the Loads chip: the two loads trade places (start time and sequence).
  const swapDispatched = (aId: string, bId: string) => {
    const a = dispatchedList.find((t) => t.trip_id === aId);
    const b = dispatchedList.find((t) => t.trip_id === bId);
    if (!store || !a || !b) return;
    store.put("trips", { trip_id: a.trip_id, planned_start_at: b.planned_start_at ?? null, dispatch_seq: b.dispatch_seq ?? 0 });
    store.put("trips", { trip_id: b.trip_id, planned_start_at: a.planned_start_at ?? null, dispatch_seq: a.dispatch_seq ?? 0 });
    void syncNow();
  };
  const [beginPopOpen, setBeginPopOpen] = useState(false);
  // The pop-out's Begin: miles and starting place go on the trip, and the plan follows what dispatch sent (the driver's own
  // plan when it matches one, else run once with caps kept).
  const confirmBeginPop = (v: { miles: string; city: string; state: string }) => {
    if (!store || !openTrip || !userId) return;
    const m = cleanOdometer(v.miles) === "" ? null : Number(cleanOdometer(v.miles));
    store.put("trips", { trip_id: openTrip.trip_id, begin_miles: m != null && Number.isFinite(m) ? m : null, start_city: v.city || null, start_state: v.state || null });
    const pk = children?.pickup ?? null;
    const sentLayout = pk && !pk.load_id
      ? layoutFromProducts(Object.fromEntries([...readPlannedMeta(pk.planned_comps).entries()].map(([n, mm]) => [n, mm.product_id])), Object.keys(compSizes).map(Number))
      : null;
    const matched = sentLayout ? findMatchingPlan(sheetPresets, sentLayout) : null;
    if (pk && !pk.load_id) {
      if (matched) {
        setTripPlan(userId, openTrip.trip_id, matched.slot);
        setTripPlanSnapshot(userId, openTrip.trip_id, { comps: matched.comps });
      } else setTripQuick(userId, openTrip.trip_id, true);
    }
    setBeginPopOpen(false);
    setVerifyActive(false);
    void syncNow();
  };
  const beginDispatchedLoad = (tripId?: string) => {
    const trip = tripId ? dispatchedList.find((t) => t.trip_id === tripId) : dispatchedList[0];
    if (!store || !userId || !trip || openTrip) return;
    const miles = truckBeginMiles(trips, truckId);
    beginDispatched(store, { trip, userId, truckId: truckId ?? null, trailerId: trailerId ?? null, beginMiles: miles, now: new Date(), newId });
    // The supplier dispatch picked: kept on the trip and preset at the rack.
    const pk = tripChildren(store, trip.trip_id).pickup;
    const sup = pk?.supplier_id ? suppliers.find((x) => x.supplier_id === pk.supplier_id) : null;
    if (sup) {
      setTripSupplier(userId, trip.trip_id, { supplier_id: sup.supplier_id, name: sup.name });
      if (pk?.terminal_id) seedTerminalPicks(userId, String(pk.terminal_id), { supplier_id: sup.supplier_id, name: sup.name });
    }
    // A compartment plan can name a different supplier per product.
    if (pk?.terminal_id) {
      const picks: SupplierPick[] = [];
      for (const m of readPlannedMeta(pk.planned_comps).values()) {
        const s2 = m.supplier_id ? suppliers.find((x) => x.supplier_id === m.supplier_id) : null;
        if (s2 && !picks.some((x) => x.product_id === m.product_id)) picks.push({ product_id: m.product_id, supplier_id: s2.supplier_id, name: s2.name });
      }
      if (picks.length) writePicks(userId, String(pk.terminal_id), { at: Date.now(), picks });
    }
    void syncNow();
    verifyBaseTerminal.current = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
    setVerifyActive(true);
    setVerifyTripId(trip.trip_id);
  };
  // /planner/home?edit=<trip>: a dispatched load tapped in the Trips list opens its details for editing. Never begins it.
  const editParamDone = useRef(false);
  useEffect(() => {
    if (editParamDone.current || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("edit");
    if (!id) { editParamDone.current = true; return; }
    if (!dispatchedList.length) return;
    editParamDone.current = true;
    const params = new URLSearchParams(window.location.search);
    params.delete("edit");
    window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
    const t = dispatchedList.find((x) => x.trip_id === id);
    if (!t) return;
    verifyBaseTerminal.current = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
    setPlanEquip(null);
    setEditDispatchedId(id);
    setSheetOpen(true);
    void (async () => {
      if (!t.planned_truck_id) return;
      const [a, b] = await Promise.all([
        supabase.from("trucks").select("truck_name").eq("truck_id", t.planned_truck_id).maybeSingle(),
        t.planned_trailer_id ? supabase.from("trailers").select("trailer_name").eq("trailer_id", t.planned_trailer_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const tn = (a.data as any)?.truck_name, rn = (b.data as any)?.trailer_name;
      setPlanEquip({ truckId: t.planned_truck_id, trailerId: t.planned_trailer_id ?? null, label: [tn ? `Truck ${tn}` : "No truck", rn ? `Trailer ${rn}` : "Bobtail"].join(" · ") });
    })();
  }, [dispatchedList.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // /planner/home?run=<trip>: tapped from the Trips list. Starts that dispatched load once, the same as its Run button.
  const runParamDone = useRef(false);
  useEffect(() => {
    if (runParamDone.current || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("run");
    if (!id) { runParamDone.current = true; return; }
    if (!dispatchedList.length && !openTrip) return; // trips not loaded yet
    runParamDone.current = true;
    const params = new URLSearchParams(window.location.search);
    params.delete("run");
    window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params}` : ""));
    if (!openTrip && dispatchedList.some((t) => t.trip_id === id)) void askEquipment(() => beginDispatchedLoad(id));
  }, [dispatchedList.length, openTrip?.trip_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (verifyTripId && openTrip?.trip_id === verifyTripId) {
      setVerifyTripId(null);
      setBeginPopOpen(true); // a few things to confirm, not the whole trip sheet
    }
  }, [verifyTripId, openTrip?.trip_id]);
  // The dispatched pickup, used while the driver hasn't changed the terminal.
  // The driver tapped Pickup and chose a terminal (even the one the Planner was already on): the dispatched pickup no longer applies.
  const pickAtTap = useRef<number | null>(null);
  const [, bumpPick] = useState(0);
  const startPickupChange = () => { pickAtTap.current = shell.terminalPicks; };
  useEffect(() => {
    if (pickAtTap.current == null || shell.termOpen || shell.locOpen || shell.rackPickerOpen || shell.rackResolving) return;
    const picked = shell.terminalPicks > pickAtTap.current;
    pickAtTap.current = null;
    if (picked) { verifyBaseTerminal.current = "__picked__"; bumpPick((n) => n + 1); }
  }, [shell.termOpen, shell.locOpen, shell.rackPickerOpen, shell.rackResolving, shell.terminalPicks]); // eslint-disable-line react-hooks/exhaustive-deps
  // A dispatched, not-yet-begun load opened for editing from the Trips list (never begun from there).
  const [editDispatchedId, setEditDispatchedId] = useState<string | null>(null);
  const dTrip = editDispatchedId && store ? trips.find((t) => t.trip_id === editDispatchedId && t.status === "dispatched") ?? null : null;
  const dChildren = useMemo(() => (dTrip && store ? tripChildren(store, dTrip.trip_id) : null), [store, dTrip?.trip_id, trips]); // eslint-disable-line react-hooks/exhaustive-deps
  const eTrip = dTrip ?? openTrip;
  const eChildren = dTrip ? dChildren : children;
  const eEditing = dTrip ? true : editing;
  const eDeliveries = useMemo(() => (dTrip && store ? store.list("trip_deliveries", (d) => d.trip_id === dTrip.trip_id) : snap?.deliveries ?? []), [store, dTrip?.trip_id, trips, snap]); // eslint-disable-line react-hooks/exhaustive-deps
  const dispatchedPickup = (() => {
    const pk = eEditing ? eChildren?.pickup : null;
    if ((!verifyActive && !dTrip) || !pk || pk.load_id || pk.arrived_at || !pk.terminal_id) return null;
    const cur = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
    return cur === verifyBaseTerminal.current || cur === null ? pk : null;
  })();

  const initialValues = useMemo<StartLoadValues>(() => {
    if (resumeDraft) return resumeDraft;
    if (eTrip && eChildren && (dTrip || snap) && !addingLoad) {
      const planned = plannedDeliveries(eDeliveries as any);
      return {
        orderNumber: eChildren.primaryOrder?.order_number ?? "",
        extraOrderNumbers: eChildren.extraOrders.map((o) => o.order_number ?? ""),
        // Dispatch's shipper/customer first; blank falls back to the driver's last entries.
        shipper: eTrip.shipper || (userId ? lastShipperCustomer(trips, userId).shipper : null) || "",
        customer: eTrip.customer || (userId ? lastShipperCustomer(trips, userId).customer : null) || "",
        deliveries: planned.length
          ? planned.map((d) => ({ locationId: d.location_id, oneOffName: d.one_off_name, deliveryType: d.delivery_type }))
          : [{ locationId: null, oneOffName: "", deliveryType: "drop" }],
        beginMiles: eTrip.begin_miles == null ? "" : String(eTrip.begin_miles),
        startCity: eTrip.start_city ?? "",
        startState: eTrip.start_state ?? "",
        planSlot: getTripPlan(userId, eTrip.trip_id)?.slot ?? null,
        supplier: getTripSupplier(userId, eTrip.trip_id),
        savePlan: null,
      };
    }
    const prev = userId ? lastShipperCustomer(trips, userId) : { shipper: null, customer: null };
    const miles = truckBeginMiles(trips, truckId);
    return {
      orderNumber: "",
      extraOrderNumbers: [],
      shipper: prev.shipper ?? "",
      customer: prev.customer ?? "",
      deliveries: [defaultDelivery()],
      beginMiles: miles == null ? "" : String(miles),
      startCity: "",
      startState: "",
      planSlot: null,
      supplier: currentTerminalSupplier(),
      savePlan: null,
    };

    // A supplier already picked at the Planner's terminal this visit, if it's one supplier.
    function currentTerminalSupplier(): TripSupplier | null {
      const tid = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
      const groups = groupPicks(readPicks(userId, tid)?.picks ?? []);
      return groups.length === 1 ? { supplier_id: groups[0].supplier_id, name: groups[0].name } : null;
    }

    // The delivery the driver used last (this phone's history), else their
    // first starred location, else a blank one-off.
    function defaultDelivery(): StartLoadDelivery {
      const picked = storedLocId ? locations.find((l) => l.location_id === storedLocId) : null;
      if (picked) return { locationId: picked.location_id, oneOffName: null, deliveryType: picked.delivery_type };
      if (store && userId) {
        const mine = new Map(trips.filter((t) => t.driver_id === userId).map((t) => [t.trip_id, t]));
        const recent = store
          .list("trip_deliveries", (d) => mine.has(d.trip_id) && !!d.location_id && d.status !== "cancelled")
          .sort((a, b) => String(b.client_updated_at ?? "").localeCompare(String(a.client_updated_at ?? "")))[0];
        const loc = recent && locations.find((l) => l.location_id === recent.location_id);
        if (loc) return { locationId: loc.location_id, oneOffName: null, deliveryType: loc.delivery_type };
      }
      const star = locations.find((l) => l.starred);
      if (star) return { locationId: star.location_id, oneOffName: null, deliveryType: star.delivery_type };
      return { locationId: null, oneOffName: "", deliveryType: "drop" };
    }
  }, [eTrip, eChildren, snap, trips, userId, truckId, store, locations, storedLocId, location.selectedTerminalId, resumeDraft, addingLoad]);

  const submit = async (v: StartLoadValues) => {
    if (!store || !userId || !companyId) {
      setError("Still signing you in. Try again in a moment.");
      return;
    }
    const miles = cleanOdometer(v.beginMiles) === "" ? null : Number(cleanOdometer(v.beginMiles));
    setBusy(true);
    setError(null);
    try {
      // An order number can only be on one live trip.
      const numbers = [v.orderNumber, ...v.extraOrderNumbers].filter((x) => x.trim());
      const repeated = repeatedRefs(numbers);
      if (repeated.length) {
        setError(`Order ${repeated[0]} is entered twice.`);
        return;
      }
      const excludeTrip = eEditing ? eTrip?.trip_id ?? null : null;
      const localUsed = usedOrderNumbers(trips, store.list("trip_orders", () => true), excludeTrip);
      const taken = conflicts(numbers, localUsed);
      if (!taken.length) taken.push(...(await serverOrderConflicts(companyId, numbers, excludeTrip)));
      if (taken.length) {
        setError(`Order ${taken[0]} is already on another trip.`);
        return;
      }
      const rows = buildStartLoad(
        {
          companyId,
          userId,
          truckId,
          trailerId,
          orderNumber: v.orderNumber,
          extraOrderNumbers: v.extraOrderNumbers,
          shipper: v.shipper,
          customer: v.customer,
          pickup: dispatchedPickup
            ? { terminalId: String(dispatchedPickup.terminal_id), rackId: dispatchedPickup.rack_id ?? null, name: dispatchedPickup.name ?? null, city: dispatchedPickup.city ?? null, state: dispatchedPickup.state ?? null }
            : {
                terminalId: location.selectedTerminalId || null,
                rackId: location.selectedRackId || null,
                name: terminalName,
                city: location.selectedCity || null,
                state: location.selectedState || null,
              },
          deliveries: v.deliveries,
          beginMiles: miles != null && Number.isFinite(miles) ? miles : null,
          startCity: v.startCity,
          startState: v.startState,
        },
        {
          now: new Date(),
          newId,
          existing: eEditing && eTrip && eChildren
            ? { trip: eTrip, orders: eChildren.orders, pickups: eChildren.pickups, deliveries: store.list("trip_deliveries", (d) => d.trip_id === eTrip.trip_id) }
            : null,
        },
      );
      if (addingLoad) {
        // A load added by the driver is a planned load, same as one dispatch sends: it waits in the Loads chip until they begin it.
        const loads = dispatchedForDriver(trips, userId);
        const lastStart = Math.max(0, ...loads.map((t) => Date.parse(t.planned_start_at ?? "") || 0));
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        Object.assign(rows.trip, {
          status: "dispatched", started_at: null, truck_id: null, trailer_id: null, begin_miles: null, start_city: null, start_state: null,
          dispatched_by: userId, planned_start_at: new Date(Math.max(nowMs, lastStart + 60_000)).toISOString(),
          // The equipment this load is planned for: the pick in the window, else what is in use now (a truck with no trailer is a bobtail).
          planned_truck_id: planEquip ? planEquip.truckId : truckId ?? null, planned_trailer_id: planEquip ? planEquip.trailerId : trailerId ?? null,
          dispatch_seq: Math.max(0, ...loads.map((t) => t.dispatch_seq ?? 0)) + 1, client_updated_at: nowIso,
        });
        rows.events = [];
        if (rows.pickups[0] && v.supplier?.supplier_id) Object.assign(rows.pickups[0], { supplier_id: v.supplier.supplier_id });
      }
      if (dTrip) {
        // Editing a dispatched load: the details change, it stays dispatched, and nothing about beginning it moves.
        Object.assign(rows.trip, {
          truck_id: null, trailer_id: null, begin_miles: null, start_city: null, start_state: null,
          planned_truck_id: planEquip ? planEquip.truckId : dTrip.planned_truck_id ?? null,
          planned_trailer_id: planEquip ? planEquip.trailerId : dTrip.planned_trailer_id ?? null,
          client_updated_at: new Date().toISOString(),
        });
        rows.events = [];
        if (rows.pickups[0] && v.supplier?.supplier_id) Object.assign(rows.pickups[0], { supplier_id: v.supplier.supplier_id });
        applyStartLoad(store, rows);
        setEditDispatchedId(null); setSheetOpen(false); setVerifyActive(false);
        void syncNow();
        return;
      }
      applyStartLoad(store, rows);
      // Editing the pickup's supplier saves it on the pickup itself too, not only on this phone.
      if (eEditing && !addingLoad && eChildren?.pickup && !eChildren.pickup.load_id) store.put("trip_pickups", { pickup_id: eChildren.pickup.pickup_id, supplier_id: v.supplier?.supplier_id ?? null });
      // Dispatch's plan: save it as a plan slot when asked (optionally changing it in the Planner first).
      let planSlot = v.planSlot;
      let openPlanner = false;
      const sentLayout = dispatchedPickup
        ? layoutFromProducts(Object.fromEntries([...readPlannedMeta(dispatchedPickup.planned_comps).entries()].map(([n, m]) => [n, m.product_id])), Object.keys(compSizes).map(Number))
        : null;
      const matched = sentLayout ? findMatchingPlan(sheetPresets, sentLayout) : null;
      // Dispatch sent a layout the driver already has: their plan (caps and CG) applies.
      // No match: Customize saves it and opens the Planner; Quick load runs it with no caps and CG centered.
      if (dispatchedPickup && matched) planSlot = matched.slot;
      if (v.savePlan && dispatchedPickup && !matched && equipment.selectedComboId) {
        const target = nextSaveSlot(sheetPresets);
        const products: Record<number, string> = {};
        for (const [n, m] of readPlannedMeta(dispatchedPickup.planned_comps).entries()) products[n] = m.product_id;
        for (const n of Object.keys(compSizes).map(Number)) if (!(n in products)) products[n] = "";
        await savePresetPlan(userId, equipment.selectedComboId, target.slot, products);
        planSlot = target.slot;
        openPlanner = v.savePlan.modify;
      }
      setTripQuick(userId, rows.trip.trip_id, !!dispatchedPickup && !matched && !v.savePlan);
      if (planSlot !== (getTripPlan(userId, rows.trip.trip_id)?.slot ?? null)) setTripPlan(userId, rows.trip.trip_id, planSlot);
      // Keep the plan on the trip itself so the trip card shows it even if the preset can't be found later.
      if (planSlot != null) {
        const fresh = await fetchPresets(userId, equipment.selectedComboId || null, Object.keys(compSizes).map(Number));
        const chosen = fresh.find((p) => p.slot === planSlot) ?? sheetPresets.find((p) => p.slot === planSlot);
        if (chosen) setTripPlanSnapshot(userId, rows.trip.trip_id, { comps: chosen.comps });
      }
      // Supplier: kept on the trip, and preset at the pickup rack now (the
      // Planner presets it at any later rack on the trip too).
      const prevSupplier = getTripSupplier(userId, rows.trip.trip_id);
      setTripSupplier(userId, rows.trip.trip_id, v.supplier);
      const pickupTid = dispatchedPickup ? String(dispatchedPickup.terminal_id) : location.selectedTerminalId ? String(location.selectedTerminalId) : null;
      const pickupLoaded = !!(eEditing && eChildren?.pickup?.load_id);
      if (!addingLoad && v.supplier && pickupTid && !pickupLoaded && (!eEditing || !sameSupplier(prevSupplier, v.supplier))) {
        seedTerminalPicks(userId, pickupTid, v.supplier);
        if (v.supplier.supplier_id) void linkSupplierToTerminal({ companyId, supplierId: v.supplier.supplier_id, terminalId: pickupTid });
      }
      setSheetOpen(false);
      setAddingLoad(false);
      setVerifyActive(false);
      void syncNow();
      if (openPlanner) router.push("/planner?plan=1");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save the load.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { if (!addingLoad) setPlanEquip(null); }, [addingLoad]); // eslint-disable-line react-hooks/exhaustive-deps
  // Adding a load to the day starts on the truck last used (and the trailer coupled to it) when the driver holds nothing, since
  // parking at the end of a shift lets go of the truck but leaves the pair coupled. Picking in the equipment modal claims the
  // pair, so the held equipment takes over from this default once that modal closes.
  useEffect(() => {
    if (!addingLoad || !userId || equipment.currentTruckName || planEquip) return;
    let live = true;
    void (async () => {
      const { data: combos } = await supabase.from("equipment_combos").select("truck_id, trailer_id, active").eq("active", true);
      const last = resolveLast(readLastEquipment(userId), lastFromTrips(((trips ?? []) as any[]).map((t) => ({ truck_id: t.truck_id ?? null, trailer_id: t.trailer_id ?? null, started_at: t.started_at ?? null, driver_id: t.driver_id ?? null })), userId), (combos ?? []) as any[]);
      if (!last || !live) return;
      const [a, b] = await Promise.all([
        supabase.from("trucks").select("truck_name").eq("truck_id", last.truckId).maybeSingle(),
        last.trailerId ? supabase.from("trailers").select("trailer_name").eq("trailer_id", last.trailerId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!live) return;
      const tn = (a.data as any)?.truck_name, rn = (b.data as any)?.trailer_name;
      defaultPlanEquip.current = true;
      setPlanEquip((cur) => cur ?? { truckId: last.truckId, trailerId: last.trailerId, label: [tn ? `Truck ${tn}` : "No truck", rn ? `Trailer ${rn}` : "Bobtail"].join(" · ") });
    })();
    return () => { live = false; };
  }, [addingLoad, userId, equipment.currentTruckName]); // eslint-disable-line react-hooks/exhaustive-deps
  // The last-used default only stands in for equipment the driver isn't holding: once they hold something, that is the default.
  const defaultPlanEquip = useRef(false);
  useEffect(() => {
    if (addingLoad && equipment.currentTruckName && defaultPlanEquip.current) { defaultPlanEquip.current = false; setPlanEquip(null); }
  }, [equipment.currentTruckName, addingLoad]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...p, editDispatchedId, setEditDispatchedId, dTrip, dChildren, beginPopOpen, setBeginPopOpen, confirmBeginPop, dispatchedList, dispatchedItems, openEquipPicker, askEquipment, parkPreset, alignPlannerToPickup, beginDispatchedLoad, swapDispatched, dispatchedPickup, startPickupChange, initialValues, submit } as const;
}
