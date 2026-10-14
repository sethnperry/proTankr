"use client";
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TripPickupRow, TripTable } from "@/lib/trips/types";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";
import { useTripStore } from "@/lib/trips/useTripStore";
import { newId } from "@/lib/trips/tripStore";
import { useTripHydration } from "@/lib/trips/useTripHydration";
import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { locationPlace, locationTitle, type LatLon } from "@/lib/trips/deliveryLocations";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { useActiveOutageBanner } from "../hooks/useTerminalOutageReports";
import TerminalOutageDetailModal from "../modals/TerminalOutageDetailModal";
import {
  applyStartLoad,
  buildStartLoad,
  lastShipperCustomer,
  openTripForDriver,
  truckBeginMiles,
  tripChildren,
  type StartLoadDelivery,
} from "@/lib/trips/tripLogic";
import {
  activePickup,
  addPickup,
  addTripOrder,
  setPickupOrder,
  canPark,
  arriveDelivery,
  arrivePickup,
  compartmentsForDelivery,
  closePickupNoLoad,
  canCancelLoad,
  cancelLoad,
  confirmLoaded,
  finishDelivery,
  handoffCandidate,
  nextStep,
  onBoard,
  PARK_FOR_LABEL,
  parkTrip,
  parkedTripOnTrailer,
  resumeTrip,
  pickupNeedsOdometer,
  plannedDeliveries,
  rerouteDelivery,
  saveDeliveryProgress,
  splitToNewDelivery,
  takeOverTrip,
  tripSnapshot,
  type DeliveryDestination,
} from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripRow } from "@/lib/trips/types";
import { StartLoadSheet, type StartLoadValues } from "../components/StartLoadSheet";
import { CancelTripSheet, type CancelTripSubmit } from "../components/trip/CancelTripSheet";
import { rackReasonFor } from "@/lib/trips/cancelReasons";
import { truckLastDeliveryCity } from "@/lib/trips/startPlace";
import { LoadedSheet, type LoadedSubmit } from "../components/trip/LoadedSheet";
import { NoLoadSheet, type NoLoadSubmit } from "../components/trip/NoLoadSheet";
import { ParkSheet, type ParkSubmit } from "../components/trip/ParkSheet";
import { TripEquipmentSheets, useTripEquipment } from "../hooks/useTripEquipment";
import { reportDelayIssue, submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";
import { isTerminalIssueCode, noLoadReasonLabel } from "@/lib/trips/terminalIssues";
import { cancelPlannedLoad } from "@/lib/supabase/load";
import { clearActivePlannedLoad } from "../utils/activePlannedLoad";
import { useSuppliers } from "@/lib/trips/useSuppliers";
import { bolConflicts } from "@/lib/trips/refCheck";
import { DeliveryDashboard, clearDeliveryDraft, type DeliveryProgress, type FinishDeliverySubmit, type ProductInfo } from "../components/trip/DeliveryDashboard";
import { LocationPicker } from "../components/trip/LocationPicker";
import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";
import { serverOrderConflicts } from "@/lib/trips/refCheck";
import { CompartmentStrip } from "../components/trip/CompartmentStrip";
import { AddPickupSheet, type AddPickupDraft } from "../components/trip/AddPickupSheet";
import { checkAddPickup, grossColor } from "@/lib/trips/addPickupCheck";
import { productColorFor } from "../utils/productColor";
import { PickupOrderSheet, type OrderChoice } from "../components/trip/OrderChooser";
import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { headingToDelivery, headingToTerminal, parkedPreloads } from "@/lib/trips/dashboardCards";
import { useStoreDeliveries, useTerminalStatus } from "../hooks/useDashboardCards";
import { TerminalStatusSheet } from "../components/trip/TerminalStatusSheet";
import { DashLookProvider, DashStyles, LOOK, SectionLabel, useScrollBackdrop } from "./dashLook";
import { GaugePanel, TerminalAccessStrip, ToolPanel, type ToolItem } from "./DashboardChrome";
import { QualificationCard, type QualTerminal } from "./QualificationStrip";
import { openAccessSteps, useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";
import { isoToday_ } from "../utils/dates";
import { EXPIRY_COLOR } from "@/lib/expiry";
import { HeadingToDeliveryCard, HeadingToTerminalCard, ParkedPreloadsCard, RecentDeliveriesCard, TerminalStatusCard } from "../components/trip/DashboardCards";
import { useTrailerResidue } from "../hooks/useDashboardCards";

const STATUS_LABEL: Record<TripRow["status"], string> = {
  draft: "Not loaded yet",
  loading: "Loading",
  in_transit: "In transit",
  delivering: "Delivering",
  parked: "Parked preloaded",
  complete: "Complete",
  cancelled: "Cancelled",
};

// Short forms for the gauge panel's Trip box (one word fits).
const STATUS_SHORT: Record<TripRow["status"], string> = {
  draft: "MT", loading: "Loading", in_transit: "Transit", delivering: "Drop",
  parked: "Parked", complete: "Done", cancelled: "Cancel",
};

const muted = "rgba(255,255,255,0.5)";
const smallLink: React.CSSProperties = {
  border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0,
};

type PickerMode =
  | { mode: "add" }
  // Dashboard "Delivery Location": sets where this driver is headed. On a
  // trip it reroutes the next delivery (or adds one); otherwise it's kept
  // for the next Begin Trip.
  | { mode: "select" }
  | { mode: "split"; ids: string[]; from: string | null }
  | { mode: "reroute"; delivery: TripDeliveryRow };

export default function HomePage() {
  const shell = useCalculatorShell();
  const router = useRouter();
  const { equipment, location, terminals, expirations } = shell;
  const userId = shell.effectiveUserId || null;
  const companyId = shell.companyId || null;
  const truckId = equipment.selectedCombo?.truck_id ?? equipment.currentTruckId ?? null;
  const trailerId = equipment.selectedCombo?.trailer_id ?? equipment.currentTrailerId ?? null;

  // Same audience as the driver Planner. Waits for role/super-admin/solo to
  // resolve, same as the Cards and Dispatch gates.
  useEffect(() => {
    if (shell.role == null || !shell.isSuperAdminResolved || shell.isSolo === null) return;
    if (!canReachDestination("home", shell.role, shell.isSuperAdmin, shell.isSolo)) {
      router.replace("/planner/dispatch");
    }
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, router]);

  const { state, store, syncNow, retryFailed, dismissFailed, pendingCount, failed } = useTripStore(userId);
  const [syncOpen, setSyncOpen] = useState(false);
  useTripHydration(store, userId, truckId, trailerId);
  const { settings, reasons } = useTripSettings(companyId);
  const signature = useDriverSignature(userId);
  const { suppliers, addSupplier } = useSuppliers(store, state, companyId, userId);
  const locList = useDeliveryLocationList(companyId, userId);
  const locations = locList.locations;
  const { data: products } = useProductsCatalog();
  const { data: terminalCatalog } = useTerminalsCatalog();

  const productName = (id: string | null) => {
    if (!id) return "Product";
    const p = products.find((x) => x.product_id === id);
    return p ? String(p.display_name || p.product_name || "Product") : "Product";
  };
  const deliveryName = (d: TripDeliveryRow) => {
    const loc = d.location_id ? locations.find((l) => l.location_id === d.location_id) : null;
    return loc ? locationTitle(loc) : d.one_off_name ?? "Delivery";
  };

  const trips = useMemo(() => Object.values(state.rows.trips ?? {}) as TripRow[], [state]);
  const openTrip = userId ? openTripForDriver(trips, userId) : null;
  const children = useMemo(
    () => (store && openTrip ? tripChildren(store, openTrip.trip_id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, openTrip?.trip_id, state],
  );
  const snap = useMemo(
    () => (store && openTrip ? tripSnapshot(store, openTrip.trip_id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, openTrip?.trip_id, state],
  );
  const step = nextStep(openTrip, snap, deliveryName);
  // Set while routing to the Planner, so the button doesn't flash the next
  // step's label ("Continue Trip") during the navigation.
  const [openingPlanner, setOpeningPlanner] = useState(false);
  const handoff = !openTrip && userId ? handoffCandidate(trips, trailerId, userId) : null;
  // A load parked on the trailer this driver holds (theirs after a layover, or
  // someone else's for a slip seat).
  const parked = !openTrip ? parkedTripOnTrailer(trips, trailerId) : null;
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

  const equipmentLabel = equipment.equipmentLabel
    ?? (equipment.isBobtail ? `Truck ${equipment.currentTruckName ?? ""} (bobtail)`.trim() : "No equipment selected");

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
    const p = snap ? activePickup(snap.pickups) ?? [...snap.pickups].reverse().find((x) => x.terminal_id) : null;
    return String(p?.terminal_id || location.selectedTerminalId || "") || null;
  }, [snap, location.selectedTerminalId]);
  const alertProducts = useMemo<Set<string> | "all">(
    () => (shell.plannedProductIds.size > 0 ? shell.plannedProductIds : "all"),
    [shell.plannedProductIds],
  );
  const terminalAlerts = useActiveOutageBanner(alertTerminalId, userId || null, alertProducts);
  const [alertsOpen, setAlertsOpen] = useState(false);

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
  const toMyTerminal = useMemo(() => headingToTerminal(fleet.trips, alertTerminalId, userId), [fleet.trips, alertTerminalId, userId]);
  const toMyDelivery = useMemo(() => headingToDelivery(fleet.trips, myDelivery?.location_id ?? null, userId), [fleet.trips, myDelivery?.location_id, userId]);
  const nearbyParked = useMemo(() => parkedPreloads(fleet.trips, trailerId), [fleet.trips, trailerId]);
  const completedDeliveries = useMemo(
    () => Object.values(state.rows.trip_deliveries ?? {}).filter((d: any) => d.status === "complete").length,
    [state],
  );
  // The driver's delivery location: the trip's next delivery when there is
  // one, else the last one picked here (kept per user on this phone).
  const deliveryKey = userId ? `proTankr:u:${userId}:deliveryLocation` : null;
  const [storedLocId, setStoredLocId] = useState<string | null>(null);
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
  const [statusOpen, setStatusOpen] = useState(false);
  const statusPlace = useMemo(() => {
    const t = alertTerminalId ? terminalCatalog.find((x) => String(x.terminal_id) === alertTerminalId) : null;
    return t ? [t.city, t.state].filter(Boolean).join(", ") || null : null;
  }, [alertTerminalId, terminalCatalog]);

  // ── Mid-trip equipment change (warning + truck change record) ────────────
  const tripEquip = useTripEquipment({ state, store, syncNow }, userId);
  const { tripLoaded, truckChanged, currentGross, currentTarget, openEquipment } = tripEquip;

  // ── Start Load prefills ────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!openTrip;

  const initialValues = useMemo<StartLoadValues>(() => {
    if (openTrip && children && snap) {
      const planned = plannedDeliveries(snap.deliveries);
      return {
        orderNumber: children.primaryOrder?.order_number ?? "",
        extraOrderNumbers: children.extraOrders.map((o) => o.order_number ?? ""),
        shipper: openTrip.shipper ?? "",
        customer: openTrip.customer ?? "",
        deliveries: planned.length
          ? planned.map((d) => ({ locationId: d.location_id, oneOffName: d.one_off_name, deliveryType: d.delivery_type }))
          : [{ locationId: null, oneOffName: "", deliveryType: "drop" }],
        beginMiles: openTrip.begin_miles == null ? "" : String(openTrip.begin_miles),
        startCity: openTrip.start_city ?? "",
        startState: openTrip.start_state ?? "",
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
    };

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
  }, [openTrip, children, snap, trips, userId, truckId, store, locations, storedLocId]);

  const submit = async (v: StartLoadValues) => {
    if (!store || !userId || !companyId) {
      setError("Still signing you in. Try again in a moment.");
      return;
    }
    const miles = v.beginMiles.trim() === "" ? null : Number(v.beginMiles);
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
      const excludeTrip = openTrip?.trip_id ?? null;
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
          pickup: {
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
          existing: openTrip && children
            ? { trip: openTrip, orders: children.orders, pickups: children.pickups, deliveries: store.list("trip_deliveries", (d) => d.trip_id === openTrip.trip_id) }
            : null,
        },
      );
      applyStartLoad(store, rows);
      setSheetOpen(false);
      void syncNow();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save the load.");
    } finally {
      setBusy(false);
    }
  };

  // ── Cancel load (nothing on board) ───────────────────────────────────────
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
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
      void syncNow();
    } catch (e: any) {
      setCancelErr(e?.message ?? "Couldn't cancel the load.");
    } finally {
      setCancelBusy(false);
    }
  };

  // ── Pickup / delivery steps ────────────────────────────────────────────────
  const [loadedOpen, setLoadedOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [notice, setNotice] = useState<{ text: string; tripId: string | null } | null>(null);
  const clock = () => ({ now: new Date(), newId });

  const loadedPickup = step.kind === "loaded" ? step.pickup : null;
  const finishDeliveryRow = step.kind === "finish_delivery" ? step.delivery : null;

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
    setNotice({ text: "Loaded. Drive safe.", tripId: null });
    void syncNow();
  };

  const onFinishSubmit = async (v: FinishDeliverySubmit) => {
    if (!store || !userId || !companyId || !finishDeliveryRow || !openTrip) return;
    const tripId = openTrip.trip_id;
    const { tripComplete } = finishDelivery(store, {
      userId, companyId, trailerId, delivery: finishDeliveryRow, ...v, ...clock(),
    });
    clearDeliveryDraft(finishDeliveryRow.delivery_id);
    setFinishOpen(false);
    setNotice(tripComplete
      ? { text: "Trip complete.", tripId }
      : v.retained.length
        ? { text: "Delivery finished. Pick where the rest is going, or Park preloaded for another driver.", tripId: null }
        : { text: "Delivery finished.", tripId: null });
    void syncNow();
    if (finishDeliveryRow.location_id) {
      const seen = v.tanks.map((t) => ({ tank_number: t.tank_number, product_id: t.product_id }));
      await rememberTanks(finishDeliveryRow.location_id, seen, locList.tanks);
      void locList.reload();
    }
  };

  const onDeliveryProgress = (p: DeliveryProgress) => {
    if (!store || !finishDeliveryRow) return;
    saveDeliveryProgress(store, { delivery: finishDeliveryRow, ...p, newId });
    void syncNow();
  };
  const productInfo = (id: string | null): ProductInfo => {
    const p = id ? products.find((x) => x.product_id === id) : null;
    const name = productName(id);
    const hex = typeof p?.hex_code === "string" && p.hex_code.trim() ? p.hex_code.trim() : null;
    const code = String(p?.button_code ?? (name.split(" ")[0] || "PRD")).trim().toUpperCase();
    return { name, code, hex };
  };

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
    addPickup(store, {
      userId, tripId: openTrip.trip_id,
      terminalId: location.selectedTerminalId || null,
      rackId: location.selectedRackId || null,
      name: terminalName,
      city: location.selectedCity || null,
      state: location.selectedState || null,
      ...clock(),
    });
    void syncNow();
  };

  // ── Add another pickup (partly loaded trailer) ───────────────────────────
  // The trailer's compartments, for the loaded strip and the add-pickup check.
  const tripTrailerId = openTrip?.trailer_id ?? trailerId;
  const [compSizes, setCompSizes] = useState<Record<number, number>>({});
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
  const aboardRows = useMemo(() => (snap ? onBoard(snap.compLoads) : []), [snap]);
  const aboard = useMemo(() => {
    const m: Record<number, { product_id: string | null; gallons: number | null }> = {};
    for (const c of aboardRows) m[c.comp_number] = { product_id: c.product_id, gallons: c.gross_gallons != null ? Number(c.gross_gallons) : null };
    return m;
  }, [aboardRows]);
  // What the trailer last carried, for empty compartments (residue).
  const residue = useTrailerResidue(tripTrailerId, `${openTrip?.status ?? ""}|${aboardRows.length}`);
  const stripSlots = Object.keys(compSizes).map(Number).map((n) => {
    const a = aboard[n];
    const info = a ? productInfo(a.product_id) : null;
    const r = !a && residue[n] ? productInfo(residue[n]) : null;
    return {
      comp: n, size: compSizes[n] || 1,
      color: info ? info.hex ?? productColorFor(info.name) : null,
      residue: r ? r.hex ?? productColorFor(r.name) : null,
      title: info ? `C${n} · ${info.name}` : r ? `C${n} · empty, last held ${r.name}` : `C${n} · empty`,
    };
  });
  const hasResidue = stripSlots.some((x) => x.residue);
  const trailerStrip = stripSlots.length > 0 ? (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ width: 66, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}><CompartmentStrip slots={stripSlots} /></div>
      {aboardRows.length > 0 && currentGross != null ? (
        <span className="dash-num" style={{ fontSize: 19, fontWeight: 900, color: truckChanged ? "#fbbf24" : grossColor(currentGross, currentTarget), whiteSpace: "nowrap" }}>
          {currentGross.toLocaleString("en-US")}
          <span style={{ fontSize: 10, fontWeight: 700, color: LOOK.muted, marginLeft: 3, letterSpacing: "0.08em" }}>LBS</span>
        </span>
      ) : (
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: LOOK.muted, whiteSpace: "nowrap" }}>
          {aboardRows.length > 0 ? "" : hasResidue ? "RESIDUE" : "EMPTY"}
        </span>
      )}
    </div>
  ) : null;
  const addCheck = useMemo(() => checkAddPickup({
    compNumbers: Object.keys(compSizes).map(Number),
    onBoard: aboardRows,
    gross: currentGross,
    target: currentTarget,
  }), [compSizes, aboardRows, currentGross, currentTarget]);
  const [addOpen, setAddOpen] = useState(false);
  const primaryOrderId = children?.primaryOrder?.order_id ?? null;
  const defaultOrder = (): OrderChoice => primaryOrderId ? { kind: "existing", orderId: primaryOrderId } : { kind: "new", number: "" };
  const [addDraft, setAddDraft] = useState<AddPickupDraft>({ stage: "comps", comps: [], products: {}, order: { kind: "new", number: "" } });
  const [addBusy, setAddBusy] = useState(false);
  const [orderErr, setOrderErr] = useState<string | null>(null);
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
  const [addTermPending, setAddTermPending] = useState(false);
  const addSawPicker = useRef(false);
  const openAddPickup = () => {
    setOrderErr(null);
    setAddDraft({ stage: "comps", comps: addCheck.emptyComps.length === 1 ? [...addCheck.emptyComps] : [], products: {}, order: defaultOrder() });
    setAddOpen(true);
  };
  const addPickTerminal = () => {
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
    setAddDraft((d) => ({ ...d, stage: location.selectedTerminalId ? "products" : "comps" }));
    setAddOpen(true);
  }, [addTermPending, shell.termOpen, shell.locOpen, shell.rackPickerOpen, shell.rackResolving, location.selectedTerminalId]);
  const confirmAddPickup = async () => {
    if (!store || !userId || !openTrip) return;
    const plannedComps = addDraft.comps
      .filter((n) => !!addDraft.products[n])
      .map((n) => ({ comp_number: n, product_id: addDraft.products[n] }));
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
    setNotice({ text: `Pickup added at ${terminalName ?? "the terminal"}. Tap Arrive when you get there.`, tripId: null });
    void syncNow();
  };

  // Change which order a pickup loads under (tap its order on the trip card).
  const [orderPickup, setOrderPickup] = useState<TripPickupRow | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
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

  // ── Couldn't load here / next rack ───────────────────────────────────────
  const workingPickup = snap ? activePickup(snap.pickups) : null;
  const canNoLoad = !!workingPickup && (!!workingPickup.arrived_at || !!workingPickup.load_id)
    && step.kind === "planner";
  const [noLoadOpen, setNoLoadOpen] = useState(false);
  const [noLoadBusy, setNoLoadBusy] = useState(false);
  const [noLoadErr, setNoLoadErr] = useState<string | null>(null);
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

  // Next Rack: pick the terminal (the shared picker), then it becomes the
  // trip's next pickup. Picking the same terminal again counts too (a
  // different rack there, or trying again later).
  const [nextRackPending, setNextRackPending] = useState(false);
  const nextRackSawPicker = useRef(false);
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

  const onBigButton = () => {
    setNotice(null);
    if (!store || !userId) return;
    switch (step.kind) {
      case "start":
        if (parked) {
          doResume();
          break;
        }
        setError(null);
        setSheetOpen(true);
        break;
      case "planner":
        setOpeningPlanner(true);
        router.push("/planner");
        break;
      case "arrive_pickup": {
        // Arrived: straight to the Planner to build the load, on this
        // pickup's terminal (the Planner may still be on an earlier one).
        setOpeningPlanner(true);
        arrivePickup(store, { userId, pickup: step.pickup, ...clock() });
        const loc = shell.location;
        const pk = step.pickup;
        if (pk.terminal_id && pk.terminal_id !== String(loc.selectedTerminalId || "")) {
          loc.skipResetRef.current = true;
          if (pk.state) loc.setSelectedState(pk.state);
          if (pk.city) loc.setSelectedCity(pk.city);
          loc.setSelectedTerminalId(pk.terminal_id);
          loc.setSelectedRackId(pk.rack_id ?? "");
          setTimeout(() => { loc.skipResetRef.current = false; }, 50);
        }
        void syncNow();
        router.push("/planner");
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
        // Arrived: straight into Finish Delivery.
        arriveDelivery(store, { userId, delivery: step.delivery, ...clock() });
        void syncNow();
        setFinishOpen(true);
        break;
      case "finish_delivery":
        setFinishOpen(true);
        break;
    }
  };

  // Arriving straight from the Planner's load report ("Arrived at Delivery"):
  // /planner/home?arrive=1 arrives the next delivery and opens Finish
  // Delivery. With no delivery set yet, the picker opens first.
  const [autoArrive, setAutoArrive] = useState(false);
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
      setFinishOpen(true);
      setAutoArrive(false);
    } else if (step.kind === "finish_delivery") {
      setFinishOpen(true);
      setAutoArrive(false);
    } else if (step.kind === "add_delivery") {
      setPicker({ mode: "add" });
    } else {
      setAutoArrive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoArrive, step.kind, store, userId, openTrip?.trip_id]);

  // ── Handoff (§10) ──────────────────────────────────────────────────────────
  const [handoffName, setHandoffName] = useState<string | null>(null);
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
  // ── Park Preloaded ────────────────────────────────────────────────────────
  const [parkOpen, setParkOpen] = useState(false);
  // Right-now sheets opened from the gauges and the Terminal tool.
  const [terminalNowOpen, setTerminalNowOpen] = useState(false);
  const [dropNowOpen, setDropNowOpen] = useState(false);
  const switchTerminal = () => {
    setTerminalNowOpen(false);
    if (location.selectedCity) shell.setTermOpen(true);
    else shell.setLocOpen(true);
  };
  const loadLine = (c: TripCompartmentLoadRow) =>
    `C${c.comp_number} · ${productName(c.product_id)}${c.gross_gallons != null ? ` · ${Math.round(Number(c.gross_gallons)).toLocaleString("en-US")} gal` : ""}`;
  const onBoardLines = (compLoads: TripCompartmentLoadRow[] | undefined) =>
    onBoard(compLoads ?? []).sort((a, b) => a.comp_number - b.comp_number).map(loadLine);
  const showPark = !!snap && canPark(openTrip, step, onBoard(snap.compLoads).length > 0);
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
  const doResume = () => {
    if (!store || !userId || !parked) return;
    resumeTrip(store, { trip: parked, userId, truckId, ...clock() });
    void syncNow();
  };

  const doTakeOver = () => {
    if (!store || !userId || !handoff) return;
    takeOverTrip(store, { userId, trip: handoff, truckId, ...clock() });
    void syncNow();
  };

  const expired = expirations.expiredCount ?? 0;
  const warning = expirations.warningCount ?? 0;
  const soonCount = expirations.soonCount ?? 0;
  const canCards = canReachDestination("cards", shell.role, shell.isSuperAdmin, shell.isSolo ?? false);

  // ── Look (see dashLook.tsx) ───────────────────────────────────────────────
  const L = LOOK;
  const card: React.CSSProperties = { ...L.primary, padding: 14 };
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
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
  // The trip's pickup city when there is one, else the Planner's city.
  const readinessPlace = (() => {
    const p = snap ? activePickup(snap.pickups) : null;
    const t = p?.terminal_id ? terminalCatalog.find((x) => String(x.terminal_id) === String(p.terminal_id)) : null;
    if (t?.city) return { city: String(t.city), state: String(t.state ?? ""), pickupId: String(t.terminal_id) };
    return { city: location.selectedCity || "", state: location.selectedState || "", pickupId: p?.terminal_id ? String(p.terminal_id) : null };
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
  const openTerminalList = (terminalId: string | null) => {
    if (terminalId) shell.setExpandedTerminalId(terminalId);
    if (location.selectedCity) shell.setTermOpen(true);
    else shell.setLocOpen(true);
  };

  const pickups = snap?.pickups ?? [];
  const liveDeliveries = (snap?.deliveries ?? []).filter((d) => d.status !== "cancelled");
  const anyDelivered = liveDeliveries.some((d) => d.status === "complete");
  const canAddPickup = !!openTrip && openTrip.status !== "draft" && !!snap && !activePickup(snap.pickups) && !anyDelivered
    && step.kind !== "next_rack";
  const plannedCount = snap ? plannedDeliveries(snap.deliveries).length : 0;

  return (
    <DashLookProvider value={L}>
    <DashStyles />
    <div
      ref={setWrapEl}
      className="dash-wrap"
      style={{
        position: "relative", zIndex: 1, padding: "12px 16px 40px", color: "#fff",
        // DashboardCards read their surface from these.
        ["--dash-card-bg" as any]: L.secondary.background,
        ["--dash-card-border" as any]: L.secondary.border,
        ["--dash-card-radius" as any]: `${L.secondary.borderRadius}px`,
      }}
    >
      {/* Title: small label, the truck/trailer number large. */}
      <div style={{ marginBottom: 12 }}>
        <div style={L.title}>Driver Dashboard</div>
        <div className="dash-num" style={{ fontSize: 30, fontWeight: 800, marginTop: 4, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {equipmentLabel}
        </div>
      </div>

      <div className="dash-cols">
      <div>
      <SectionLabel desktopOnly first>Trip</SectionLabel>

      {/* Handoff */}
      {handoff && (
        <div style={{ ...card, marginBottom: 14, borderColor: "rgba(251,191,36,0.5)" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {handoffName ?? "Another driver"} has an open trip on this trailer.
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
            Take it over to finish the deliveries.
          </div>
          <button type="button" onClick={doTakeOver}
            style={{ marginTop: 10, borderRadius: 10, border: "none", background: "#fbbf24", color: "#000", padding: "10px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            Take Over Trip
          </button>
        </div>
      )}

      {/* Parked preloaded on this trailer */}
      {parked && (
        <div style={{ ...card, marginBottom: 14, borderColor: "rgba(96,165,250,0.55)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Parked preloaded
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>
            {parked.parked_by === userId || (!parked.parked_by && parked.driver_id === userId) ? "You" : handoffName ?? "Another driver"} parked this trailer
            {parked.parked_at ? ` ${new Date(parked.parked_at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
            {parked.parked_for ? ` · ${PARK_FOR_LABEL[parked.parked_for]}` : ""}
          </div>
          {parked.parked_where && <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>At {parked.parked_where}</div>}
          {parked.parked_note && <div style={{ fontSize: 13, marginTop: 4 }}>&ldquo;{parked.parked_note}&rdquo;</div>}
          <div style={{ marginTop: 8 }}>
            {onBoardLines(parkedSnap?.compLoads).map((l) => <div key={l} style={{ fontSize: 14 }}>{l}</div>)}
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>
            {parked.driver_id === userId ? "Resume to deliver it." : "Take it over to deliver it. The trip moves to you."}
          </div>
        </div>
      )}

      {/* Trip */}
      {openTrip ? (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Current trip · {STATUS_LABEL[openTrip.status]}
            </div>
            {/* The trip record is locked once the driver has arrived anywhere:
                from then on it's a record of what happened. */}
            {!pickups.some((p) => p.arrived_at || p.load_id || p.left_at) && (
              <button type="button" onClick={() => { setError(null); setSheetOpen(true); }} style={smallLink}>Edit</button>
            )}
          </div>
          <div className="dash-num" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {children?.primaryOrder?.order_number ? `Order ${children.primaryOrder.order_number}` : "No order number"}
            {children && children.extraOrders.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: muted }}> +{children.extraOrders.length} more</span>
            )}
          </div>
          {(openTrip.shipper || openTrip.customer) && (
            <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
              {[openTrip.shipper, openTrip.customer].filter(Boolean).join(" → ")}
            </div>
          )}

          {(() => {
            // A rack the driver left without loading is a rack hop, not a
            // second pickup: show it as "Tried", and number only real pickups.
            const real = pickups.filter((p) => p.outcome !== "no_load");
            const orderRows = children?.orders ?? [];
            const multiOrder = orderRows.filter((o) => !!o.order_number).length > 1;
            const orderNumberFor = (p: TripPickupRow) =>
              (p.order_id ? orderRows.find((o) => o.order_id === p.order_id) : children?.primaryOrder)?.order_number ?? null;
            return pickups.map((p, i) => {
              const noLoad = p.outcome === "no_load";
              const n = real.indexOf(p);
              const loaded = p.outcome === "loaded" || (!!p.left_at && !!p.load_id);
              // The label is the stage: Pickup → Arrived → Loaded.
              const label = noLoad ? "Tried" : loaded ? "Loaded" : p.arrived_at ? "Arrived" : "Pickup";
              const t = p.terminal_id ? terminalCatalog.find((x) => String(x.terminal_id) === String(p.terminal_id)) : null;
              const place = t ? [t.city, t.state].filter(Boolean).join(", ") : [p.city, p.state].filter(Boolean).join(", ");
              const reason = noLoad ? (noLoadReasonLabel(p.no_load_reason) || "Other") : "";
              if (noLoad) {
                // Tried rack: terminal struck through, then the reason in red.
                // One line; a long name scrolls sideways instead of wrapping.
                return (
                  <div key={p.pickup_id} style={{ fontSize: 14, marginTop: i === 0 ? 10 : 4, display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ color: muted, width: 66, flexShrink: 0 }}>{label}</span>
                    <div className="pt-tabscroll" style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "nowrap" }}>
                      <span style={{ color: muted, textDecoration: "line-through" }}>{p.name ?? "Not set"}</span>
                      <span style={{ color: "#f87171", marginLeft: 8, fontSize: 13 }}>{reason}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={p.pickup_id} style={{ fontSize: 14, marginTop: i === 0 ? 10 : 4, display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ color: loaded ? "#4ade80" : p.arrived_at ? "#fff" : muted, width: 66, flexShrink: 0, fontWeight: p.arrived_at && !loaded ? 700 : undefined }}>{label}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={noLoad ? { color: muted, textDecoration: "line-through" } : undefined}>{p.name ?? "Not set"}</span>
                    {!noLoad && (pickups.length > 1 || multiOrder || p.order_id) && (
                      <button type="button" onClick={() => { setOrderErr(null); setOrderPickup(p); }}
                        style={{ display: "block", background: "none", border: "none", padding: 0, marginTop: 1, color: muted, fontSize: 12, cursor: "pointer", textAlign: "left" }}>
                        Order {orderNumberFor(p) ?? "—"} ›
                      </button>
                    )}
                  </span>
                  <span style={{ color: muted, fontSize: 12, whiteSpace: "nowrap" }}>{place}</span>
                </div>
              );
            });
          })()}
          {/* The trailer on one line, between pickup and delivery: product
              colors when loaded (C1 on the right, like the Planner), residue
              dots for what it last carried when empty. */}
          {trailerStrip && <div style={{ marginTop: 8, marginBottom: 4 }}>{trailerStrip}</div>}
          {liveDeliveries.length === 0 && (
            <div style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ color: muted, width: 66, flexShrink: 0 }}>Delivery</span>
              <button type="button" onClick={() => setPicker({ mode: "select" })}
                style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, color: "#fff", fontSize: 14, textAlign: "left", cursor: "pointer" }}>
                Not set <span style={{ color: muted }}>›</span>
              </button>
            </div>
          )}
          {liveDeliveries.map((d) => {
            // The label is the stage: Delivery → Arrived → Delivered.
            const done = d.status === "complete";
            const label = done ? "Delivered" : d.arrived_at ? "Arrived" : "Delivery";
            const loc = d.location_id ? locations.find((l) => l.location_id === d.location_id) : null;
            const place = loc ? locationPlace(loc) : "";
            return (
              <div key={d.delivery_id} style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ color: done ? "#4ade80" : d.arrived_at ? "#fff" : muted, width: 66, flexShrink: 0, fontWeight: d.arrived_at && !done ? 700 : undefined }}>{label}</span>
                {done ? (
                  <span style={{ flex: 1, minWidth: 0 }}>{deliveryName(d)}</span>
                ) : (
                  <button type="button" onClick={() => setPicker({ mode: "reroute", delivery: d })} aria-label={`Change ${deliveryName(d)}`}
                    style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, color: "#fff", fontSize: 14, textAlign: "left", cursor: "pointer" }}>
                    {deliveryName(d)} <span style={{ color: muted }}>›</span>
                  </button>
                )}
                <span style={{ color: muted, fontSize: 12, whiteSpace: "nowrap" }}>{place}</span>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            {canAddPickup && pickups.some((p) => p.outcome === "loaded" || (!!p.left_at && !!p.load_id)) && (
              <button type="button" onClick={openAddPickup} style={smallLink}>+ Another pickup</button>
            )}
            {canNoLoad && (
              <button type="button" onClick={() => { setNoLoadErr(null); setNoLoadOpen(true); }} style={{ ...smallLink, color: "#fbbf24" }}>
                Couldn&apos;t load here
              </button>
            )}
            {showPark && (
              <button type="button" onClick={() => setParkOpen(true)} style={{ ...smallLink, color: "#93c5fd" }}>
                Park preloaded
              </button>
            )}
            {canCancelLoad(openTrip, onBoard(snap?.compLoads ?? []).length > 0) && (
              <button type="button" onClick={() => { setCancelErr(null); setCancelOpen(true); }} style={{ ...smallLink, color: "#f87171" }}>
                Cancel load
              </button>
            )}
            <button type="button" onClick={() => router.push(`/planner/trips/${openTrip.trip_id}`)} style={{ ...smallLink, color: muted }}>
              PTD ›
            </button>
          </div>
        </div>
      ) : (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>No trip in progress</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>Start a load when you have an order.</div>
          {trailerStrip && <div style={{ marginTop: 12, marginLeft: -72 }}>{trailerStrip}</div>}
        </div>
      )}

      {notice && (
        <div style={{ ...card, marginBottom: 14, borderColor: "rgba(74,222,128,0.5)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{notice.text}</span>
          {notice.tripId && (
            <button type="button" onClick={() => router.push(`/planner/trips/${notice.tripId}`)} style={smallLink}>View PTD ›</button>
          )}
          <button type="button" onClick={() => setNotice(null)} style={{ ...smallLink, color: muted }}>✕</button>
        </div>
      )}

      <GaugePanel cells={[
          tripLoaded && currentGross != null
            ? { label: "Gross", value: currentGross.toLocaleString("en-US"), unit: "lb", color: truckChanged ? "#fbbf24" : grossColor(currentGross, currentTarget) }
            : { label: "Trip", value: openTrip ? STATUS_SHORT[openTrip.status] : "None" },
          // Company trucks headed to my terminal, and loads headed to my delivery.
          { label: "To Rack", value: String(toMyTerminal.length), unit: toMyTerminal.length === 1 ? "trk" : "trks",
            color: toMyTerminal.length ? undefined : L.muted, onClick: () => setTerminalNowOpen(true) },
          { label: "To Drop", value: String(toMyDelivery.length), unit: toMyDelivery.length === 1 ? "load" : "loads",
            color: toMyDelivery.length ? undefined : L.muted, onClick: () => setDropNowOpen(true) },
          { label: "Sync", value: failed.length > 0 ? String(failed.length) : String(pendingCount),
            unit: failed.length > 0 ? "err" : pendingCount > 0 ? "wait" : "ok",
            color: failed.length > 0 ? "#f87171" : undefined,
            onClick: () => { void syncNow(); setSyncOpen(true); } },
        ]} />

      <AddPickupSheet
        open={addOpen}
        draft={addDraft}
        setDraft={setAddDraft}
        check={addCheck}
        compSizes={compSizes}
        aboard={aboard}
        catalog={products.map((p) => { const i = productInfo(p.product_id); return { product_id: p.product_id, name: i.name, code: i.code, hex: i.hex }; })}
        terminalLabel={pickupLabel}
        rackId={location.selectedRackId || null}
        orders={children?.orders ?? []}
        orderError={orderErr}
        busy={addBusy}
        onPickTerminal={addPickTerminal}
        onConfirm={confirmAddPickup}
        onClose={() => setAddOpen(false)}
      />

      <PickupOrderSheet
        open={!!orderPickup}
        rackName={orderPickup?.name ?? "this rack"}
        orders={children?.orders ?? []}
        initial={orderPickup?.order_id ? { kind: "existing", orderId: orderPickup.order_id } : defaultOrder()}
        busy={orderBusy}
        error={orderErr}
        onSave={(v) => void savePickupOrder(v)}
        onClose={() => setOrderPickup(null)}
      />

      <ParkSheet
        open={parkOpen}
        trailerLabel={(() => { const n = (trailerId && equipment.trailerNameById?.[trailerId]) || equipment.currentTrailerName; return n ? `Trailer ${n}` : "The trailer"; })()}
        onBoard={onBoardLines(snap?.compLoads)}
        onSubmit={doPark}
        onClose={() => setParkOpen(false)}
      />

      {/* Attention rows: only when something needs it. */}
      {(() => {
        const showGross = tripLoaded && (truckChanged || currentGross != null);
        const showExp = expired > 0 || warning > 0;
        const showSync = pendingCount > 0 || failed.length > 0;
        if (!showGross && !showExp && !showSync) return null;
        return (
          <div style={{ ...L.secondary, marginTop: 14, overflow: "hidden" }}>
            {showGross && (
              <InfoRow
                label="Gross"
                value={truckChanged ? "Truck changed · tap to record" : `${currentGross!.toLocaleString("en-US")} lbs (est.)`}
                valueColor={truckChanged ? "#fbbf24" : currentGross! > 80000 ? "#f87171" : currentTarget != null && currentGross! > currentTarget ? "#fbbf24" : undefined}
                onClick={() => { if (truckChanged) tripEquip.reopenTruckChange(); }}
                last={!showExp && !showSync}
              />
            )}
            {showExp && (
              <InfoRow
                label="Expirations"
                value={expired > 0 ? `${expired} expired` : `${warning} within 7 days`}
                valueColor={expired > 0 ? EXPIRY_COLOR.expired : EXPIRY_COLOR.expiring}
                onClick={() => shell.setExpModalOpen(true)}
                last={!showSync}
              />
            )}
            {showSync && (
              <InfoRow
                label="Sync"
                value={failed.length > 0 ? `${failed.length} change${failed.length === 1 ? "" : "s"} couldn't save` : `${pendingCount} waiting to send`}
                valueColor={failed.length > 0 ? "#f87171" : muted}
                onClick={() => { void syncNow(); setSyncOpen(true); }}
                last
              />
            )}
          </div>
        );
      })()}

      <SectionLabel>Terminal access</SectionLabel>
      <TerminalAccessStrip
        place={readinessLabel}
        summary={readiness}
        loading={terminals.termLoading}
        onOpenTerminal={openTerminalList}
        onOpenSteps={(tid) => openAccessSteps({ terminalId: tid })}
        onChangeCity={() => shell.setLocOpen(true)}
      />
      {stepsByTerminal.size > 0 && (
        <>
          <SectionLabel>Access steps</SectionLabel>
          <QualificationCard
            items={[...stepsByTerminal.entries()].map(([tid, st]): QualTerminal => ({
              terminalId: tid,
              name: String(terminalCatalog.find((t) => String(t.terminal_id) === tid)?.terminal_name ?? "Terminal"),
              steps: st,
            }))}
            onOpen={(tid) => openAccessSteps({ terminalId: tid })}
          />
        </>
      )}
      </div>

      <div className="dash-side">
      {/* Readouts: terminal status and recent deliveries always; the rest
          only when there's something to show. */}
      <SectionLabel first>Right now</SectionLabel>
      <TerminalStatusSheet
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        terminalId={alertTerminalId}
        terminalName={statusTerminalName}
        rackId={terminalStatus.rackId}
        rackName={terminalStatus.rackCount > 1 ? terminalStatus.rackName : null}
        products={terminalStatus.products}
        reports={terminalAlerts.reports}
        companyId={companyId}
        userId={userId}
        truckLabel={equipment.currentTruckName ?? ""}
        onChanged={() => { void terminalStatus.reload(); terminalAlerts.refresh(); }}
      />
      {/* Terminal: right-now status of the selected terminal + who's headed
          there, with a switch button. Opened from the Terminal tool and the
          To Rack gauge. */}
      <FullscreenModal open={terminalNowOpen} title={statusTerminalName ?? "Terminal"} onClose={() => setTerminalNowOpen(false)} footer={null}>
        <TerminalStatusCard
          defaultOpen
          placeLabel={statusPlace}
          terminalName={statusTerminalName}
          rackName={terminalStatus.rackCount > 1 ? terminalStatus.rackName : null}
          products={terminalStatus.products}
          reports={terminalAlerts.reports}
          onOpenReports={() => setAlertsOpen(true)}
          onChangeTerminal={switchTerminal}
          onUpdate={() => setStatusOpen(true)}
        />
        <div style={{ marginTop: 10 }}>
          <HeadingToTerminalCard defaultOpen terminalName={statusTerminalName} items={toMyTerminal} productInfo={productInfo}
            emptyText="No other company trucks headed here right now." />
        </div>
        <button type="button" onClick={switchTerminal} className="dash-press"
          style={{ width: "100%", marginTop: 14, padding: "14px 0", fontSize: 15, fontWeight: 800, ...L.cta }}>
          Switch Terminal
        </button>
      </FullscreenModal>
      <FullscreenModal open={dropNowOpen} title={myDelivery ? deliveryName(myDelivery) : "Delivery"} onClose={() => setDropNowOpen(false)} footer={null}>
        <HeadingToDeliveryCard defaultOpen deliveryName={myDelivery ? deliveryName(myDelivery) : null} items={toMyDelivery} productInfo={productInfo}
          emptyText={myDelivery ? "No other company loads headed here right now." : "Set a delivery on your trip to see other loads headed there."} />
      </FullscreenModal>
      <ParkedPreloadsCard items={nearbyParked} productInfo={productInfo} onOpenTrip={(id) => router.push(`/planner/trips/${id}`)} />
      <RecentDeliveriesCard
        storeName={selectedLoc ? locationTitle(selectedLoc) : null}
        items={recent.items}
        productInfo={productInfo}
        onOpenTrip={(id) => router.push(`/planner/trips/${id}`)}
        onPickStore={() => setPicker({ mode: "select" })}
      />

      <TerminalOutageDetailModal
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        reports={terminalAlerts.reports}
        timeZone={terminalAlerts.timeZone}
        onCleared={terminalAlerts.refresh}
      />

      <SyncDetailsSheet
        open={syncOpen}
        failed={failed}
        queue={state.queue}
        pendingCount={pendingCount}
        onRetry={() => void retryFailed()}
        onDiscard={dismissFailed}
        onClose={() => setSyncOpen(false)}
      />

      <div style={{ marginTop: 18 }}>
      {/* Next step */}
      <button
        type="button"
        onClick={onBigButton}
        className="dash-press"
        style={{
          width: "100%", padding: "20px 0", fontSize: 20, fontWeight: 800, cursor: "pointer", ...L.cta,
        }}
      >
        {openingPlanner ? "Opening Planner…" : parked && step.kind === "start"
          ? (parked.driver_id === userId ? "Resume Trip" : "Take Over Trip")
          : step.label}
      </button>
      {step.kind !== "start" && !openingPlanner && (
        <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 6 }}>{step.detail}</div>
      )}
      </div>

      {/* Tools. Left: the things on the cards above, top to bottom. Right: records. */}
      <SectionLabel>Tools</SectionLabel>
      {(() => {
        const tools: ToolItem[] = [
          { icon: "truck", label: "Equipment", sub: equipmentLabel, onClick: openEquipment },
          { icon: "terminal", label: "Terminal", sub: statusTerminalName ?? "Not set",
            subColor: terminalAlerts.reports.length ? "#f87171" : undefined,
            onClick: () => (statusTerminalName ? setTerminalNowOpen(true) : switchTerminal()) },
          { icon: "store", label: "Delivery", sub: selectedLoc ? locationTitle(selectedLoc) : "Not set", onClick: () => setPicker({ mode: "select" }) },
          ...(canCards ? [{ icon: "card" as const, label: "Cards",
            sub: expired > 0 ? `${expired} expired` : warning > 0 ? `${warning} within 7 days` : soonCount > 0 ? `${soonCount} within 30 days` : "All current",
            subColor: expired > 0 ? EXPIRY_COLOR.expired : warning > 0 ? EXPIRY_COLOR.expiring : soonCount > 0 ? EXPIRY_COLOR.soon : undefined,
            onClick: () => router.push("/planner/cards") }] : []),
          { icon: "route", label: "Trips", sub: openTrip ? "Trip in progress" : "History & PTDs", onClick: () => router.push("/planner/trips") },
          { icon: "chart", label: "Reports", sub: "Loads & history", onClick: () => router.push("/planner/reports") },
        ];
        return <ToolPanel items={tools} />;
      })()}
      </div>
      </div>

      <StartLoadSheet
        open={sheetOpen}
        editing={editing}
        initial={initialValues}
        pickupLabel={editing && children?.pickup?.load_id ? children.pickup.name ?? pickupLabel : pickupLabel}
        onChangePickup={() => (location.selectedCity ? shell.setTermOpen(true) : shell.setLocOpen(true))}
        planLabel="Set in the Planner when you load"
        equipmentLabel={equipmentLabel}
        locations={locations}
        tanks={locList.tanks}
        origin={origin}
        companyId={companyId}
        userId={userId}
        onToggleStar={(id, star) => void locList.toggleStar(id, star).catch(() => {})}
        onLocationAdded={() => void locList.reload()}
        busy={busy}
        error={error}
        onClose={() => setSheetOpen(false)}
        onSubmit={submit}
        suggestStart={() => truckLastDeliveryCity(truckId)}
      />

      <TripEquipmentSheets {...tripEquip.sheets} />
      <CancelTripSheet
        open={cancelOpen && !!openTrip}
        title={children?.primaryOrder?.order_number ? `Order ${children.primaryOrder.order_number}` : "Load"}
        busy={cancelBusy}
        error={cancelErr}
        onSubmit={(v) => void onCancelSubmit(v)}
        onClose={() => setCancelOpen(false)}
      />
      <NoLoadSheet
          open={noLoadOpen && !!workingPickup}
          rackName={workingPickup?.name ?? terminalName ?? "this rack"}
          arrivedAt={workingPickup?.arrived_at ?? workingPickup?.begin_at ?? null}
          products={plannedProducts}
          busy={noLoadBusy}
          error={noLoadErr}
          onSubmit={(v) => void onNoLoadSubmit(v)}
          onClose={() => setNoLoadOpen(false)}
        />
      {loadedPickup && snap && (
        <LoadedSheet
          open={loadedOpen}
          pickup={loadedPickup}
          compLoads={snap.compLoads.filter((c) => c.pickup_id === loadedPickup.pickup_id && c.disposition !== "cancelled")}
          orders={children?.orders ?? []}
          settings={settings}
          reasons={reasons.filter((r) => r.kind === "loading" && r.is_active)}
          needsOdometer={pickupNeedsOdometer(snap.pickups, loadedPickup.pickup_id)}
          productName={productName}
          signature={signature.svg}
          onSaveSignature={signature.save}
          suppliers={suppliers}
          onAddSupplier={addSupplier}
          checkBols={(values, exclude) => bolConflicts(
            trips,
            Object.values(state.rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[],
            companyId, values, exclude,
          )}
          onSubmit={onLoadedSubmit}
          onClose={() => setLoadedOpen(false)}
        />
      )}

      {finishDeliveryRow && snap && store && (() => {
        const here = compartmentsForDelivery(snap.compLoads, snap.deliveries, finishDeliveryRow.delivery_id);
        const hereIds = new Set(here.map((c) => c.compartment_load_id));
        return (
          <DeliveryDashboard
            open={finishOpen}
            title={deliveryName(finishDeliveryRow)}
            delivery={finishDeliveryRow}
            compartments={here}
            laterAboard={onBoard(snap.compLoads).filter((c) => !hereIds.has(c.compartment_load_id))}
            trailerId={openTrip?.trailer_id ?? trailerId}
            savedTanks={store.list("trip_delivery_tanks", (t) => t.delivery_id === finishDeliveryRow.delivery_id)}
            locationTanks={finishDeliveryRow.location_id ? locList.tanks.filter((t) => t.location_id === finishDeliveryRow.location_id) : []}
            settings={settings}
            reasons={reasons.filter((r) => r.kind === "delivery" && r.is_active)}
            otherPlanned={Math.max(0, plannedCount - 1)}
            beginMiles={openTrip?.begin_miles ?? null}
            productInfo={productInfo}
            signature={signature.svg}
            onSaveSignature={signature.save}
            onSaveProgress={onDeliveryProgress}
            onSubmit={(v) => void onFinishSubmit(v)}
            onPark={showPark ? () => { setFinishOpen(false); setParkOpen(true); } : undefined}
            onClose={() => setFinishOpen(false)}
          />
        );
      })()}

      <LocationPicker
        open={!!picker}
        title={picker?.mode === "reroute" ? "Change delivery" : picker?.mode === "split" ? "Send to another delivery" : picker?.mode === "select" ? "Delivery location" : "Add delivery"}
        selectedLocationId={picker?.mode === "reroute" ? picker.delivery.location_id : picker?.mode === "select" ? selectedLocId : null}
        origin={origin}
        locations={locations}
        tanks={locList.tanks}
        companyId={companyId}
        userId={userId}
        onLocationAdded={() => void locList.reload()}
        onToggleStar={(id, star) => void locList.toggleStar(id, star).catch(() => {})}
        onPick={onPick}
        onClose={() => { setPicker(null); setAutoArrive(false); }}
        onManage={() => { setPicker(null); router.push("/planner/locations"); }}
      />
    </div>
    </DashLookProvider>
  );
}

function InfoRow({ label, value, valueColor, onClick, last }: {
  label: string; value: string; valueColor?: string; onClick: () => void; last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dash-press"
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px",
        border: "none", borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.06)",
        background: "transparent", color: "#fff", cursor: "pointer", textAlign: "left",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, flexShrink: 0, background: valueColor ?? "rgba(255,255,255,0.55)" }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: muted, width: 84, flexShrink: 0 }}>{label}</span>
      <span className="dash-num" style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: valueColor ?? "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
    </button>
  );
}


const SYNC_TABLE_LABEL: Record<string, string> = {
  suppliers: "Supplier",
  trips: "Trip",
  trip_orders: "Order",
  trip_pickups: "Pickup",
  trip_deliveries: "Delivery",
  trip_delivery_tanks: "Tank reading",
  trip_compartment_loads: "Compartment",
  trip_events: "Trip history entry",
  compartment_readiness: "Compartment status",
};

// What didn't save and why, with Retry (after a fix ships) and Discard.
function SyncDetailsSheet({ open, failed, queue, pendingCount, onRetry, onDiscard, onClose }: {
  open: boolean;
  failed: { table: TripTable; key: string; error: string; failedAt: number }[];
  queue: { table: TripTable; key: string; attempts: number; lastError: string | null }[];
  pendingCount: number;
  onRetry: () => void;
  onDiscard: (table: TripTable, key: string) => void;
  onClose: () => void;
}) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  return (
    <FullscreenModal open={open} title="Sync" onClose={onClose} footer={null}>
      {failed.length === 0 && pendingCount === 0 && (
        <div style={{ fontSize: 15, color: "#4ade80", fontWeight: 700, marginBottom: 12 }}>Everything is saved.</div>
      )}
      {pendingCount > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, color: muted, marginBottom: 8 }}>
            {pendingCount} change{pendingCount === 1 ? "" : "s"} waiting to send. They go up on their own.
          </div>
          {queue.map((q) => (
            <div key={`${q.table}|${q.key}`} style={{ padding: "8px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {SYNC_TABLE_LABEL[q.table] ?? q.table}
                {q.attempts > 0 && <span style={{ fontSize: 12, color: muted, fontWeight: 500 }}> · tried {q.attempts}×</span>}
              </div>
              {q.lastError && <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 2, overflowWrap: "anywhere" }}>{q.lastError}</div>}
            </div>
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <>
          <div style={{ fontSize: 14, color: muted, marginBottom: 10 }}>
            The server turned these down. They&apos;re still on this phone. Retry sends them again.
          </div>
          <button type="button" onClick={onRetry}
            style={{ width: "100%", padding: "14px 0", borderRadius: 6, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 14 }}>
            Retry {failed.length === 1 ? "" : `all ${failed.length}`}
          </button>
          {failed.map((f) => {
            const id = `${f.table}|${f.key}`;
            return (
              <div key={id} style={{ padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{SYNC_TABLE_LABEL[f.table] ?? f.table}</span>
                  <span style={{ fontSize: 12, color: muted }}>
                    {new Date(f.failedAt).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#f87171", marginTop: 4, overflowWrap: "anywhere" }}>{f.error}</div>
                {confirmKey === id ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: muted, flex: 1 }}>Discard this change for good?</span>
                    <button type="button" onClick={() => { onDiscard(f.table, f.key); setConfirmKey(null); }}
                      style={{ background: "#f87171", color: "#000", border: "none", borderRadius: 4, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Discard</button>
                    <button type="button" onClick={() => setConfirmKey(null)}
                      style={{ background: "transparent", color: muted, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Keep</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmKey(id)}
                    style={{ marginTop: 6, background: "transparent", border: "none", padding: 0, color: muted, fontSize: 12, cursor: "pointer" }}>Discard</button>
                )}
              </div>
            );
          })}
        </>
      )}
    </FullscreenModal>
  );
}
