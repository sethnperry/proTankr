"use client";
// app/planner/home/useHomeBase.tsx
//
// One slice of the Driver Dashboard's logic (see useHome.tsx for how the slices chain together).
// app/planner/home/useHome.tsx
//
// All of the Driver Dashboard's state, effects and handlers. Returns what the screen (HomeView) draws.

import { usePending } from "@/lib/ui/pending";
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

import type { TripPickupRow } from "@/lib/trips/types";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";
import { useTripStore } from "@/lib/trips/useTripStore";

import { type SquawkType } from "@/lib/squawk/squawk";
import { playChirp, useMyArea, useSquawkAlerts } from "@/lib/squawk/useSquawk";

import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import { readRunningDelay, type RunningDelay, SHOP_CODE } from "@/lib/trips/delays";

import { useTripHydration } from "@/lib/trips/useTripHydration";
import { useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { locationTitle } from "@/lib/trips/deliveryLocations";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";

import { openTripForDriver, tripChildren } from "@/lib/trips/tripLogic";
import { nextStep, onBoard, tripSnapshot } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripRow } from "@/lib/trips/types";
import type { StartLoadValues } from "../components/StartLoadSheet";
import { type CancelTripSubmit } from "../components/trip/CancelTripSheet";

import { useTruckReading, fetchTruckShipments, fetchTruckReading } from "@/lib/telematics/useTruckReading";

import { type Level } from "@/lib/telematics/hosTripNotify";
import { type NotifyPermission } from "@/lib/ui/notify";

import { DROP_STOP_MIN, LOAD_STOP_MIN, remainingDriveMin, tripHosCheck } from "@/lib/telematics/progress";
import { recordArrivalPoint, useArrivalSuggestion, type ArrivalTarget } from "@/lib/telematics/useArrivalSuggestion";
import { type PresetSummary } from "@/lib/trips/tripPlan";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";

import { writePicks, type SupplierPick } from "@/lib/suppliers/picks";
import { saveTripDraft, takeTripDraft, takeDetourSlot } from "@/lib/trips/planDetour";
import { getTripSupplier, sameSupplier, seedTerminalPicks, setTripSupplier, type TripSupplier } from "@/lib/trips/tripSupplier";
import { readPicks, groupPicks } from "@/lib/suppliers/picks";

import { reportDelayIssue, submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";

import { useSuppliers } from "@/lib/trips/useSuppliers";

import { clearDeliveryDraft, type DeliveryProgress, type FinishDeliverySubmit, type ProductInfo } from "../components/trip/DeliveryDashboard";

import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";

import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";
import type { AddPickupDraft } from "../components/trip/AddPickupSheet";
import { checkAddPickup, grossColor, LEGAL_GROSS_LBS } from "@/lib/trips/addPickupCheck";
import { topOffPlan, roughLbsPerGal, mergeBlendRows, blendPct, blendLabel, offTarget, validPct } from "@/lib/trips/splash";
import { type TripSplash } from "@/lib/trips/tripSplash";
import { markAddingPickup, releaseAddingPickup } from "@/lib/trips/pickerIntent";
import { isSplashable, splashPickupPlans, refineSecondStop, type StagedPlanned } from "@/lib/trips/splashRows";

import { headingToTerminal, parkedPreloads, storeActivity } from "@/lib/trips/dashboardCards";

import { statusSetThisShift } from "@/lib/shifts/endStatus";
import { snoozed } from "@/lib/shifts/autoStart";
import { useShiftRecap } from "../hooks/useShiftRecap";
import { useDashIdentity } from "@/lib/ui/driver/useDashIdentity";

import { endNeedsExplanation } from "@/lib/shifts/explanation";
import { type RepairUnit } from "../components/repair/RepairSheet";

import { readShopDown, writeShopDown, type ShopDown } from "@/lib/trips/shopDown";
import { createRepairWorkOrder } from "@/lib/repairs/repairRequest";

import { useGeotabEquipment, useSecondSeat } from "../hooks/useGeotabEquipment";
import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";
import { useFreight } from "../hooks/useFreight";
import { useEmptyMoves } from "../hooks/useEmptyMoves";

import { useCatchUp } from "../hooks/useCatchUp";

import { useTankChecks } from "../hooks/useTankChecks";

import { useLanternfly } from "../hooks/useLanternfly";

import { useSafetyMeetings } from "../hooks/useSafetyMeetings";

import { useTerminalWork } from "../hooks/useTerminalWork";

import { useMyCallouts } from "../hooks/useMyCallouts";
import { usePerDiem } from "../hooks/usePerDiem";
import { useDriverSetup } from "@/lib/setup/useDriverSetup";

import { rememberLastEquipment } from "@/lib/equipment/lastEquipment";

import { type InspectUnit } from "../components/maintenance/InspectionSheet";
import { useOpenCampaigns } from "../hooks/useOpenCampaigns";
import { createInspection } from "@/lib/maintenance/inspection";

import { useShift } from "../hooks/useShift";
import { beginTripShift, offDutyAsk, telematicsLive } from "@/lib/shifts/dutyStatus";
import { useStuckSyncReporter } from "../hooks/useStuckSyncReporter";
import { useOtherCarriers, useStoreDeliveries, useTerminalStatus } from "../hooks/useDashboardCards";

import { LOOK, useScrollBackdrop } from "./dashLook";

import { bolGroups } from "@/lib/trips/bols";

import { type TrailerAlert } from "@/lib/trips/trailerAlerts";

import { openAccessSteps, useAccessQualifications } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";

import { EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";

import { type ExpGroup, type ExpRow } from "./DashboardSheets";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import { type PickerMode } from "./homeShared";
export function useHomeBase() {

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
  const [shopDown, setShopDown] = useState<ShopDown | null>(null);
  useEffect(() => { if (userId) setShopDown(readShopDown(userId)); }, [userId]);
  const repairFromDelay = useRef(false);
  const startDelayRef = useRef<((code: string, note: string | null) => void) | null>(null);
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
  // The driver's trips from the last two weeks with the BOL numbers on them, for filing a scanned BOL against a load.
  const recentBolTrips = () => {
    if (!store || !userId) return [];
    const since = Date.now() - 14 * 86400_000;
    return store.list("trips", (t) => t.driver_id === userId && t.status !== "cancelled" && Date.parse(t.started_at ?? "") >= since)
      .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
      .map((t) => {
        const order = store.list("trip_orders", (o) => o.trip_id === t.trip_id && o.is_primary)[0]?.order_number;
        const groups = bolGroups(store.list("trip_compartment_loads", (c) => c.trip_id === t.trip_id), store.list("trip_pickups", (p) => p.trip_id === t.trip_id), (id) => productName(id));
        const day = t.started_at ? new Date(t.started_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "";
        return { tripId: t.trip_id, label: `${order ? `Order ${order}` : "Trip"} · ${day} · ${t.customer ?? ""}`.replace(/ · $/, ""), bols: groups.map((g) => g.bol).filter(Boolean) as string[] };
      });
  };
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
    // The unit is down: mark it, and when this report didn't come from a delay (or none is running), start the shop time.
    const sd: ShopDown = { unitKind: unit.kind, unitId: unit.id, unitName: unit.name, at: new Date().toISOString() };
    writeShopDown(userId, sd); setShopDown(sd);
    if (!repairFromDelay.current && !readRunningDelay(userId)) startDelayRef.current?.(SHOP_CODE, null);
    repairFromDelay.current = false;
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
  const [endAsk, setEndAsk] = useState<{ name: string; sleeper: boolean; loaded: boolean; status: string | null; notes: string | null; sub: string | null; area: string | null; arrival?: boolean } | null>(null);
  const askTruckStatus = async (shiftStartedAt: string | null) => {
    if (!truckId) return;
    try {
      const { data } = await supabase.from("trucks").select("truck_name, status_updated_at, has_sleeper, status_code, status_notes, sub_status, local_area").eq("truck_id", truckId).maybeSingle();
      const t = data as { truck_name?: string; status_updated_at?: string | null; has_sleeper?: boolean; status_code?: string | null; status_notes?: string | null; sub_status?: string | null; local_area?: string | null } | null;
      if (!t || statusSetThisShift(t.status_updated_at, shiftStartedAt)) return;
      setEndAsk({ name: t.truck_name ?? "", sleeper: !!t.has_sleeper, loaded: !!openTrip && !!snap && onBoard(snap.compLoads).length > 0, status: t.status_code ?? null, notes: t.status_notes ?? null, sub: t.sub_status ?? null, area: t.local_area ?? null });
    } catch { /* no question: the status stays as it is */ }
  };
  // Arriving from an empty move: the equipment status window opens so the driver can update it. Every status is allowed.
  const askArrivalStatus = async () => {
    if (!truckId) return;
    try {
      const { data } = await supabase.from("trucks").select("truck_name, has_sleeper, status_code, status_notes, sub_status, local_area").eq("truck_id", truckId).maybeSingle();
      const t = data as { truck_name?: string; has_sleeper?: boolean; status_code?: string | null; status_notes?: string | null; sub_status?: string | null; local_area?: string | null } | null;
      if (!t) return;
      setEndAsk({ name: t.truck_name ?? "", sleeper: !!t.has_sleeper, loaded: false, status: t.status_code ?? null, notes: t.status_notes ?? null, sub: t.sub_status ?? null, area: t.local_area ?? null, arrival: true });
    } catch { /* no question: the status stays as it is */ }
  };
  // Cancelling a load and ending a shift both stop to confirm the odometer first (see OdometerConfirmSheet).
  const [stampAsk, setStampAsk] = useState<{ kind: "cancel"; v: CancelTripSubmit } | { kind: "shift" } | { kind: "move_begin"; plannedId?: string } | { kind: "move_end" } | null>(null);
  const finishShift = () => {
    if (truckId) { setStampAsk({ kind: "shift" }); return; }
    const startedAt = shift.current?.startedAt ?? null; shift.end(); void askTruckStatus(startedAt);
  };
  const requestEnd = () => { if (endNeedsExplanation(shift.current, maxShiftHours)) setExplainOpen(true); else finishShift(); };
  const signature = useDriverSignature(userId);
  const { suppliers, addSupplier } = useSuppliers(store, state, companyId, userId);
  const locList = useDeliveryLocationList(companyId, userId);
  const locations = locList.locations;
  const catchUp = useCatchUp({ store, state, syncNow, userId: userId || null, companyId: companyId || null, truckId: truckId ?? null, trailerId: trailerId ?? null, locations, shiftOpen: !!shift.current });
  // A shift the server ended (off duty 15 minutes): tell the driver once, and open the catch-up for the day.
  const autoEndSeen = useRef(false);
  useEffect(() => {
    if (autoEndSeen.current || !userId || !locations.length) return;
    const s = [...shift.shifts].reverse().find((x) => !x.open && x.endedAt && x.events.some((e) => e.event_type === "shift_end" && (e.payload as any)?.auto));
    const ev = s?.events.find((e) => e.event_type === "shift_end" && (e.payload as any)?.auto);
    if (!s || !ev || !s.endedAt || Date.now() - Date.parse(s.endedAt) > 48 * 3600_000) return;
    const k = `proTankr:u:${userId}:autoEndSeen:${ev.event_id}`;
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, "1"); } catch { return; }
    autoEndSeen.current = true;
    const pl = (ev.payload ?? {}) as { truck_id?: string | null; odometer?: number | null; place_text?: string | null };
    const pl2 = (ev.payload ?? {}) as { truck_id?: string | null; trailer_id?: string | null };
    const t = new Date(s.endedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    setNotice({ text: `Your shift was ended automatically at ${t}${pl.place_text ? ` at ${pl.place_text}` : ""}, when your truck showed off duty. Check your day.`, tripId: null });
    if (pl2.truck_id) rememberLastEquipment(userId, { truckId: pl2.truck_id, trailerId: pl2.trailer_id ?? null }); // the truck the server parked: Begin Trip offers it again
    if (pl.truck_id) void catchUp.begin({ truckId: pl.truck_id, from: s.startedAt, to: s.endedAt, endOdo: pl.odometer ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift.shifts, userId, locations.length]);
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
  // First time a terminal is reported down for gauging, ask when it normally gauges.
  const [gaugingAsk, setGaugingAsk] = useState<{ id: string; name: string } | null>(null);
  // Back in service: end the shop time, clear Deadline, and pick the equipment again (Deadline took the unit off the driver).
  const [backBusy, setBackBusy] = useState(false);
  // Set while routing to the Planner, so the button doesn't flash the next
  // step's label ("Continue Trip") during the navigation.
  const [openingPlanner, setOpeningPlanner] = useState(false);
  // Plan Review / a load report open over this screen (Planner host, see
  // PlannerHost.tsx). Drop the "Opening…" state once they're up, or give up.
  const [openingReport, setOpeningReport] = useState(false);
  // A note left on the trailer I hold: product still aboard (Retain).
  const [trailerNotes, setTrailerNotes] = useState<TrailerAlert[]>([]);
  const [clearAlertAsk, setClearAlertAsk] = useState(false);
  // The last step when a trip closes: email the trip package.
  const [pkgTrip, setPkgTrip] = useState<{ tripId: string; order: string | null } | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [rackSheetOpen, setRackSheetOpen] = useState(false);
  const [rackStudOpen, setRackStudOpen] = useState(false);
  // Equipment picked for a load being planned (Add load). null = the equipment in use.
  const [planEquip, setPlanEquip] = useState<{ truckId: string | null; trailerId: string | null; label: string } | null>(null);
  const [planEquipOpen, setPlanEquipOpen] = useState(false);
  const [rackDelayOpen, setRackDelayOpen] = useState(false);
  const [storedLocId, setStoredLocId] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  // ── Start Load prefills ────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  // + Add load: the New Load window opens for a second load, not to edit the open trip.
  const [addingLoad, setAddingLoad] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState(false);
  // Values the Begin / Edit Trip card had when the driver left to make or change a plan.
  const [resumeDraft, setResumeDraft] = useState<StartLoadValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Begin Dispatched Load starts the trip, then opens this same sheet so the
  // driver taps through what dispatch planned. While verifying, the pickup is
  // the one dispatch chose, unless the driver changes the terminal here.
  const [verifyTripId, setVerifyTripId] = useState<string | null>(null);
  const verifyBaseTerminal = useRef<string | null>(null);
  const [verifyActive, setVerifyActive] = useState(false);
  const [plannedNames, setPlannedNames] = useState<Record<string, string>>({}); // eslint-disable-line react-hooks/exhaustive-deps

  // A fuel stop still open when a trip is about to begin: ask, so the fueling time ends before the trip's start
  // instead of straddling it.
  const [fuelAsk, setFuelAsk] = useState<null | (() => void)>(null);
  // Begin Trip: after the shift starts, the Select Equipment picker opens whenever the driver doesn't hold equipment (nothing
  // is pre-selected: parking let go of it). A trip needs a trailer: a truck with none can only run an empty move, so the
  // driver is offered that instead (bobtailAsk). Fuel stops only need a truck (needTrailer false). Skipped when an admin is
  // using the app as someone else.
  const [equipAsk, setEquipAsk] = useState<{ then: () => void; needTrailer: boolean } | null>(null);
  const [equipSwitching, setEquipSwitching] = useState(false);
  const [bobtailAsk, setBobtailAsk] = useState<(() => void) | null>(null);
  const resumeAfterMove = useRef<(() => void) | null>(null);
  const equipSawOpen = useRef(false); // eslint-disable-line react-hooks/exhaustive-deps
  // Where a truck was left: the stamp from the End shift confirmation, written to the truck and its trailer once a parked
  // status is saved. One pin per unit; it disappears when anyone takes the unit.
  const parkStampRef = useRef<{ lat: number | null; lon: number | null; label: string | null; placeId: string | null } | null>(null);

  // ── Cancel load (nothing on board) ───────────────────────────────────────
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  // ── Pickup / delivery steps ────────────────────────────────────────────────
  const [loadedOpen, setLoadedOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  // The Locations tool: terminals and delivery locations.
  const [manageLocsOpen, setManageLocsOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tripId: string | null } | null>(null);
  // A notice that stops an action (themed, not an alert).
  const [blockNotice, setBlockNotice] = useState<{ title: string; text: string } | null>(null); // eslint-disable-line react-hooks/exhaustive-deps
  const [fuelOpen, setFuelOpen] = useState(false);
  // Live odometer and position from the company's telematics, fetched whenever one of these windows opens.
  const [truckSheetWatch, setTruckSheetWatch] = useState(false);
  const [hookupOkId, setHookupOkId] = useState<string | null>(null);
  const [notifyPerm, setNotifyPerm] = useState<NotifyPermission>("default");
  // Connected telematics starts the shift by itself, at the time the driver went on duty. No question.
  const autoStarted = useRef<string | null>(null);
  const lastHosLevel = useRef<Level | null>(null);
  const serverPushOn = useRef(false);
  const [fuelPending, setFuelPending] = useState(false);
  // A back-dated arrival (the geofence saw the truck come to rest earlier) sets this for one call.
  const arriveAtRef = useRef<Date | null>(null);

  // The truck's shipment numbers (BOLs) from the telematics app. Asked once when the Loaded sheet opens. Never polled.
  const [loadedGeoBols, setLoadedGeoBols] = useState<string[]>([]);
  // Drop site window: opens at Arrive; Begin Delivery stamps begin_at and shows the tank volume calculator.
  const [dropSiteOpen, setDropSiteOpen] = useState(false);

  // Splash blend set up for this trip (per compartment). Declared early: the delivery merge below reads it during render.
  const [tripSplash, setTripSplashState] = useState<TripSplash>({});
  const [compSizes, setCompSizes] = useState<Record<number, number>>({}); // eslint-disable-line react-hooks/exhaustive-deps

  // A terminal becomes one of the company's places the first time a driver arrives there (best effort; once per terminal per visit).
  const placedTerminals = useRef<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<AddPickupDraft>({ stage: "comps", comps: [], products: {}, order: { kind: "new", number: "" } });
  const [addBusy, setAddBusy] = useState(false);
  const [orderErr, setOrderErr] = useState<string | null>(null);
  const [addTermPending, setAddTermPending] = useState(false);
  const addSawPicker = useRef(false);
  // Splash blend set up for this trip (per compartment), and the plan's base product per compartment.
  const [splashOpen, setSplashOpen] = useState(false);

  // Change which order a pickup loads under (tap its order on the trip card).
  const [orderPickup, setOrderPickup] = useState<TripPickupRow | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [noLoadOpen, setNoLoadOpen] = useState(false);
  const [noLoadBusy, setNoLoadBusy] = useState(false);
  const [noLoadErr, setNoLoadErr] = useState<string | null>(null);

  // Next Rack: pick the terminal (the shared picker), then it becomes the
  // trip's next pickup. Picking the same terminal again counts too (a
  // different rack there, or trying again later).
  const [nextRackPending, setNextRackPending] = useState(false);
  const nextRackSawPicker = useRef(false);
  const [undoConfirm, setUndoConfirm] = useState(false);

  // Duty-log stops: the ELD's own time for "stopped driving", asked about once we can see it.
  const [handledStops, setHandledStops] = useState<Set<string>>(new Set());
  const [stopClock, setStopClock] = useState(() => Date.now());
  // "Did you arrive?" only when the truck is near the stop it is headed to: a pull-off at a scale house or a
  // rest stop is not an arrival. Checked once per stop; no position or no stop coordinates still asks.
  const [stopFar, setStopFar] = useState<Record<string, boolean>>({});
  const hopRef = useRef<{ stop: { at: string; droveFrom?: string }; pickup: TripPickupRow; reason: string; productIds: string[]; skipReport?: boolean } | null>(null);
  const [consigneeSignOpen, setConsigneeSignOpen] = useState(false);
  // First-use dashboard tour: once, when nothing else is on screen (setup screens, the plan builder).
  // /planner/home?tour=1 replays it.
  const [tourOpen, setTourOpen] = useState(false);
  // Off duty in telematics with the shift still open asks the same question as a long quiet spell. "Still working"
  // holds it off for that off-duty stretch; End shift runs the usual end (odometer, then the truck's status, with
  // Park preloaded when it is still loaded).
  const [offDutyDismissed, setOffDutyDismissed] = useState<string | null>(null);
  // "Still working" while the ELD says off duty asks why (OffDutySheet); the answer is saved on the shift.
  const [offWhyOpen, setOffWhyOpen] = useState(false);

  // Arriving straight from the Planner's load report ("Arrived at Delivery"):
  // /planner/home?arrive=1 arrives the next delivery (the time is stamped,
  // nothing opens). With no delivery set yet, the picker opens first.
  const [autoArrive, setAutoArrive] = useState(false);

  // ── Handoff (§10) ──────────────────────────────────────────────────────────
  const [handoffName, setHandoffName] = useState<string | null>(null);
  // ── Park Preloaded ────────────────────────────────────────────────────────
  const [parkOpen, setParkOpen] = useState(false);
  // Right-now sheets opened from the gauges and the Terminal tool.
  const [terminalNowOpen, setTerminalNowOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [dropNowOpen, setDropNowOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  // Re-render every 30 s so the Break chip counts up between hours reads.
  const [, setBreakTick] = useState(0);
  const [unitAlertsOpen, setUnitAlertsOpen] = useState<"truck" | "trailer" | null>(null);
  const [expSheetOpen, setExpSheetOpen] = useState(false);
  const [loadsSheetOpen, setLoadsSheetOpen] = useState(false);
  const [handoffAcked, setHandoffAcked] = useState<string | null>(null);
  // Regions for Park Preloaded: the company's list, defaulting to the driver's own.
  const [parkRegions, setParkRegions] = useState<string[]>([]);
  const [myRegion, setMyRegion] = useState<string | null>(null);
  // The truck chosen in the equipment step arrives after this closure was made, so the latest value is read here.
  const truckIdLive = useRef<string | null>(truckId ?? null);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  // Saved plans for the Begin Trip plan picker, read when the sheet opens.
  const [sheetPresets, setSheetPresets] = useState<PresetSummary[]>([]);
  const [splashTermPending, setSplashTermPending] = useState(false);
  const splashSawPicker = useRef(false);
  const [siteNotesOpen, setSiteNotesOpen] = useState(false);
  // ── Squawk ──
  const [squawkOpen, setSquawkOpen] = useState(false);
  const [squawkType, setSquawkType] = useState<SquawkType | null>(null);
  const [squawkCity, setSquawkCity] = useState<{ city: string; state: string } | null>(null);
  const [dropSiteKey, setDropSiteKey] = useState<string | null>(null);
  return { shell, router, nav, equipment, location, terminals, expirations, userId, companyId, truckId, findTruckOpen, setFindTruckOpen, trailerId, state, store, syncNow, retryFailed, dismissFailed, pendingCount, failed, syncOpen, setSyncOpen, settings, reasons, paperLogOpen, setPaperLogOpen, repairOpen, setRepairOpen, shopDown, setShopDown, repairFromDelay, startDelayRef, inspectOpen, setInspectOpen, perDiemOpen, setPerDiemOpen, calloutOpen, setCalloutOpen, shiftOpen, setShiftOpen, termWorkOpen, setTermWorkOpen, safetyOpen, setSafetyOpen, slfOpen, setSlfOpen, tankCheckOpen, setTankCheckOpen, freightOpen, setFreightOpen, moveOpen, setMoveOpen, explainOpen, setExplainOpen, docOpen, setDocOpen, recentBolTrips, downTimeOpen, setDownTimeOpen, shift, repairUnits, sendRepairRequest, safety, openSafety, termWork, callouts, setup, perDiem, openCampaigns, submitInspection, dashIdentity, shiftRecapData, shiftAsk, shiftKey, askShiftStart, lastShiftEndedMs, confirmShiftStart, skipShiftStart, endAsk, setEndAsk, askTruckStatus, askArrivalStatus, addingLoad, setAddingLoad, moveConfirm, setMoveConfirm, stampAsk, setStampAsk, finishShift, requestEnd, signature, suppliers, addSupplier, locList, locations, catchUp, products, terminalCatalog, productName, deliveryName, trips, openTrip, freight, emptyMoves, tankChecks, lanternfly, children, snap, step, runningDelay, setRunningDelay, gaugingAsk, setGaugingAsk, backBusy, setBackBusy, openingPlanner, setOpeningPlanner, openingReport, setOpeningReport, trailerNotes, setTrailerNotes, clearAlertAsk, setClearAlertAsk, pkgTrip, setPkgTrip, alertsOpen, setAlertsOpen, rackSheetOpen, setRackSheetOpen, rackStudOpen, setRackStudOpen, planEquip, setPlanEquip, planEquipOpen, setPlanEquipOpen, rackDelayOpen, setRackDelayOpen, storedLocId, setStoredLocId, sheetOpen, setSheetOpen, resumeDraft, setResumeDraft, busy, setBusy, error, setError, verifyTripId, setVerifyTripId, verifyBaseTerminal, verifyActive, setVerifyActive, plannedNames, setPlannedNames, fuelAsk, setFuelAsk, equipAsk, setEquipAsk, equipSwitching, setEquipSwitching, bobtailAsk, setBobtailAsk, resumeAfterMove, equipSawOpen, parkStampRef, cancelOpen, setCancelOpen, cancelBusy, setCancelBusy, cancelErr, setCancelErr, loadedOpen, setLoadedOpen, finishOpen, setFinishOpen, picker, setPicker, manageLocsOpen, setManageLocsOpen, notice, setNotice, blockNotice, setBlockNotice, fuelOpen, setFuelOpen, truckSheetWatch, setTruckSheetWatch, hookupOkId, setHookupOkId, notifyPerm, setNotifyPerm, autoStarted, lastHosLevel, serverPushOn, fuelPending, setFuelPending, arriveAtRef, loadedGeoBols, setLoadedGeoBols, dropSiteOpen, setDropSiteOpen, tripSplash, setTripSplashState, compSizes, setCompSizes, placedTerminals, addOpen, setAddOpen, addDraft, setAddDraft, addBusy, setAddBusy, orderErr, setOrderErr, addTermPending, setAddTermPending, addSawPicker, splashOpen, setSplashOpen, orderPickup, setOrderPickup, orderBusy, setOrderBusy, noLoadOpen, setNoLoadOpen, noLoadBusy, setNoLoadBusy, noLoadErr, setNoLoadErr, nextRackPending, setNextRackPending, nextRackSawPicker, undoConfirm, setUndoConfirm, handledStops, setHandledStops, stopClock, setStopClock, stopFar, setStopFar, hopRef, consigneeSignOpen, setConsigneeSignOpen, tourOpen, setTourOpen, offDutyDismissed, setOffDutyDismissed, offWhyOpen, setOffWhyOpen, autoArrive, setAutoArrive, handoffName, setHandoffName, parkOpen, setParkOpen, dropNowOpen, setDropNowOpen, recapOpen, setRecapOpen, setBreakTick, unitAlertsOpen, setUnitAlertsOpen, expSheetOpen, setExpSheetOpen, loadsSheetOpen, setLoadsSheetOpen, handoffAcked, setHandoffAcked, parkRegions, setParkRegions, myRegion, setMyRegion, truckIdLive, wrapEl, setWrapEl, sheetPresets, setSheetPresets, splashTermPending, setSplashTermPending, splashSawPicker, siteNotesOpen, setSiteNotesOpen, squawkOpen, setSquawkOpen, squawkType, setSquawkType, squawkCity, setSquawkCity, dropSiteKey, setDropSiteKey } as const;
}
