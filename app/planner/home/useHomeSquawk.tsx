"use client";
// app/planner/home/useHomeSquawk.tsx
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

import { supabase } from "@/lib/supabase/client";

import { topUnread, totalUnread, type SquawkCtx } from "@/lib/squawk/squawk";
import { playChirp, useMyArea, useSquawkAlerts } from "@/lib/squawk/useSquawk";

import { dropFuelStops, STOP_GRACE_MS } from "@/lib/push/stopAlertCore";
import { markStopHandled, pendingStop, readHandledStops } from "@/lib/trips/stopPrompt";
import { DELAY_EVENT, delayEventPayload, delayIssueCode, legForStep, loggedDelays, readRunningDelay, writeRunningDelay, type RunningDelay, endRunningDelay, attachPendingDelays, INSTANT_CODES, logInstantDelay, SHOP_CODE } from "@/lib/trips/delays";

import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { airMiles, kindsOf, locationTitle, type LatLon } from "@/lib/trips/deliveryLocations";

import { applyStartLoad, buildStartLoad, lastShipperCustomer, openTripForDriver, dispatchedForDriver, beginDispatched, truckBeginMiles, tripChildren, type StartLoadDelivery } from "@/lib/trips/tripLogic";
import { activePickup, plannedDeliveries } from "@/lib/trips/tripFlow";
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

import { conflicts, repeatedRefs, usedOrderNumbers } from "@/lib/trips/refs";

import { TrailerHeader, useTrailerHeaderData } from "../components/TrailerViews";

import { checkAddPickup, grossColor, LEGAL_GROSS_LBS } from "@/lib/trips/addPickupCheck";
import { topOffPlan, roughLbsPerGal, mergeBlendRows, blendPct, blendLabel, offTarget, validPct } from "@/lib/trips/splash";
import { getTripSplash, setTripSplash, type TripSplash } from "@/lib/trips/tripSplash";
import { markAddingPickup, releaseAddingPickup } from "@/lib/trips/pickerIntent";
import { isSplashable, splashPickupPlans, refineSecondStop, type StagedPlanned } from "@/lib/trips/splashRows";

import { headingToTerminal, parkedPreloads, storeActivity } from "@/lib/trips/dashboardCards";

import { snoozed, telematicsStart } from "@/lib/shifts/autoStart";

import { readShopDown, writeShopDown, SHOP_BLOCK, type ShopDown } from "@/lib/trips/shopDown";

import { useGeotabEquipment, useSecondSeat } from "../hooks/useGeotabEquipment";
import { remember as rememberRepair, retryPending as retryRepairs, sendRepair } from "@/lib/repairs/sendRepair";

import { beginTripShift, offDutyAsk, telematicsLive } from "@/lib/shifts/dutyStatus";

import { useOtherCarriers, useStoreDeliveries, useTerminalStatus } from "../hooks/useDashboardCards";

import { LOOK, useScrollBackdrop } from "./dashLook";

import { addTrailerAlert, clearTrailerAlerts, fetchTrailerAlerts, sendPendingTrailerAlerts, type TrailerAlert } from "@/lib/trips/trailerAlerts";
import { TerminalAccessStrip } from "./DashboardChrome";

import { openAccessSteps } from "../components/access/useAccessSteps";
import { accessSteps, inProgress, requirementsComplete } from "@/lib/terminals/accessSteps";
import { terminalReadiness, type ReadinessInput } from "@/lib/terminals/readiness";

import { EXP_WARN_DAYS, type ExpiryState } from "@/lib/expiry";

import { type ExpGroup, type ExpRow } from "./DashboardSheets";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import type { useHomeParkAccess } from "./useHomeParkAccess";

export function useHomeSquawk(p: ReturnType<typeof useHomeParkAccess>) {
  const { aboardRows, anyDelivered, companyId, dropSiteKey, location, openTerminalList, openTrip, readiness, readinessLabel, setDropSiteKey, setSquawkCity, shell, snap, squawkCity, step, terminalCatalog, terminals, trailerId, truckId, userId } = p;

  const myArea = useMyArea(userId || null);
  const unreadRows = useSquawkAlerts(userId || null, playChirp);
  const squawkCityKey = userId ? `proTankr:u:${userId}:squawkCity` : null;
  useEffect(() => {
    try { const raw = squawkCityKey ? localStorage.getItem(squawkCityKey) : null; if (raw) setSquawkCity(JSON.parse(raw)); } catch { /* storage blocked */ }
  }, [squawkCityKey]);
  // The next delivery's store, named the same in every company, so "To drop" reaches other carriers too.
  const nextDropLoc = snap ? plannedDeliveries(snap.deliveries)[0]?.location_id ?? null : null;
  useEffect(() => {
    if (!nextDropLoc) { setDropSiteKey(null); return; }
    let off = false;
    void supabase.rpc("squawk_site_key", { p_location_id: nextDropLoc }).then((r) => { if (!off) setDropSiteKey((r.data as string | null) ?? null); });
    return () => { off = true; };
  }, [nextDropLoc]);
  const squawkCtx: SquawkCtx = (() => {
    // With a trip underway the city is the trip's terminal's; otherwise the one the driver picked, else the Planner's.
    const pk = snap ? (activePickup(snap.pickups) ?? [...snap.pickups].sort((a, b) => a.seq - b.seq).find((p) => !p.left_at && p.outcome !== "no_load")) : null;
    const t = pk?.terminal_id ? terminalCatalog.find((x) => String(x.terminal_id) === String(pk.terminal_id)) : null;
    const city = t?.city ? { city: String(t.city), state: String((t as any).state ?? pk?.state ?? "") } : squawkCity ?? (location.selectedCity && location.selectedState ? { city: String(location.selectedCity), state: String(location.selectedState) } : null);
    const nextDel = snap ? plannedDeliveries(snap.deliveries)[0] : null;
    const toRack = snap && !aboardRows.length ? pk?.terminal_id ?? null : null;
    return { toRackTerminalId: toRack ? String(toRack) : null, toDropSiteKey: dropSiteKey, userId, isSuperAdmin: shell.isSuperAdmin, companyId: companyId || null, city: city?.city ?? null, state: city?.state || null, region: myArea.region, localArea: myArea.localArea, truckId: truckId ?? null, trailerId: trailerId ?? null };
  })();
  const squawkCities = useMemo(() => [...new Set(terminalCatalog.filter((t) => t.city && (t as any).state).map((t) => `${t.city}|${(t as any).state}`))].sort().map((v) => ({ value: v, label: v.replace("|", ", ") })), [terminalCatalog]);
  const squawkTop = topUnread(unreadRows);
  const squawkNew = totalUnread(unreadRows);
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
  return { ...p, squawkCityKey, squawkCtx, squawkCities, squawkTop, squawkNew, canAddPickup, plannedCount, accessCollapsed, accessStrip } as const;
}
