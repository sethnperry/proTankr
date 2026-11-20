"use client";
// app/planner/home/HomeView.tsx
//
// What the Driver Dashboard draws. Every value and handler comes from useHome.

import { ConfirmDay } from "../components/shift/ConfirmDay";
import { requestHosRefresh } from "@/lib/telematics/useMyHos";
import { releaseEquipment } from "@/lib/equipment/releaseEquipment";
import { Spinner, busyProps, busyText } from "@/lib/ui/pending";
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

import React from "react";
import { BackArrow } from "@/lib/ui/BackArrow";
import { StandbySheet } from "../components/standby/StandbySheet";
import { StampQuestion, stampClock } from "../components/StampQuestion";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { HosRecapModal } from "@/app/planner/components/trip/HosRecap";

import { DelayButton } from "../components/trip/DelayButton";
import { SQUAWK_TYPES } from "@/lib/squawk/squawk";

import { SiteAverage, SiteNotes } from "../components/site/SiteNotes";
import { DEFAULT_SOP_DROP } from "@/lib/sites/siteStats";

import { DashboardTour, markDashTourSeen } from "../components/tour/DashboardTour";
import { ConsigneeSignSheet } from "../components/trip/ConsigneeSignSheet";
import { DutyStopCard } from "./DutyStopCard";

import { readRunningDelay, writeRunningDelay, dropDelayMinutes, type RunningDelay } from "@/lib/trips/delays";

import { locationPlace, locationTitle } from "@/lib/trips/deliveryLocations";
import { DispatchedMovesCard } from "../components/moves/DispatchedMovesCard";
import { beginPatch, dispatchedMovesFor, stepKindOf, stepText } from "@/lib/moves/dispatchedMoves";

import TerminalOutageDetailModal from "../modals/TerminalOutageDetailModal";

import { activePickup, onBoard, PARK_FOR_LABEL, pickupNeedsOdometer, plannedDeliveries } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow } from "@/lib/trips/types";

import { CancelTripSheet } from "../components/trip/CancelTripSheet";

import { truckLastKnownPlace } from "@/lib/trips/startPlace";

import { notifyPermission } from "@/lib/ui/notify";
import { enablePush } from "@/lib/push/subscribe";

import { CYCLE_LIMIT_MIN } from "@/lib/telematics/cycleRecap";
import { clockColor, clockHM } from "@/lib/telematics/progress";

import { getTripPlan, nextSaveSlot, slotLetter } from "@/lib/trips/tripPlan";
import { findMatchingPlan, layoutFromProducts } from "@/lib/trips/planMatch";
import { readPlannedMeta } from "@/lib/dispatch/compPlan";

import { NoLoadSheet } from "../components/trip/NoLoadSheet";
import { destinationRegion } from "@/lib/trips/deliveryLocations";
import { ParkSheet } from "../components/trip/ParkSheet";

import { TripEquipmentSheets } from "../components/trip/TripEquipmentSheets";
import { submitOutageReport, type OutageReportType } from "../hooks/useTerminalOutageReports";
import { noLoadReasonLabel } from "@/lib/trips/terminalIssues";

import { GaugingAskSheet } from "../components/trip/GaugingAskSheet";

import { bolConflicts } from "@/lib/trips/refCheck";
import { DeliveryDashboard } from "../components/trip/DeliveryDashboard";
import { LocationsHub, terminalsTool, deliveriesTool } from "../components/locations/LocationsHub";

import { TrailerHeader } from "../components/TrailerViews";

import { blendPct, blendLabel, offTarget } from "@/lib/trips/splash";
import { getTripSplash } from "@/lib/trips/tripSplash";

import { SplashPlanSheet } from "../components/trip/SplashPlanSheet";
import { productColorFor } from "../utils/productColor";
import { TripCardView } from "../components/trip/TripCardView";
import { deliveryRows, pickupRows } from "@/lib/trips/cardRows";
import { PickupOrderSheet } from "../components/trip/OrderChooser";

import { ShiftBar } from "../components/shift/ShiftBar";
import { ShiftSheet } from "../components/shift/ShiftSheet";
import { ShiftStartConfirm } from "../components/shift/ShiftStartConfirm";
import { OffDutySheet } from "../components/shift/OffDutySheet";

import EquipmentStatusModal, { type FleetStatus } from "../modals/EquipmentStatusModal";

import { ExplanationSheet } from "../components/shift/ExplanationSheet";
import { explanationPayload } from "@/lib/shifts/explanation";
import { RepairSheet } from "../components/repair/RepairSheet";
import RackDelaySheet from "../components/RackDelaySheet";
import { RackDelayButton } from "../components/trip/RackDelayButton";


import { CatchUpSheet } from "../components/shift/CatchUpSheet";
import { TarePairHost } from "../components/equipment/TarePairHost";
import { OdometerConfirmSheet } from "../components/moves/OdometerConfirmSheet";

import { LanternflySheet } from "../components/slf/LanternflySheet";

import { SafetyMeetingSheet } from "../components/safety/SafetyMeetingSheet";

import { TerminalWorkSheet } from "../components/terminalwork/TerminalWorkSheet";

import { minutesOf as workMinutes, clock as workClock } from "@/lib/terminalwork/terminalWork";
import { CalloutSheet } from "../components/callouts/CalloutSheet";

import { breakChip } from "@/lib/telematics/breakChip";

import { counterText } from "@/lib/setup/driverSetup";
import { InspectionSheet } from "../components/maintenance/InspectionSheet";

import { PaperLogSheet } from "../components/shift/PaperLogSheet";
import { DocumentSheet } from "../components/shift/DocumentSheet";
import { CaptureSheet } from "../components/capture/CaptureSheet";
import { DOCUMENT_EVENT, DOWN_TIME_EVENT, documentPayload, downTimePayload } from "@/lib/documents/documents";
import { PAPER_LOG_EVENT, paperLogPayload } from "@/lib/shifts/paperLog";
import { reasonsOrDefault } from "@/lib/reasons/reasons";
import { recordShiftEvent } from "@/lib/shifts/shiftEvents";
import { SAFETY_MEETING_EVENT } from "@/lib/safety/onDuty";
import { getTripStore } from "@/lib/trips/useTripStore";

import { dutyChip, dutyLabel, telematicsLive } from "@/lib/shifts/dutyStatus";

import { TerminalStatusSheet } from "../components/trip/TerminalStatusSheet";
import { TrackSheet } from "../components/track/TrackSheet";
import { DashLookProvider, DashStyles, LOOK, SectionLabel } from "./dashLook";
import { DispatchNotices } from "./DispatchNotices";
import { bolGroups } from "@/lib/trips/bols";

import { clearTrailerAlerts } from "@/lib/trips/trailerAlerts";
import { GaugePanel, ToolPanel, type ToolItem } from "./DashboardChrome";
import { QualificationCard, type QualTerminal } from "./QualificationStrip";
import { openAccessSteps } from "../components/access/useAccessSteps";

import { EXPIRY_COLOR } from "@/lib/expiry";
import { ConnectedDashHeader, ConnectedDashFooter } from "../components/dash/ConnectedDash";
import { ExpirationsSheet, LoadsSheet } from "./DashboardSheets";
import { SiteBoard } from "../dispatch/SiteBoard";
import { ParkedPreloadsCard } from "../components/trip/DashboardCards";

import FuelSheet from "../components/fuel/FuelSheet";
import { DispatchedCard } from "./DispatchedCard";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import type { useHome } from "./useHome";
import { odometerStatus } from "@/lib/telematics/useTruckReading";
import { staleOpenDelivery } from "@/lib/trips/staleDelivery";
import { PlanEquipmentSheet } from "../components/PlanEquipmentSheet";
import { SquawkSheet, DropSiteSheet, StartLoadSheet, LoadedSheet, LocationPicker, AddPickupSheet, FreightSheet, TankCheckSheet, PerDiemSheet, STATUS_LABEL, muted, smallLink, EquipLine, EquipmentToolsRegistrar, InfoRow, SyncDetailsSheet } from "./homeShared";

export function HomeView({ h }: { h: ReturnType<typeof useHome> }) {
  const {
    L,
    aboard,
    aboardRows,
    accessCollapsed,
    accessStrip,
    addBusy,
    addCheck,
    addDraft,
    addOpen,
    addPickTerminal,
    addSupplier,
    alertsOpen,
    answerStop,
    anyDelivered,
    arrival,
    arrivalPickup,
    arrivalTarget,
    arriveCardPending,
    askEquipment,
    autoBlocked,
    backBusy,
    backInService,
    baseByComp,
    baseStop,
    beginDelivery,
    beginDispatchedLoad,
    startEmptyMove,
    addingLoad,
    planEquip,
    setPlanEquip,
    planEquipOpen,
    setPlanEquipOpen,
    setAddingLoad,
    moveConfirm,
    setMoveConfirm,
    swapDispatched,
    behindWheel,
    blendWarnings,
    blockNotice,
    breakCountsRed,
    breakNote,
    busy,
    calloutOpen,
    callouts,
    canAddPickup,
    canCancelNow,
    canNoLoad,
    cancelBusy,
    cancelErr,
    cancelOpen,
    card,
    catchUp,
    children,
    chipFor,
    clearAlertAsk,
    compSizes,
    companyId,
    confirmAddPickup,
    confirmDetectedArrival,
    confirmDutyArrival,
    confirmShiftStart,
    confirmStamp,
    consigneeSignOpen,
    countColor,
    dashIdentity,
    defaultOrder,
    delayLeg,
    deliveryName,
    dismissFailed,
    dismissHandoff,
    dispatchedItems,
    dispatchedList,
    dispatchedPickup,
    startPickupChange,
    doPark,
    doTakeOver,
    doUndoArrival,
    undoBeginDeliveryNow,
    docOpen,
    downTimeOpen,
    dropCount,
    dropNowOpen,
    dropProducts,
    dropSiteOpen,
    dutyStop,
    editing,
    emptyMoves,
    endAsk,
    endDelay,
    endMoveAndMark,
    equipment,
    equipmentLabel,
    error,
    expGroups,
    expSheetOpen,
    expTotal,
    expWorst,
    explainOpen,
    failed,
    findTruckOpen,
    finishDeliveryRow,
    openDelivery,
    finishFromDropSite,
    finishOpen,
    finishShift,
    fleet,
    freight,
    freightOpen,
    fuel,
    fuelAsk,
    fuelOpen,
    fuelSetup,
    gaugingAsk,
    handoff,
    handoffAlert,
    handoffName,
    hookup,
    hookupKey,
    hookupOkId,
    hopPickup,
    hopToAnotherRack,
    hosVsTrip,
    initialValues,
    inspectOpen,
    keepBlendAsLoaded,
    lanternfly,
    lastLoadId,
    liveDeliveries,
    loadLine,
    loadedGeoBols,
    loadedOpen,
    loadedPickup,
    loadsSheetOpen,
    locList,
    location,
    locations,
    logDutyDelay,
    manageLocsOpen,
    mergedHere,
    myDelivery,
    myHos,
    askTruckStatus,
    myRegion,
    nav,
    nearbyParked,
    noLoadBusy,
    noLoadErr,
    noLoadOpen,
    notesSite,
    notice,
    notifyPerm,
    offAsk,
    offWhyOpen,
    onBigButton,
    onBoardLines,
    onCancelSubmit,
    onDeliveryProgress,
    onFinishSubmit,
    onLoadedSubmit,
    onNoLoadSubmit,
    onPick,
    openAddPickup,
    openCampaigns,
    openEquipPicker,
    openEquipment,
    openSafety,
    openSplash,
    openTrip,
    openingPlanner,
    openingReport,
    orderBusy,
    orderErr,
    orderPickup,
    origin,
    paperLogOpen,
    parkOpen,
    parkPreset,
    parkRegions,
    parkRequested,
    parkStampRef,
    parked,
    parkedSnap,
    pendingCount,
    perDiem,
    perDiemOpen,
    picker,
    pickupLabel,
    pickups,
    planDetour,
    planLine,
    plannedCount,
    plannedProducts,
    productInfo,
    productName,
    products,
    rackAlerts,
    rackCity,
    rackCount,
    rackDelayOpen,
    rackName,
    rackSheetOpen,
    rackStatus,
    rackStudOpen,
    rackTerminalId,
    reasons,
    recapOpen,
    recentBolTrips,
    reloadTrailerAlerts,
    repairFromDelay,
    repairOpen,
    repairUnits,
    requestEnd,
    resumeAfterMove,
    retryFailed,
    runningDelay,
    safety,
    safetyOpen,
    savePickupOrder,
    saveSplash,
    selectedLoc,
    selectedLocId,
    sendRepairRequest,
    setAddDraft,
    setAddOpen,
    setAlertsOpen,
    setAutoArrive,
    setBlockNotice,
    setCalloutOpen,
    setCancelErr,
    setCancelOpen,
    setClearAlertAsk,
    setConsigneeSignOpen,
    setDocOpen,
    setDownTimeOpen,
    setDropNowOpen,
    setDropSiteOpen,
    setEndAsk,
    setError,
    setExpSheetOpen,
    setExplainOpen,
    setFindTruckOpen,
    setFinishOpen,
    setFreightOpen,
    setFuelAsk,
    setFuelOpen,
    setGaugingAsk,
    setHookupOkId,
    setInspectOpen,
    setLoadedOpen,
    setLoadsSheetOpen,
    setManageLocsOpen,
    setNoLoadErr,
    setNoLoadOpen,
    setNotice,
    setNotifyPerm,
    setOffWhyOpen,
    setOpeningReport,
    setOrderPickup,
    setPaperLogOpen,
    setParkOpen,
    setPerDiemOpen,
    setPicker,
    setRackDelayOpen,
    setRackSheetOpen,
    setRackStudOpen,
    setRecapOpen,
    setRepairOpen,
    setRunningDelay,
    setSafetyOpen,
    setSheetOpen,
    setShiftOpen,
    setSiteNotesOpen,
    setSlfOpen,
    setSplashOpen,
    setSquawkCity,
    setSquawkOpen,
    setSquawkType,
    setStampAsk,
    setSyncOpen,
    setTankCheckOpen,
    setTermWorkOpen,
    setTourOpen,
    setUndoConfirm,
    setUnitAlertsOpen,
    setVerifyActive,
    setWrapEl,
    settings,
    setup,
    sheetOpen,
    sheetPresets,
    shell,
    shift,
    shiftAsk,
    shiftOpen,
    shiftPromptShown,
    shiftRecapData,
    shopDown,
    showPark,
    sigDelivery,
    signature,
    siteNotesOpen,
    skipShiftStart,
    slfOpen,
    snap,
    splashComps,
    splashOpen,
    splashPickup,
    splashPlanProp,
    splashRoomLbs,
    squawkCities,
    squawkCityKey,
    squawkCtx,
    squawkNew,
    squawkOpen,
    squawkTop,
    squawkType,
    stampAsk,
    stampCtx,
    stampFloor,
    stampPlaceLabel,
    startDelay,
    startLoading,
    state,
    step,
    stepsByTerminal,
    stillWorking,
    stopName,
    store,
    submit,
    submitInspection,
    submitOffWhy,
    suppliers,
    swapSplashOrder,
    syncNow,
    syncOpen,
    tankCheckOpen,
    tankChecks,
    tapFuel,
    termWork,
    termWorkOpen,
    terminalAlerts,
    terminalCatalog,
    terminalName,
    terminals,
    tourOpen,
    trailerAlerts,
    trailerBar,
    trailerHdr,
    trailerId,
    trailerLabel,
    trailerNotes,
    tripDelays,
    tripEquip,
    tripLoaded,
    tripSplash,
    trips,
    truckAlerts,
    truckChanged,
    truckId,
    truckReading,
    truckReadingFailed,
    undoConfirm,
    undoName,
    undoable,
    unitAlertsOpen,
    userId,
    workingPickup,
  } = h;
  // Back arrow in the arrival window: keep or undo the arrival time.
  const [leaveArrival, setLeaveArrival] = React.useState(false);
  // Plan Review's back arrow (before Begin Loading) asks whether to keep the arrival time or undo it.
  React.useEffect(() => { const h = () => setLeaveArrival(true); window.addEventListener("protankr:leaveArrival", h); return () => window.removeEventListener("protankr:leaveArrival", h); }, []);
  const [standbyOpen, setStandbyOpen] = React.useState(false);
  // Planned moves count as trips next to dispatched loads.
  const plannedMoves = userId ? dispatchedMovesFor(emptyMoves.moves, userId) : [];
  const placeName = (id: string | null, text: string | null) => { const l = id ? locations.find((x) => x.location_id === id) : null; return l ? locationTitle(l) : text || "—"; };
  const trailerNameOf = (id: string | null) => (id ? ((equipment as { trailerNameById?: Record<string, string> }).trailerNameById?.[id] ?? null) : null);
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
      <ConnectedDashHeader current="driver" line={(() => {
        const chip = dutyChip(myHos, Date.now());
        if (!chip) return <EquipLine wheel={behindWheel} label={equipmentLabel} />;
        return (
          <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <EquipLine wheel={behindWheel} label={equipmentLabel} />
            <span style={{ flexShrink: 0, color: chip.on ? "#4ade80" : "rgba(255,255,255,0.7)" }}
              title={chip.since ? `Since ${new Date(chip.since).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : undefined}>{chip.text}</span>
          </span>
        );
      })()} />

      {trailerNotes.length > 0 && (
        <div role="alert" style={{ margin: "0 0 12px", border: "2px solid #fbbf24", background: "rgba(251,191,36,0.14)", padding: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fbbf24", letterSpacing: "0.02em" }}>⚠️ PRODUCT ABOARD THIS TRAILER</div>
          {trailerNotes.map((a) => (
            <div key={a.alert_id} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{a.note}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                {a.compartments.length ? `C${a.compartments.join(", C")} · ` : ""}left {new Date(a.created_at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setClearAlertAsk(true)}
            style={{ marginTop: 12, padding: "9px 12px", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", border: "1px solid rgba(251,191,36,0.6)", background: "transparent", color: "#fbbf24", cursor: "pointer" }}>Product is gone, clear this alert</button>
          {clearAlertAsk && (
            <div style={{ marginTop: 10, fontSize: 14 }}>
              Only clear it if the product is off this trailer.
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => { if (trailerId && userId) void clearTrailerAlerts(trailerId, userId).then(() => { setClearAlertAsk(false); reloadTrailerAlerts(); }); }}
                  style={{ padding: "10px 14px", fontWeight: 800, border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>Clear</button>
                <button type="button" onClick={() => setClearAlertAsk(false)} style={{ padding: "10px 14px", fontWeight: 800, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", cursor: "pointer" }}>Keep</button>
              </div>
            </div>
          )}
        </div>
      )}

      <DispatchNotices userId={userId || null} />
      <ShiftBar shift={shift.current} prompt={shiftPromptShown} onEnd={requestEnd} onAckLong={shift.ackLong} onKeepGoing={stillWorking} />
      <ConfirmDay shift={shift} move={emptyMoves.current} truckId={truckId ?? null} myHos={myHos}
        onStillMoving={() => shift.keepGoing({ moving: true, confirmed: true })}
        onConfirm={(a) => {
          const mv = emptyMoves.current;
          if (mv) { emptyMoves.end(mv.move_id, a.odometer, undefined, a.moveEndAt); emptyMoves.patch(mv.move_id, { notes: "Ended after the fact: the driver confirmed when it ended and the odometer." }); }
          if (a.endShift) {
            const startedAt = shift.current?.startedAt ?? null;
            shift.end({ odometer: a.odometer, confirmed_late: true, move_id: mv?.move_id ?? null }, a.shiftEndAt);
            requestHosRefresh({ chaseMin: 15 });
            void askTruckStatus(startedAt);
          } else shift.keepGoing({ confirmed: true });
        }} />
      {/* The shift is over but the ELD still counts the driver as working. ProTankr only reads Geotab (the duty status is the
          driver's to change, in Drive), so say so; this card goes away by itself once the status changes. */}
      {(() => {
        const last = [...shift.shifts].reverse().find((s) => s.endedAt);
        const endedMs = last?.endedAt ? Date.parse(last.endedAt) : null;
        if (shift.current || endedMs == null || Date.now() - endedMs > 2 * 3600_000) return null;
        if (!telematicsLive(myHos, Date.now()) || !myHos || !["D", "ON", "YM"].includes(myHos.status ?? "")) return null;
        return (
          <div style={{ ...LOOK.secondary, marginTop: 8, padding: "11px 14px", borderColor: "rgba(251,191,36,0.5)" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Your shift ended, but your ELD still shows {dutyLabel(myHos.status)}.</div>
            <div style={{ fontSize: 12, marginTop: 3, color: LOOK.muted }}>Set Off duty in Geotab Drive so your hours stop counting. This updates here within a minute or so.</div>
          </div>
        );
      })()}

      <div className="d2-cols">
      <div className="d2-left">
      <div className="d2-o0">
      {/* Status squares: equipment due, and company trucks headed where I'm going (me included). */}
      <div style={{ marginBottom: 14 }}>
      <GaugePanel square top={0} cells={[
          { label: "Expiration", value: String(expTotal), color: expWorst ? EXPIRY_COLOR[expWorst] : LOOK.muted, onClick: () => setExpSheetOpen(true) },
          { label: "Trips", value: String(dispatchedList.length + plannedMoves.length), color: dispatchedList.length + plannedMoves.length > 0 ? "#93c5fd" : LOOK.muted,
            onClick: () => setLoadsSheetOpen(true) },
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
          ? ((parked.parked_by === userId || (!parked.parked_by && parked.driver_id === userId)) ? "Resume Trip" : "Begin Trip")
          : step.kind === "start" && emptyMoves.current && !openTrip ? "Arrive"
          : step.kind === "start" && dispatchedList.length && trailerId ? "Begin Trip"
          : step.kind === "start" ? "Empty Move"
          : step.label}
      </button>}
      {step.kind === "start" && emptyMoves.current && !openTrip && !openingPlanner && (
        <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 6 }}>
          Empty move in progress since {new Date(emptyMoves.current.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Tap when you get there.
        </div>
      )}
      {step.kind === "start" && !openTrip && !openingPlanner && (() => {
        const planned = userId ? dispatchedMovesFor(emptyMoves.moves, userId) : [];
        const place = (id: string | null, text: string | null) => { const l = id ? locations.find((x) => x.location_id === id) : null; return l ? locationTitle(l) : text || "—"; };
        const trailerName = (id: string | null) => (id ? ((equipment as { trailerNameById?: Record<string, string> }).trailerNameById?.[id] ?? null) : null);
        const startMove = (m: (typeof planned)[number]) => {
          if (!truckId) { setNotice({ text: "Pick your truck first, then start the move.", tripId: null }); return; }
          setStampAsk({ kind: "move_begin", plannedId: m.move_id });
        };
        const doInstant = (m: (typeof planned)[number]) => {
          emptyMoves.beginPlanned(beginPatch(m, { atIso: new Date().toISOString(), truckId: truckId ?? null, trailerId: stepKindOf(m) === "drop" ? (m.trailer_id ?? trailerId ?? null) : (m.trailer_id ?? null), beginMiles: truckReading?.odometerMi != null ? Math.round(truckReading.odometerMi) : null }));
          if (stepKindOf(m) === "drop") void equipment.setCurrentEquipment?.(truckId ?? null, null);
          else shell.setEquipOpen(true);
        };
        return <DispatchedMovesCard moves={planned} text={(m) => stepText(m, { place, trailer: trailerName })}
          when={(m) => (m.planned_start_at ? new Date(m.planned_start_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : null)}
          onStart={startMove} onInstant={doInstant} blockedBy={emptyMoves.current ? "Arrive at your current move first." : null} />;
      })()}
      {step.kind !== "start" && !openingPlanner && !arriveCardPending && (
        <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 6 }}>{parkRequested ? "Dispatch asked you to park this load" : step.detail}</div>
      )}
      {sigDelivery && !openingPlanner && (
        <button type="button" className="dash-press" onClick={() => setConsigneeSignOpen(true)}
          style={{ width: "100%", marginTop: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", background: "transparent", color: sigDelivery.consignee_signature ? "#4ade80" : "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 }}>
          {sigDelivery.consignee_signature ? `✓ Consignee signed${sigDelivery.consignee_name ? ` · ${sigDelivery.consignee_name}` : ""}` : "Get consignee signature"}
        </button>
      )}
      {shopDown && (
        <div style={{ marginTop: 8, padding: "10px 12px", border: "1px solid rgba(248,113,113,0.55)", background: "rgba(248,113,113,0.08)", borderRadius: 2, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>
            {shopDown.unitKind === "truck" ? "Truck" : "Trailer"} {shopDown.unitName} is down
            <div style={{ fontSize: 12, fontWeight: 500, color: muted }}>Plan trips, but no loading until it is back in service.</div>
          </div>
          <button type="button" onClick={() => void backInService()} disabled={backBusy}
            style={{ padding: "9px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", background: "#fff", color: "#000", border: "none", borderRadius: 2, opacity: backBusy ? 0.6 : 1 }}>
            {backBusy ? "…" : "Back in service"}
          </button>
        </div>
      )}
      {!openingPlanner && (
        <button type="button" className="dash-press" onClick={() => { setError(null); setAddingLoad(true); setSheetOpen(true); }}
          style={{ width: "100%", marginTop: 8, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", background: "transparent", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 2 }}>
          + Add load
        </button>
      )}
      {(delayLeg || canCancelNow || (!!emptyMoves.current && !openTrip)) && !openingPlanner && (
        <DelayButton leg={delayLeg ? runningDelay?.leg ?? delayLeg : null} running={runningDelay} onStart={startDelay} onEnd={() => endDelay()}
          cancelWord={canCancelNow ? "load" : "move"}
          onCancel={canCancelNow ? () => { setCancelErr(null); setCancelOpen(true); } : emptyMoves.current && !openTrip ? () => { emptyMoves.discard(emptyMoves.current!.move_id); } : undefined}
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
      <EquipmentToolsRegistrar onInspect={() => setInspectOpen(true)} onTruckDown={() => { repairFromDelay.current = false; setRepairOpen(true); }} />
      <SectionLabel>Tools</SectionLabel>
      {(() => {
        // Six tiles. Tiles with a list open a pop-out of smaller tools; the Reports tile holds every form.
        const A = {
          truckDown: { icon: "truck" as const, label: "Truck down", sub: "Request a repair", onClick: () => { repairFromDelay.current = false; setRepairOpen(true); } },
          inspect: { icon: "plan" as const, label: "Inspect", sub: "Truck or trailer", onClick: () => setInspectOpen(true) },
          tankCheck: { icon: "plan" as const, label: "Tank check", sub: "Store tank readings", onClick: () => setTankCheckOpen(true) },
          termWork: { icon: "terminal" as const, label: "Terminal work", sub: termWork.current ? `Running ${workClock(workMinutes(termWork.current, Date.now()))}` : "Timer", subColor: termWork.current ? "#fbbf24" : undefined, onClick: () => setTermWorkOpen(true) },
          emptyMove: { icon: "locate" as const, label: "Empty move", sub: emptyMoves.current ? "In progress" : "Bobtail, repo", subColor: emptyMoves.current ? "#fbbf24" : undefined, onClick: () => { if (openTrip) setNotice({ text: "Finish or cancel your current load before starting an empty move.", tripId: null }); else if (emptyMoves.current) setNotice({ text: "An empty move is already in progress. Tap Arrive when you get there.", tripId: null }); else setMoveConfirm(true); } },
          freight: { icon: "truck" as const, label: "Freight", sub: freight.loads.some((l) => l.status === "open") ? "Load open" : "Van, flatbed, LTS", subColor: freight.loads.some((l) => l.status === "open") ? "#4ade80" : undefined, onClick: () => setFreightOpen(true) },
        };
        const tankCheckItems = shell.isSolo === false ? [A.tankCheck] : [];
        const fleetWorkSub = openSafety ? "Sign in needed" : null;
        const tools: ToolItem[] = [
          { icon: "fuel", label: "Fuel", sub: fuel.active ? "In progress" : null, subColor: fuel.active ? "#fbbf24" : undefined, onClick: () => void tapFuel() },
          { icon: "plan", label: "Planner", sub: "Set up load plans", onClick: () => nav.go("plan", "/planner?plan=1"), busy: nav.is("plan") },
          { icon: "truck", label: "Equipment", sub: equipmentLabel, subColor: undefined, onClick: openEquipment },
          { icon: "store", label: "Location", sub: null, group: [
            terminalsTool(() => shell.setTerminalHubOpen(true)),
            deliveriesTool(() => setManageLocsOpen(true)),
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
        tools.push({ icon: "radio", label: "Squawk", sub: squawkNew ? `${squawkNew} new` : null, subColor: squawkNew ? "#60a5fa" : undefined, onClick: () => { setSquawkType(null); setSquawkOpen(true); } });
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
          <button type="button" onClick={() => void askEquipment(() => doTakeOver())}
            style={{ marginTop: 10, borderRadius: 2, border: "none", background: "#fff", color: "#000", padding: "10px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Take Over Trip
          </button>
        </div>
      )}

      {/* Trip */}
      {openTrip ? (
        <TripCardView
          style={{ ...card, marginBottom: 14 }}
          bar={trailerBar}
          heading={`Current trip · ${STATUS_LABEL[openTrip.status]}`}
          right={trailerLabel}
          route={(openTrip.shipper || openTrip.customer) ? [openTrip.shipper, openTrip.customer].filter(Boolean).join(" → ") : null}
          plan={planLine ? { label: planLine.label, comps: planLine.comps.map(chipFor), splash: splashComps.length > 0 && ["draft", "loading", "in_transit"].includes(openTrip.status) && !anyDelivered && !pickups.some((p) => p.load_id) ? { text: Object.keys(tripSplash).length ? "Splash ✓" : "Splash", on: Object.keys(tripSplash).length > 0, onTap: openSplash } : null } : null}
          swapKeys={splashPickup && baseStop && !splashPickup.arrived_at && !baseStop.arrived_at ? [splashPickup.pickup_id, baseStop.pickup_id] : []}
          onSwap={swapSplashOrder}
          pickups={pickupRows(pickups, {
            currentId: snap ? activePickup(snap.pickups)?.pickup_id ?? null : null,
            noLoadReason: (c) => noLoadReasonLabel(c) ?? "",
            place: (p) => { const t = p.terminal_id ? terminalCatalog.find((x) => String(x.terminal_id) === String(p.terminal_id)) : null; return t ? [t.city, t.state].filter(Boolean).join(", ") : [p.city, p.state].filter(Boolean).join(", "); },
          })}
          deliveries={deliveryRows(liveDeliveries, {
            headedId: snap && !activePickup(snap.pickups) && aboardRows.length > 0 ? plannedDeliveries(snap.deliveries)[0]?.delivery_id ?? null : null,
            place: (d) => { const loc = d.location_id ? locations.find((l) => l.location_id === d.location_id) : null; return loc ? locationPlace(loc) : ""; },
            name: deliveryName,
          })}
          noDelivery={(
            <div style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ color: muted, width: 66, flexShrink: 0 }}>Delivery</span>
              <button type="button" onClick={() => setPicker({ mode: "select" })}
                style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, color: "#fff", fontSize: 14, textAlign: "left", cursor: "pointer" }}>
                Not set <span style={{ color: muted }}>›</span>
              </button>
            </div>
          )}
          onDelivery={(key) => { const d = liveDeliveries.find((x) => x.delivery_id === key); if (d) setPicker({ mode: "reroute", delivery: d }); }}
          footer={(
          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              {lastLoadId && (
                <button type="button" onClick={() => { setOpeningReport(true); shell.postPlannerIntent("report", lastLoadId); }} {...busyProps(openingReport)} style={{ ...smallLink, display: "inline-flex", alignItems: "center", gap: 6 }}>Load Report {openingReport ? <Spinner size={11} /> : "›"}</button>
              )}
              {blendWarnings.length > 0 && (
                <div style={{ width: "100%", fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>
                  {blendWarnings.map((w) => (
                    <div key={w.text} style={{ marginBottom: 8 }}>
                      <div>Blend off target: {w.text}</div>
                      <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
                        <button type="button" onClick={() => keepBlendAsLoaded(w.comp, w.pct)} style={smallLink}>Deliver as {blendLabel(w.pct)}</button>
                        {w.pct < w.target && canAddPickup && <button type="button" onClick={openAddPickup} style={smallLink}>Add more ethanol</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {notesSite && (
                <button type="button" onClick={() => setSiteNotesOpen(true)} style={smallLink}>{notesSite.word} ›</button>
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
          )}
        />
      ) : parked && parkedSnap ? (() => {
        // A load parked on this trailer: the same trip card, loaded, in blue. A trailer holding a parked load can't start a new trip.
        const mine = parked.parked_by === userId || (!parked.parked_by && parked.driver_id === userId);
        const aboardP = onBoard(parkedSnap.compLoads);
        const byComp: Record<number, string | null> = {};
        for (const c of aboardP) byComp[c.comp_number] = c.product_id;
        const nums = [...new Set([...Object.keys(compSizes).map(Number), ...aboardP.map((c) => c.comp_number)])].sort((a, b) => b - a);
        const parkedBar = nums.length > 0 ? <TrailerHeader variant="bar" trailerId={trailerId} loaded={byComp} data={trailerHdr} /> : null;
        const dels = parkedSnap.deliveries.filter((d) => d.status !== "cancelled");
        const who = mine ? "You" : handoffName ?? "Another driver";
        // Same read-only details the open trip shows: the plan letter, a splash note, blends off target, the Load Report.
        const storedP = getTripPlan(userId || null, parked.trip_id);
        const matchP = storedP?.snapshot ? null : findMatchingPlan(sheetPresets, layoutFromProducts(Object.fromEntries(nums.map((n) => [n, byComp[n] ?? null])), nums));
        const planLabelP = storedP?.snapshot ? `Plan ${slotLetter(storedP.slot)}` : matchP ? `Plan ${slotLetter(matchP.slot)}` : "";
        const splashP = getTripSplash(userId || null, parked.trip_id);
        const blendP = Object.entries(splashP).flatMap(([k, sp]) => {
          const rows = aboardP.filter((r) => r.comp_number === Number(k));
          if (rows.length < 2) return [];
          const add = rows.filter((r) => r.product_id === sp.additiveProductId).reduce((t, r) => t + (r.gross_gallons ?? 0), 0);
          const base = rows.filter((r) => r.product_id !== sp.additiveProductId).reduce((t, r) => t + (r.gross_gallons ?? 0), 0);
          const pct = blendPct(add, base);
          return pct != null && offTarget(pct, sp.pct) ? [`C${k} is ${blendLabel(pct)} (${pct.toFixed(1)}%), target ${sp.pct}%`] : [];
        });
        const loadIdP = [...parkedSnap.pickups].filter((q) => q.load_id && (q.outcome === "loaded" || q.left_at)).sort((x, y) => y.seq - x.seq)[0]?.load_id ?? null;
        return (
          <TripCardView
            style={{ ...card, marginBottom: 14, borderColor: "rgba(96,165,250,0.6)" }}
            bar={parkedBar}
            heading="No trip in progress"
            right={<span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: "#93c5fd", whiteSpace: "nowrap" }}>PARKED PRELOADED</span>}
            route={(parked.shipper || parked.customer) ? [parked.shipper, parked.customer].filter(Boolean).join(" → ") : null}
            plan={{ label: planLabelP, comps: nums.map((n) => chipFor(byComp[n] ?? null)), splash: Object.keys(splashP).length ? { text: "Splash ✓", on: true, onTap: () => {} } : null }}
            pickups={pickupRows(parkedSnap.pickups, {
              currentId: null,
              noLoadReason: (c) => noLoadReasonLabel(c) ?? "",
              place: (p) => { const t = p.terminal_id ? terminalCatalog.find((x) => String(x.terminal_id) === String(p.terminal_id)) : null; return t ? [t.city, t.state].filter(Boolean).join(", ") : [p.city, p.state].filter(Boolean).join(", "); },
            })}
            deliveries={deliveryRows(dels, {
              headedId: aboardP.length > 0 ? plannedDeliveries(parkedSnap.deliveries)[0]?.delivery_id ?? null : null,
              place: (d) => { const loc = d.location_id ? locations.find((l) => l.location_id === d.location_id) : null; return loc ? locationPlace(loc) : ""; },
              name: deliveryName,
            })}
            footer={(
              <div style={{ marginTop: 12 }}>
                {loadIdP && (
                  <button type="button" onClick={() => { setOpeningReport(true); shell.postPlannerIntent("report", loadIdP); }} {...busyProps(openingReport)} style={{ ...smallLink, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>Load Report {openingReport ? <Spinner size={11} /> : "›"}</button>
                )}
                {blendP.length > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>{blendP.map((t) => <div key={t}>Blend off target: {t}</div>)}</div>
                )}
                <div style={{ fontSize: 13, color: muted }}>
                  {who} parked this trailer
                  {parked.parked_at ? ` ${new Date(parked.parked_at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
                  {parked.parked_for ? ` · ${PARK_FOR_LABEL[parked.parked_for]}` : ""}
                  {parked.parked_where ? ` · at ${parked.parked_where}` : ""}
                </div>
                {parked.parked_note && (
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8, padding: "8px 10px", background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.45)" }}>&ldquo;{parked.parked_note}&rdquo;</div>
                )}
                <div style={{ marginTop: 8 }}>
                  {aboardP.sort((a, b) => a.comp_number - b.comp_number).map((c) => (
                    <div key={c.compartment_load_id} className="dash-num" style={{ fontSize: 15, fontWeight: 800, padding: "6px 10px", marginTop: 4, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.45)" }}>{loadLine(c)}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>{mine ? "Resume to deliver it." : "Begin the trip to deliver it. It moves to you."}</div>
              </div>
            )}
          />
        );
      })() : (
        <div style={{ ...card, marginBottom: 14 }}>
          {trailerBar && <div style={{ marginBottom: 8 }}>{trailerBar}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>No trip in progress</div>
            {trailerLabel}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>Start a load when you have an order.</div>
        </div>
      )}

      {squawkTop && !squawkOpen && (
        <button type="button" className="dash-press" onClick={() => { setSquawkType(squawkTop.type); setSquawkOpen(true); }}
          style={{ ...card, display: "flex", alignItems: "center", gap: 10, width: "100%", marginBottom: 14, textAlign: "left", color: "#fff", cursor: "pointer", borderColor: "rgba(96,165,250,0.55)" }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>Squawk · {squawkNew} new<span style={{ color: muted, fontWeight: 600 }}> in {SQUAWK_TYPES.find((c) => c.type === squawkTop.type)?.label ?? "a channel"}</span></span>
          <span style={{ color: muted }}>›</span>
        </button>
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
        splashPlan={splashPlanProp}
        weightRoomLbs={splashRoomLbs}
        orders={children?.orders ?? []}
        orderError={orderErr}
        busy={addBusy}
        onPickTerminal={addPickTerminal}
        onConfirm={confirmAddPickup}
        onClose={() => setAddOpen(false)}
      />

      <SplashPlanSheet
        open={splashOpen}
        comps={splashComps.map((n) => ({ n, size: compSizes[n] || 0, baseProductId: baseByComp[n] }))}
        hasPickup={!!splashPickup}
        catalog={products.map((p) => { const i = productInfo(p.product_id); return { product_id: p.product_id, name: i.name, code: i.code, hex: i.hex }; })}
        initial={tripSplash}
        onSave={saveSplash}
        onClose={() => setSplashOpen(false)}
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
        const staleFinish = finishDeliveryRow && staleOpenDelivery([finishDeliveryRow], Date.now()) ? finishDeliveryRow : null;
        // Only while something required is missing; the optional steps stay under Profile > Setup.
        const showSetup = !!setup.summary && setup.summary.requiredLeft > 0;
        if (!showGross && !showExp && !showSync && !showFuel && !showSetup && !staleFinish) return null;
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
            {staleFinish && (
              <InfoRow
                label="Finish delivery"
                value="Still open · tap to finish"
                valueColor="#f87171"
                onClick={openDelivery}
                last={!showFuel && !showGross && !showExp && !showSync}
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
      <LoadsSheet open={loadsSheetOpen} items={dispatchedItems} moves={plannedMoves.map((m) => ({ id: m.move_id, text: stepText(m, { place: placeName, trailer: trailerNameOf }), when: m.planned_start_at ? new Date(m.planned_start_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : null }))} onSwap={swapDispatched} onClose={() => setLoadsSheetOpen(false)}
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
      <FullscreenModal open={rackSheetOpen} title={rackCity ? `${rackName} · ${rackCity}` : rackName} onClose={() => (arrivalPickup?.arrived_at ? setLeaveArrival(true) : setRackSheetOpen(false))}
        headerLeft={<BackArrow onClick={() => (arrivalPickup?.arrived_at ? setLeaveArrival(true) : setRackSheetOpen(false))} />}
        footer={arrivalPickup ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" className="dash-press" onClick={startLoading} style={{ width: "100%", padding: "18px 0", fontSize: 18, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>Plan Review</button>
          </div>
        ) : null}>
        {(() => {
          const hair = "rgba(255,255,255,0.12)";
          const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
          const panel: React.CSSProperties = { background: "#0f0f10", border: `1px solid ${hair}` };
          const label = (t: string, right?: React.ReactNode) => (
            <div style={{ display: "flex", alignItems: "baseline", margin: "18px 0 8px", paddingBottom: 6, borderBottom: `1px solid ${hair}` }}><span style={{ ...cap, flex: 1 }}>{t}</span>{right}</div>
          );
          return (
            <>
              {arrivalPickup?.arrived_at && (
                <div style={{ padding: "12px 14px", background: "#0f0f10", border: `1px solid ${hair}`, marginBottom: 4 }}>
                  <div style={{ ...cap }}>Arrived</div>
                  <div className="dash-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
                    {new Date(arrivalPickup.arrived_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    <span style={{ fontSize: 14, fontWeight: 600, color: muted }}> · waiting {Math.max(0, Math.round((Date.now() - Date.parse(arrivalPickup.arrived_at)) / 60000))} min</span>
                  </div>
                  <div style={{ marginTop: 4 }}><SiteAverage kind="terminal" id={rackTerminalId || null} /></div>
                  <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>Open Plan Review to check the plan. Begin Loading there sets your loading start time.</div>
                </div>
              )}
              {arrivalPickup?.arrived_at && rackTerminalId && <div style={{ marginTop: 8 }}><SiteNotes kind="terminal" id={rackTerminalId} mode="edit" userId={userId} /></div>}
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
              {arrivalPickup && <RackDelayButton running={runningDelay} onClick={() => setRackDelayOpen(true)} />}
            </>
          );
        })()}
      </FullscreenModal>
      <StampQuestion open={leaveArrival} title="Leave Plan Review?"
        keepLabel={`Keep arrival time ${stampClock(arrivalPickup?.arrived_at)}`} undoLabel="Undo arrival time"
        onKeep={() => { setLeaveArrival(false); setRackSheetOpen(false); }}
        onUndo={() => { setLeaveArrival(false); setRackSheetOpen(false); doUndoArrival(); }}
        onStay={() => setLeaveArrival(false)} />
      {rackTerminalId && (
        <TerminalStatusSheet
          open={rackStudOpen} onClose={() => setRackStudOpen(false)} terminalId={rackTerminalId} terminalName={rackName}
          rackId={rackStatus.rackId} rackName={rackStatus.rackCount > 1 ? rackStatus.rackName : null}
          products={rackStatus.products} reports={rackAlerts.reports} companyId={companyId} userId={userId}
          truckLabel={equipment.currentTruckName ?? ""}
          onChanged={() => { void rackStatus.reload(); rackAlerts.refresh(); }}
        />
      )}
      {/* After the rack window in the page, so it stacks above it. */}
      <RackDelaySheet
        open={rackDelayOpen}
        products={rackStatus.products.map((r: any) => ({ productId: String(r.product_id), name: productInfo(String(r.product_id)).name }))}
        onClose={() => setRackDelayOpen(false)}
        onSubmit={async (code, productIds) => {
          const pk = arrivalPickup;
          if (!userId || !pk) return "No rack arrival to delay.";
          if (!readRunningDelay(userId)) {
            const d: RunningDelay = { tripId: pk.trip_id, leg: "at_rack", code, note: null, startedAt: new Date().toISOString(), pickupId: pk.pickup_id, deliveryId: null };
            writeRunningDelay(userId, d);
            setRunningDelay(d);
          }
          if (pk.terminal_id && companyId) {
            const r = await submitOutageReport({ terminalId: String(pk.terminal_id), selectedRackId: pk.rack_id ?? null, productIds, reportType: code as OutageReportType, companyId, userId, truckLabel: equipment.currentTruckName ?? "" });
            if (r.error) return "The delay started, but the warning to other drivers didn't go out. Try again from the Terminal sheet.";
          }
          return null;
        }}
      />
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
      <SquawkSheet open={squawkOpen} onClose={() => setSquawkOpen(false)} userId={userId || null} ctx={squawkCtx} initialType={squawkType}
        cityOptions={squawkCities}
        onCity={(v) => { const [city, state] = v.split("|"); const c = { city, state }; setSquawkCity(c); try { if (squawkCityKey) localStorage.setItem(squawkCityKey, JSON.stringify(c)); } catch { /* storage blocked */ } }} />
      <FullscreenModal open={siteNotesOpen && !!notesSite} title={notesSite?.title ?? ""} onClose={() => setSiteNotesOpen(false)} footer={null}>
        {notesSite && (
          <>
            <SiteNotes kind={notesSite.kind} id={notesSite.id} mode="read" />
            <div style={{ fontSize: 12, color: muted, marginTop: 10 }}>Notes can be changed once you arrive and tap Arrived. Until then you can't see what has changed on site.</div>
          </>
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

      <OffDutySheet open={offWhyOpen && !!offAsk} statusLabel={dutyLabel(offAsk?.status)} reasons={reasonsOrDefault(reasons as any, "nonproductive")} onSubmit={submitOffWhy} onClose={() => setOffWhyOpen(false)} />
      <ExplanationSheet open={explainOpen} hours={shift.current?.hours ?? 0} reasons={reasonsOrDefault(reasons as any, "shift_explanation")} onClose={() => setExplainOpen(false)}
        onSubmit={(pick) => { shift.explain({ ...explanationPayload(pick, shift.current?.hours ?? 0) }); finishShift(); setExplainOpen(false); }}
        onSkip={() => { finishShift(); setExplainOpen(false); }} />
      <CatchUpSheet open={catchUp.open} cards={catchUp.cards} onDone={(a) => void catchUp.apply(a)} onSkip={catchUp.skip} />
      <FullscreenModal open={moveConfirm} title="Empty move" onClose={() => setMoveConfirm(false)} footer={null}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Start an empty move?</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, margin: "8px 0 14px" }}>
          The truck is going somewhere with no load. You'll confirm the odometer, then the big button reads Arrive. Tap it when you get there and update the equipment status.
        </div>
        <button type="button" onClick={() => { setMoveConfirm(false); shell.setEquipOpen(true); }}
          style={{ width: "100%", textAlign: "left", padding: "13px 14px", marginBottom: 12, fontSize: 15, fontWeight: 700, background: "#0f0f10", color: "#fff", border: "1px solid rgba(255,255,255,0.14)", cursor: "pointer" }}>
          {equipment.currentTruckName ? `Truck ${equipment.currentTruckName} · ${equipment.currentTrailerName ? `Trailer ${equipment.currentTrailerName}` : "Bobtail"}` : "Pick equipment"} ›
        </button>
        <button type="button" style={{ width: "100%", padding: "16px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}
          onClick={() => { setMoveConfirm(false); startEmptyMove(); }}>Start empty move</button>
        <button type="button" style={{ width: "100%", padding: "14px 0", marginTop: 10, fontSize: 14, fontWeight: 800, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", cursor: "pointer" }}
          onClick={() => setMoveConfirm(false)}>Not now</button>
      </FullscreenModal>
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
      <ShiftStartConfirm open={!!shiftAsk} reason={shiftAsk?.reason ?? ""} atMs={shiftAsk?.atMs ?? Date.now()} nowMs={Date.now()} skipLabel={shiftAsk?.always ? "Start now" : "Not now"} onConfirm={confirmShiftStart} onSkip={skipShiftStart} />
      {endAsk && truckId && companyId && (
        <EquipmentStatusModal open endShift={!endAsk.arrival} onClose={() => { const wasEnd = !endAsk.arrival; setEndAsk(null); if (wasEnd) void releaseEquipment(truckId, trailerId).then(() => { void equipment.fetchCombos?.(); void equipment.loadCurrentEquipment?.(); equipment.clearSelectedEquipment?.(); }); }} companyId={companyId} unitKind="truck" unitId={truckId} unitName={endAsk.name}
          pair={trailerId ? { truckId, trailerId, truckName: endAsk.name, trailerName: (equipment.trailerNameById?.[trailerId] || equipment.currentTrailerName || "") } : null}
          currentStatus={endAsk.status} currentNotes={endAsk.notes} currentSubStatus={endAsk.sub} homeLocalArea={endAsk.area}
          allowed={endAsk.arrival ? undefined : endAsk.sleeper ? ["in_use", "deadline", "readyline"] : ["deadline", "readyline"]}
          onParkPreloaded={endAsk.loaded ? () => { setEndAsk(null); setParkOpen(true); } : undefined}
          presetRegion={parkPreset?.region ?? null} presetLocalArea={parkPreset?.local_area ?? null}
          presetPin={parkStampRef.current?.lat != null && parkStampRef.current?.lon != null ? { lat: parkStampRef.current.lat, lon: parkStampRef.current.lon, label: parkStampRef.current.label, placeId: parkStampRef.current.placeId } : null}
          locationOptional={!!parkStampRef.current?.lat}
          onSaved={(s: FleetStatus) => {
            const arrival = !!endAsk.arrival;
            setEndAsk(null);
            void equipment.fetchCombos?.();
            void equipment.loadCurrentEquipment?.(); // parking let go of the units: the dashboard must stop showing them
            if (!arrival) equipment.clearSelectedEquipment?.(); // an arrival keeps what the driver holds unless the status released it
            parkStampRef.current = null; // the status window writes the pin itself
          }} />
      )}
      <ShiftSheet open={shiftOpen} onClose={() => setShiftOpen(false)} scheduled={shiftRecapData.scheduled} running={!!shift.current} recap={shiftRecapData.recap} periodLabel={shiftRecapData.periodLabel}
        onStart={() => shift.start()} onEnd={() => { setShiftOpen(false); requestEnd(); }}
        onCallout={() => { setShiftOpen(false); setCalloutOpen(true); }} onStandby={() => { setShiftOpen(false); setStandbyOpen(true); }} onSignOut={() => void dashIdentity.signOut()} />
      <StandbySheet open={standbyOpen} onClose={() => setStandbyOpen(false)} userId={userId || null} companyId={companyId || null}
        cycleLeftMin={myHos?.cycleLeftMin ?? null} recapDays={myHos?.recap?.days ?? []} />
      <CalloutSheet open={calloutOpen} onClose={() => setCalloutOpen(false)} reasons={reasonsOrDefault(reasons as any, "callout")} divisions={callouts.divisions} defaultDivision={callouts.profile.division} tz={callouts.tz} mine={callouts.mine}
        onWithdraw={callouts.withdraw}
        onCreate={async (v) => {
          const r = await callouts.create({ reason: v.reason, reasonId: v.reasonId, note: v.note, date: v.date, time: v.time }, v.category, v.division);
          return r === "sent" ? "Dispatch and your manager were emailed. You can withdraw it until your shift starts." : r === "waiting" ? "Saved. The email will go when you have signal." : "Saved, but no email is set up for your area yet. Tell dispatch.";
        }} />
      <PerDiemSheet open={perDiemOpen} onClose={() => setPerDiemOpen(false)} home={perDiem.home} cards={perDiem.cards} loading={perDiem.loading} onSaveHome={perDiem.saveHome} onClaim={perDiem.claim} onWithdraw={perDiem.withdraw} />
      <InspectionSheet open={inspectOpen} onClose={() => setInspectOpen(false)} units={repairUnits} campaignsFor={openCampaigns.campaignsFor} companyId={companyId} userId={userId} onSubmit={submitInspection} />
      <RepairSheet open={repairOpen} onClose={() => { setRepairOpen(false); repairFromDelay.current = false; }} units={repairUnits} onSend={sendRepairRequest} />
      <PaperLogSheet open={paperLogOpen} onClose={() => setPaperLogOpen(false)} companyId={companyId} userId={userId || null}
        reasons={reasonsOrDefault(reasons as any, "paper_log")}
        onDone={(pick, cap) => {
          if (companyId && userId) recordShiftEvent(getTripStore(userId), { companyId, userId, actorId: userId, type: PAPER_LOG_EVENT, payload: { ...paperLogPayload(pick, cap) } });
          setPaperLogOpen(false);
        }} />

      <DocumentSheet open={docOpen} onClose={() => setDocOpen(false)} companyId={companyId} userId={userId || null} bolTrips={docOpen ? recentBolTrips() : []}
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
        onChangePickup={() => { startPickupChange(); if (location.selectedCity) shell.setTermOpen(true); else shell.setLocOpen(true); }}
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
        productChip={(id) => { const p = productInfo(id); return { code: p.code, name: p.name, color: p.hex ?? productColorFor(p.name) }; }}
        equipmentLabel={equipmentLabel}
        locations={locations}
        tanks={locList.tanks}
        origin={origin}
        companyId={companyId}
        userId={userId}
        onLocationAdded={() => void locList.reload()}
        busy={busy}
        error={error}
        onClose={() => { setSheetOpen(false); setAddingLoad(false); setVerifyActive(false); }}
        onSubmit={submit}
        forDriver={addingLoad ? "self" : null}
        planEquipLabel={addingLoad ? (planEquip?.label ?? ([equipment.currentTruckName ? `Truck ${equipment.currentTruckName}` : "No truck", equipment.currentTruckName ? (equipment.currentTrailerName ? `Trailer ${equipment.currentTrailerName}` : "Bobtail") : null].filter(Boolean).join(" · "))) : null}
        onChangeEquipment={addingLoad ? () => setPlanEquipOpen(true) : undefined}
        liveMiles={truckReading?.odometerMi ?? null}
        milesStatus={odometerStatus(truckReading ?? null, truckReadingFailed)}
        suggestStart={async () => (truckReading?.city ? { city: truckReading.city, state: truckReading.state } : await truckLastKnownPlace(truckId))}
      />

      <PlanEquipmentSheet open={planEquipOpen} companyId={companyId || null} truckId={(planEquip ?? { truckId: truckId ?? null }).truckId} trailerId={(planEquip ?? { trailerId: trailerId ?? null }).trailerId}
        onPick={setPlanEquip} onClose={() => setPlanEquipOpen(false)} />
      <TripEquipmentSheets {...tripEquip.sheets} />
      <TarePairHost userId={userId || null} onPaired={(id) => { void (async () => { await equipment.fetchCombos?.(); if (id) equipment.setSelectedComboId?.(id); await equipment.loadCurrentEquipment?.(); })(); }} />
      <CancelTripSheet
        open={cancelOpen && !!openTrip}
        title={children?.primaryOrder?.order_number ? `Order ${children.primaryOrder.order_number}` : "Load"}
        busy={cancelBusy}
        error={cancelErr}
        onSubmit={(v) => { if (truckId && companyId) setStampAsk({ kind: "cancel", v }); else void onCancelSubmit(v); }}
        onClose={() => setCancelOpen(false)}
      />
      {/* After the cancel window and the end-shift flow so it opens over them, not behind. */}
      <OdometerConfirmSheet open={!!stampAsk && !!truckId}
        title={stampAsk?.kind === "shift" ? "End shift" : stampAsk?.kind === "move_begin" ? "Empty move" : stampAsk?.kind === "move_end" ? "Arrived" : "Load cancelled"}
        lead={stampAsk?.kind === "shift" ? "Confirm the truck's odometer to end your shift." : stampAsk?.kind === "move_end" ? "Confirm the truck's odometer. The empty move ends here." : "Confirm the truck's odometer. The empty run starts here."}
        placeLabel={stampPlaceLabel} loading={stampCtx.loading} guess={stampCtx.guess} floor={stampFloor}
        onConfirm={(n) => void confirmStamp(n)} onBack={() => setStampAsk(null)} />
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

      {finishDeliveryRow?.arrived_at && snap && (
        <DropSiteSheet
          open={dropSiteOpen} onClose={() => setDropSiteOpen(false)}
          onUndoArrival={() => { setDropSiteOpen(false); doUndoArrival(); }} onUndoBegin={() => { setDropSiteOpen(false); undoBeginDeliveryNow(); }}
          siteName={deliveryName(finishDeliveryRow)} arrivedAt={finishDeliveryRow.arrived_at} beganAt={finishDeliveryRow.begin_at ?? null}
          products={dropProducts}
          slots={[...new Set([...Object.keys(compSizes).map(Number), ...onBoard(snap.compLoads).map((c) => c.comp_number)])].sort((a, b) => a - b)}
          comps={onBoard(snap.compLoads).map((c) => { const i = productInfo(c.product_id); return { n: c.comp_number, bol: c.bol_number?.trim() || null, gallons: Number(c.gross_gallons ?? c.net_gallons ?? 0), color: i.hex ?? productColorFor(i.name) }; })}
          board={finishDeliveryRow.location_id ? (
            <SiteBoard kind="location" id={finishDeliveryRow.location_id} name={deliveryName(finishDeliveryRow)} hideName trips={fleet.trips} product={productInfo} now={new Date()}
              etaFor={() => null} canOpen={(tid) => fleet.trips.some((f) => f.trip.trip_id === tid && f.trip.driver_id === userId)}
              onOpenTrip={(tid) => { setDropSiteOpen(false); nav.go(`trip:${tid}`, `/planner/trips/${tid}`); }} />
          ) : null}
          delay={<DelayButton leg="at_drop" running={runningDelay} onStart={startDelay} onEnd={() => endDelay()} />}
          notes={finishDeliveryRow.location_id ? <SiteNotes kind="location" id={finishDeliveryRow.location_id} mode="edit" userId={userId} /> : undefined}
          avg={<SiteAverage kind="location" id={finishDeliveryRow.location_id ?? null} />}
          sop={settings.sop_drop_begin?.trim() || DEFAULT_SOP_DROP}
          onBegin={beginDelivery} onFinish={finishFromDropSite}
        />
      )}

      {finishDeliveryRow && snap && store && (() => {
        const here = mergedHere(finishDeliveryRow.delivery_id).rows;
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
            bolGroups={bolGroups(snap.compLoads, snap.pickups, productName)}
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

      <LocationsHub kind="deliveries" open={manageLocsOpen} onClose={() => setManageLocsOpen(false)} companyId={companyId} userId={userId} role={shell.role ?? null} isSuperAdmin={!!shell.isSuperAdmin} origin={origin} />

      <LocationPicker kinds={["store"]}
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
