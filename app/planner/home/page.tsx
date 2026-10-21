"use client";
import { Spinner, busyProps, busyText, usePending } from "@/lib/ui/pending";
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
  dispatchedForDriver,
  beginDispatched,
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
import { truckLastKnownPlace } from "@/lib/trips/startPlace";
import { useTruckReading } from "@/lib/telematics/useTruckReading";
import { syncTrailerEvents } from "@/lib/trips/syncTrailerEvents";
import { useDepartureWatch } from "@/lib/telematics/useDepartureWatch";
import { recordArrivalPoint, useArrivalSuggestion, type ArrivalTarget } from "@/lib/telematics/useArrivalSuggestion";
import { fetchPresets, getTripPlan, setTripPlan, type PresetSummary } from "@/lib/trips/tripPlan";
import { readPlannedMeta } from "@/lib/dispatch/compPlan";
import { writePicks, type SupplierPick } from "@/lib/suppliers/picks";
import { getTripSupplier, sameSupplier, seedTerminalPicks, setTripSupplier, type TripSupplier } from "@/lib/trips/tripSupplier";
import { readPicks, groupPicks } from "@/lib/suppliers/picks";
import { linkSupplierToTerminal } from "@/lib/suppliers/useTerminalSuppliers";
import { LoadedSheet, type LoadedSubmit } from "../components/trip/LoadedSheet";
import { NoLoadSheet, type NoLoadSubmit } from "../components/trip/NoLoadSheet";
import { destinationRegion } from "@/lib/trips/deliveryLocations";
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
import { useTrailerResidue, useUnitAlerts } from "../hooks/useDashboardCards";
import FuelSheet from "../components/fuel/FuelSheet";
import { DispatchedCard, type DispatchedItem } from "./DispatchedCard";
import { useFuelStop } from "@/lib/fuel/useFuelStop";
import { useFuelSetup } from "@/lib/fuel/useFuelSetup";
import type { UnitAlertSummary } from "@/lib/equipment/unitAlerts";

const STATUS_LABEL: Record<TripRow["status"], string> = {
  dispatched: "Dispatched",
  draft: "Not loaded yet",
  loading: "Loading",
  in_transit: "In transit",
  delivering: "Delivering",
  parked: "Parked preloaded",
  complete: "Complete",
  cancelled: "Cancelled",
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
  // Tapped links/tools dim with a spinner until the next screen opens.
  const nav = usePending();
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
  // My own truck counts too: headed to this rack until I've left it, and
  // headed to the drop while loaded with a delivery set.
  const meToRack = !!snap && !!alertTerminalId && String(activePickup(snap.pickups)?.terminal_id ?? "") === alertTerminalId;
  const rackCount = toMyTerminal.length + (meToRack ? 1 : 0);
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
  // Begin Dispatched Load starts the trip, then opens this same sheet so the
  // driver taps through what dispatch planned. While verifying, the pickup is
  // the one dispatch chose, unless the driver changes the terminal here.
  const [verifyTripId, setVerifyTripId] = useState<string | null>(null);
  const verifyBaseTerminal = useRef<string | null>(null);
  const [verifyActive, setVerifyActive] = useState(false);

  // Terminals picked on the dashboard are ahead of time: the rack is asked on Arrive.
  useEffect(() => {
    shell.setDeferRackPick(true);
    return () => shell.setDeferRackPick(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loads dispatch planned for this driver ───────────────────────────────
  const dispatchedList = useMemo(() => (userId && !openTrip ? dispatchedForDriver(trips, userId) : []), [trips, userId, openTrip]);
  const [plannedNames, setPlannedNames] = useState<Record<string, string>>({});
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
  }, [dispatchedList, store, suppliers, truckId, trailerId, state, plannedNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginDispatchedLoad = () => {
    const trip = dispatchedList[0];
    if (!store || !userId || !trip) return;
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
  useEffect(() => {
    if (verifyTripId && openTrip?.trip_id === verifyTripId) {
      setVerifyTripId(null);
      setSheetOpen(true);
    }
  }, [verifyTripId, openTrip?.trip_id]);
  // The dispatched pickup, used while the driver hasn't changed the terminal.
  const dispatchedPickup = (() => {
    const pk = editing ? children?.pickup : null;
    if (!verifyActive || !pk || pk.load_id || pk.arrived_at || !pk.terminal_id) return null;
    const cur = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
    return cur === verifyBaseTerminal.current || cur === null ? pk : null;
  })();

  const initialValues = useMemo<StartLoadValues>(() => {
    if (openTrip && children && snap) {
      const planned = plannedDeliveries(snap.deliveries);
      return {
        orderNumber: children.primaryOrder?.order_number ?? "",
        extraOrderNumbers: children.extraOrders.map((o) => o.order_number ?? ""),
        // Dispatch's shipper/customer first; blank falls back to the driver's last entries.
        shipper: openTrip.shipper || (userId ? lastShipperCustomer(trips, userId).shipper : null) || "",
        customer: openTrip.customer || (userId ? lastShipperCustomer(trips, userId).customer : null) || "",
        deliveries: planned.length
          ? planned.map((d) => ({ locationId: d.location_id, oneOffName: d.one_off_name, deliveryType: d.delivery_type }))
          : [{ locationId: null, oneOffName: "", deliveryType: "drop" }],
        beginMiles: openTrip.begin_miles == null ? "" : String(openTrip.begin_miles),
        startCity: openTrip.start_city ?? "",
        startState: openTrip.start_state ?? "",
        planSlot: getTripPlan(userId, openTrip.trip_id)?.slot ?? null,
        supplier: getTripSupplier(userId, openTrip.trip_id),
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
  }, [openTrip, children, snap, trips, userId, truckId, store, locations, storedLocId, location.selectedTerminalId]);

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
          existing: openTrip && children
            ? { trip: openTrip, orders: children.orders, pickups: children.pickups, deliveries: store.list("trip_deliveries", (d) => d.trip_id === openTrip.trip_id) }
            : null,
        },
      );
      applyStartLoad(store, rows);
      if (v.planSlot !== (getTripPlan(userId, rows.trip.trip_id)?.slot ?? null)) setTripPlan(userId, rows.trip.trip_id, v.planSlot);
      // Supplier: kept on the trip, and preset at the pickup rack now (the
      // Planner presets it at any later rack on the trip too).
      const prevSupplier = getTripSupplier(userId, rows.trip.trip_id);
      setTripSupplier(userId, rows.trip.trip_id, v.supplier);
      const pickupTid = dispatchedPickup ? String(dispatchedPickup.terminal_id) : location.selectedTerminalId ? String(location.selectedTerminalId) : null;
      const pickupLoaded = !!(editing && children?.pickup?.load_id);
      if (v.supplier && pickupTid && !pickupLoaded && (!editing || !sameSupplier(prevSupplier, v.supplier))) {
        seedTerminalPicks(userId, pickupTid, v.supplier);
        if (v.supplier.supplier_id) void linkSupplierToTerminal({ companyId, supplierId: v.supplier.supplier_id, terminalId: pickupTid });
      }
      setSheetOpen(false);
      setVerifyActive(false);
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

  // Fuel stop: tapping Fuel stamps the start time right away.
  const fuel = useFuelStop(userId || null, companyId || null);
  const [fuelOpen, setFuelOpen] = useState(false);
  // Live odometer and position from the company's telematics, fetched whenever one of these windows opens.
  const truckReading = useTruckReading(truckId, sheetOpen || finishOpen || fuelOpen);
  // Hookup detection: which trailer Geotab says is on this truck, read once when the dashboard opens.
  const hookup = useTruckReading(truckId, !!truckId);
  const [hookupSnoozed, setHookupSnoozed] = useState(false);
  // Geotab hooks and drops land on the open trip's log, now and every ten minutes.
  const logTripId = openTrip?.trip_id ?? null;
  useEffect(() => {
    if (!store || !userId || !logTripId) return;
    let off = false;
    const run = () => {
      const t = store.list("trips", (x) => x.trip_id === logTripId)[0];
      if (t && !off) void syncTrailerEvents(store, { trip: t, userId }).then((n) => { if (n && !off) void syncNow(); });
    };
    run();
    const id = window.setInterval(run, 600_000);
    return () => { off = true; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, userId, logTripId]);
  const fuelSetup = useFuelSetup(fuelOpen ? companyId || null : null);
  const tapFuel = async () => {
    if (!fuel.active) await fuel.start({ truckId: truckId ?? null, trailerId: trailerId ?? null, tripId: openTrip?.trip_id ?? null });
    setFuelOpen(true);
  };
  // A back-dated arrival (the geofence saw the truck come to rest earlier) sets this for one call.
  const arriveAtRef = useRef<Date | null>(null);
  const clock = () => ({ now: arriveAtRef.current ?? new Date(), newId });

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
    const orderNo = children?.primaryOrder?.order_number;
    setNotice(tripComplete
      ? { text: orderNo ? `Order ${orderNo} · Trip complete.` : "Trip complete.", tripId }
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
  const arrival = useArrivalSuggestion({ companyId: companyId || null, truckId, target: arrivalTarget, enabled: !!arrivalTarget && !!openTrip });
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
  useDepartureWatch({ companyId: companyId || null, truckId, stopKey: atStop?.key ?? null, target: atStop?.target ?? null, enabled: !!atStop && autoStampOn });

  // Arrival auto-stamp: only where the fence is learned (tight). A wide catalog-point fence still
  // just offers the Arrive card. Back-dated to when the truck came to rest; the driver can edit.
  useEffect(() => {
    if (!autoStampOn || !arrival.suggest || !arrival.learned || !arrivalTarget || !store || !userId) return;
    const at = new Date(arrival.suggest.sinceMs);
    const when = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (step.kind === "arrive_pickup") {
      arrivePickup(store, { userId, pickup: step.pickup, now: at, newId });
      const loc = shell.location;
      if (step.pickup.rack_id == null && loc.selectedRackId && String(loc.selectedTerminalId || "") === String(step.pickup.terminal_id || "")) {
        store.put("trip_pickups", { pickup_id: step.pickup.pickup_id, rack_id: loc.selectedRackId });
      }
    } else if (step.kind === "arrive_delivery") {
      arriveDelivery(store, { userId, delivery: step.delivery, now: at, newId });
    } else return;
    void syncNow();
    setNotice({ text: `Arrived at ${arrivalTarget.name} at ${when}, from your truck's position.`, tripId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival.suggest?.sinceMs, arrival.learned, autoStampOn, step.kind]);

  const confirmDetectedArrival = () => {
    if (!arrival.suggest) return;
    arriveAtRef.current = new Date(arrival.suggest.sinceMs);
    try { onBigButton(); } finally { arriveAtRef.current = null; }
  };

  const onBigButton = () => {
    setNotice(null);
    if (!store || !userId) return;
    switch (step.kind) {
      case "start":
        if (parked) {
          doResume();
          break;
        }
        if (dispatchedList.length) {
          beginDispatchedLoad();
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
        learnArrival();
        // Arrived: straight to the Planner to build the load, on this
        // pickup's terminal (the Planner may still be on an earlier one).
        // Which rack isn't known until the driver is there, so it's asked now.
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
            router.push("/planner");
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
        learnArrival();
        // Arrived: the drop clock starts and the delivery screen opens.
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
  // Truck / trailer alert squares: permits + service coming due.
  const truckAlerts = useUnitAlerts("truck", truckId, companyId);
  const trailerAlerts = useUnitAlerts("trailer", trailerId, companyId);
  const [unitAlertsOpen, setUnitAlertsOpen] = useState<"truck" | "trailer" | null>(null);
  const unitCell = (label: string, s: UnitAlertSummary, which: "truck" | "trailer", has: boolean) => ({
    label, value: has ? String(s.count) : "—", unit: has ? "due" : undefined,
    color: s.worst ? EXPIRY_COLOR[s.worst] : LOOK.muted,
    onClick: has ? () => setUnitAlertsOpen(which) : undefined,
  });
  const meToDrop = !!myDelivery && aboardRows.length > 0;
  const dropCount = toMyDelivery.length + (meToDrop ? 1 : 0);
  // 1 (usually just me) is white; more than one truck going there is red.
  const countColor = (n: number) => (n === 0 ? LOOK.muted : n === 1 ? "#fff" : "#f87171");
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
  // Regions for Park Preloaded: the company's list, defaulting to the driver's own.
  const [parkRegions, setParkRegions] = useState<string[]>([]);
  const [myRegion, setMyRegion] = useState<string | null>(null);
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
  // Terminal access alerts in cities other than the one the strip shows.
  const otherCityAccess = (() => {
    const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();
    const items = expirations.activeItems.filter((i) =>
      i.entityType === "terminal" &&
      !(norm(i.city) === norm(readinessPlace.city) && norm(i.state) === norm(readinessPlace.state)));
    if (items.length === 0) return null;
    const worst = items.some((i) => i.level === "expired") ? "expired" : items.some((i) => i.level === "expiring") ? "expiring" : "soon";
    return { count: items.length, color: EXPIRY_COLOR[worst], onOpen: () => shell.setExpModalOpen(true) };
  })();
  const openTerminalList = (terminalId: string | null) => {
    if (terminalId) shell.setExpandedTerminalId(terminalId);
    setTerminalNowOpen(false);
    if (location.selectedCity) shell.setTermOpen(true);
    else shell.setLocOpen(true);
  };

  const pickups = snap?.pickups ?? [];
  const liveDeliveries = (snap?.deliveries ?? []).filter((d) => d.status !== "cancelled");
  const anyDelivered = liveDeliveries.some((d) => d.status === "complete");
  // Saved plans for the Begin Trip plan picker, read when the sheet opens.
  const [sheetPresets, setSheetPresets] = useState<PresetSummary[]>([]);
  useEffect(() => {
    if (!sheetOpen) return;
    let alive = true;
    void fetchPresets(userId, equipment.selectedComboId ?? null, Object.keys(compSizes).map(Number)).then((p) => { if (alive) setSheetPresets(p); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen, userId, equipment.selectedComboId]);

  // The most recent load on this trip, for the Load Report link.
  const lastLoadId = [...pickups].filter((p) => p.load_id && (p.outcome === "loaded" || p.left_at)).sort((a, b) => b.seq - a.seq)[0]?.load_id ?? null;
  const canAddPickup = !!openTrip && openTrip.status !== "draft" && !!snap && !activePickup(snap.pickups) && !anyDelivered
    && step.kind !== "next_rack";
  const plannedCount = snap ? plannedDeliveries(snap.deliveries).length : 0;

  // The access strip shows on the dashboard while empty, or loaded but headed
  // to load more (an Add Pickup rack not left yet, or Next Rack). Otherwise it
  // lives in the Terminal sheet, under Switch Terminal.
  const headingToLoadMore = !!snap && (!!activePickup(snap.pickups) || step.kind === "next_rack");
  const accessCollapsed = aboardRows.length > 0 && !headingToLoadMore;
  const accessStrip = (
    <TerminalAccessStrip
      place={readinessLabel}
      summary={readiness}
      loading={terminals.termLoading}
      onOpenTerminal={openTerminalList}
      onOpenSteps={(tid) => openAccessSteps({ terminalId: tid })}
      onChangeCity={() => { setTerminalNowOpen(false); shell.setLocOpen(true); }}
      otherCities={otherCityAccess}
    />
  );

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
      {/* Title: small label, the truck/trailer number under it in gray. */}
      <div style={{ marginBottom: 10 }}>
        <div style={L.title}>Driver Dashboard</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 2 }}>
          <div className="dash-num" style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 700, color: LOOK.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {equipmentLabel}
          </div>
          {/* The trip's order number; the whole thing opens the PTD. */}
          {openTrip && (
            <button type="button" onClick={() => nav.go("ptd", `/planner/trips/${openTrip.trip_id}`)} {...busyProps(nav.is("ptd"))} aria-label="Open the PTD"
              className="dash-num"
              style={{ flexShrink: 0, background: "none", border: "none", padding: "4px 0 4px 12px", margin: "-4px 0", cursor: "pointer",
                fontSize: 18, fontWeight: 700, color: LOOK.muted, display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 12, letterSpacing: 0.5, display: "inline-flex", alignItems: "center", gap: 6 }}>PTD {nav.is("ptd") ? <Spinner size={10} /> : "›"}</span>
              <span>{children?.primaryOrder?.order_number ?? "No order #"}{children && children.extraOrders.length > 0 ? ` +${children.extraOrders.length}` : ""}</span>
            </button>
          )}
        </div>
      </div>

      {/* Status squares: equipment due, and company trucks headed where I'm going (me included). */}
      <div style={{ marginBottom: 14 }}>
      <GaugePanel cells={[
          unitCell("Truck", truckAlerts, "truck", !!truckId),
          unitCell("Trailer", trailerAlerts, "trailer", !!trailerId),
          { label: "To Rack", value: String(rackCount), unit: rackCount === 1 ? "trk" : "trks",
            color: countColor(rackCount), onClick: () => setTerminalNowOpen(true) },
          { label: myDelivery?.delivery_type === "pump_off" ? "To Pump" : "To Drop", value: String(dropCount), unit: dropCount === 1 ? "load" : "loads",
            color: countColor(dropCount), onClick: () => setDropNowOpen(true) },
        ]} />
      </div>

      <div className="dash-cols">
      <div>
      <SectionLabel desktopOnly first>Trip</SectionLabel>

      <DispatchedCard items={dispatchedItems} />

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
            style={{ marginTop: 10, borderRadius: 2, border: "none", background: "#fff", color: "#000", padding: "10px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
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
            const current = snap ? activePickup(snap.pickups) : null;
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
              // Leg tracking: heading to this rack -> city white; at the
              // rack -> rack white; otherwise both gray.
              const isCurrent = !loaded && current?.pickup_id === p.pickup_id;
              const placeColor = isCurrent && !p.arrived_at ? "#fff" : muted;
              const nameColor = isCurrent && p.arrived_at ? "#fff" : muted;
              return (
                <div key={p.pickup_id} style={{ fontSize: 14, marginTop: i === 0 ? 10 : 4 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ color: loaded ? "#4ade80" : p.arrived_at ? "#fff" : muted, width: 66, flexShrink: 0, fontWeight: p.arrived_at && !loaded ? 700 : undefined }}>{label}</span>
                    <span style={{ flex: 1, minWidth: 0, color: placeColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place || "—"}</span>
                    <span style={{ color: nameColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "55%" }}>{p.name ?? "Not set"}</span>
                  </div>
                  {(pickups.length > 1 || multiOrder || p.order_id) && (
                    <button type="button" onClick={() => { setOrderErr(null); setOrderPickup(p); }}
                      style={{ display: "block", background: "none", border: "none", padding: 0, marginTop: 1, marginLeft: 72, color: muted, fontSize: 12, cursor: "pointer", textAlign: "left" }}>
                      Order {orderNumberFor(p) ?? "—"} ›
                    </button>
                  )}
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
          {(() => {
            // The stop the truck is headed to: the next planned delivery,
            // once nothing is left to load and product is aboard.
            const headed = snap && !activePickup(snap.pickups) && aboardRows.length > 0 ? plannedDeliveries(snap.deliveries)[0] ?? null : null;
            return liveDeliveries.map((d) => {
              // The label is the stage: Delivery → Arrived → Delivered.
              const done = d.status === "complete";
              const label = done ? "Delivered" : d.arrived_at ? "Arrived" : "Delivery";
              const loc = d.location_id ? locations.find((l) => l.location_id === d.location_id) : null;
              const place = loc ? locationPlace(loc) : "";
              // Leg tracking: on the way -> city white; at the store -> store white.
              const isCurrent = !done && (headed?.delivery_id === d.delivery_id || !!d.arrived_at);
              const placeColor = isCurrent && !d.arrived_at ? "#fff" : muted;
              const nameColor = isCurrent && d.arrived_at ? "#fff" : muted;
              const nameStyle: React.CSSProperties = { color: nameColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "55%", fontSize: 14 };
              return (
                <div key={d.delivery_id} style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ color: done ? "#4ade80" : d.arrived_at ? "#fff" : muted, width: 66, flexShrink: 0, fontWeight: d.arrived_at && !done ? 700 : undefined }}>{label}</span>
                  <span style={{ flex: 1, minWidth: 0, color: placeColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place || "—"}</span>
                  {done ? (
                    <span style={nameStyle}>{deliveryName(d)}</span>
                  ) : (
                    <button type="button" onClick={() => setPicker({ mode: "reroute", delivery: d })} aria-label={`Change ${deliveryName(d)}`}
                      style={{ ...nameStyle, background: "none", border: "none", padding: 0, textAlign: "right", cursor: "pointer" }}>
                      {deliveryName(d)} ›
                    </button>
                  )}
                </div>
              );
            });
          })()}

          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            {lastLoadId && (
              <button type="button" onClick={() => nav.go("report", `/planner?report=${encodeURIComponent(lastLoadId)}`)} {...busyProps(nav.is("report"))} style={{ ...smallLink, display: "inline-flex", alignItems: "center", gap: 6 }}>Load Report {nav.is("report") ? <Spinner size={11} /> : "›"}</button>
            )}
            {canAddPickup && pickups.some((p) => p.outcome === "loaded" || (!!p.left_at && !!p.load_id)) && (
              <button type="button" onClick={openAddPickup} style={smallLink}>+ Another pickup</button>
            )}
            {canNoLoad && (
              <button type="button" onClick={() => { setNoLoadErr(null); setNoLoadOpen(true); }} style={{ ...smallLink, color: "#fbbf24" }}>
                Couldn&apos;t load here
              </button>
            )}
            {canCancelLoad(openTrip, onBoard(snap?.compLoads ?? []).length > 0) && (
              <button type="button" onClick={() => { setCancelErr(null); setCancelOpen(true); }} style={{ ...smallLink, color: "#f87171" }}>
                Cancel load
              </button>
            )}
            {showPark && (
              <button type="button" onClick={() => setParkOpen(true)} style={{ ...smallLink, color: "#93c5fd", marginLeft: "auto" }}>
                Park preloaded
              </button>
            )}
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
            <button type="button" onClick={() => nav.go("notice-ptd", `/planner/trips/${notice.tripId}`)} {...busyProps(nav.is("notice-ptd"))} style={{ ...smallLink, display: "inline-flex", alignItems: "center", gap: 6 }}>View PTD {nav.is("notice-ptd") ? <Spinner size={11} /> : "›"}</button>
          )}
          <button type="button" onClick={() => setNotice(null)} style={{ ...smallLink, color: muted }}>✕</button>
        </div>
      )}


      {!hookupSnoozed && hookup?.trailerId && hookup.trailerId !== (trailerId ?? null) && (
        <div style={{ ...card, marginBottom: 10, borderColor: "rgba(251,146,60,0.55)" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            Geotab shows Trailer {hookup.trailerName ?? "?"} hooked to your truck
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
            {trailerId
              ? `You have ${equipment.trailerNameById?.[trailerId] || equipment.currentTrailerName || "another trailer"} selected.`
              : "You don't have a trailer selected."}
            {tripLoaded ? " Product is on board, so check this before you change anything." : ""}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="dash-press" onClick={() => openEquipment()} style={{ flex: 2, padding: "11px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", ...L.cta }}>
              Open Equipment
            </button>
            <button type="button" onClick={() => setHookupSnoozed(true)} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 }}>
              It's right
            </button>
          </div>
        </div>
      )}

      {arrival.suggest && arrivalTarget && (
        <div style={{ ...card, marginBottom: 10, borderColor: "rgba(74,222,128,0.5)" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Looks like you're at {arrivalTarget.name}</div>
          <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
            Your truck stopped here at {new Date(arrival.suggest.sinceMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="dash-press" onClick={confirmDetectedArrival} style={{ flex: 2, padding: "11px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", ...L.cta }}>
              Arrive · {new Date(arrival.suggest.sinceMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </button>
            <button type="button" onClick={() => arrival.snooze(20)} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 }}>
              Not yet
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 4, marginBottom: 14 }}>
      {/* Next step */}
      <button
        type="button"
        onClick={onBigButton}
        className="dash-press"
        {...busyProps(openingPlanner)}
        style={{
          width: "100%", padding: "20px 0", fontSize: 20, fontWeight: 800, cursor: "pointer", ...L.cta,
        }}
      >
        {openingPlanner ? busyText(true, "Opening Planner…") : parked && step.kind === "start"
          ? (parked.driver_id === userId ? "Resume Trip" : "Take Over Trip")
          : dispatchedList.length && step.kind === "start" ? "Begin Dispatch"
          : step.label}
      </button>
      {step.kind !== "start" && !openingPlanner && (
        <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 6 }}>{step.detail}</div>
      )}
      </div>

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
        regions={parkRegions}
        defaultRegion={(() => {
          // The destination's region, so a far-away park still lands with whoever delivers it.
          const next = (snap?.deliveries ?? []).filter((d) => d.status === "planned" && d.location_id).sort((a, b) => a.seq - b.seq)[0];
          const loc = next ? locations.find((l) => l.location_id === next.location_id) : null;
          return destinationRegion(loc, locations) ?? myRegion;
        })()}
        onSubmit={doPark}
        onClose={() => setParkOpen(false)}
      />

      {/* Attention rows: only when something needs it. */}
      {(() => {
        // Gross already shows on the trip card; only the truck-change prompt stays here.
        const showGross = tripLoaded && truckChanged;
        const showExp = expired > 0 || warning > 0 || soonCount > 0;
        const showSync = pendingCount > 0 || failed.length > 0;
        const showFuel = !!fuel.active;
        if (!showGross && !showExp && !showSync && !showFuel) return null;
        return (
          <div style={{ ...L.secondary, marginTop: 14, overflow: "hidden" }}>
            {showFuel && (
              <InfoRow
                label="Fuel stop"
                value={fuel.active!.status === "details" ? "Finish details" : fuel.active!.status === "pumping" ? "Pumping" : "Choose payment"}
                valueColor="#fbbf24"
                onClick={() => setFuelOpen(true)}
                last={!showGross && !showExp && !showSync}
              />
            )}
            {showGross && (
              <InfoRow
                label="Truck changed"
                value="Tap to record"
                valueColor="#fbbf24"
                onClick={() => tripEquip.reopenTruckChange()}
                last={!showExp && !showSync}
              />
            )}
            {showExp && (
              <InfoRow
                label="Expirations"
                value={[
                  expired > 0 ? `${expired} expired` : null,
                  warning > 0 ? `${warning} within 7 days` : null,
                  soonCount > 0 ? `${soonCount} within 30 days` : null,
                ].filter(Boolean).join(" · ")}
                valueColor={expired > 0 ? EXPIRY_COLOR.expired : warning > 0 ? EXPIRY_COLOR.expiring : EXPIRY_COLOR.soon}
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

      {!accessCollapsed && (
        <>
          <SectionLabel>Terminal access</SectionLabel>
          {accessStrip}
        </>
      )}
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
        {accessCollapsed && (
          <>
            <div style={{ marginTop: 18 }}><SectionLabel>Terminal access</SectionLabel></div>
            {accessStrip}
          </>
        )}
      </FullscreenModal>
      {/* After the Terminal sheet so Update status opens on top of it. */}
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

      <FullscreenModal open={!!unitAlertsOpen} title={unitAlertsOpen === "trailer" ? "Trailer" : "Truck"} onClose={() => setUnitAlertsOpen(null)} footer={null}>
        {(() => {
          const s = unitAlertsOpen === "trailer" ? trailerAlerts : truckAlerts;
          return (
            <>
              {s.alerts.length === 0 && <div style={{ ...card, color: muted, fontSize: 14 }}>Nothing due in the next 30 days.</div>}
              {s.alerts.map((a, i) => (
                <div key={i} style={{ ...card, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <span aria-hidden style={{ width: 8, height: 8, background: EXPIRY_COLOR[a.state], flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>{a.name}<span style={{ color: muted, fontWeight: 500, fontSize: 12, marginLeft: 6 }}>{a.kind === "permit" ? "Permit" : "Service"}</span></span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: EXPIRY_COLOR[a.state], textAlign: "right" }}>{a.detail}</span>
                </div>
              ))}
              <button type="button" onClick={() => { setUnitAlertsOpen(null); openEquipment(); }}
                style={{ ...card, width: "100%", marginTop: 6, color: "#fff", fontWeight: 800, cursor: "pointer", textAlign: "center" }}>Open Equipment</button>
            </>
          );
        })()}
      </FullscreenModal>
      <FullscreenModal open={dropNowOpen} title={myDelivery ? deliveryName(myDelivery) : "Delivery"} onClose={() => setDropNowOpen(false)} footer={null}>
        <HeadingToDeliveryCard defaultOpen deliveryName={myDelivery ? deliveryName(myDelivery) : null} items={toMyDelivery} productInfo={productInfo}
          emptyText={myDelivery ? "No other company loads headed here right now." : "Set a delivery on your trip to see other loads headed there."} />
      </FullscreenModal>
      <ParkedPreloadsCard items={nearbyParked} productInfo={productInfo} onOpenTrip={(id) => nav.go(`trip:${id}`, `/planner/trips/${id}`)} openingId={nav.openingId("trip")} />
      <RecentDeliveriesCard
        storeName={selectedLoc ? locationTitle(selectedLoc) : null}
        items={recent.items}
        productInfo={productInfo}
        onOpenTrip={(id) => nav.go(`trip:${id}`, `/planner/trips/${id}`)} openingId={nav.openingId("trip")}
        onPickStore={() => setPicker({ mode: "select" })}
      />

      <TerminalOutageDetailModal
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        reports={terminalAlerts.reports}
        timeZone={terminalAlerts.timeZone}
        onCleared={terminalAlerts.refresh}
      />

      <FuelSheet
        open={fuelOpen}
        onClose={() => setFuelOpen(false)}
        stop={fuel}
        liveOdometer={truckReading?.odometerMi ?? null}
        settings={fuelSetup.settings}
        methods={fuelSetup.methods}
        userId={userId ?? ""}
        truckName={(truckId && equipment.truckNameById?.[truckId]) || equipment.currentTruckName || null}
        onDone={(text) => setNotice({ text, tripId: null })}
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

      {/* Tools. Left: the things on the cards above, top to bottom. Right: records. */}
      <SectionLabel>Tools</SectionLabel>
      {(() => {
        const tools: ToolItem[] = [
          { icon: "truck", label: "Equipment", sub: equipmentLabel, onClick: openEquipment },
          { icon: "terminal", label: "Terminal", sub: statusTerminalName ?? "Not set",
            subColor: terminalAlerts.reports.length ? "#f87171" : undefined,
            onClick: () => (statusTerminalName ? setTerminalNowOpen(true) : switchTerminal()) },
          { icon: "store", label: "Delivery", sub: selectedLoc ? locationTitle(selectedLoc) : "Not set", onClick: () => setPicker({ mode: "select" }) },
          { icon: "fuel", label: "Fuel", sub: fuel.active ? "In progress" : null, subColor: fuel.active ? "#fbbf24" : undefined, onClick: () => void tapFuel() },
          ...(canCards ? [{ icon: "card" as const, label: "Cards",
            sub: expired > 0 ? `${expired} expired` : warning > 0 ? `${warning} within 7 days` : soonCount > 0 ? `${soonCount} within 30 days` : "All current",
            subColor: expired > 0 ? EXPIRY_COLOR.expired : warning > 0 ? EXPIRY_COLOR.expiring : soonCount > 0 ? EXPIRY_COLOR.soon : undefined,
            onClick: () => nav.go("cards", "/planner/cards"), busy: nav.is("cards") }] : []),
          { icon: "route", label: "Trips", sub: openTrip ? "Trip in progress" : "History & PTDs", onClick: () => nav.go("trips", "/planner/trips"), busy: nav.is("trips") },
          { icon: "chart", label: "Reports", sub: "Loads & history", onClick: () => nav.go("reports", "/planner/reports"), busy: nav.is("reports") },
        ];
        return <ToolPanel items={tools} />;
      })()}
      </div>
      </div>

      <StartLoadSheet
        open={sheetOpen}
        editing={editing}
        initial={initialValues}
        pickupLabel={dispatchedPickup ? [dispatchedPickup.name, [dispatchedPickup.city, dispatchedPickup.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : editing && children?.pickup?.load_id ? children.pickup.name ?? pickupLabel : pickupLabel}
        pickupTerminalId={dispatchedPickup ? String(dispatchedPickup.terminal_id) : editing && children?.pickup?.load_id ? (children.pickup.terminal_id ? String(children.pickup.terminal_id) : null) : (location.selectedTerminalId ? String(location.selectedTerminalId) : null)}
        onChangePickup={() => (location.selectedCity ? shell.setTermOpen(true) : shell.setLocOpen(true))}
        suppliers={suppliers}
        onAddSupplier={addSupplier}
        presets={sheetPresets}
        productColor={(id) => { const p = productInfo(id); return p.hex ?? productColorFor(p.name); }}
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
        onClose={() => { setSheetOpen(false); setVerifyActive(false); }}
        onSubmit={submit}
        liveMiles={truckReading?.odometerMi ?? null}
        suggestStart={async () => (truckReading?.city ? { city: truckReading.city, state: truckReading.state } : await truckLastKnownPlace(truckId))}
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
            location={finishDeliveryRow.location_id ? locations.find((l) => l.location_id === finishDeliveryRow.location_id) ?? null : null}
            compartments={here}
            laterAboard={onBoard(snap.compLoads).filter((c) => !hereIds.has(c.compartment_load_id))}
            trailerId={openTrip?.trailer_id ?? trailerId}
            savedTanks={store.list("trip_delivery_tanks", (t) => t.delivery_id === finishDeliveryRow.delivery_id)}
            locationTanks={finishDeliveryRow.location_id ? locList.tanks.filter((t) => t.location_id === finishDeliveryRow.location_id) : []}
            settings={settings}
            reasons={reasons.filter((r) => r.kind === "delivery" && r.is_active)}
            otherPlanned={Math.max(0, plannedCount - 1)}
            beginMiles={openTrip?.begin_miles ?? null}
            liveOdometer={truckReading?.odometerMi ?? null}
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
        onManage={() => { setPicker(null); nav.go("locations", "/planner/locations"); }}
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
            <div key={`${q.table}|${q.key}`} style={{ padding: "8px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 6 }}>
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
            style={{ width: "100%", padding: "14px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 14 }}>
            Retry {failed.length === 1 ? "" : `all ${failed.length}`}
          </button>
          {failed.map((f) => {
            const id = `${f.table}|${f.key}`;
            return (
              <div key={id} style={{ padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 8 }}>
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
                      style={{ background: "#f87171", color: "#000", border: "none", borderRadius: 2, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Discard</button>
                    <button type="button" onClick={() => setConfirmKey(null)}
                      style={{ background: "transparent", color: muted, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Keep</button>
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
