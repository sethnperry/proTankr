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
import { HosRecapModal } from "@/app/planner/components/trip/HosRecap";
import type { TripPickupRow, TripTable } from "@/lib/trips/types";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";
import { useTripStore } from "@/lib/trips/useTripStore";
import { DelayButton } from "../components/trip/DelayButton";
import { DashboardTour, dashTourSeen, markDashTourSeen } from "../components/tour/DashboardTour";
import { ConsigneeSignSheet } from "../components/trip/ConsigneeSignSheet";
import { DutyStopCard } from "./DutyStopCard";
import { useStopAnswers } from "@/lib/trips/useStopAnswers";
import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import {
  DELAY_EVENT, delayEventPayload, delayIssueCode, legForStep, loggedDelays, readRunningDelay, writeRunningDelay,
  dropDelayMinutes, type RunningDelay,
  endRunningDelay,
} from "@/lib/trips/delays";
import { newId } from "@/lib/trips/tripStore";
import { useTripHydration } from "@/lib/trips/useTripHydration";
import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { airMiles, locationPlace, locationTitle, type LatLon } from "@/lib/trips/deliveryLocations";
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
  unlinkCancelledLoad,
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
  undoableArrival,
  undoArrivePickup,
  undoArriveDelivery,
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
import { useTruckReading, fetchTruckShipments, fetchTruckReading } from "@/lib/telematics/useTruckReading";
import { shipmentsForPickup } from "@/lib/telematics/shipmentMatch";
import { syncTrailerEvents } from "@/lib/trips/syncTrailerEvents";
import { useDepartureWatch } from "@/lib/telematics/useDepartureWatch";
import { useMyHos } from "@/lib/telematics/useMyHos";
import { shouldNotifyHosTrip, type Level } from "@/lib/telematics/hosTripNotify";
import { notifyPermission, showNotification, type NotifyPermission } from "@/lib/ui/notify";
import { enablePush, pushEnabledHere } from "@/lib/push/subscribe";
import { BREAK_REST_MIN } from "@/lib/telematics/cycleRecap";
import { CYCLE_LIMIT_MIN } from "@/lib/telematics/cycleRecap";
import { clockColor, clockHM, DROP_STOP_MIN, LOAD_STOP_MIN, remainingDriveMin, tripHosCheck } from "@/lib/telematics/progress";
import { recordArrivalPoint, useArrivalSuggestion, type ArrivalTarget } from "@/lib/telematics/useArrivalSuggestion";
import { fetchPresets, getTripPlan, setTripPlan, setTripQuick, nextSaveSlot, savePresetPlan, slotLetter, type PresetSummary } from "@/lib/trips/tripPlan";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";
import { readPlannedMeta } from "@/lib/dispatch/compPlan";
import { writePicks, type SupplierPick } from "@/lib/suppliers/picks";
import { saveTripDraft, takeTripDraft, takeDetourSlot } from "@/lib/trips/planDetour";
import { getTripSupplier, sameSupplier, seedTerminalPicks, setTripSupplier, type TripSupplier } from "@/lib/trips/tripSupplier";
import { readPicks, groupPicks } from "@/lib/suppliers/picks";
import { linkSupplierToTerminal } from "@/lib/suppliers/useTerminalSuppliers";
import { LoadedSheet, type LoadedSubmit } from "../components/trip/LoadedSheet";
import { NoLoadSheet, type NoLoadSubmit } from "../components/trip/NoLoadSheet";
import { destinationRegion } from "@/lib/trips/deliveryLocations";
import { ParkSheet, type ParkSubmit } from "../components/trip/ParkSheet";
import { useTripEquipment } from "../hooks/useTripEquipment";
import { TripEquipmentSheets } from "../components/trip/TripEquipmentSheets";
import { reportDelayIssue, submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";
import { isTerminalIssueCode, noLoadReasonLabel } from "@/lib/trips/terminalIssues";
import { cancelPlannedLoad } from "@/lib/supabase/load";
import { GaugingAskSheet } from "../components/trip/GaugingAskSheet";
import { needsGaugingAnswer } from "@/lib/trips/gaugingAsk";
import { clearActivePlannedLoad } from "../utils/activePlannedLoad";
import { useSuppliers } from "@/lib/trips/useSuppliers";
import { bolConflicts } from "@/lib/trips/refCheck";
import { DeliveryDashboard, clearDeliveryDraft, type DeliveryProgress, type FinishDeliverySubmit, type ProductInfo } from "../components/trip/DeliveryDashboard";
import { LocationPicker } from "../components/trip/LocationPicker";
import { LocationsHub, locationsTool } from "../components/locations/LocationsHub";
import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";
import { serverOrderConflicts } from "@/lib/trips/refCheck";
import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";
import { AddPickupSheet, type AddPickupDraft } from "../components/trip/AddPickupSheet";
import { checkAddPickup, grossColor } from "@/lib/trips/addPickupCheck";
import { productColorFor } from "../utils/productColor";
import { PickupOrderSheet, type OrderChoice } from "../components/trip/OrderChooser";
import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { headingToTerminal, parkedPreloads, storeActivity } from "@/lib/trips/dashboardCards";
import { ShiftBar } from "../components/shift/ShiftBar";
import { ShiftSheet } from "../components/shift/ShiftSheet";
import { ShiftStartConfirm } from "../components/shift/ShiftStartConfirm";
import EquipmentStatusModal, { type FleetStatus, fleetStatusLabel } from "../modals/EquipmentStatusModal";
import { statusSetThisShift } from "@/lib/shifts/endStatus";
import { snoozed, telematicsStart } from "@/lib/shifts/autoStart";
import { useShiftRecap } from "../hooks/useShiftRecap";
import { useDashIdentity } from "@/lib/ui/driver/useDashIdentity";
import { ExplanationSheet } from "../components/shift/ExplanationSheet";
import { endNeedsExplanation, explanationPayload } from "@/lib/shifts/explanation";
import { RepairSheet, type RepairUnit } from "../components/repair/RepairSheet";
import { createRepairWorkOrder } from "@/lib/repairs/repairRequest";
import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";
import { FreightSheet } from "../components/freight/FreightSheet";
import { useFreight } from "../hooks/useFreight";
import { useEmptyMoves } from "../hooks/useEmptyMoves";
import { useStampContext } from "../hooks/useStampContext";
import { OdometerConfirmSheet } from "../components/moves/OdometerConfirmSheet";
import { moveFromStamp } from "@/lib/moves/emptyMoves";
import { EmptyMoveSheet } from "../components/moves/EmptyMoveSheet";
import { TankCheckSheet } from "../components/trip/TankCheckSheet";
import { useTankChecks } from "../hooks/useTankChecks";
import { LanternflySheet } from "../components/slf/LanternflySheet";
import { useLanternfly } from "../hooks/useLanternfly";
import { SafetyMeetingSheet } from "../components/safety/SafetyMeetingSheet";
import { useSafetyMeetings } from "../hooks/useSafetyMeetings";
import { TerminalWorkSheet } from "../components/terminalwork/TerminalWorkSheet";
import { useTerminalWork } from "../hooks/useTerminalWork";
import { minutesOf as workMinutes, clock as workClock } from "@/lib/terminalwork/terminalWork";
import { CalloutSheet } from "../components/callouts/CalloutSheet";
import { useMyCallouts } from "../hooks/useMyCallouts";
import { PerDiemSheet } from "../components/perdiem/PerDiemSheet";
import { usePerDiem } from "../hooks/usePerDiem";
import { useDriverSetup } from "@/lib/setup/useDriverSetup";
import { breakChip } from "@/lib/telematics/breakChip";
import { EquipmentConfirmSheet, type EquipChoice } from "../components/EquipmentConfirmSheet";
import { lastFromTrips, readLastEquipment, rememberLastEquipment, resolveLast, type ComboLite } from "@/lib/equipment/lastEquipment";
import { buildCandidates, type Candidate, type ParkPin } from "@/lib/equipment/parkedNearby";
import { getPhonePosition } from "@/lib/geo/position";
import { counterText } from "@/lib/setup/driverSetup";
import { InspectionSheet, type InspectUnit } from "../components/maintenance/InspectionSheet";
import { useOpenCampaigns } from "../hooks/useOpenCampaigns";
import { createInspection } from "@/lib/maintenance/inspection";
import { PaperLogSheet } from "../components/shift/PaperLogSheet";
import { DocumentSheet } from "../components/shift/DocumentSheet";
import { CaptureSheet } from "../components/capture/CaptureSheet";
import { DOCUMENT_EVENT, DOWN_TIME_EVENT, documentPayload, downTimePayload } from "@/lib/documents/documents";
import { PAPER_LOG_EVENT, paperLogPayload } from "@/lib/shifts/paperLog";
import { reasonsOrDefault } from "@/lib/reasons/reasons";
import { recordShiftEvent } from "@/lib/shifts/shiftEvents";
import { SAFETY_MEETING_EVENT } from "@/lib/safety/onDuty";
import { getTripStore } from "@/lib/trips/useTripStore";
import { useShift } from "../hooks/useShift";
import { useStuckSyncReporter } from "../hooks/useStuckSyncReporter";
import { useOtherCarriers, useStoreDeliveries, useTerminalLoads, useTerminalStatus } from "../hooks/useDashboardCards";
import { useCompanyRoster } from "../hooks/useCompanyRoster";
import { SuppliersModal } from "../dispatch/SuppliersModal";
import { TerminalStatusSheet } from "../components/trip/TerminalStatusSheet";
import { TrackSheet } from "../components/track/TrackSheet";
import { DashLookProvider, DashStyles, LOOK, SectionLabel, useScrollBackdrop } from "./dashLook";
import { GaugePanel, TerminalAccessStrip, ToolPanel, type ToolItem } from "./DashboardChrome";
import { QualificationCard, type QualTerminal } from "./QualificationStrip";
import { openAccessSteps, useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";
import { isoToday_ } from "../utils/dates";
import { EXPIRY_COLOR, EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";
import { ConnectedDashHeader, ConnectedDashFooter } from "../components/dash/ConnectedDash";
import { ExpirationsSheet, LoadsSheet, type ExpGroup, type ExpRow } from "./DashboardSheets";
import { SiteBoard } from "../dispatch/SiteBoard";
import { CarrierStrip, CompsStrip, HeadingToTerminalCard, ParkedPreloadsCard, RecentDeliveriesCard, StoreActivityCard, TerminalStatusCard, initialsOf, runLabel } from "../components/trip/DashboardCards";
import { useUnitAlerts } from "../hooks/useDashboardCards";
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
  const [findTruckOpen, setFindTruckOpen] = useState(false);
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
  const [paperLogOpen, setPaperLogOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [perDiemOpen, setPerDiemOpen] = useState(false);
  const [calloutOpen, setCalloutOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [termWorkOpen, setTermWorkOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [slfOpen, setSlfOpen] = useState(false);
  const [tankCheckOpen, setTankCheckOpen] = useState(false);
  const [freightOpen, setFreightOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [unitRegions, setUnitRegions] = useState<Record<string, string | null>>({});
  const [explainOpen, setExplainOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [downTimeOpen, setDownTimeOpen] = useState(false);
  useStuckSyncReporter(state, userId || null, companyId || null);
  const shift = useShift({ store, state, syncNow, userId: userId || null, companyId: companyId || null, maxHours: Number(settings.max_shift_hours ?? 12) });
  // Ending a shift that ran past the limit asks what happened first (skippable).
  const maxShiftHours = Number(settings.max_shift_hours ?? 12);
  // Truck Down: the work order is written through the offline store, then the server sends the one email.
  const repairUnits: RepairUnit[] = [
    ...(truckId ? [{ kind: "truck" as const, id: truckId, name: equipment.truckNameById?.[truckId] ?? equipment.currentTruckName ?? "" }] : []),
    ...(trailerId ? [{ kind: "trailer" as const, id: trailerId, name: equipment.trailerNameById?.[trailerId] ?? equipment.currentTrailerName ?? "" }] : []),
  ];
  useEffect(() => { if (userId) void retryRepairs(userId); }, [userId]);
  const sendRepairRequest = async (unit: RepairUnit, input: { category: any; note: string }): Promise<string> => {
    if (!store || !userId || !companyId) throw new Error("Not signed in.");
    const { data: prof } = await supabase.from("profiles").select("display_name, region").eq("user_id", userId).maybeSingle();
    const wo = createRepairWorkOrder(store, { companyId, reportedBy: userId, kind: unit.kind, unitId: unit.id, unitName: unit.name, driverName: String((prof as any)?.display_name ?? ""), region: ((prof as any)?.region as string | null) ?? null, category: input.category, note: input.note, captureId: null });
    rememberRepair(userId, wo.work_order_id);
    await syncNow();
    const r = await sendRepair(userId, wo.work_order_id);
    const unitText = `${unit.kind === "truck" ? "Truck" : "Trailer"} ${unit.name}`;
    if (r === "sent") return `${unitText} is now Deadline and the repair request was emailed for approval.`;
    if (r === "waiting") return `Saved. ${unitText} will go to Deadline and the email will send when you have signal.`;
    return `${unitText} is Deadline. No approver email is set for your company, so this is waiting in the work order list.`;
  };
  const safety = useSafetyMeetings(userId || null, companyId || null, true);
  const openSafety = safety.meetings.filter((m) => m.started_at && !safety.signed[m.meeting_id]).length;
  const termWork = useTerminalWork({ store, state, syncNow, userId: userId || null, companyId: companyId || null, enabled: true });
  const callouts = useMyCallouts({ store, state, syncNow, userId: userId || null, companyId: companyId || null, enabled: calloutOpen });
  // Setup checklist: a "Finish setup" row until every step is done. Also the target of /planner/home?open=perdiem.
  const setup = useDriverSetup(userId || null, companyId || null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("open") !== "perdiem") return;
    params.delete("open");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    setPerDiemOpen(true);
  }, []);
  const perDiem = usePerDiem({ store, state, syncNow, userId: userId || null, companyId: companyId || null, enabled: perDiemOpen });
  // Inspect a unit: written through the offline store; a failed item plans a work order.
  const openCampaigns = useOpenCampaigns(companyId, inspectOpen, unitRegions);
  // A campaign's region is matched against the driver's own region (their profile), not the unit's.
  useEffect(() => {
    if (!inspectOpen || !userId) return;
    void (async () => {
      const { data: prof } = await supabase.from("profiles").select("region").eq("user_id", userId).maybeSingle();
      const region = ((prof as any)?.region as string | null) ?? null;
      setUnitRegions({ ...(truckId ? { [truckId]: region } : {}), ...(trailerId ? { [trailerId]: region } : {}) });
    })();
  }, [inspectOpen, userId, truckId, trailerId]);
  const submitInspection = async (o: { unit: InspectUnit; ratings: any; campaignId: string | null; notes: string; captureId: string | null }): Promise<string> => {
    if (!store || !userId || !companyId) throw new Error("Not signed in.");
    const { data: prof } = await supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    const { inspection, workOrder } = createInspection(store, { companyId, driverId: userId, driverName: String((prof as any)?.display_name ?? ""), kind: o.unit.kind, unitId: o.unit.id, unitName: o.unit.name, ratings: o.ratings, campaignId: o.campaignId, notes: o.notes, captureId: o.captureId });
    void syncNow();
    const what = `${o.unit.kind === "truck" ? "Truck" : "Trailer"} ${o.unit.name}`;
    return inspection.overall === "good" ? `${what} is good. The inspection is saved.`
      : workOrder ? `Saved. ${what} has an item that needs replacing soon, so a work order was planned for it.` : `Saved. ${what} has items to watch.`;
  };
  // The Shift pop-out: scheduled start, Start or End, this pay period's recap, Call out and Sign out.
  const dashIdentity = useDashIdentity();
  const [shiftNow, setShiftNow] = useState(() => Date.now());
  useEffect(() => { if (!shiftOpen) return; setShiftNow(Date.now()); const t = window.setInterval(() => setShiftNow(Date.now()), 60_000); return () => window.clearInterval(t); }, [shiftOpen]);
  const shiftLocalEvents = useMemo(() => (store && userId ? store.list("shift_events", (e) => e.user_id === userId) : []), [store, userId, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const shiftRecapData = useShiftRecap({ companyId: companyId || null, userId: userId || null, enabled: shiftOpen, localEvents: shiftLocalEvents, nowMs: shiftNow });
  // Starting the shift automatically: a Begin Trip tap always asks; Geotab showing them on duty or driving asks
  // once per status. The driver always confirms the start time. The rules are in lib/shifts/autoStart.ts.
  const [shiftAsk, setShiftAsk] = useState<{ reason: string; atMs: number; source: "app" | "geotab"; then?: () => void; always: boolean; since?: string } | null>(null);
  const shiftKey = (k: string) => `proTankr:u:${userId}:${k}`;
  const askShiftStart = (reason: string, then: () => void, o?: { always?: boolean }) => {
    if (shift.current) { then(); return; }
    let at: number | null = null;
    try { at = Number(localStorage.getItem(shiftKey("shiftSnooze"))) || null; } catch { /* storage blocked */ }
    if (!o?.always && snoozed(at, Date.now())) { then(); return; }
    setShiftAsk({ reason, atMs: Date.now(), source: "app", then, always: !!o?.always });
  };
  const lastShiftEndedMs = useMemo(() => { const e = [...shift.shifts].reverse().find((x) => x.endedAt); return e?.endedAt ? Date.parse(e.endedAt) : null; }, [shift.shifts]);
  const confirmShiftStart = (atMs: number) => { const a = shiftAsk; setShiftAsk(null); shift.start(new Date(atMs).toISOString(), a?.source ?? "app"); a?.then?.(); };
  const skipShiftStart = () => {
    const a = shiftAsk; setShiftAsk(null);
    try {
      if (a?.source === "geotab" && a.since) localStorage.setItem(shiftKey("shiftDeclined"), a.since);
      else if (a && !a.always) localStorage.setItem(shiftKey("shiftSnooze"), String(Date.now()));
    } catch { /* storage blocked */ }
    a?.then?.();
  };
  // End shift, then ask what status the truck gets, unless it was set during the shift (a stud in the equipment modal
  // stays exactly as set). Sleepers can stay In use; a loaded truck offers Park preloaded instead of Readyline.
  const [endAsk, setEndAsk] = useState<{ name: string; sleeper: boolean; loaded: boolean; status: string | null; notes: string | null; sub: string | null; area: string | null } | null>(null);
  const askTruckStatus = async (shiftStartedAt: string | null) => {
    if (!truckId) return;
    try {
      const { data } = await supabase.from("trucks").select("truck_name, status_updated_at, has_sleeper, status_code, status_notes, sub_status, local_area").eq("truck_id", truckId).maybeSingle();
      const t = data as { truck_name?: string; status_updated_at?: string | null; has_sleeper?: boolean; status_code?: string | null; status_notes?: string | null; sub_status?: string | null; local_area?: string | null } | null;
      if (!t || statusSetThisShift(t.status_updated_at, shiftStartedAt)) return;
      setEndAsk({ name: t.truck_name ?? "", sleeper: !!t.has_sleeper, loaded: !!openTrip && !!snap && onBoard(snap.compLoads).length > 0, status: t.status_code ?? null, notes: t.status_notes ?? null, sub: t.sub_status ?? null, area: t.local_area ?? null });
    } catch { /* no question: the status stays as it is */ }
  };
  // Cancelling a load and ending a shift both stop to confirm the odometer first (see OdometerConfirmSheet).
  const [stampAsk, setStampAsk] = useState<{ kind: "cancel"; v: CancelTripSubmit } | { kind: "shift" } | null>(null);
  const finishShift = () => {
    if (truckId) { setStampAsk({ kind: "shift" }); return; }
    const startedAt = shift.current?.startedAt ?? null; shift.end(); void askTruckStatus(startedAt);
  };
  const requestEnd = () => { if (endNeedsExplanation(shift.current, maxShiftHours)) setExplainOpen(true); else finishShift(); };
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
  const freight = useFreight({ store, state, syncNow, userId: userId || null, companyId: companyId || null });
  const emptyMoves = useEmptyMoves({ store, state, syncNow, userId: userId || null, companyId: companyId || null });
  const tankChecks = useTankChecks({ store, syncNow, userId: userId || null, companyId: companyId || null });
  const lanternfly = useLanternfly({ store, state, syncNow, userId: userId || null, companyId: companyId || null, tripId: openTrip?.trip_id ?? null });
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

  // ── Delay button: one delay running at a time, ended by a second tap, Arrive or Finish.
  const [runningDelay, setRunningDelay] = useState<RunningDelay | null>(null);
  useEffect(() => {
    if (userId) setRunningDelay(readRunningDelay(userId));
  }, [userId]);
  // Plan Review's Rack Delay starts one from the Planner overlay: pick it up here.
  useEffect(() => {
    const h = () => { if (userId) setRunningDelay(readRunningDelay(userId)); };
    window.addEventListener("protankr:delay", h);
    return () => window.removeEventListener("protankr:delay", h);
  }, [userId]);
  const delayLeg = openTrip ? legForStep(step.kind) : null;
  const endDelay = (atIso?: string) => {
    if (!store || !userId) return;
    if (endRunningDelay(store, userId, atIso)) { setRunningDelay(null); void syncNow(); }
  };
  // First time a terminal is reported down for gauging, ask when it normally gauges.
  const [gaugingAsk, setGaugingAsk] = useState<{ id: string; name: string } | null>(null);
  const askGauging = (terminalId: string | null | undefined) => {
    if (!terminalId) return;
    const t = (terminalCatalog ?? []).find((x) => String(x.terminal_id) === String(terminalId));
    if (t && needsGaugingAnswer(t)) setGaugingAsk({ id: String(t.terminal_id), name: t.terminal_name ?? "this terminal" });
  };
  const startDelay = (code: string, note: string | null) => {
    if (!userId || !openTrip || !delayLeg) return;
    const d: RunningDelay = {
      tripId: openTrip.trip_id, leg: delayLeg, code, note, startedAt: new Date().toISOString(),
      // The "planner" step (Begin Loading) carries no pickup of its own: use the rack the driver is waiting at.
      pickupId: "pickup" in step ? step.pickup.pickup_id : (snap?.pickups.find((p) => p.arrived_at && !p.load_id && !p.left_at && !p.outcome)?.pickup_id ?? null),
      deliveryId: "delivery" in step ? step.delivery.delivery_id : null,
    };
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
  const tripDelays = useMemo(
    () => (store && openTrip ? loggedDelays(store.list("trip_events", (e) => e.trip_id === openTrip.trip_id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, openTrip?.trip_id, state],
  );
  // Set while routing to the Planner, so the button doesn't flash the next
  // step's label ("Continue Trip") during the navigation.
  const [openingPlanner, setOpeningPlanner] = useState(false);
  // Plan Review / a load report open over this screen (Planner host, see
  // PlannerHost.tsx). Drop the "Opening…" state once they're up, or give up.
  const [openingReport, setOpeningReport] = useState(false);
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
  const [rackSheetOpen, setRackSheetOpen] = useState(false);
  const rackCity = useMemo(() => {
    const t = rackTerminalId ? terminalCatalog.find((x) => String(x.terminal_id) === rackTerminalId) : null;
    return t?.city ? String(t.city) : "";
  }, [rackTerminalId, terminalCatalog]);
  const [rackStudOpen, setRackStudOpen] = useState(false);
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
  const roster = useCompanyRoster(companyId);
  // "SP 25184": my initials and truck, for my own rows.
  const myLabel = [initialsOf(roster.members.find((m) => m.user_id === userId)?.display_name), equipment.currentTruckName].filter(Boolean).join(" ") || "You";
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
  // Values the Begin / Edit Trip card had when the driver left to make or change a plan.
  const [resumeDraft, setResumeDraft] = useState<StartLoadValues | null>(null);
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
  const dispatchedList = useMemo(() => (userId ? dispatchedForDriver(trips, userId) : []), [trips, userId]);
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

  // A fuel stop still open when a trip is about to begin: ask, so the fueling time ends before the trip's start
  // instead of straddling it.
  const [fuelAsk, setFuelAsk] = useState<null | (() => void)>(null);
  // Begin Trip: after the shift starts, confirm the equipment. Free pairs parked where the driver is now (each unit has one
  // pin, left when a shift ended), then their own last truck. The driver taps one to highlight it and confirms (Commandeer
  // when someone has it); Find equipment opens the picker and the sequence carries on when it closes. Skipped when the
  // driver already holds a pair, there is nothing to offer, or an admin is using the app as someone else.
  type EquipCand = Candidate & { truckName: string | null; trailerName: string | null; status: string | null };
  const [equipAsk, setEquipAsk] = useState<{ cands: EquipCand[]; then: () => void } | null>(null);
  const [equipSel, setEquipSel] = useState<string | null>(null);
  const [equipBusy, setEquipBusy] = useState(false);
  const [equipErr, setEquipErr] = useState<string | null>(null);
  const [equipSwitching, setEquipSwitching] = useState(false);
  const equipSawOpen = useRef(false);
  useEffect(() => {
    if (!equipSwitching) { equipSawOpen.current = false; return; }
    if (shell.equipOpen) { equipSawOpen.current = true; return; }
    if (!equipSawOpen.current) return;
    const a = equipAsk;
    setEquipSwitching(false);
    // Begin Trip needs a truck: coming back from the picker without one keeps the sheet open (no way past it).
    if (!(equipment.selectedComboId || equipment.isBobtail)) {
      setEquipErr("Pick a truck to begin the trip.");
      return;
    }
    setEquipAsk(null);
    a?.then();
  }, [equipSwitching, shell.equipOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const askEquipment = async (go: () => void) => {
    if (!userId || !companyId || shell.setupSession) { go(); return; }
    if (equipment.selectedComboId || equipment.isBobtail) { go(); return; }
    // Nothing offered (or the lookup failed): the full picker, and the trip doesn't begin until a truck is held.
    const askPicker = () => { setEquipErr(null); setEquipSel(null); setEquipAsk({ cands: [], then: go }); setEquipSwitching(true); shell.setEquipOpen(true); };
    try {
      const myTrips = store ? store.list("trips", (t) => t.driver_id === userId) : [];
      // Where I am, the pins, and every active pairing, read fresh: another driver may have taken a unit since.
      const [myPos, pinsRes, combosRes] = await Promise.all([
        getPhonePosition(3500),
        supabase.from("equipment_parks").select("unit_kind, unit_id, lat, lon, place_label, parked_by, parked_at"),
        supabase.from("equipment_combos").select("combo_id, truck_id, trailer_id, claimed_by, active").eq("active", true),
      ]);
      const combos = (combosRes.data ?? []) as ComboLite[];
      const pins = (pinsRes.data ?? []) as ParkPin[];
      const last = resolveLast(readLastEquipment(userId), lastFromTrips(myTrips, userId), combos);
      const cands = buildCandidates({ pins, activeCombos: combos, me: userId, myPos, last });
      if (cands.some((c) => c.state.kind === "mine")) { go(); return; }
      if (!cands.length) { askPicker(); return; }
      const truckIds = cands.map((c) => c.truckId);
      const trailerIds = cands.map((c) => c.trailerId).filter(Boolean) as string[];
      const [tn, ln] = await Promise.all([
        supabase.from("trucks").select("truck_id, truck_name, status_code").in("truck_id", truckIds),
        trailerIds.length ? supabase.from("trailers").select("trailer_id, trailer_name").in("trailer_id", trailerIds) : Promise.resolve({ data: [] }),
      ]);
      const tnames = new Map(((tn.data ?? []) as { truck_id: string; truck_name: string }[]).map((r) => [r.truck_id, r.truck_name]));
      const tstatus = new Map(((tn.data ?? []) as { truck_id: string; status_code: string | null }[]).map((r) => [r.truck_id, r.status_code]));
      const lnames = new Map(((ln.data ?? []) as { trailer_id: string; trailer_name: string }[]).map((r) => [r.trailer_id, r.trailer_name]));
      const withNames = cands.map((c) => ({ ...c, truckName: tnames.get(c.truckId) ?? null, trailerName: c.trailerId ? lnames.get(c.trailerId) ?? null : null, status: tstatus.get(c.truckId) ?? null }));
      setEquipErr(null);
      setEquipSel(withNames.length === 1 ? withNames[0].key : null); // a single choice is already highlighted; it still takes a tap on Confirm
      setEquipAsk({ cands: withNames, then: go });
    } catch { askPicker(); }
  };
  const confirmEquipment = async () => {
    const a = equipAsk;
    const c = a?.cands.find((x) => x.key === equipSel);
    if (!a || !c || !userId) return;
    setEquipBusy(true);
    setEquipErr(null);
    try {
      if (c.trailerId) {
        // Free and still coupled (parking only lets go of the unit): claim the pairing. Taking it from another driver, or
        // putting a decoupled pair back together, goes through couple_combo (force when something active holds a unit).
        const { data, error: e } = c.state.kind === "parked" && c.comboId
          ? await supabase.rpc("claim_combo", { p_combo_id: c.comboId })
          : await supabase.rpc("couple_combo", { p_truck_id: c.truckId, p_trailer_id: c.trailerId, p_force: c.state.kind === "in_use" || c.touchesActive });
        if (e) throw e;
        await equipment.fetchCombos?.();
        const comboId = String((data as { combo_id?: string } | null)?.combo_id ?? "");
        if (comboId) equipment.setSelectedComboId(comboId);
      } else {
        await equipment.setCurrentEquipment(c.truckId, null);
      }
      rememberLastEquipment(userId, { truckId: c.truckId, trailerId: c.trailerId });
      setEquipAsk(null);
      a.then();
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
      setEquipErr(/historical combo|tare/i.test(m) ? "This pair hasn't been used together before. Tap Find equipment." : m ? `Couldn't take the equipment: ${m}` : "Couldn't take the equipment. Tap Find equipment.");
    } finally { setEquipBusy(false); }
  };
  // Where a truck was left: the stamp from the End shift confirmation, written to the truck and its trailer once a parked
  // status is saved. One pin per unit; it disappears when anyone takes the unit.
  const parkStampRef = useRef<{ lat: number | null; lon: number | null; label: string | null; placeId: string | null } | null>(null);
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
  const askFuelFirst = (go: () => void) => {
    if (fuel.active && fuel.active.status !== "complete" && !fuel.active.finished_at) setFuelAsk(() => go);
    else go();
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
    if (resumeDraft) return resumeDraft;
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
  }, [openTrip, children, snap, trips, userId, truckId, store, locations, storedLocId, location.selectedTerminalId, resumeDraft]);

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
      if (openPlanner) router.push("/planner?plan=1");
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

  // ── Pickup / delivery steps ────────────────────────────────────────────────
  const [loadedOpen, setLoadedOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  // The Locations tool: terminals and delivery locations.
  const [manageLocsOpen, setManageLocsOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tripId: string | null } | null>(null);

  // Fuel stop: tapping Fuel stamps the start time right away.
  const fuel = useFuelStop(userId || null, companyId || null);
  // Fueling in progress (pump not finished yet). A stop left open only for its details doesn't count.
  const fuelOn = !!fuel.active && !fuel.active.finished_at;
  // A notice that stops an action (themed, not an alert).
  const [blockNotice, setBlockNotice] = useState<{ title: string; text: string } | null>(null);
  const [fuelOpen, setFuelOpen] = useState(false);
  // Live odometer and position from the company's telematics, fetched whenever one of these windows opens.
  const [truckSheetWatch, setTruckSheetWatch] = useState(false);
  const truckReading = useTruckReading(truckId, sheetOpen || finishOpen || fuelOpen || freightOpen || moveOpen || truckSheetWatch, finishOpen ? 60_000 : undefined, fuelOpen); // fuel wants a fresh odometer; a stop that lasted minutes is fine from the cache
  // Hookup detection: which trailer Geotab says is on this truck, read once when the dashboard opens.
  const hookup = useTruckReading(truckId, !!truckId);
  // "It's right" is remembered for that truck and trailer, so the card doesn't come back every time the app opens.
  const hookupKey = userId && truckId ? `proTankr:u:${userId}:hookupOk:${truckId}` : null;
  const [hookupOkId, setHookupOkId] = useState<string | null>(null);
  useEffect(() => {
    if (!hookupKey) { setHookupOkId(null); return; }
    try { setHookupOkId(localStorage.getItem(hookupKey)); } catch { setHookupOkId(null); }
  }, [hookupKey]);
  const [notifyPerm, setNotifyPerm] = useState<NotifyPermission>("default");
  useEffect(() => { setNotifyPerm(notifyPermission()); }, []);
  const myHos = useMyHos(companyId || null, !!companyId && !!userId);
  useEffect(() => {
    if (!userId || shiftAsk) return;
    let declined: string | null = null;
    try { declined = localStorage.getItem(shiftKey("shiftDeclined")); } catch { /* storage blocked */ }
    const t = telematicsStart({ hos: myHos, nowMs: Date.now(), shiftOpen: !!shift.current, lastEndedMs: lastShiftEndedMs, declinedSince: declined });
    if (!t) return;
    const hm = new Date(t.atMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    setShiftAsk({ reason: `Your truck's telematics shows you on duty since ${hm}.`, atMs: t.atMs, source: "geotab", always: false, since: t.since });
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
  const lastHosLevel = useRef<Level | null>(null);
  const serverPushOn = useRef(false);
  useEffect(() => { void pushEnabledHere().then((v) => { serverPushOn.current = v; }); }, [notifyPerm]);
  useEffect(() => {
    if (hosLevel === null) return;
    if (shouldNotifyHosTrip(lastHosLevel.current, hosLevel) && hosVsTrip && !serverPushOn.current) {
      void showNotification(hosLevel === "bad" ? "Your hours won't cover this trip" : "Your hours are tight for this trip", hosVsTrip.text, "protankr-hos-trip");
    }
    lastHosLevel.current = hosLevel;
  }, [hosLevel]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const [fuelPending, setFuelPending] = useState(false);
  useEffect(() => {
    if (fuelPending && truckId) { setFuelPending(false); void tapFuel(); }
  }, [fuelPending, truckId]); // eslint-disable-line react-hooks/exhaustive-deps
  const tapFuel = async () => {
    // Fuel, scale or any other stop waits until the delivery you're at is finished.
    const openDrop = snap?.deliveries.find((d) => d.arrived_at && !d.left_at && d.status !== "complete" && d.status !== "cancelled");
    if (openDrop && !fuel.active) {
      setBlockNotice({ title: "Finish the delivery first", text: `You're at ${deliveryName(openDrop) ?? "the delivery"}. Finish the delivery (or undo the arrival if you haven't dropped yet) before you fuel.` });
      return;
    }
    // Fuel is per truck: with none held, pick one first (the stop starts once a truck is held).
    if (!fuel.active && !truckId) { setFuelPending(true); void askEquipment(() => {}); return; }
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
  // A back-dated arrival (the geofence saw the truck come to rest earlier) sets this for one call.
  const arriveAtRef = useRef<Date | null>(null);
  const clock = () => ({ now: arriveAtRef.current ?? new Date(), newId });

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

  // The truck's shipment numbers (BOLs) from the telematics app. Asked once when the Loaded sheet opens. Never polled.
  const [loadedGeoBols, setLoadedGeoBols] = useState<string[]>([]);
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

  const onFinishSubmit = async (v: FinishDeliverySubmit) => {
    if (!store || !userId || !companyId || !finishDeliveryRow || !openTrip) return;
    const tripId = openTrip.trip_id;
    const { tripComplete } = finishDelivery(store, {
      userId, companyId, trailerId, delivery: finishDeliveryRow, ...v, ...clock(),
    });
    clearDeliveryDraft(finishDeliveryRow.delivery_id);
    endDelay();
    setFinishOpen(false);
    const orderNo = children?.primaryOrder?.order_number;
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
  // ── Odometer stamp: cancel a load / end a shift ────────────────────────────
  // Where the truck is when the load is cancelled: the rack the driver is still at, else GPS (see useStampContext).
  const stampRack = useMemo(() => {
    if (stampAsk?.kind !== "cancel" || !snap) return null;
    const p = snap.pickups.find((x) => x.arrived_at && !x.left_at && x.outcome !== "no_load");
    if (!p) return null;
    const loc = locations.find((l) => l.place_kind === "terminal" && l.name.trim().toLowerCase() === String(p.name ?? "").trim().toLowerCase());
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
    if (ask.kind === "cancel") {
      setStampAsk(null);
      await onCancelSubmit({ ...ask.v, endMiles: odo });
      if (truckId) {
        emptyMoves.begin({ truckId, trailerId, kind: trailerId ? "empty_return" : "bobtail", from: { id: stampCtx.placeId, text: stampCtx.placeText }, to: { id: null, text: null }, beginMiles: odo, at: ask.v.cancelledAt || at, source: stampCtx.guess === odo ? "geotab" : "app" });
      }
      return;
    }
    // End shift: the shift record carries the same stamp, and an open move ends here.
    const startedAt = shift.current?.startedAt ?? null;
    if (userId && truckId) rememberLastEquipment(userId, { truckId, trailerId: trailerId ?? null }); // parking lets go of the truck; Begin Trip offers it again
    parkStampRef.current = { lat: stampCtx.lat, lon: stampCtx.lon, label: stampPlaceLabel, placeId: stampCtx.placeId };
    setStampAsk(null);
    shift.end({ odometer: odo, lat: stampCtx.lat, lon: stampCtx.lon, place_id: stampCtx.placeId, place_text: stampPlaceLabel, location_source: stampCtx.source, odometer_source: stampCtx.guess === odo ? "truck" : "typed" });
    const m = emptyMoves.current;
    if (m) emptyMoves.end(m.move_id, odo, { id: stampCtx.placeId, text: stampCtx.placeText }, at);
    void askTruckStatus(startedAt);
  };
  // An empty move ends where the next trip begins: its beginning miles and starting-from.
  useEffect(() => {
    const m = emptyMoves.current;
    if (!m || !openTrip?.started_at || Date.parse(openTrip.started_at) < Date.parse(m.started_at)) return;
    emptyMoves.end(m.move_id, openTrip.begin_miles ?? null, { id: null, text: [openTrip.start_city, openTrip.start_state].filter(Boolean).join(", ") || null }, openTrip.started_at);
  }, [emptyMoves.current?.move_id, openTrip?.trip_id, openTrip?.started_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // A terminal becomes one of the company's places the first time a driver arrives there (best effort; once per terminal per visit).
  const placedTerminals = useRef<Set<string>>(new Set());
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
    const m: Record<number, { product_id: string | null; gallons: number | null }> = {};
    for (const c of aboardRows) m[c.comp_number] = { product_id: c.product_id, gallons: c.gross_gallons != null ? Number(c.gross_gallons) : null };
    return m;
  }, [aboardRows]);
  // What the trailer last carried, for empty compartments (residue).
  const trailerHdr = useTrailerHeaderData([tripTrailerId], `${openTrip?.status ?? ""}|${aboardRows.length}`);
  const residue = (tripTrailerId ? trailerHdr.residue[tripTrailerId] : undefined) ?? {};
  const compCount = Object.keys(compSizes).length;
  // A compartment with nothing aboard that last held something is residue.
  const hasResidue = Object.keys(compSizes).map(Number).some((n) => !aboard[n] && !!residue[n]);
  // The trailer, full width like a header to its card; the gross (or Residue / Empty) goes under it.
  const trailerBar = compCount > 0 ? <TrailerHeader variant="side" trailerId={tripTrailerId} loaded={Object.fromEntries(Object.entries(aboard).map(([n, a]) => [Number(n), a.product_id]))} data={trailerHdr} /> : null;
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
  const [undoConfirm, setUndoConfirm] = useState(false);
  const undoable = snap ? undoableArrival(snap) : null;
  const undoName = undoable?.kind === "pickup" ? (undoable.pickup.name ?? "the terminal") : undoable?.kind === "delivery" ? "the store" : "";
  const doUndoArrival = () => {
    if (!store || !userId || !undoable) return;
    const id = undoable.kind === "pickup" ? undoable.pickup.pickup_id : undoable.delivery.delivery_id;
    try { localStorage.setItem(noAutoKey(id), "1"); } catch {}
    if (undoable.kind === "pickup") undoArrivePickup(store, { userId, pickup: undoable.pickup, now: new Date(), newId });
    else undoArriveDelivery(store, { userId, delivery: undoable.delivery, now: new Date(), newId });
    void syncNow();
    setUndoConfirm(false);
    setNotice({ text: "Arrival undone. Tap Arrive when you really get there.", tripId: null });
  };
  useDepartureWatch({ companyId: companyId || null, truckId, stopKey: atStop?.key ?? null, target: atStop?.target ?? null, enabled: !!atStop && autoStampOn });

  // Arrival is never stamped automatically: a truck inside a stop's fence may be fueling or waiting on a delay.
  // The driver is asked (the card below, or the duty-log stop card) and answers.

  const confirmDetectedArrival = () => {
    if (!arrival.suggest) return;
    arriveAtRef.current = new Date(arrival.suggest.sinceMs);
    try { onBigButton(); } finally { arriveAtRef.current = null; }
  };

  // Duty-log stops: the ELD's own time for "stopped driving", asked about once we can see it.
  const [handledStops, setHandledStops] = useState<Set<string>>(new Set());
  const { answers: stopAnswers, markApplied: markAnswerApplied } = useStopAnswers(userId);
  useEffect(() => { if (userId) setHandledStops(readHandledStops(userId)); }, [userId]);
  const [stopClock, setStopClock] = useState(() => Date.now());
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
  // "Did you arrive?" only when the truck is near the stop it is headed to: a pull-off at a scale house or a
  // rest stop is not an arrival. Checked once per stop; no position or no stop coordinates still asks.
  const [stopFar, setStopFar] = useState<Record<string, boolean>>({});
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
  const dutyStop = dutyStopRaw && !dutyStopRaw.answerId && stopFar[dutyStopRaw.at] === true ? null : dutyStopRaw;
  // A stop made while fueling was the fuel stop, not an arrival: it is never asked about afterwards.
  useEffect(() => {
    if (!fuel.active || !userId) return;
    for (const x of dropFuelStops(myHos?.stops ?? [], [{ started_at: fuel.active.started_at, completed_at: null }])) {
      if (!handledStops.has(x.at)) { markStopHandled(userId, x.at); setHandledStops((c) => new Set(c).add(x.at)); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuel.active?.id, myHos?.stops]);
  const hopRef = useRef<{ stop: { at: string; droveFrom?: string }; pickup: TripPickupRow; reason: string; productIds: string[]; skipReport?: boolean } | null>(null);
  // Name for the card: a store picked by name only (no saved location) has no geofence target but still gets asked.
  const stopName = arrivalTarget?.name ?? (step.kind === "arrive_delivery" ? deliveryName(step.delivery) : null);
  const [consigneeSignOpen, setConsigneeSignOpen] = useState(false);
  // First-use dashboard tour: once, when nothing else is on screen (setup screens, the plan builder).
  // /planner/home?tour=1 replays it.
  const [tourOpen, setTourOpen] = useState(false);
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
  const shiftPromptShown = drivingNow ? null : shift.prompt === "idle" && openTrip ? null : shift.prompt;
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
  const confirmDutyArrival = () => {
    if (!dutyStop) return;
    arriveAtRef.current = new Date(dutyStop.at);
    answerStop(dutyStop.at);
    try { onBigButton(); } finally { arriveAtRef.current = null; }
  };

  const onBigButton = () => {
    setNotice(null);
    if (!store || !userId) return;
    if (parkRequested) { setParkOpen(true); return; }
    switch (step.kind) {
      case "start":
        if (parked) {
          doResume();
          break;
        }
        askShiftStart("You tapped Begin Trip. Starting your shift keeps your hours right.", () => void askEquipment(() => askFuelFirst(() => {
          if (dispatchedList.length) { beginDispatchedLoad(); return; }
          setError(null);
          setSheetOpen(true);
        })), { always: true });
        break;
      case "planner":
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
                store.put("trip_pickups", { pickup_id: wp.pickup_id, rack_id: rackId ?? null });
              } else if (wp?.rack_id) {
                shell.location.setSelectedRackId(wp.rack_id);
              }
            } finally {
              void syncNow();
              // Plan Review opens right over this screen (the Planner host stays mounted in the layout). If there is
              // no plan, or it can't start, the host sends the driver to the Planner instead.
              shell.postPlannerIntent("begin");
            }
          })();
        }
        break;
      case "arrive_pickup": {
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
            shell.postPlannerIntent("begin");
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
        break;
      case "finish_delivery":
        setFinishOpen(true);
        break;
    }
  };

  // Arriving straight from the Planner's load report ("Arrived at Delivery"):
  // /planner/home?arrive=1 arrives the next delivery (the time is stamped,
  // nothing opens). With no delivery set yet, the picker opens first.
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
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [dropNowOpen, setDropNowOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  // Re-render every 30 s so the Break chip counts up between hours reads.
  const [, setBreakTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setBreakTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, []);
  // Truck / trailer alert squares: permits + service coming due.
  const truckAlerts = useUnitAlerts("truck", truckId, companyId, undefined, hookup?.engineHours ?? null);
  const trailerAlerts = useUnitAlerts("trailer", trailerId, companyId);
  const [unitAlertsOpen, setUnitAlertsOpen] = useState<"truck" | "trailer" | null>(null);
  useEffect(() => { setTruckSheetWatch(unitAlertsOpen === "truck"); }, [unitAlertsOpen]);
  const [expSheetOpen, setExpSheetOpen] = useState(false);
  const [loadsSheetOpen, setLoadsSheetOpen] = useState(false);
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
        state: o.arrived ? "delivering" : o.comps.length > 0 ? "enroute" : "loading", products: [], external: { comps: o.comps },
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
  const [handoffAcked, setHandoffAcked] = useState<string | null>(null);
  const handoffAlert = !!openTrip?.handoff_at && openTrip.driver_id === userId && handoffKey !== handoffAcked && (() => { try { return !localStorage.getItem(handoffKey!); } catch { return true; } })();
  const dismissHandoff = () => { try { if (handoffKey) localStorage.setItem(handoffKey, "1"); } catch { /* storage blocked */ } setHandoffAcked(handoffKey); };
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
  // Saved plans for the Begin Trip plan picker, read when the sheet opens.
  const [sheetPresets, setSheetPresets] = useState<PresetSummary[]>([]);
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
    const slot = getTripPlan(userId || null, openTrip.trip_id)?.slot ?? null;
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

  // The most recent load on this trip, for the Load Report link.
  const lastLoadId = [...pickups].filter((p) => p.load_id && (p.outcome === "loaded" || p.left_at)).sort((a, b) => b.seq - a.seq)[0]?.load_id ?? null;
  const canAddPickup = !!openTrip && openTrip.status !== "draft" && !!snap && !activePickup(snap.pickups) && !anyDelivered
    && step.kind !== "next_rack";
  const plannedCount = snap ? plannedDeliveries(snap.deliveries).length : 0;

  // The access strip shows on the dashboard while empty, or loaded but headed
  // to load more (an Add Pickup rack not left yet, or Next Rack). Otherwise it
  // lives in the Terminal sheet, under Switch Terminal.
  const headingToLoadMore = !!snap && (!!activePickup(snap.pickups) || step.kind === "next_rack");
  const accessCollapsed = false; // the strip always stays on the dashboard now
  const accessStrip = (
    <TerminalAccessStrip
      place={readinessLabel}
      summary={readiness}
      loading={terminals.termLoading}
      onOpenTerminal={openTerminalList}
      onOpenSteps={(tid) => openAccessSteps({ terminalId: tid })}
      onChangeCity={() => { shell.setHubAfterPick(true); shell.setLocOpen(true); }}
      otherCities={null}
    />
  );

  return (
    <DashLookProvider value={L}>
    <DashStyles />
    <div
      ref={setWrapEl}
      className="dash-wrap d2"
      style={{
        position: "relative", zIndex: 1, padding: "12px 16px 40px", color: "#fff",
        // DashboardCards read their surface from these.
        ["--dash-card-bg" as any]: L.secondary.background,
        ["--dash-card-border" as any]: L.secondary.border,
        ["--dash-card-radius" as any]: `${L.secondary.borderRadius}px`,
      }}
    >
      {/* Title with the dashboard switcher; the truck/trailer number under it in gray. */}
      <ConnectedDashHeader current="driver" line={equipmentLabel} />

      <ShiftBar shift={shift.current} prompt={shiftPromptShown} onEnd={requestEnd} onAckLong={shift.ackLong} onKeepGoing={shift.keepGoing} />

      <div className="d2-cols">
      <div className="d2-left">
      <div className="d2-o0">
      {/* Status squares: equipment due, and company trucks headed where I'm going (me included). */}
      <div style={{ marginBottom: 14 }}>
      <GaugePanel square top={0} cells={[
          { label: "Expiration", value: String(expTotal), color: expWorst ? EXPIRY_COLOR[expWorst] : LOOK.muted, onClick: () => setExpSheetOpen(true) },
          { label: "Loads", value: String(dispatchedList.length), color: dispatchedList.length > 0 ? "#93c5fd" : LOOK.muted,
            onClick: dispatchedList.length > 0 ? () => setLoadsSheetOpen(true) : undefined },
          { label: "To Rack", value: String(rackCount),
            color: countColor(rackCount), onClick: () => setRackSheetOpen(true) },
          { label: myDelivery?.delivery_type === "pump_off" ? "To Pump" : "To Drop", value: String(dropCount),
            color: countColor(dropCount), onClick: () => setDropNowOpen(true) },
        ]} />
      </div>
      </div>
      <div className="d2-o2">
      <div style={{ marginTop: 4, marginBottom: 14 }}>
      {/* Next step. Hidden while the "Did you arrive?" card is waiting for an answer. */}
      {!arriveCardPending && <button
        type="button"
        onClick={onBigButton}
        className="dash-press"
        {...busyProps(openingPlanner)}
        style={{
          width: "100%", padding: "20px 0", fontSize: 20, fontWeight: 800, cursor: "pointer", ...L.cta,
        }}
      >
        {openingPlanner ? busyText(true, "Opening Planner…") : parkRequested ? "Park it" : parked && step.kind === "start"
          ? (parked.driver_id === userId ? "Resume Trip" : "Take Over Trip")
          : dispatchedList.length && step.kind === "start" ? "Begin Dispatch"
          : step.label}
      </button>}
      {step.kind !== "start" && !openingPlanner && !arriveCardPending && (
        <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 6 }}>{parkRequested ? "Dispatch asked you to park this load" : step.detail}</div>
      )}
      {sigDelivery && !openingPlanner && (
        <button type="button" className="dash-press" onClick={() => setConsigneeSignOpen(true)}
          style={{ width: "100%", marginTop: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", background: "transparent", color: sigDelivery.consignee_signature ? "#4ade80" : "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 }}>
          {sigDelivery.consignee_signature ? `✓ Consignee signed${sigDelivery.consignee_name ? ` · ${sigDelivery.consignee_name}` : ""}` : "Get consignee signature"}
        </button>
      )}
      {(delayLeg || canCancelNow) && !openingPlanner && (
        <DelayButton leg={delayLeg ? runningDelay?.leg ?? delayLeg : null} running={runningDelay} onStart={startDelay} onEnd={() => endDelay()}
          onCancel={canCancelNow ? () => { setCancelErr(null); setCancelOpen(true); } : undefined}
          rackActions={canNoLoad ? { onAnotherRack: () => { setNoLoadErr(null); setNoLoadOpen(true); } } : undefined} />
      )}
      {gaugingAsk && <GaugingAskSheet terminalId={gaugingAsk.id} terminalName={gaugingAsk.name} onClose={() => setGaugingAsk(null)} />}
      {undoable && !openingPlanner && (
        <div style={{ textAlign: "center", fontSize: 13, marginTop: 8 }}>
          {!undoConfirm ? (
            <button type="button" onClick={() => setUndoConfirm(true)} style={{ background: "none", border: "none", color: muted, textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>
              Tapped Arrive by mistake? Undo
            </button>
          ) : (
            <div>
              <div style={{ color: "#fff", marginBottom: 6 }}>Undo arrival at {undoName}?</div>
              <button type="button" onClick={doUndoArrival} style={{ padding: "8px 16px", fontWeight: 700, cursor: "pointer", background: "#fff", color: "#000", border: "none", borderRadius: 2, marginRight: 8 }}>Undo arrival</button>
              <button type="button" onClick={() => setUndoConfirm(false)} style={{ padding: "8px 16px", cursor: "pointer", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 }}>Keep</button>
            </div>
          )}
        </div>
      )}
      </div>
      </div>
      <div className="d2-o4">
      {/* Tools. Left: the things on the cards above, top to bottom. Right: records. */}
      <SectionLabel>Tools</SectionLabel>
      {(() => {
        // Six tiles. Tiles with a list open a pop-out of smaller tools; the Reports tile holds every form.
        const A = {
          truckDown: { icon: "truck" as const, label: "Truck down", sub: "Request a repair", onClick: () => setRepairOpen(true) },
          inspect: { icon: "plan" as const, label: "Inspect", sub: "Truck or trailer", onClick: () => setInspectOpen(true) },
          tankCheck: { icon: "plan" as const, label: "Tank check", sub: "Store tank readings", onClick: () => setTankCheckOpen(true) },
          termWork: { icon: "terminal" as const, label: "Terminal work", sub: termWork.current ? `Running ${workClock(workMinutes(termWork.current, Date.now()))}` : "Timer", subColor: termWork.current ? "#fbbf24" : undefined, onClick: () => setTermWorkOpen(true) },
          emptyMove: { icon: "locate" as const, label: "Empty move", sub: emptyMoves.current ? "In progress" : "Bobtail, repo", subColor: emptyMoves.current ? "#fbbf24" : undefined, onClick: () => setMoveOpen(true) },
          freight: { icon: "truck" as const, label: "Freight", sub: freight.loads.some((l) => l.status === "open") ? "Load open" : "Van, flatbed, LTS", subColor: freight.loads.some((l) => l.status === "open") ? "#4ade80" : undefined, onClick: () => setFreightOpen(true) },
        };
        const tankCheckItems = shell.isSolo === false ? [A.tankCheck] : [];
        const fleetWorkSub = openSafety ? "Sign in needed" : null;
        const tools: ToolItem[] = [
          { icon: "fuel", label: "Fuel", sub: fuel.active ? "In progress" : null, subColor: fuel.active ? "#fbbf24" : undefined, onClick: () => void tapFuel() },
          { icon: "plan", label: "Planner", sub: "Set up load plans", onClick: () => nav.go("plan", "/planner?plan=1"), busy: nav.is("plan") },
          { icon: "truck", label: "Equipment", sub: equipmentLabel, subColor: undefined, onClick: openEquipment, group: [
            { icon: "truck", label: "Equipment", sub: equipmentLabel, onClick: openEquipment },
            A.truckDown, A.inspect,
          ] },
          { icon: "store", label: "Location", sub: null, group: [
            locationsTool(() => setManageLocsOpen(true)),
            ...tankCheckItems, A.termWork,
          ] },
          { icon: "route", label: "Trips", sub: openTrip ? "Trip in progress" : null, subColor: openTrip ? "#4ade80" : undefined, group: [
            { icon: "route", label: "Trips & PTDs", sub: openTrip ? "Trip in progress" : "History & PTDs", onClick: () => nav.go("trips", "/planner/trips"), busy: nav.is("trips") },
            A.emptyMove, A.freight,
          ] },
          { icon: "chart", label: "Reports", sub: fleetWorkSub, subColor: openSafety ? "#fbbf24" : lanternfly.missing.length ? "#fbbf24" : undefined, group: [
            { icon: "chart", label: "Reports & history", sub: "Loads, history, fuel", onClick: () => nav.go("reports", "/planner/reports"), busy: nav.is("reports") },
            { icon: "plan", label: "Document hub", sub: "Submit a document", onClick: () => setDocOpen(true) },
            { icon: "plan", label: "Paper log", sub: "ELD down or on paper", onClick: () => setPaperLogOpen(true) },
            { icon: "people", label: "Safety meeting", sub: openSafety ? "Sign in needed" : safety.meetings.length ? "Upcoming" : null, subColor: openSafety ? "#fbbf24" : undefined, onClick: () => setSafetyOpen(true) },
            { icon: "locate", label: "Per diem", sub: "Days away from home", onClick: () => setPerDiemOpen(true) },
            { icon: "locate", label: "Down time", sub: "Photo, no timer", onClick: () => setDownTimeOpen(true) },
            { icon: "locate", label: "Lanternfly", sub: lanternfly.missing.length ? `${lanternfly.missing.length} to attest` : lanternfly.attested.length ? "Attested" : null, subColor: lanternfly.missing.length ? "#fbbf24" : undefined, onClick: () => setSlfOpen(true) },
            ...tankCheckItems, A.termWork, A.truckDown, A.inspect,
          ] },
        ];
        // Track is its own tile, for admin and dispatch only (not on a driver's board).
        if (shell.role === "admin" || shell.role === "dispatch" || shell.isSuperAdmin) {
          tools.push({ icon: "locate", label: "Track", sub: "Equipment & drivers", onClick: () => setFindTruckOpen(true) });
        }
        return <ToolPanel items={tools} />;
      })()}
      <ConnectedDashFooter onShift={() => setShiftOpen(true)} />
      </div>
      </div>
      <div className="d2-right">
      <div className="d2-o1">
      {myHos && (myHos.driveLeftMin != null || myHos.dutyLeftMin != null) && (() => {
        const least = Math.min(myHos.driveLeftMin ?? Infinity, myHos.dutyLeftMin ?? Infinity);
        // Geotab gives time left; the chips show time used (limit minus left), colored by what is left.
        const clock = (label: string, left: number | null | undefined, limit: number) => ({
          label, value: left == null ? "—" : clockHM(Math.max(0, limit - left)), color: clockColor(left ?? null), onClick: () => setRecapOpen(true),
        });
        // Break: loading and pumping count toward it. Every stop is timed. A break finished after about three hours of
        // driving keeps its check for the rest of the shift; an earlier one shows it only while stopped and resets when
        // driving starts (see lib/telematics/breakChip.ts). Red if a new trip was begun before it finished.
        const restMin = myHos.nonDrivingSince ? Math.max(0, Math.floor((Date.now() - Date.parse(myHos.nonDrivingSince)) / 60000)) : null;
        const breakState = breakChip({ driveLeftMin: myHos.driveLeftMin, breakLeftMin: myHos.breakLeftMin, restMin });
        // Off duty: after about an hour the check mark becomes a count-up toward the 10 hours off that
        // reset the driving and working clocks, and turns into a check again at 10:00.
        const offMin = myHos.offSince ? Math.max(0, Math.floor((Date.now() - Date.parse(myHos.offSince)) / 60000)) : null;
        const breakCell = offMin != null && offMin >= 600
          ? { label: "Reset", value: "✓", color: "#22c55e", onClick: () => setRecapOpen(true) }
          : offMin != null && offMin >= 60
          ? { label: "Off / 10:00", value: `${Math.floor(offMin / 60)}:${String(offMin % 60).padStart(2, "0")}`, color: "#fff", onClick: () => setRecapOpen(true) }
          : breakState === "done" || breakState === "rested"
          ? { label: "Break", value: "✓", color: "#22c55e", onClick: () => setRecapOpen(true) } // "done" stays for the shift; "rested" only while stopped
          : breakState === "timer"
          ? { label: "Break", value: `${restMin}m`, color: breakCountsRed ? "#f87171" : "#fff", onClick: () => setRecapOpen(true) }
          : { label: "Break", value: "0m", color: "#fff", onClick: () => setRecapOpen(true) }; // nothing to time yet
        return (
          <div style={{ marginBottom: 14 }}>
            <GaugePanel square top={0} labelBelow cells={[
              breakCell,
              clock("Driving", myHos.driveLeftMin, 11 * 60),
              clock("Working", myHos.dutyLeftMin, 14 * 60),
              clock("Cycle", myHos.cycleLeftMin, CYCLE_LIMIT_MIN),
            ]} />
            <HosRecapModal open={recapOpen} hos={myHos} onClose={() => setRecapOpen(false)} />
            {hosVsTrip && (
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: hosVsTrip.level === "bad" ? "#f87171" : "#fb923c" }}>
                {hosVsTrip.level === "bad" ? "⚠ " : ""}{hosVsTrip.text}
              </div>
            )}
            {notifyPerm === "default" && (
              <button type="button" onClick={() => void enablePush(companyId || "").then((r) => { setNotifyPerm(notifyPermission()); if (!r.ok && r.reason) setNotice({ text: r.reason, tripId: null }); })} style={{ marginTop: 8, background: "none", border: "none", color: "#93c5fd", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                Turn on alerts for low hours ›
              </button>
            )}
            {!hosVsTrip && least < 60 && (
              <div style={{ fontSize: 12, marginTop: 8, color: clockColor(least) }}>Under an hour left on a clock. Plan where you'll park.</div>
            )}
          </div>
        );
      })()}
      {/* Just above the trip card: Edit trip on the left, the order and PTD on the right. */}
      {openTrip && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "6px 0 12px" }}>
          {/* Always available (the supplier, order numbers and planned stops can change mid-trip). Stops already
              arrived at, loaded or finished are kept as they are when the trip is saved. */}
          <button type="button" onClick={() => { setError(null); setSheetOpen(true); }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: LOOK.muted, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            Edit trip
          </button>
          <button type="button" onClick={() => nav.go("ptd", `/planner/trips/${openTrip.trip_id}`)} {...busyProps(nav.is("ptd"))} aria-label="Open the PTD"
            className="dash-num"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 18, fontWeight: 700, color: LOOK.muted, display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 12, letterSpacing: 0.5, display: "inline-flex", alignItems: "center", gap: 6 }}>PTD {nav.is("ptd") ? <Spinner size={10} /> : "›"}</span>
            <span>{children?.primaryOrder?.order_number ?? "No order #"}</span>
          </button>
        </div>
      )}
      <SectionLabel desktopOnly first>Trip</SectionLabel>

      {!openTrip && <DispatchedCard items={dispatchedItems.slice(0, 1)} />}

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
          {trailerBar && <div style={{ marginBottom: 8 }}>{trailerBar}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Current trip · {STATUS_LABEL[openTrip.status]}
            </div>
            {trailerLabel && <span style={{ marginLeft: "auto" }}>{trailerLabel}</span>}
          </div>
          {(openTrip.shipper || openTrip.customer) && (
            <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
              {[openTrip.shipper, openTrip.customer].filter(Boolean).join(" → ")}
            </div>
          )}
          {planLine && (
            <div className="dash-num" style={{ fontSize: 13, marginTop: 2, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800 }}>{planLine.label}</span>
              <span style={{ color: muted }}>-</span>
              <span>
                {planLine.comps.map((id, i) => {
                  const info = id ? productInfo(id) : null;
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && <span style={{ color: muted }}>/</span>}
                      <span style={{ fontWeight: 800, color: info ? info.hex ?? productColorFor(info.name) : muted }}>{info ? info.code : "–"}</span>
                    </React.Fragment>
                  );
                })}
              </span>
            </div>
          )}

          {(() => {
            // A rack the driver left without loading is a rack hop, not a
            // second pickup: show it as "Tried", and number only real pickups.
            const real = pickups.filter((p) => p.outcome !== "no_load");
            const current = snap ? activePickup(snap.pickups) : null;
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
                </div>
              );
            });
          })()}
          {/* The trailer on one line, between pickup and delivery: product
              colors when loaded (C1 on the right, like the Planner), residue
              dots for what it last carried when empty. */}
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
              <button type="button" onClick={() => { setOpeningReport(true); shell.postPlannerIntent("report", lastLoadId); }} {...busyProps(openingReport)} style={{ ...smallLink, display: "inline-flex", alignItems: "center", gap: 6 }}>Load Report {openingReport ? <Spinner size={11} /> : "›"}</button>
            )}
            {canAddPickup && pickups.some((p) => p.outcome === "loaded" || (!!p.left_at && !!p.load_id)) && (
              <button type="button" onClick={openAddPickup} style={smallLink}>+ Another pickup</button>
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
          {trailerBar && <div style={{ marginBottom: 8 }}>{trailerBar}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>No trip in progress</div>
            {trailerLabel}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>Start a load when you have an order.</div>
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


      {hookup?.trailerId && hookup.trailerId !== hookupOkId && hookup.trailerId !== (trailerId ?? null) && (
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
            <button type="button" onClick={() => { const id = hookup?.trailerId ?? null; setHookupOkId(id); try { if (hookupKey && id) localStorage.setItem(hookupKey, id); } catch { /* private mode: it may ask again */ } }} style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 }}>
              It's right
            </button>
          </div>
        </div>
      )}

      {arrival.suggest && arrivalTarget && !autoBlocked && (
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

      {dutyStop && !arrival.suggest && (stopName || hopPickup) && delayLeg && (
        <DutyStopCard stop={dutyStop} targetName={stopName ?? "the stop"} leg={delayLeg}
          hop={hopPickup ? { rackName: hopPickup.name ?? "the rack" } : null}
          preset={dutyStop.answer} presetReason={dutyStop.reason} reportPosted={dutyStop.reported} onArrived={confirmDutyArrival} products={plannedProducts} onHop={hopToAnotherRack} onDelay={logDutyDelay} onDismiss={() => answerStop(dutyStop.at)} />
      )}

      {handoffAlert && !openingPlanner && (
        <div style={{ ...card, marginTop: 4, marginBottom: 10, borderColor: "rgba(96,165,250,0.6)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#93c5fd" }}>Trailer is preloaded</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>You took over this load. Deliver it and tap Arrive at the stop.</div>
          <div style={{ marginTop: 6 }}>{onBoardLines(snap?.compLoads).map((l) => <div key={l} style={{ fontSize: 14 }}>{l}</div>)}</div>
          <button type="button" onClick={dismissHandoff} style={{ ...smallLink, marginTop: 8 }}>Got it</button>
        </div>
      )}
      {parkRequested && !openingPlanner && (
        <div style={{ ...card, marginTop: 4, marginBottom: 10, borderColor: "rgba(96,165,250,0.6)" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#93c5fd" }}>Dispatch</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Park this load. Tap Park it to say where.</div>
        </div>
      )}
      </div>
      <div className="d2-o3">
      {sigDelivery && (
        <ConsigneeSignSheet key={`${sigDelivery.delivery_id}:${consigneeSignOpen}`} open={consigneeSignOpen}
          initialName={sigDelivery.consignee_name ?? ""} initialSig={sigDelivery.consignee_signature ?? null}
          onClose={() => setConsigneeSignOpen(false)}
          onSave={(name, sig) => { store?.put("trip_deliveries", { delivery_id: sigDelivery.delivery_id, consignee_name: name, consignee_signature: sig }); void syncNow(); setConsigneeSignOpen(false); }}
          onClear={() => { store?.put("trip_deliveries", { delivery_id: sigDelivery.delivery_id, consignee_name: null, consignee_signature: null }); void syncNow(); setConsigneeSignOpen(false); }} />
      )}

      <DashboardTour open={tourOpen} onClose={() => { setTourOpen(false); markDashTourSeen(userId || null); }} />

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
        const showExp = false;
        const showSync = pendingCount > 0 || failed.length > 0;
        const showFuel = !!fuel.active;
        const showSetup = !!setup.summary && !setup.summary.complete;
        if (!showGross && !showExp && !showSync && !showFuel && !showSetup) return null;
        return (
          <div style={{ ...L.secondary, marginTop: 14, overflow: "hidden" }}>
            {showSetup && (
              <InfoRow
                label="Finish setup"
                value={`${counterText(setup.summary!)}${setup.summary!.requiredLeft ? ` · ${setup.summary!.requiredLeft} required` : ""}`}
                valueColor={setup.summary!.requiredLeft ? "#f87171" : "#fbbf24"}
                onClick={() => nav.go("setup", "/planner/setup")}
                last={!showGross && !showExp && !showSync && !showFuel}
              />
            )}
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
      {/* Readouts: terminal status and recent deliveries always; the rest
          only when there's something to show. */}
      {/* Terminal: right-now status of the selected terminal + who's headed
          there, with a switch button. Opened from the Terminal tool and the
          To Rack gauge. */}

      <ExpirationsSheet open={expSheetOpen} groups={expGroups} onClose={() => setExpSheetOpen(false)} />
      <LoadsSheet open={loadsSheetOpen} items={dispatchedItems} onClose={() => setLoadsSheetOpen(false)}
        onRun={openTrip ? undefined : (id) => { setLoadsSheetOpen(false); void askEquipment(() => beginDispatchedLoad(id)); }} />
      <FullscreenModal open={!!unitAlertsOpen} title={unitAlertsOpen === "trailer" ? "Trailer" : "Truck"} onClose={() => setUnitAlertsOpen(null)} footer={null}>
        {(() => {
          const s = unitAlertsOpen === "trailer" ? trailerAlerts : truckAlerts;
          const live = unitAlertsOpen === "truck" ? (truckReading ?? hookup) : null;
          const stat = (label: string, v: string | null) => v == null ? null : (
            <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
              <div className="dash-num" style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted, marginTop: 3 }}>{label}</div>
            </div>
          );
          return (
            <>
              {live && (live.odometerMi != null || live.engineHours != null || live.fuelLevelPct != null) && (
                <div style={{ ...card, marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {stat("Odometer", live.odometerMi != null ? `${Math.round(live.odometerMi).toLocaleString("en-US")} mi` : null)}
                    {stat("Engine hours", live.engineHours != null ? `${Math.round(live.engineHours).toLocaleString("en-US")} h` : null)}
                    {stat("Fuel", live.fuelLevelPct != null ? `${Math.round(live.fuelLevelPct)}%` : null)}
                  </div>
                  <div style={{ fontSize: 11, color: muted, textAlign: "center", marginTop: 8 }}>
                    From the truck{live.city ? ` · near ${[live.city, live.state].filter(Boolean).join(", ")}` : ""}
                  </div>
                </div>
              )}
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
      <FullscreenModal open={rackSheetOpen} title={rackCity ? `${rackName} · ${rackCity}` : rackName} onClose={() => setRackSheetOpen(false)} footer={null}>
        {(() => {
          const hair = "rgba(255,255,255,0.12)";
          const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
          const panel: React.CSSProperties = { background: "#0f0f10", border: `1px solid ${hair}` };
          const label = (t: string, right?: React.ReactNode) => (
            <div style={{ display: "flex", alignItems: "baseline", margin: "18px 0 8px", paddingBottom: 6, borderBottom: `1px solid ${hair}` }}><span style={{ ...cap, flex: 1 }}>{t}</span>{right}</div>
          );
          return (
            <>
              <SiteBoard kind="terminal" id={rackTerminalId ?? ""} name={rackName} hideName trips={fleet.trips} product={productInfo} now={new Date()}
                etaFor={() => null} canOpen={(tid) => fleet.trips.some((f) => f.trip.trip_id === tid && f.trip.driver_id === userId)}
                onOpenTrip={(tid) => { setRackSheetOpen(false); nav.go(`trip:${tid}`, `/planner/trips/${tid}`); }} />
              {label("Products", rackStatus.rackName ? <span style={{ ...cap, color: "rgba(255,255,255,0.4)" }}>{rackStatus.rackName}</span> : null)}
              <div style={panel}>
                {rackStatus.products.length === 0 ? <div style={{ padding: "11px 14px", color: muted, fontSize: 14 }}>No products on file for this rack.</div> : rackStatus.products.map((p, i) => (
                  <div key={p.productId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 10px 0", borderTop: i ? `1px solid ${hair}` : "none", opacity: p.isOut ? 0.55 : 1 }}>
                    <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: p.hex ?? "#fff", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: p.isOut ? "line-through" : undefined }}>{p.name}</span>
                    {p.isOut && <span style={{ ...cap, color: "#f87171" }}>Out</span>}
                    <span className="dash-num" style={{ fontSize: 13, fontWeight: 700, color: p.lastApi != null ? "#fff" : muted }}>{p.lastApi != null ? p.lastApi.toFixed(1) : "—"}</span>
                    <span className="dash-num" style={{ fontSize: 13, color: muted, width: 44, textAlign: "right" }}>{p.lastTempF != null ? `${p.lastTempF.toFixed(0)}°F` : "—"}</span>
                  </div>
                ))}
              </div>
              {rackTerminalId && <button type="button" className="dash-press" onClick={() => setRackStudOpen(true)} style={{ width: "100%", marginTop: 12, padding: "15px 0", fontSize: 15, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer" }}>STUD</button>}
            </>
          );
        })()}
      </FullscreenModal>
      {rackTerminalId && (
        <TerminalStatusSheet
          open={rackStudOpen} onClose={() => setRackStudOpen(false)} terminalId={rackTerminalId} terminalName={rackName}
          rackId={rackStatus.rackId} rackName={rackStatus.rackCount > 1 ? rackStatus.rackName : null}
          products={rackStatus.products} reports={rackAlerts.reports} companyId={companyId} userId={userId}
          truckLabel={equipment.currentTruckName ?? ""}
          onChanged={() => { void rackStatus.reload(); rackAlerts.refresh(); }}
        />
      )}
      <FullscreenModal open={dropNowOpen} title={selectedLoc ? locationTitle(selectedLoc) : "Delivery"} onClose={() => setDropNowOpen(false)} footer={null}>
        {selectedLoc ? (
          <SiteBoard kind="location" id={selectedLoc.location_id} name={locationTitle(selectedLoc)} hideName trips={fleet.trips} product={productInfo} now={new Date()}
            etaFor={() => null} canOpen={(tid) => fleet.trips.some((f) => f.trip.trip_id === tid && f.trip.driver_id === userId)}
            onOpenTrip={(tid) => { setDropNowOpen(false); nav.go(`trip:${tid}`, `/planner/trips/${tid}`); }} />
        ) : (
          <button type="button" onClick={() => { setDropNowOpen(false); setPicker({ mode: "select" }); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: 14, background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, cursor: "pointer" }}>
            No delivery location selected. Pick one ›
          </button>
        )}
      </FullscreenModal>
      <ParkedPreloadsCard items={nearbyParked} productInfo={productInfo} onOpenTrip={(id) => nav.go(`trip:${id}`, `/planner/trips/${id}`)} openingId={nav.openingId("trip")} />
      <TerminalOutageDetailModal
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        reports={terminalAlerts.reports}
        timeZone={terminalAlerts.timeZone}
        onCleared={terminalAlerts.refresh}
      />

      <FullscreenModal open={!!blockNotice} title={blockNotice?.title ?? ""} onClose={() => setBlockNotice(null)} footer={null}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.45 }}>{blockNotice?.text}</div>
        <button type="button" className="dash-press" style={{ width: "100%", marginTop: 16, padding: "14px 0", fontSize: 15, fontWeight: 800, ...L.cta }}
          onClick={() => setBlockNotice(null)}>OK</button>
      </FullscreenModal>
      <FullscreenModal open={!!fuelAsk} title="Done fueling?" onClose={() => setFuelAsk(null)} footer={null}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.45 }}>
          You have a fuel stop open{fuel.active?.started_at ? `, started ${new Date(fuel.active.started_at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}. The fueling time needs to end before the trip begins.
        </div>
        <button type="button" className="dash-press" style={{ width: "100%", marginTop: 16, padding: "14px 0", fontSize: 15, fontWeight: 800, ...L.cta }}
          onClick={() => {
            const go = fuelAsk; const a = fuel.active;
            setFuelAsk(null);
            if (a) void fuel.save({ ...a, finished_at: new Date().toISOString(), status: a.status === "fueling" || a.status === "pumping" ? "details" : a.status });
            go?.();
          }}>Yes, I'm done fueling</button>
        <button type="button" className="dash-press" style={{ width: "100%", marginTop: 10, padding: "14px 0", fontSize: 15, fontWeight: 800, ...L.secondary }}
          onClick={() => { setFuelAsk(null); setFuelOpen(true); }}>Still fueling</button>
        <button type="button" className="dash-press" style={{ width: "100%", marginTop: 10, padding: "12px 0", fontSize: 13, fontWeight: 700, background: "transparent", border: "none", color: "#f87171", cursor: "pointer" }}
          onClick={() => { const go = fuelAsk; setFuelAsk(null); void fuel.discard(); go?.(); }}>Cancel the fuel stop</button>
      </FullscreenModal>
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

      <ExplanationSheet open={explainOpen} hours={shift.current?.hours ?? 0} reasons={reasonsOrDefault(reasons as any, "shift_explanation")} onClose={() => setExplainOpen(false)}
        onSubmit={(pick) => { shift.explain({ ...explanationPayload(pick, shift.current?.hours ?? 0) }); finishShift(); setExplainOpen(false); }}
        onSkip={() => { finishShift(); setExplainOpen(false); }} />
      <EquipmentConfirmSheet open={!!equipAsk && !equipSwitching}
        choices={(equipAsk?.cands ?? []).map((c): EquipChoice => ({
          key: c.key, truckName: c.truckName, trailerName: c.trailerName, hasTrailer: !!c.trailerId,
          lat: c.pin?.lat ?? null, lon: c.pin?.lon ?? null, label: c.pin?.label ?? null,
          status: c.status ? (fleetStatusLabel(c.status) || null) : null,
          parkedBy: c.pin?.parkedBy === userId ? "you" : c.pin?.parkedBy ? initialsOf(roster.members.find((m) => m.user_id === c.pin!.parkedBy)?.display_name) || null : null,
          distanceMi: c.distanceMi, isLast: c.isLast, inUse: c.state.kind === "in_use",
          holderName: c.state.holderId ? roster.members.find((m) => m.user_id === c.state.holderId)?.display_name ?? null : null,
        }))}
        selectedKey={equipSel} onSelect={setEquipSel}
        busy={equipBusy} error={equipErr}
        onConfirm={() => void confirmEquipment()}
        onFind={() => { setEquipErr(null); setEquipSwitching(true); shell.setEquipOpen(true); }}
        onClose={() => { if (!equipBusy) setEquipAsk(null); }} />
      <OdometerConfirmSheet open={!!stampAsk && !!truckId}
        title={stampAsk?.kind === "shift" ? "End shift" : "Load cancelled"}
        lead={stampAsk?.kind === "shift" ? "Confirm the truck's odometer to end your shift." : "Confirm the truck's odometer. The empty run starts here."}
        placeLabel={stampPlaceLabel} loading={stampCtx.loading} guess={stampCtx.guess} floor={stampFloor}
        onConfirm={(n) => void confirmStamp(n)} onBack={() => setStampAsk(null)} />
      <EmptyMoveSheet open={moveOpen} onClose={() => setMoveOpen(false)} truck={truckId ? { id: truckId, name: equipment.currentTruckName ?? equipmentLabel ?? "Truck" } : null}
        hasTrailer={!!trailerId} liveOdometer={truckReading?.odometerMi ?? null} current={emptyMoves.current} recent={emptyMoves.moves}
        locations={locations} tanks={locList.tanks} origin={origin} companyId={companyId} userId={userId}
        onBegin={(a) => emptyMoves.begin({ truckId, trailerId, ...a })} onEnd={emptyMoves.end} onDiscard={emptyMoves.discard} onLocationAdded={() => void locList.reload()} />
      <FreightSheet open={freightOpen} onClose={() => setFreightOpen(false)} companyId={companyId} userId={userId}
        truck={truckId ? { id: truckId, name: equipment.currentTruckName ?? equipmentLabel ?? "Truck" } : null}
        coupledTrailer={equipment.currentTrailerId ? { id: equipment.currentTrailerId, name: equipment.currentTrailerName ?? "Trailer" } : null}
        liveOdometer={truckReading?.odometerMi ?? null} loads={freight.loads} stopsOf={freight.stopsOf}
        onBegin={freight.begin} onDeliver={freight.deliver} onEndEmpty={freight.endEmpty} onCancel={freight.cancel} />
      <TankCheckSheet open={tankCheckOpen} onClose={() => setTankCheckOpen(false)} locations={locations} tanks={locList.tanks} productName={(id) => productInfo(id).name} origin={origin} companyId={companyId} userId={userId} onLocationAdded={() => void locList.reload()}
        onSave={(a) => tankChecks.saveCheck({ locationId: a.locationId, locationName: a.locationName, truckId: equipment.currentTruckId ?? null, entries: a.entries, productOf: a.productOf, paths: a.paths, note: a.note })} />
      <LanternflySheet open={slfOpen} onClose={() => setSlfOpen(false)} missing={lanternfly.missing} attested={lanternfly.attested} hasTrip={!!openTrip} hasZone={lanternfly.hasZone} onAttest={lanternfly.attest} />
      <SafetyMeetingSheet open={safetyOpen} onClose={() => setSafetyOpen(false)} meetings={safety.meetings} signed={safety.signed} loading={safety.loading} onSign={async (m, path) => {
        const err = await safety.sign(m, path);
        // Signing in is on-duty time: leave a shift event for the timeline (the work log counts it from the signature).
        if (!err && companyId && userId) recordShiftEvent(getTripStore(userId), { companyId, userId, actorId: userId, type: SAFETY_MEETING_EVENT, payload: { meeting_id: m.meeting_id, title: m.title, started_at: m.started_at, ended_at: m.ended_at, on_duty: true } });
        return err;
      }} onMaterial={(p) => void safety.openMaterial(p)} />
      <TerminalWorkSheet open={termWorkOpen} onClose={() => setTermWorkOpen(false)} current={termWork.current} defaults={termWork.defaults}
        defaultTerminalId={location.selectedTerminalId ? String(location.selectedTerminalId) : null}
        terminals={(terminals.terminals ?? []).map((t: any) => ({ value: String(t.terminal_id), label: [t.terminal_name, t.city].filter(Boolean).join(", ") }))}
        products={products.map((x: any) => ({ value: String(x.product_id), label: String(x.display_name || x.product_name || "Product") }))}
        onStart={termWork.start} onStop={termWork.stop} />
      <ShiftStartConfirm open={!!shiftAsk} reason={shiftAsk?.reason ?? ""} atMs={shiftAsk?.atMs ?? Date.now()} nowMs={Date.now()} skipLabel={shiftAsk?.always ? "Continue without a shift" : "Not now"} onConfirm={confirmShiftStart} onSkip={skipShiftStart} />
      {endAsk && truckId && companyId && (
        <EquipmentStatusModal open onClose={() => setEndAsk(null)} companyId={companyId} unitKind="truck" unitId={truckId} unitName={endAsk.name}
          currentStatus={endAsk.status} currentNotes={endAsk.notes} currentSubStatus={endAsk.sub} homeLocalArea={endAsk.area}
          allowed={endAsk.sleeper ? ["in_use", "deadline", "readyline"] : ["deadline", "readyline"]}
          onParkPreloaded={endAsk.loaded ? () => { setEndAsk(null); setParkOpen(true); } : undefined}
          presetRegion={parkPreset?.region ?? null} presetLocalArea={parkPreset?.local_area ?? null}
          presetPin={parkStampRef.current?.lat != null && parkStampRef.current?.lon != null ? { lat: parkStampRef.current.lat, lon: parkStampRef.current.lon, label: parkStampRef.current.label, placeId: parkStampRef.current.placeId } : null}
          locationOptional={!!parkStampRef.current?.lat}
          onSaved={(s: FleetStatus) => {
            setEndAsk(null);
            void equipment.fetchCombos?.();
            parkStampRef.current = null; // the status window writes the pin itself
          }} />
      )}
      <ShiftSheet open={shiftOpen} onClose={() => setShiftOpen(false)} scheduled={shiftRecapData.scheduled} running={!!shift.current} recap={shiftRecapData.recap} periodLabel={shiftRecapData.periodLabel}
        onStart={() => shift.start()} onEnd={() => { setShiftOpen(false); requestEnd(); }}
        onCallout={() => { setShiftOpen(false); setCalloutOpen(true); }} onSignOut={() => void dashIdentity.signOut()} />
      <CalloutSheet open={calloutOpen} onClose={() => setCalloutOpen(false)} reasons={reasonsOrDefault(reasons as any, "callout")} divisions={callouts.divisions} defaultDivision={callouts.profile.division} tz={callouts.tz} mine={callouts.mine}
        onWithdraw={callouts.withdraw}
        onCreate={async (v) => {
          const r = await callouts.create({ reason: v.reason, reasonId: v.reasonId, note: v.note, date: v.date, time: v.time }, v.category, v.division);
          return r === "sent" ? "Dispatch and your manager were emailed. You can withdraw it until your shift starts." : r === "waiting" ? "Saved. The email will go when you have signal." : "Saved, but no email is set up for your area yet. Tell dispatch.";
        }} />
      <PerDiemSheet open={perDiemOpen} onClose={() => setPerDiemOpen(false)} home={perDiem.home} cards={perDiem.cards} loading={perDiem.loading} onSaveHome={perDiem.saveHome} onClaim={perDiem.claim} onWithdraw={perDiem.withdraw} />
      <InspectionSheet open={inspectOpen} onClose={() => setInspectOpen(false)} units={repairUnits} campaignsFor={openCampaigns.campaignsFor} companyId={companyId} userId={userId} onSubmit={submitInspection} />
      <RepairSheet open={repairOpen} onClose={() => setRepairOpen(false)} units={repairUnits} onSend={sendRepairRequest} />
      <PaperLogSheet open={paperLogOpen} onClose={() => setPaperLogOpen(false)} companyId={companyId} userId={userId || null}
        reasons={reasonsOrDefault(reasons as any, "paper_log")}
        onDone={(pick, cap) => {
          if (companyId && userId) recordShiftEvent(getTripStore(userId), { companyId, userId, actorId: userId, type: PAPER_LOG_EVENT, payload: { ...paperLogPayload(pick, cap) } });
          setPaperLogOpen(false);
        }} />

      <DocumentSheet open={docOpen} onClose={() => setDocOpen(false)} companyId={companyId} userId={userId || null}
        onDone={(type, note, cap) => {
          if (companyId && userId) recordShiftEvent(getTripStore(userId), { companyId, userId, actorId: userId, type: DOCUMENT_EVENT, payload: { ...documentPayload(type, note, cap) } });
          setDocOpen(false);
        }} />
      {/* Down time is camera only: no approval, no timer, no form. */}
      <CaptureSheet open={downTimeOpen} purpose="down_time" title="Down time" companyId={companyId} userId={userId || null} refType="shift_event"
        onDone={(cap) => {
          if (companyId && userId) recordShiftEvent(getTripStore(userId), { companyId, userId, actorId: userId, type: DOWN_TIME_EVENT, payload: { ...downTimePayload(cap) } });
          setDownTimeOpen(false);
        }} onClose={() => setDownTimeOpen(false)} />

      <TrackSheet open={findTruckOpen} onClose={() => setFindTruckOpen(false)} companyId={companyId} role={shell.role ?? null} myTruckId={truckId} myTrailerId={trailerId} />

      </div>
      </div>
      </div>

      <StartLoadSheet
        breakNote={breakNote}
        planRequired={!(editing && children?.pickup?.load_id)}
        requireShipperCustomer={settings.require_shipper_customer !== false}
        onPlanDetour={planDetour}
        open={sheetOpen}
        editing={editing}
        initial={initialValues}
        pickupLabel={dispatchedPickup ? [dispatchedPickup.name, [dispatchedPickup.city, dispatchedPickup.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : editing && children?.pickup?.load_id ? children.pickup.name ?? pickupLabel : pickupLabel}
        pickupTerminalId={dispatchedPickup ? String(dispatchedPickup.terminal_id) : editing && children?.pickup?.load_id ? (children.pickup.terminal_id ? String(children.pickup.terminal_id) : null) : (location.selectedTerminalId ? String(location.selectedTerminalId) : null)}
        onChangePickup={() => (location.selectedCity ? shell.setTermOpen(true) : shell.setLocOpen(true))}
        suppliers={suppliers}
        onAddSupplier={addSupplier}
        presets={sheetPresets}
        compSizes={compSizes}
        dispatchPlan={dispatchedPickup ? (() => {
          const meta = readPlannedMeta(dispatchedPickup.planned_comps);
          if (!meta.size) return null;
          const nums = [...new Set([...Object.keys(compSizes).map(Number), ...meta.keys()])].sort((a, b) => b - a);
          return nums.map((n) => meta.get(n)?.product_id ?? null);
        })() : null}
        dispatchMatch={dispatchedPickup ? (() => {
          const meta = readPlannedMeta(dispatchedPickup.planned_comps);
          if (!meta.size) return null;
          return findMatchingPlan(sheetPresets, layoutFromProducts(Object.fromEntries([...meta.entries()].map(([n, m]) => [n, m.product_id])), Object.keys(compSizes).map(Number)));
        })() : null}
        saveSlot={nextSaveSlot(sheetPresets)}
        productColor={(id) => { const p = productInfo(id); return p.hex ?? productColorFor(p.name); }}
        equipmentLabel={equipmentLabel}
        locations={locations}
        tanks={locList.tanks}
        origin={origin}
        companyId={companyId}
        userId={userId}
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
        onSubmit={(v) => { if (truckId && companyId) setStampAsk({ kind: "cancel", v }); else void onCancelSubmit(v); }}
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
          companyId={companyId}
          terminalId={loadedPickup.terminal_id ? String(loadedPickup.terminal_id) : null}
          checkBols={(values, exclude) => bolConflicts(
            trips,
            Object.values(state.rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[],
            companyId, values, exclude,
          )}
          geotabBols={loadedGeoBols}
          onSubmit={onLoadedSubmit}
          onClose={() => { setLoadedOpen(false); }}
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
            recordedDelayMin={dropDelayMinutes(tripDelays, finishDeliveryRow.delivery_id)}
            recordedDelayLabels={tripDelays.filter((d) => d.deliveryId === finishDeliveryRow.delivery_id && d.leg === "at_drop").map((d) => `${d.label} ${d.minutes} min`)}
            companyId={companyId}
            userId={userId}
            ticketPhotos={store.list("tank_checks", (c) => c.delivery_id === finishDeliveryRow.delivery_id).reduce((n, c) => n + c.photo_paths.length, 0)}
            onTicketPhotos={(paths) => tankChecks.saveTicket({ deliveryId: finishDeliveryRow.delivery_id, locationId: finishDeliveryRow.location_id, locationName: locations.find((l) => l.location_id === finishDeliveryRow.location_id)?.name ?? finishDeliveryRow.one_off_name ?? null, truckId: openTrip?.truck_id ?? null, paths })}
            onSaveSignature={signature.save}
            onSaveProgress={onDeliveryProgress}
            onSubmit={(v) => void onFinishSubmit(v)}
            onPark={showPark ? () => { setFinishOpen(false); setParkOpen(true); } : undefined}
            onClose={() => setFinishOpen(false)}
          />
        );
      })()}

      <LocationsHub open={manageLocsOpen} onClose={() => setManageLocsOpen(false)} companyId={companyId} userId={userId} role={shell.role ?? null} isSuperAdmin={!!shell.isSuperAdmin} origin={origin} />

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
        onPick={onPick}
        onClose={() => { setPicker(null); setAutoArrive(false); }}
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
