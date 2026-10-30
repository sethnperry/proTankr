"use client";
// app/planner/dispatch/page.tsx
//
// Real Dispatch tab dashboard, replacing the old Dashboard/Tasks/Ledger
// placeholder shell (shelved along with the rest of the 2026-07-30
// role-tabs work -- see CLAUDE.md "Terminal Tier — Build Spec"). Reachable
// as the Dispatch/Admin roles' middle tab (CalculatorLayoutClient.tsx).
//
// Pick a driver (shared via shell.selectedDriverId so the Cards tab and
// Terminal tab agree on the same driver across tab switches), then see:
// identity/schedule, equipment + its expiring/expired permit items,
// terminal card status (grouped by city), badges, credentials, and a
// dispatcher-notes box. All expiration coloring throughout this page uses
// the app-wide rule in lib/expiry.ts (30 days yellow, 7 days orange,
// past red, no date gray).
//
// 2026-08-07 rework (per explicit user direction): Terminal Cards grouped
// by city; added Badges and Credentials sections (same admin+dispatch RLS
// FleetCredentialsModal.tsx already relies on -- driver_licenses/
// driver_medical_cards/driver_twic_cards/driver_port_ids); Equipment moved
// above Terminal Cards and switched from "primary" equipment
// (user_primary_trucks/trailers) to whatever combo the driver has actually
// claimed right now (equipment_combos.claimed_by) -- "primary" is a
// separate, different concept (a fallback default, not "what they're in
// today") and reading it here would show stale/wrong equipment for a
// driver who slip-seated into something else.
//
// Equipment's expiring-permit list reads `equipment_permits` (joined to
// permit_types(name)) -- the dynamic system the Binder screen manages --
// not the old hardcoded trucks/trailers columns (reg_expiration_date etc.)
// this originally used. That first attempt assumed the old columns were
// the safer, more-current source (per this repo's own documented "the
// admin edit form still writes the old columns, equipment_permits can go
// stale" risk), but a live report ("dispatch shows Registration expired,
// the equipment modal shows it's fine") proved the opposite for this real
// company: a direct query found equipment_permits' Registration row for
// truck 25184 at 2027-07-31, a full year past the old column's untouched
// 2026-07-31 -- someone renewed it through the Binder, which only ever
// wrote to equipment_permits, so the old column silently never caught up.
// equipment_permits is also what useExpirations.ts (the header bell badge)
// already reads, so this now agrees with that too instead of disagreeing
// with two different "current" equipment views at once.

import { expiryStateFor, EXPIRY_COLOR, type ExpiryState } from "@/lib/expiry";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { startSetupSession } from "@/lib/setupSession";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { addDaysISO_, formatMDYWithCountdown_ } from "../utils/dates";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { useFleetPositions } from "@/lib/telematics/useFleetPositions";
import { useFleetHos } from "@/lib/telematics/useFleetHos";
import { linkMeToTelematics } from "@/lib/telematics/linkMe";
import { hosAlerts as buildHosAlerts } from "@/lib/dispatch/hosAlerts";
import { useGeofenceWatch } from "@/lib/dispatch/useGeofenceWatch";
import { useHosNotifier } from "@/lib/dispatch/useHosNotifier";
import { enablePush } from "@/lib/push/subscribe";
import { hosText, resetInfo } from "@/lib/telematics/progress";
import { restWindow } from "@/lib/dispatch/dutyGraph";
import { TrackSheet } from "../components/track/TrackSheet";
import { CANCELLED_DAYS, useCancelledTrips, type CancelledTrip } from "@/lib/trips/useCancelledTrips";
import { FleetBoard, type BoardProduct } from "./FleetBoard";
import { DispatchDashboardView, type DispatchMode } from "./DispatchDashboardView";
import { findConflicts, liveCounts } from "@/lib/dispatch/conflicts";
import { applyAcks } from "@/lib/dispatch/acks";
import { watchList, companyTerminalSet } from "@/lib/dispatch/watch";
import { useConflictNotifier } from "@/lib/dispatch/useConflictNotifier";
import { reportText } from "./DispatchDashboardView";
import FleetCardsModal from "@/app/admin/FleetCardsModal";
import type { ToolItem } from "../home/DashboardChrome";
import { planAlerts, planCounts } from "@/lib/dispatch/planAlerts";
import { rankDrivers, focusAlerts } from "@/lib/dispatch/planLoad";
import { PlanLoadCard, DriverList, type TerminalOption, type DriverEquip } from "./PlanLoadCard";
import { trailerCert, certBlocks } from "@/lib/dispatch/certs";
import { SuppliersModal } from "./SuppliersModal";
import { TimelineCard, type DayLeg } from "./TimelineCard";
import { DispatchedBoard } from "./DispatchedBoard";
import { AllocationModal, LEVEL_COLOR, type AllocRow } from "./AllocationModal";
import { contractUsage, typicalGallons, wouldExceed, type Level } from "@/lib/dispatch/allocation";
import { buildDispatchedTrip } from "@/lib/dispatch/dispatchTrip";
import { serverOrderConflicts } from "@/lib/trips/refCheck";
import { forecastLoad, typicalStartMinutes, clock } from "@/lib/dispatch/forecast";
import { useTerminalSuppliers } from "@/lib/suppliers/useTerminalSuppliers";
import { useCompanySuppliers, useSupplierContracts } from "@/lib/suppliers/useSupplierAdmin";
import { LocationPicker } from "../components/trip/LocationPicker";
import { LocationsHub, locationsTool } from "../components/locations/LocationsHub";
import { useDeliveryLocationList, useTripSettings } from "@/lib/trips/useTripData";
import { classifyLive } from "@/lib/dispatch/liveGroups";
import { locationTitle } from "@/lib/trips/deliveryLocations";
import { settingsForTerminal, driveMinutesByDistance } from "@/lib/dispatch/forecast";
import { groupsFromPlan, distinctOrders, slotPayloadFromPlan, type CompPlan, type GroupOverride } from "@/lib/dispatch/compPlan";
import { useTrailerPlan } from "@/lib/dispatch/useTrailerPlan";
import { CompartmentPlanCard } from "./CompartmentPlanCard";
import { useFleetReports, usePlanData, useConflictAcks, useLocationDeliveries, useDriverEquipment, useTerminalCerts, useTripHistory, useTimelineSettings, useDispatchedTrips, writeDispatched, cancelDispatched, swapDispatched, useSupplierUsage, useCompanyContracts } from "@/lib/dispatch/useDispatchData";
import { onBoard, activePickup } from "@/lib/trips/tripFlow";

import { usePending } from "@/lib/ui/pending";
// Expiration colors use the app-wide rule (lib/expiry.ts). Permits, badges
// and credentials stay red however long ago they expired; terminal cards
// time out to "no access" 30 days after expiring.
type ExpState = ExpiryState;
function expStateFor(iso: string | null | undefined, access = false): ExpState {
  return expiryStateFor(iso, { access });
}
const DARK_EXP_COLOR = EXPIRY_COLOR;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat, matches the mockup's day-icon row

type DriverIdentity = {
  display_name: string;
  division: string | null;
  region: string | null;
  local_area: string | null;
  employee_number: string | null;
};

type TerminalCardRow = {
  terminal_id: string;
  terminal_name: string;
  city: string | null;
  state: string | null;
  expiresISO: string | null;
  hasCard: boolean;
};

type PermitItem = { label: string; iso: string };

type EquipmentSummary = {
  truckName: string | null;
  truckMake: string | null;
  trailerName: string | null;
  trailerMake: string | null;
  permitItems: PermitItem[]; // pre-filtered to expiring/expired only, soonest first
  // Phase 2 — true when the names came from the driver's held units
  // (user_settings.current_*) rather than a fully-coupled active combo, i.e.
  // the driver is bobtail (truck only) or trailer-only.
  partial: boolean;
};

type BadgeRow = { id: string; port_name: string; category: string | null; expiration_date: string | null };

type CredentialSummary = { licenseExp: string | null; medicalExp: string | null; twicExp: string | null };

type EquipmentPermitRow = { expiration_date: string | null; permit_types: { name: string } | null };

// unitLabel ("Truck 25184" / "Trailer 3151") is baked directly into each
// item's label -- per explicit request, dispatch couldn't tell which unit
// a bare "Registration" line belonged to when a driver has both a truck
// and trailer with their own permit sets.
function collectExpiringPermits(unitLabel: string, rows: EquipmentPermitRow[]): PermitItem[] {
  const out: PermitItem[] = [];
  for (const r of rows) {
    const iso = r.expiration_date;
    if (!iso) continue;
    const state = expStateFor(iso);
    if (state === "soon" || state === "expiring" || state === "expired") {
      out.push({ label: `${unitLabel} — ${r.permit_types?.name ?? "Permit"}`, iso });
    }
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function ExpirationLine({ label, iso, access = false }: { label: string; iso: string | null; access?: boolean }) {
  const state = expStateFor(iso, access);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "#fff", fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 800, color: DARK_EXP_COLOR[state] }}>
        {state === "inactive" ? "No access" : iso ? formatMDYWithCountdown_(iso) : "Not on file"}
      </span>
    </div>
  );
}

export default function DispatchPage() {
  const shell = useCalculatorShell();
  const router = useRouter();
  const nav = usePending();
  const { selectedDriverId, setSelectedDriverId, companyId, effectiveUserId, authUserId } = shell;
  const canUseAppAs = shell.role === "admin" || shell.isSuperAdmin;

  // Loads in progress + parked loads, company-wide (Dispatch board).
  const fleet = useFleetTrips(companyId || null);
  const cancelledTrips = useCancelledTrips(companyId || null);
  const { data: catalog } = useProductsCatalog();
  const boardProduct = (id: string | null): BoardProduct => {
    const p = id ? catalog.find((x) => x.product_id === id) : null;
    const name = p ? String(p.display_name || p.product_name || "Product") : "Product";
    const hex = typeof p?.hex_code === "string" && p.hex_code.trim() ? p.hex_code.trim() : null;
    return { name, code: String(p?.button_code ?? (name.split(" ")[0] || "PRD")).toUpperCase(), hex };
  };

  // This page had NO access gate at all before this -- a driver/lead hitting
  // this URL directly wasn't blocked, only kept off it by the (now-removed)
  // tab bar simply not showing this tab to them. Now that this is admin/
  // dispatch's real Planner (see the role-restructure this shipped
  // alongside), a real gate is needed: driver/lead don't belong here at all,
  // symmetric with the new gate on Cards (app/planner/cards/layout.tsx)
  // blocking admin/dispatch the other direction. Gated on
  // isSuperAdminResolved for the same race-condition reason page.tsx's own
  // landing redirect is -- role resolves independently of isSuperAdmin, with
  // no ordering guarantee.
  useEffect(() => {
    if (shell.role == null) return;
    if (!shell.isSuperAdminResolved) return;
    if (shell.isSolo === null) return; // a solo admin is NOT a dispatcher -- wait for resolution, then bounce to /planner
    if (!canReachDestination("dispatch", shell.role, shell.isSuperAdmin, shell.isSolo)) {
      router.replace("/planner/home");
    }
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, router]);
  // Sourced from the shared cached catalog (lib/queries/useTerminalsCatalog.ts)
  // instead of this page's own .in("terminal_id", terminalIds) network
  // lookup below -- the full catalog is already cached, so this is a
  // client-side filter instead of a round trip.
  const { data: terminalsCatalog = [] } = useTerminalsCatalog();

  // ── Dispatch Dashboard (no driver picked) ─────────────────────────────────
  // Mode and horizon are remembered on this device.
  const [mode, setModeState] = useState<DispatchMode>("live");
  const livePositions = useFleetPositions(companyId || null, mode === "live");
  const [hosNonce, setHosNonce] = useState(0);
  const fleetHos = useFleetHos(companyId || null, true, hosNonce);
  // Picking a driver for the timeline: link them to Geotab now (if they match), then reload clocks.
  useEffect(() => {
    if (!companyId || !selectedDriverId) return;
    let off = false;
    void linkMeToTelematics(companyId, selectedDriverId).then(() => { if (!off) setHosNonce((n) => n + 1); });
    return () => { off = true; };
  }, [companyId, selectedDriverId]);
  useEffect(() => {
    try {
      const m = localStorage.getItem("proTankr:dispatchMode");
      if (m === "plan" || m === "live") setModeState(m);
    } catch { /* storage blocked */ }
  }, []);
  const setMode = (m: DispatchMode) => { setModeState(m); try { localStorage.setItem("proTankr:dispatchMode", m); } catch {} };
  const [companyName, setCompanyName] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let off = false;
    supabase.from("companies").select("company_name").eq("company_id", companyId).maybeSingle()
      .then(({ data }) => { if (!off) setCompanyName((data as any)?.company_name ?? null); });
    return () => { off = true; };
  }, [companyId]);
  const plan = usePlanData(companyId || null);

  // Region filter: drivers, equipment and loads in the picked regions only.
  // Empty = everything. Remembered on this device.
  const [regionSel, setRegionSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem("proTankr:dispatchRegions");
      if (raw) setRegionSel(new Set(JSON.parse(raw) as string[]));
    } catch { /* storage blocked */ }
  }, []);
  const changeRegions = (next: Set<string>) => {
    setRegionSel(next);
    try { localStorage.setItem("proTankr:dispatchRegions", JSON.stringify([...next])); } catch {}
  };
  const NO_REGION = "No region";
  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of plan.roster) set.add(m.region?.trim() || NO_REGION);
    for (const r of plan.unitRegions.values()) set.add(r?.trim() || NO_REGION);
    const named = [...set].filter((x) => x !== NO_REGION).sort((a, b) => a.localeCompare(b));
    return set.has(NO_REGION) ? [...named, NO_REGION] : named;
  }, [plan.roster, plan.unitRegions]);
  const regionOn = regionSel.size > 0;
  const regionDriverIds = useMemo(
    () => new Set(plan.roster.filter((m) => regionSel.has(m.region?.trim() || NO_REGION)).map((m) => m.user_id)),
    [plan.roster, regionSel]);
  const initialsOf = (n?: string | null) => (n ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const driverInRegion = (id: string | null | undefined) => !regionOn || (!!id && regionDriverIds.has(id));
  // A parked load belongs to the region it's parked in, whoever's driver or
  // equipment it is. Older ones without a region fall back to the driver's.
  const fleetTrips = useMemo(() => fleet.trips.filter((f) => {
    if (!regionOn) return true;
    if (f.trip.status === "parked" && f.trip.parked_region?.trim()) return regionSel.has(f.trip.parked_region.trim());
    return driverInRegion(f.trip.driver_id);
  }), [fleet.trips, regionOn, regionDriverIds, regionSel]); // eslint-disable-line react-hooks/exhaustive-deps
  const regionRoster = useMemo(() => plan.roster.filter((m) => driverInRegion(m.user_id)), [plan.roster, regionOn, regionDriverIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-read the clock every minute so on-site times and the Delayed chip keep moving.
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setLiveTick((n) => n + 1), 60_000); return () => window.clearInterval(t); }, []);

  // Cancelled loads the dispatcher has dismissed (this device).
  const dismissKey = `proTankr:u:${authUserId || "anon"}:dismissedCancelled`;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setDismissed(new Set(JSON.parse(localStorage.getItem(dismissKey) ?? "[]") as string[])); } catch { /* storage blocked */ }
  }, [dismissKey]);
  const saveDismissed = (next: Set<string>) => {
    setDismissed(next);
    try { localStorage.setItem(dismissKey, JSON.stringify([...next])); } catch {}
  };
  const visibleCancelled = useMemo(
    () => cancelledTrips.trips.filter((c) => !dismissed.has(c.trip.trip_id) && driverInRegion(c.trip.driver_id)),
    [cancelledTrips.trips, dismissed, regionOn, regionDriverIds]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reassign a cancelled load to another driver: a new dispatched load with the same order number,
  // rack, supplier and store. The cancelled record stays; it just stops showing as cancelled.
  const [reassigning, setReassigning] = useState<CancelledTrip | null>(null);
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignErr, setReassignErr] = useState<string | null>(null);
  const reassignTo = async (driverId: string) => {
    const ct = reassigning;
    if (!ct || !companyId || !authUserId) return;
    const pk = ct.pickups.find((p) => p.terminal_id) ?? ct.pickups[0];
    const dl = ct.deliveries.find((d) => d.location_id);
    if (!pk?.terminal_id || !dl?.location_id) { setReassignErr("This load has no rack or store to copy."); return; }
    setReassignBusy(true); setReassignErr(null);
    try {
      const nums = ct.orderNumbers;
      const taken = nums.length ? await serverOrderConflicts(companyId, nums, ct.trip.trip_id) : [];
      if (taken.length) { setReassignErr(`Order ${taken[0]} is already on another trip.`); return; }
      const nowMs = Date.now();
      const leg = {
        terminalId: String(pk.terminal_id), terminalName: pk.name ?? "Rack", city: pk.city ?? null, state: pk.state ?? null,
        locationId: dl.location_id, deliveryType: dl.delivery_type, supplierId: pk.supplier_id ?? null,
        orderNumber: nums[0] ?? "", startMs: nowMs, endMs: nowMs, truckId: null, trailerId: null, warnings: [] as string[],
        shipper: ct.trip.shipper ?? undefined, customer: ct.trip.customer ?? undefined,
      };
      const rows = buildDispatchedTrip({ companyId, dispatcherId: authUserId, driverId, leg, seq: 1 }, { now: new Date(), newId: () => crypto.randomUUID() });
      const err = await writeDispatched(rows as any);
      if (err) { setReassignErr(err); return; }
      const ev = await supabase.from("trip_events").insert({
        event_id: crypto.randomUUID(), trip_id: ct.trip.trip_id, event_type: "reassigned", occurred_at: new Date().toISOString(),
        actor_id: authUserId, pickup_id: null, delivery_id: null, payload: { to_driver: driverId, new_trip_id: (rows.trip as any).trip_id },
      });
      if (ev.error) setReassignErr(`Sent, but couldn't clear it from Cancelled: ${ev.error.message}`);
      else setReassigning(null);
      dispatched.reload(); cancelledTrips.reload();
    } finally { setReassignBusy(false); }
  };

  const { settings: tripSettings } = useTripSettings(companyId || null);
  const fleetReports = useFleetReports(fleetTrips, plan.usedTerminalIds);
  const terminalLLOf = (id: string) => { const t = terminalsCatalog.find((x) => String(x.terminal_id) === id); return t?.lat != null && t?.lon != null ? { lat: Number(t.lat), lon: Number(t.lon) } : null; };
  const locationLLOf = (id: string) => { const l = locList.locations.find((x) => x.location_id === id); return l?.lat != null && l?.lon != null ? { lat: l.lat, lon: l.lon } : null; };
  // When a truck on its way to a rack gets there (live position + straight-line drive time).
  const arrivalEta = (tripId: string): number | null => {
    const ft = fleetTrips.find((f) => f.trip.trip_id === tripId);
    const pk = ft ? activePickup(ft.pickups.filter((x) => x.outcome !== "no_load")) : null;
    const dest = pk?.terminal_id ? terminalLLOf(String(pk.terminal_id)) : null;
    const pos = ft?.trip.truck_id ? livePositions.get(ft.trip.truck_id) : undefined;
    if (!dest || !pos || Date.now() - Date.parse(pos.at ?? "") > 30 * 60000) return null;
    return Date.now() + driveMinutesByDistance({ lat: pos.lat, lon: pos.lon }, dest) * 60000;
  };
  const rawConflicts = useMemo(
    () => findConflicts(fleetTrips, fleetReports.reports, fleetReports.plannedByLoad, arrivalEta),
    [fleetTrips, fleetReports.reports, fleetReports.plannedByLoad, livePositions, terminalsCatalog], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const reportIds = useMemo(() => [...new Set(rawConflicts.flatMap((c) => c.reports.map((r) => r.reportId)))], [rawConflicts]);
  const acks = useConflictAcks(companyId || null, reportIds, authUserId || null);
  const conflicts = useMemo(() => applyAcks(rawConflicts, acks.acks), [rawConflicts, acks.acks]);
  const watch = useMemo(
    () => watchList(fleetReports.reports, new Set(fleetReports.headedTerminalIds)),
    [fleetReports.reports, fleetReports.headedTerminalIds],
  );
  const [fleetCardsOpen, setFleetCardsOpen] = useState(false);
  const counts = useMemo(
    () => liveCounts(fleetTrips.map((f) => ({ ...f, loadedComps: onBoard(f.compLoads).length }))),
    [fleetTrips],
  );
  // ── Planning a load: drop location -> terminal -> drivers ───────────────
  const [planLocationId, setPlanLocationId] = useState<string | null>(null);
  const [planTerminalId, setPlanTerminalId] = useState<string | null>(null);
  const [showNotCarded, setShowNotCarded] = useState(false);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const locList = useDeliveryLocationList(companyId || null, authUserId || null);
  const [locsOpen, setLocsOpen] = useState(false); // the Locations tool
  const lowHours = useMemo(
    () => buildHosAlerts(fleetTrips.filter((f) => f.trip.status !== "parked").map((f) => ({ tripId: f.trip.trip_id, userId: f.trip.driver_id ?? null, driverName: f.driverName, truckName: f.truckName })), fleetHos, Date.now()),
    [fleetTrips, fleetHos]);
  useHosNotifier({ userId: authUserId || null, alerts: lowHours, ready: fleet.loaded && fleetHos.size > 0 });
  const liveRows = useMemo(
    () => classifyLive(fleetTrips, fleet.locations, Date.now(), { loading: tripSettings.loading_delay_threshold_minutes, delivery: tripSettings.delivery_delay_threshold_minutes },
      (q) => {
        const dest = q.kind === "to_rack" ? (q.terminalId ? terminalLLOf(q.terminalId) : null) : (q.locationId ? locationLLOf(q.locationId) : null);
        if (!dest) return null;
        const pos = q.truckId ? livePositions.get(q.truckId) : undefined;
        if (pos && Date.now() - Date.parse(pos.at ?? "") < 30 * 60000) return Date.now() + driveMinutesByDistance({ lat: pos.lat, lon: pos.lon }, dest) * 60000;
        return null;
      }),
    [fleetTrips, fleet.locations, tripSettings.loading_delay_threshold_minutes, tripSettings.delivery_delay_threshold_minutes, liveTick, livePositions, terminalsCatalog, locList.locations]); // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useGeofenceWatch({ userId: authUserId || null, companyId: companyId || null, trips: fleetTrips, locations: fleet.locations, positions: livePositions, terminalLL: terminalLLOf, locationLL: locationLLOf });
  const history = useLocationDeliveries(companyId || null, planLocationId);
  const planLocation = locList.locations.find((l) => l.location_id === planLocationId) ?? null;
  const planTerminal = useMemo<TerminalOption | null>(() => {
    const t = planTerminalId ? terminalsCatalog.find((x) => String(x.terminal_id) === planTerminalId) : null;
    return t ? { id: String(t.terminal_id), name: t.terminal_name ?? "Terminal", place: t.city ? `${t.city}${t.state ? `, ${t.state}` : ""}` : null, used: false } : null;
  }, [planTerminalId, terminalsCatalog]);
  const terminalOptions = useMemo<TerminalOption[]>(() => {
    const used = new Set(plan.usedTerminalIds);
    return terminalsCatalog.map((t) => ({
      id: String(t.terminal_id), name: t.terminal_name ?? "Terminal", used: used.has(String(t.terminal_id)),
      place: t.city ? `${t.city}${t.state ? `, ${t.state}` : ""}` : null,
      city: t.city ?? null, state: t.state ?? null,
    }));
  }, [terminalsCatalog, plan.usedTerminalIds]);
  // Supplier at the chosen terminal (warn-only: a paused contract never blocks).
  const [planSupplierId, setPlanSupplierId] = useState<string | null>(null);
  const [suppliersOpen, setSuppliersOpen] = useState<null | "pick" | "manage">(null);
  const canManageSuppliers = shell.role === "admin" || shell.role === "dispatch" || shell.isSuperAdmin;
  const termSuppliers = useTerminalSuppliers(companyId || null, planTerminalId);
  const companySuppliers = useCompanySuppliers(companyId || null);
  const termContracts = useSupplierContracts(companyId || null, planTerminalId);
  const planSupplier = useMemo(() => {
    const s = planSupplierId ? companySuppliers.all.find((x) => x.supplier_id === planSupplierId) : null;
    if (!s) return null;
    const row = termSuppliers.bySupplier.get(s.supplier_id);
    const con = termContracts.contracts.get(s.supplier_id);
    const warning = con?.paused ? `Contract paused${con.paused_note ? `: ${con.paused_note}` : ""}` : row?.issue_at ? "Reported not working" : null;
    return { name: s.name, account: row?.account_number ?? null, warning };
  }, [planSupplierId, companySuppliers.all, termSuppliers.bySupplier, termContracts.contracts]);
  const busyByDriver = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fleetTrips) m.set(f.trip.driver_id, f.trip.status === "parked" ? "Parked" : "On a load");
    return m;
  }, [fleetTrips]);
  const planning = !!planLocationId || !!planTerminalId;
  const ranked = useMemo(() => rankDrivers({
    roster: regionRoster, deliveries: history.rows, access: plan.input?.access,
    terminalId: planTerminalId, renewalDays: planTerminalId ? plan.input?.terminals.get(planTerminalId)?.renewal_days ?? null : null,
    busy: busyByDriver,
  }), [regionRoster, history.rows, plan.input, planTerminalId, busyByDriver]);

  // Equipment each driver holds, and the terminal's trailer-certification check.
  const heldEquipment = useDriverEquipment(companyId || null);
  const certs = useTerminalCerts(companyId || null, planTerminalId);
  const equipFor = useMemo(() => {
    const trucks = plan.input?.trucks, trailers = plan.input?.trailers;
    return (userId: string): DriverEquip | null => {
      const h = heldEquipment.get(userId);
      if (!h) return null;
      return {
        truck: trucks?.get(h.truckId) ?? "—", trailer: trailers?.get(h.trailerId) ?? "—", since: h.since,
        cert: planTerminalId ? trailerCert(certs.types, certs.records, h.trailerId) : null,
        thumb: certs.thumbs.get(h.trailerId) ?? null,
      };
    };
  }, [heldEquipment, plan.input, certs.types, certs.records, certs.thumbs, planTerminalId]);
  const certProblems = useMemo(() => {
    if (!planTerminalId || certs.types.length === 0) return 0;
    const list = showNotCarded ? ranked.notCarded : ranked.ready;
    return list.filter((d) => { const h = heldEquipment.get(d.userId); return !!h && certBlocks(trailerCert(certs.types, certs.records, h.trailerId)); }).length;
  }, [planTerminalId, certs.types, certs.records, showNotCarded, ranked, heldEquipment]);

  // ── Timeline for the driver being considered ──────────────────────────────
  const [tlDriverId, setTlDriverId] = useState<string | null>(null);
  const [findTruckOpen, setFindTruckOpen] = useState(false);
  const dispatched = useDispatchedTrips(companyId || null);
  const [tlStart, setTlStart] = useState<number | null>(null);          // dispatcher's own start time
  const [dayPlan, setDayPlan] = useState<Record<string, DayLeg[]>>({});  // planning only, this screen
  const tripHistory = useTripHistory(companyId || null);
  const tlSettings = useTimelineSettings(companyId || null);
  const tlTz = (terminalsCatalog.find((t) => String(t.terminal_id) === planTerminalId) as any)?.timezone ?? null;
  const dayLegs = (tlDriverId && dayPlan[tlDriverId]) || [];
  // Loads already dispatched to this driver and not begun: the new load is added after them.
  const priorLegs = useMemo<DayLeg[]>(() => {
    if (!tlDriverId) return [];
    const ll = (id: string | null) => { const l = id ? locList.locations.find((x) => x.location_id === id) : null; return l && l.lat != null && l.lon != null ? { lat: l.lat, lon: l.lon } : null; };
    return dispatched.trips
      .filter((t) => t.driver_id === tlDriverId && t.planned_start_at)
      .sort((a, b) => (a.planned_start_at ?? "").localeCompare(b.planned_start_at ?? "") || (a.dispatch_seq ?? 0) - (b.dispatch_seq ?? 0))
      .map((t) => {
        const start = Date.parse(t.planned_start_at!);
        // Loads dispatched before the end time was recorded are assumed to take 4 hours.
        const end = t.planned_end_at ? Date.parse(t.planned_end_at) : start + 4 * 3600000;
        const loc = t.locationId ? locList.locations.find((x) => x.location_id === t.locationId) : null;
        return {
          startMs: start, endMs: end, driveMin: t.planned_drive_min ?? 0, terminal: t.terminal ?? "Terminal", location: loc ? locationTitle(loc) : "Delivery", locationLL: ll(t.locationId),
          terminalId: "", city: null, state: null, locationId: t.locationId ?? "", deliveryType: "drop" as const,
          supplierId: t.supplier_id, orderNumber: t.order ?? "", truckId: null, trailerId: null, warnings: [],
        };
      });
  }, [tlDriverId, dispatched.trips, locList.locations]);
  const allLegs = useMemo(() => [...priorLegs, ...dayLegs], [priorLegs, dayLegs]);
  const typicalMin = useMemo(() => (tlDriverId ? typicalStartMinutes(tripHistory.trips, tlDriverId) : null), [tripHistory.trips, tlDriverId]);
  const defaultStartMs = useMemo(() => {
    const now = Date.now();
    const next = Math.ceil(now / 900000) * 900000;
    if (typicalMin == null) return next;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const typical = d.getTime() + typicalMin * 60000;
    return typical > now ? typical : next;
  }, [typicalMin, tlDriverId]); // eslint-disable-line react-hooks/exhaustive-deps
  const chainedStart = allLegs.length ? allLegs[allLegs.length - 1].endMs : null;
  const startMs = tlStart ?? chainedStart ?? defaultStartMs;
  const termRow = planTerminalId ? terminalsCatalog.find((t) => String(t.terminal_id) === planTerminalId) : null;
  const forecast = useMemo(() => {
    if (!tlDriverId || !planLocation || !termRow) return null;
    const ll = (o: { lat?: number | null; lon?: number | null }) => (o.lat != null && o.lon != null ? { lat: Number(o.lat), lon: Number(o.lon) } : null);
    return forecastLoad({
      startMs, startFrom: allLegs.length ? allLegs[allLegs.length - 1].locationLL : null,
      terminal: { id: String(termRow.terminal_id), name: termRow.terminal_name ?? "Terminal", tz: tlTz, ll: ll(termRow as any) },
      location: { id: planLocation.location_id, name: locationTitle(planLocation), ll: ll(planLocation) },
      history: tripHistory.trips, settings: settingsForTerminal(tlSettings, termRow as any),
      dutyStartMs: allLegs[0]?.startMs ?? startMs, drivingMinSoFar: allLegs.reduce((a, l) => a + l.driveMin, 0),
      hos: (() => { const h = fleetHos.get(tlDriverId); return h ? { driveLeftMin: h.driveLeftMin, dutyLeftMin: h.dutyLeftMin, asOfMs: Date.parse(h.at) } : null; })(),
    });
  }, [tlDriverId, planLocation, termRow, startMs, allLegs, tripHistory.trips, tlSettings, tlTz, fleetHos]);
  // Loads can't overlap: each one starts when the one before it ends, or later.
  const blockMsg = useMemo(() => {
    const last = allLegs[allLegs.length - 1];
    if (!last || startMs >= last.endMs) return null;
    return `Load ${allLegs.length} ends about ${clock(last.endMs)}. Start this one then or later.`;
  }, [allLegs, startMs]);
  // The load as planned right now, ready to stack or dispatch.
  const [orderNumber, setOrderNumber] = useState("");
  const [shipper, setShipper] = useState("");
  const [customer, setCustomer] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dispatchedShown = useMemo(() => dispatched.trips.filter((t) => driverInRegion(t.driver_id)), [dispatched.trips, regionOn, regionDriverIds]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── Supplier allocation (contract limits vs loaded + booked) ──────────────
  const usageItems = useSupplierUsage(companyId || null);
  const allContracts = useCompanyContracts(companyId || null);
  const [allocOpen, setAllocOpen] = useState(false);
  const tzOfTerminal = (id: string) => (terminalsCatalog.find((t) => String(t.terminal_id) === id) as any)?.timezone ?? null;
  const allocRows = useMemo<AllocRow[]>(() => {
    const order: Record<Level, number> = { over: 0, full: 1, near: 2, ok: 3, none: 4 };
    return allContracts.filter((c) => c.per_day != null || c.per_week != null).map((c) => ({
      key: `${c.supplier_id}|${c.terminal_id}`,
      supplier: companySuppliers.all.find((s) => s.supplier_id === c.supplier_id)?.name ?? "Supplier",
      terminal: terminalsCatalog.find((t) => String(t.terminal_id) === c.terminal_id)?.terminal_name ?? "Terminal",
      paused: c.paused, usage: contractUsage(c, usageItems, Date.now(), tzOfTerminal(c.terminal_id)),
    })).sort((a, b) => Number(a.paused) - Number(b.paused) || order[a.usage.level] - order[b.usage.level] || a.supplier.localeCompare(b.supplier));
  }, [allContracts, usageItems, companySuppliers.all, terminalsCatalog]); // eslint-disable-line react-hooks/exhaustive-deps
  const allocChip = useMemo(() => {
    const live = allocRows.filter((r) => !r.paused && ["near", "full", "over"].includes(r.usage.level));
    const worstLevel = (["over", "full", "near"] as Level[]).find((l) => live.some((r) => r.usage.level === l)) ?? "none";
    return { count: live.length, color: LEVEL_COLOR[worstLevel as Level] };
  }, [allocRows]);
  // The load being planned, against the chosen supplier's limits at its start time.
  const allocWarning = useMemo(() => {
    if (!planSupplierId || !planTerminalId) return null;
    const c = allContracts.find((x) => x.supplier_id === planSupplierId && x.terminal_id === planTerminalId);
    if (!c || c.paused) return null;
    const u = contractUsage(c, usageItems, startMs, tzOfTerminal(planTerminalId));
    const add = c.limit_basis === "loads" ? 1 : typicalGallons(usageItems, planSupplierId, planTerminalId);
    return wouldExceed(u, planSupplier?.name ?? "This supplier", add);
  }, [planSupplierId, planTerminalId, allContracts, usageItems, startMs, planSupplier]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compartment plan (optional): products per compartment, order and supplier per product ──
  const [planTrailerOverride, setPlanTrailerOverride] = useState<string | null>(null);
  const [compPlan, setCompPlan] = useState<CompPlan>({});
  const [groupOverrides, setGroupOverrides] = useState<Record<string, GroupOverride>>({});
  const [activeTrailerSlot, setActiveTrailerSlot] = useState<number | null>(null);
  const [supPickFor, setSupPickFor] = useState<string | null>(null);
  const driverTrailerId = tlDriverId ? heldEquipment.get(tlDriverId)?.trailerId ?? null : null;
  const effectiveTrailerId = planTrailerOverride ?? driverTrailerId;
  const trailerPlan = useTrailerPlan(companyId || null, effectiveTrailerId, planTerminalId);
  useEffect(() => { setCompPlan({}); setGroupOverrides({}); setActiveTrailerSlot(null); }, [effectiveTrailerId]);
  useEffect(() => { setPlanTrailerOverride(null); }, [tlDriverId]);
  const planCatalog = useMemo(() => (catalog ?? []).filter((x) => x.active !== false).map((x) => ({
    product_id: x.product_id, name: x.display_name || x.product_name, code: x.button_code || (x.display_name || x.product_name).split(" ")[0], hex: x.hex_code,
  })), [catalog]);
  const planGroups = useMemo(
    () => groupsFromPlan(compPlan, groupOverrides, { orderNumber, supplierId: planSupplierId }),
    [compPlan, groupOverrides, orderNumber, planSupplierId]);
  const supplierNameOf = (id: string | null) => (id ? companySuppliers.all.find((x) => x.supplier_id === id)?.name ?? null : null);
  // Each group that has its own supplier is checked against that supplier's limits too.
  const groupAllocWarnings = useMemo(() => {
    if (!planTerminalId) return [] as string[];
    const out: string[] = [];
    for (const g of planGroups) {
      if (!g.supplierId || g.supplierId === planSupplierId) continue;
      const c = allContracts.find((x) => x.supplier_id === g.supplierId && x.terminal_id === planTerminalId);
      if (!c || c.paused) continue;
      const u = contractUsage(c, usageItems, startMs, tzOfTerminal(planTerminalId));
      const add = c.limit_basis === "loads" ? 1 : typicalGallons(usageItems, g.supplierId, planTerminalId);
      const w = wouldExceed(u, supplierNameOf(g.supplierId) ?? "This supplier", add);
      if (w) out.push(w);
    }
    return out;
  }, [planGroups, planTerminalId, planSupplierId, allContracts, usageItems, startMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const warnings = useMemo(() => {
    const w: string[] = [];
    for (const f of forecast?.flags ?? []) if (f.severity !== "info") w.push(f.text);
    // First load: a start before the driver's 10 hour reset completes.
    const rs = !allLegs.length && tlDriverId ? resetInfo(fleetHos.get(tlDriverId) ?? { status: null }, Date.now()) : null;
    if (rs && startMs < rs.resetAtMs) w.push(`Starts before the driver is rested: their 10 hour reset completes ${clock(rs.resetAtMs)}.`);
    if (tlDriverId && planTerminalId && certs.types.length) {
      const h = heldEquipment.get(tlDriverId);
      if (h && certBlocks(trailerCert(certs.types, certs.records, h.trailerId))) w.push("The driver's trailer has no current certification for this terminal.");
    }
    if (planSupplier?.warning) w.push(planSupplier.warning);
    if (allocWarning) w.push(allocWarning);
    for (const x of groupAllocWarnings) w.push(x);
    return w;
  }, [forecast, tlDriverId, planTerminalId, certs, heldEquipment, planSupplier, allocWarning, groupAllocWarnings, allLegs, startMs, fleetHos]);
  const buildLeg = (): DayLeg | null => {
    if (!tlDriverId || !forecast || !planLocation || !termRow) return null;
    const h = heldEquipment.get(tlDriverId);
    return {
      startMs, endMs: forecast.endMs, driveMin: forecast.driveMinutes, terminal: termRow.terminal_name ?? "Terminal", location: locationTitle(planLocation),
      locationLL: planLocation.lat != null && planLocation.lon != null ? { lat: planLocation.lat, lon: planLocation.lon } : null,
      terminalId: String(termRow.terminal_id), city: termRow.city ?? null, state: termRow.state ?? null,
      locationId: planLocation.location_id, deliveryType: planLocation.delivery_type,
      supplierId: planSupplierId, orderNumber: orderNumber.trim(), truckId: h?.truckId ?? null, trailerId: effectiveTrailerId ?? h?.trailerId ?? null, warnings,
      groups: planGroups.length ? planGroups : undefined,
      shipper: shipper.trim(), customer: customer.trim(),
    };
  };
  // Shipper and customer: prefilled from this driver's last trip to the same drop (customer) or any last trip.
  const prefilledFor = useRef<string>("");
  const customerTouched = useRef(false);
  const readParties = (): { shipper: string; customerByLoc: Record<string, string> } => {
    try { const j = JSON.parse(localStorage.getItem("proTankr:dispatchParties") || "{}"); return { shipper: j.shipper || "", customerByLoc: j.customerByLoc || {} }; } catch { return { shipper: "", customerByLoc: {} }; }
  };
  const rememberParties = (loc: string | null | undefined) => {
    try {
      const cur = readParties();
      if (shipper.trim()) cur.shipper = shipper.trim();
      if (loc && customer.trim()) cur.customerByLoc[loc] = customer.trim();
      localStorage.setItem("proTankr:dispatchParties", JSON.stringify(cur));
    } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!tlDriverId || !planLocation) return;
    const key = `${tlDriverId}|${planLocation.location_id}`;
    if (prefilledFor.current === key) return;
    prefilledFor.current = key;
    // Keep what's already typed; fill blanks from what was used last (this device), then from trip history.
    const saved = readParties();
    setShipper((s) => s || saved.shipper || "");
    setCustomer((c) => (customerTouched.current ? c : saved.customerByLoc[planLocation.location_id] || c || ""));
    let off = false;
    void supabase.from("trips").select("shipper, customer, trip_deliveries(location_id)")
      .eq("driver_id", tlDriverId).or("shipper.not.is.null,customer.not.is.null").neq("status", "cancelled")
      .order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => {
        if (off) return;
        const rows = (data ?? []) as { shipper: string | null; customer: string | null; trip_deliveries: { location_id: string | null }[] }[];
        const same = rows.find((r) => r.customer && r.trip_deliveries?.some((d) => d.location_id === planLocation.location_id));
        setShipper((s) => s || rows.find((r) => r.shipper)?.shipper || "");
        setCustomer((c) => c || (customerTouched.current ? "" : same?.customer || rows.find((r) => r.customer)?.customer || ""));
      });
    return () => { off = true; };
  }, [tlDriverId, planLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLeg = () => {
    const leg = buildLeg();
    if (!leg || !tlDriverId || blockMsg || planGroups.length === 0) return;
    rememberParties(leg.locationId);
    setDayPlan((m) => ({ ...m, [tlDriverId]: [...(m[tlDriverId] ?? []), leg] }));
    // Next load: shipper stays, customer re-fills for the next drop.
    customerTouched.current = false; setCustomer(""); prefilledFor.current = "";
    setPlanLocationId(null); setPlanTerminalId(null); setPlanSupplierId(null); setShowNotCarded(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTlStart(null); // the next load starts when this one ends
    setOrderNumber(""); setCompPlan({}); setGroupOverrides({}); setActiveTrailerSlot(null);
  };
  const dispatchNow = async () => {
    const leg = buildLeg();
    if (!leg || !tlDriverId || !companyId || !authUserId) return;
    if (blockMsg) { setDispatchMsg({ ok: false, text: blockMsg }); return; }
    if (planGroups.length === 0) { setDispatchMsg({ ok: false, text: "Pick a product for at least one compartment first." }); return; }
    const legs = [...dayLegs, leg];
    rememberParties(leg.locationId);
    setDispatching(true); setDispatchMsg(null);
    try {
      const nums = legs.flatMap((l) => (l.groups?.length ? distinctOrders(l.groups) : [l.orderNumber])).filter(Boolean);
      const dup = nums.find((n, i) => nums.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== i);
      if (dup) { setDispatchMsg({ ok: false, text: `Order ${dup} is on two of these loads.` }); return; }
      const taken = nums.length ? await serverOrderConflicts(companyId, nums, null) : [];
      if (taken.length) { setDispatchMsg({ ok: false, text: `Order ${taken[0]} is already on another trip.` }); return; }
      let seq = priorLegs.length;
      for (const l of legs) {
        seq++;
        const rows = buildDispatchedTrip({ companyId, dispatcherId: authUserId, driverId: tlDriverId, leg: { ...l, terminalName: l.terminal }, seq }, { now: new Date(), newId: () => crypto.randomUUID() });
        const err = await writeDispatched(rows as any);
        if (err) { setDispatchMsg({ ok: false, text: seq > 1 ? `Sent ${seq - 1} of ${legs.length}. Then: ${err}` : err }); dispatched.reload(); return; }
      }
      const name = plan.roster.find((m) => m.user_id === tlDriverId)?.display_name ?? "the driver";
      setDispatchMsg({ ok: true, text: `Dispatched ${legs.length} load${legs.length === 1 ? "" : "s"} to ${name}.` });
      setDayPlan((m) => ({ ...m, [tlDriverId]: [] }));
      setTlStart(null); setOrderNumber(""); setPlanSupplierId(null); setCompPlan({}); setGroupOverrides({}); setActiveTrailerSlot(null);
      // Start the next load from a blank route; the one just sent now shows as "Sent" above it.
      setPlanLocationId(null); setPlanTerminalId(null); setShowNotCarded(false);
      dispatched.reload();
    } finally {
      setDispatching(false);
    }
  };

  const alerts = useMemo(
    () => focusAlerts(plan.input ? planAlerts(plan.input, 30) : [], planning ? ranked.focusIds : null)
      .filter((a) => {
        if (!regionOn) return true;
        if (!a.isEquipment) return regionDriverIds.has(a.subjectId);
        return regionSel.has(plan.unitRegions.get(a.subjectId)?.trim() || NO_REGION);
      }),
    [plan.input, planning, ranked.focusIds, regionOn, regionDriverIds, regionSel, plan.unitRegions]);
  const pCounts = useMemo(() => planCounts(alerts), [alerts]);
  const terminalInfo = (id: string) => {
    const t = terminalsCatalog.find((x) => String(x.terminal_id) === id);
    return { name: t?.terminal_name ?? "Terminal", place: t?.city ? `${t.city}${t.state ? `, ${t.state}` : ""}` : null };
  };

  const notifier = useConflictNotifier({
    userId: authUserId || null,
    conflicts: rawConflicts,
    ready: fleet.loaded && fleetReports.loaded,
    terminalName: (id) => terminalInfo(id).name,
    reportLabel: (c, rid) => {
      const r = c.reports.find((x) => x.reportId === rid);
      return r ? reportText(r, boardProduct) : "Problem reported";
    },
  });

  const [identity, setIdentity] = useState<DriverIdentity | null>(null);
  const [schedule, setSchedule] = useState<{ days: number[]; start: string; end: string }>({ days: [], start: "", end: "" });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [cards, setCards] = useState<TerminalCardRow[]>([]);
  const [cardSearch, setCardSearch] = useState("");
  const [equipment, setEquipment] = useState<EquipmentSummary>({ truckName: null, truckMake: null, trailerName: null, trailerMake: null, permitItems: [], partial: false });
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary>({ licenseExp: null, medicalExp: null, twicExp: null });
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDriverId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const [
        { data: nameRows }, { data: schedRow }, { data: notesRow },
        { data: accessRows }, { data: cardRows },
        { data: claimedCombos },
        { data: badgeRows },
        { data: licRows }, { data: medRows }, { data: twicRows },
      ] = await Promise.all([
        supabase.rpc("get_display_names_full", { p_user_ids: [selectedDriverId] }),
        supabase.from("driver_schedules").select("days_of_week, shift_start_local, shift_end_local").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("dispatcher_notes").select("note").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("terminal_access").select("terminal_id, carded_on").eq("user_id", selectedDriverId),
        supabase.from("user_terminal_cards").select("terminal_id").eq("user_id", selectedDriverId),
        // Whatever combo the driver actually has claimed right now -- not
        // "primary" (a separate fallback-default concept, see file header).
        supabase.from("equipment_combos").select("truck_id, trailer_id, claimed_at").eq("claimed_by", selectedDriverId).neq("active", false).order("claimed_at", { ascending: false }).limit(1),
        supabase.from("driver_port_ids").select("id, port_name, category, expiration_date").eq("user_id", selectedDriverId).order("expiration_date", { ascending: true, nullsFirst: false }),
        supabase.from("driver_licenses").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("driver_medical_cards").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
        supabase.from("driver_twic_cards").select("expiration_date").eq("user_id", selectedDriverId).maybeSingle(),
      ]);
      if (cancelled) return;

      const nameRow = (nameRows ?? [])[0] as any;
      setIdentity(nameRow ? {
        display_name: nameRow.display_name ?? "Unknown",
        division: nameRow.division ?? null,
        region: nameRow.region ?? null,
        local_area: nameRow.local_area ?? null,
        employee_number: nameRow.employee_number ?? null,
      } : null);

      setSchedule({
        days: (schedRow as any)?.days_of_week ?? [],
        start: (schedRow as any)?.shift_start_local?.slice(0, 5) ?? "",
        end: (schedRow as any)?.shift_end_local?.slice(0, 5) ?? "",
      });
      setNotes((notesRow as any)?.note ?? "");

      const cardIdSet = new Set(((cardRows ?? []) as any[]).map((r) => String(r.terminal_id)));
      const accessByTerminal = new Map<string, string>();
      for (const r of (accessRows ?? []) as any[]) accessByTerminal.set(String(r.terminal_id), r.carded_on);

      const terminalIds = Array.from(new Set([...accessByTerminal.keys(), ...cardIdSet]));
      const idSet = new Set(terminalIds);
      const termRows = terminalsCatalog.filter((t) => idSet.has(String(t.terminal_id)));
      const rows: TerminalCardRow[] = termRows.map((t) => {
        const tid = String(t.terminal_id);
        const cardedOn = accessByTerminal.get(tid) ?? null;
        const renewalDays = t.renewal_days ?? 90;
        return {
          terminal_id: tid,
          terminal_name: t.terminal_name ?? "",
          city: t.city, state: t.state,
          expiresISO: cardedOn ? addDaysISO_(cardedOn, renewalDays) : null,
          hasCard: cardIdSet.has(tid),
        };
      }).sort((a, b) => a.terminal_name.localeCompare(b.terminal_name));
      setCards(rows);

      const claimed = ((claimedCombos ?? [])[0] as any) ?? null;
      let truckId = claimed?.truck_id ?? null;
      let trailerId = claimed?.trailer_id ?? null;

      // Phase 2 bobtail / trailer-only fallback: a driver holding just a
      // truck (or just a trailer) has no active combo, so the query above
      // finds nothing. Fall back to their held units in user_settings so the
      // Equipment section shows "Truck NNN (bobtail)" instead of blank. This
      // relies on the dispatcher having read access to the driver's
      // user_settings row; if RLS denies it the read simply returns nothing
      // and the section falls back to the pre-Phase-2 "no equipment" display
      // -- no worse than before, never an error.
      let partial = false;
      if (!truckId && !trailerId) {
        const { data: us } = await supabase
          .from("user_settings")
          .select("current_truck_id, current_trailer_id")
          .eq("user_id", selectedDriverId)
          .maybeSingle();
        const ct = (us as any)?.current_truck_id ?? null;
        const cr = (us as any)?.current_trailer_id ?? null;
        if (ct || cr) { truckId = ct; trailerId = cr; partial = true; }
      }
      const [truckRes, trailerRes, truckPermitsRes, trailerPermitsRes] = await Promise.all([
        truckId ? supabase.from("trucks").select("truck_name, make").eq("truck_id", truckId).maybeSingle() : Promise.resolve({ data: null }),
        trailerId ? supabase.from("trailers").select("trailer_name, make").eq("trailer_id", trailerId).maybeSingle() : Promise.resolve({ data: null }),
        truckId
          ? supabase.from("equipment_permits").select("expiration_date, permit_types(name)").eq("truck_id", truckId)
          : Promise.resolve({ data: [] }),
        trailerId
          ? supabase.from("equipment_permits").select("expiration_date, permit_types(name)").eq("trailer_id", trailerId)
          : Promise.resolve({ data: [] }),
      ]);
      const truckRow = (truckRes as any)?.data ?? null;
      const trailerRow = (trailerRes as any)?.data ?? null;
      const permitItems = [
        ...collectExpiringPermits(truckRow?.truck_name ? `Truck ${truckRow.truck_name}` : "Truck", ((truckPermitsRes as any)?.data ?? []) as EquipmentPermitRow[]),
        ...collectExpiringPermits(trailerRow?.trailer_name ? `Trailer ${trailerRow.trailer_name}` : "Trailer", ((trailerPermitsRes as any)?.data ?? []) as EquipmentPermitRow[]),
      ].sort((a, b) => a.iso.localeCompare(b.iso));
      setEquipment({
        truckName: truckRow?.truck_name ?? null,
        truckMake: truckRow?.make ?? null,
        trailerName: trailerRow?.trailer_name ?? null,
        trailerMake: trailerRow?.make ?? null,
        permitItems,
        partial,
      });

      setBadges((badgeRows ?? []) as BadgeRow[]);
      setCredentials({
        licenseExp: (licRows as any)?.expiration_date ?? null,
        medicalExp: (medRows as any)?.expiration_date ?? null,
        twicExp: (twicRows as any)?.expiration_date ?? null,
      });

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedDriverId, terminalsCatalog]);

  async function saveSchedule(next: { days: number[]; start: string; end: string }) {
    setSchedule(next);
    setScheduleSaving(true);
    await supabase.from("driver_schedules").upsert({
      user_id: selectedDriverId,
      company_id: companyId,
      days_of_week: next.days,
      shift_start_local: next.start || null,
      shift_end_local: next.end || null,
      updated_by: effectiveUserId || null,
    }, { onConflict: "user_id" });
    setScheduleSaving(false);
  }

  function toggleDay(d: number) {
    const days = schedule.days.includes(d) ? schedule.days.filter((x) => x !== d) : [...schedule.days, d].sort();
    saveSchedule({ ...schedule, days });
  }

  async function saveNotes() {
    setNotesSaving(true);
    await supabase.from("dispatcher_notes").upsert({
      user_id: selectedDriverId,
      company_id: companyId,
      note: notes,
      updated_by: effectiveUserId || null,
    }, { onConflict: "user_id" });
    setNotesSaving(false);
  }

  const filteredCards = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => `${c.terminal_name} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase().includes(q));
  }, [cards, cardSearch]);

  // Group by city -- "No City" bucket sorts last so real cities always lead.
  const cardsByCity = useMemo(() => {
    const groups = new Map<string, TerminalCardRow[]>();
    for (const c of filteredCards) {
      const city = c.city?.trim() || "No City";
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city)!.push(c);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "No City") return 1;
      if (b === "No City") return -1;
      return a.localeCompare(b);
    });
  }, [filteredCards]);

  if (!selectedDriverId) {
    const openTrip = (id: string) => nav.go(`trip:${id}`, `/planner/trips/${id}`);
    const dashTools: ToolItem[] = [
      { icon: "people", label: "Drivers", onClick: () => document.getElementById("dispatch-drivers")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
      { icon: "locate" as const, label: "Track", onClick: () => setFindTruckOpen(true) },
      { icon: "card", label: "Fleet Cards", onClick: () => setFleetCardsOpen(true) },
      locationsTool(() => setLocsOpen(true)),
      { icon: "terminal" as const, label: "Suppliers", onClick: () => setSuppliersOpen("manage") },
      { icon: "chart", label: "Reports", busy: nav.is("reports"), onClick: () => nav.go("reports", "/planner/reports") },
      ...(shell.role === "admin" || shell.isSuperAdmin
        ? [{ icon: "terminal" as const, label: "Company", busy: nav.is("company"), onClick: () => nav.go("company", "/admin") }]
        : []),
    ];
    const driverListEl = (
      <div id="dispatch-drivers"><DriverList result={ranked} showNotCarded={showNotCarded && !!planTerminalId}
          location={planLocation} terminal={planTerminal} historyLoading={history.loading} historyError={history.error}
          selectedDriverId={tlDriverId}
          onSelectDriver={(id) => { setTlDriverId((cur) => (cur === id ? null : id)); setTlStart(null); if (planLocationId && planTerminalId) window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onOpenDriver={(id) => setSelectedDriverId(id)} equipFor={equipFor} hosFor={(id) => (fleetHos.get(id) ? hosText(fleetHos.get(id)!) : null)} /></div>
    );
    return (
      <>
      <DispatchDashboardView
        mode={mode} onMode={setMode} companyName={companyName}
        error={fleet.error ?? fleetReports.error ?? (mode === "plan" ? plan.error : null)}
        conflicts={conflicts} counts={counts} reportCount={fleetReports.reports.length}
        watch={watch} unseen={notifier.unseen} onSeen={notifier.markSeen} onSeenAll={notifier.markAllSeen}
        notify={notifier.permission} onEnableNotify={() => { void enablePush(companyId || "").finally(() => void notifier.enable()); }}
        onAck={acks.ack} ackError={acks.error}
        terminal={terminalInfo} product={boardProduct} initialsOf={(id) => initialsOf(plan.roster.find((m) => m.user_id === id)?.display_name)} onOpenTrip={openTrip} openingId={nav.openingId("trip")}
        regionNote={regionOn ? `Filtered to region: ${[...regionSel].join(", ")}` : null}
        alerts={alerts} planCounts={pCounts} planLoading={plan.loading}
        allocation={allContracts.some((c) => c.per_day != null || c.per_week != null) ? { ...allocChip, onOpen: () => setAllocOpen(true) } : null}
        focusCount={planning ? ranked.focusIds.size : null}
        notCarded={planTerminalId && planLocationId ? { count: ranked.notCarded.length, shown: showNotCarded, onToggle: () => setShowNotCarded((v) => !v) } : null}
        planner={!tlDriverId ? (
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 8px" }}>Step 1 · Pick the driver for this load.</div>
            {driverListEl}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {plan.roster.find((m) => m.user_id === tlDriverId)?.display_name ?? "Driver"}
              </div>
              <button type="button" onClick={() => { setTlDriverId(null); setTlStart(null); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>Change driver</button>
            </div>
          <PlanLoadCard location={planLocation} terminal={planTerminal} terminals={terminalOptions} result={ranked}
            historyLoading={history.loading} historyError={history.error} showNotCarded={showNotCarded && !!planTerminalId}
            onPickLocation={() => setLocPickerOpen(true)}
            onClearLocation={() => { setPlanLocationId(null); setShowNotCarded(false); }}
            onPickTerminal={(id) => { setPlanTerminalId(id); setPlanSupplierId(null); if (!id) setShowNotCarded(false); }}
            parties={{ shipper, customer, onShipper: setShipper, onCustomer: (v: string) => { customerTouched.current = true; setCustomer(v); } }}
            timeline={tlDriverId && planLocation && planTerminalId ? (
              <TimelineCard driverName={plan.roster.find((m) => m.user_id === tlDriverId)?.display_name ?? "Driver"} forecast={forecast} startMs={startMs}
                chained={allLegs.length > 0 && tlStart == null} lockedCount={priorLegs.length} blockMsg={blockMsg} typicalStart={typicalMin != null ? clock(new Date(new Date().setHours(0, 0, 0, 0)).getTime() + typicalMin * 60000) : null}
                terminalPlace={planTerminal?.place ?? null} locationPlace={[planLocation?.city, planLocation?.state].filter(Boolean).join(", ") || null}
                hosLine={fleetHos.get(tlDriverId) ? hosText(fleetHos.get(tlDriverId)!) : null}
                rest={restWindow(fleetHos.get(tlDriverId), typicalMin)}
                dayLegs={allLegs} historyLoading={tripHistory.loading} onStart={setTlStart} onAdd={addLeg}
                onRemoveLeg={(i) => setDayPlan((m) => ({ ...m, [tlDriverId]: (m[tlDriverId] ?? []).filter((_, j) => j !== i - priorLegs.length) }))}
                onClearDay={() => setDayPlan((m) => ({ ...m, [tlDriverId]: [] }))}
                compartments={(
                  <CompartmentPlanCard
                    trailerName={plan.input?.trailers.get(effectiveTrailerId ?? "") ?? ""}
                    trailerOptions={[...(plan.input?.trailers ?? new Map<string, string>()).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))}
                    onTrailer={setPlanTrailerOverride} usingDriversTrailer={planTrailerOverride == null}
                    comps={trailerPlan.comps} catalog={planCatalog} terminalProductIds={trailerPlan.terminalProductIds}
                    plan={compPlan} onPlan={setCompPlan} slots={trailerPlan.slots}
                    activeSlot={activeTrailerSlot} onActiveSlot={setActiveTrailerSlot}
                    onSaveSlot={(slot, name) => trailerPlan.saveSlot(slot, name, slotPayloadFromPlan(compPlan, trailerPlan.comps.map((c) => c.n)), authUserId || "")}
                    onClearSlot={trailerPlan.clearSlot}
                    groups={planGroups} supplierName={supplierNameOf} defaultOrder={orderNumber} slotError={trailerPlan.error}
                    onGroupOrder={(pid, v) => {
                      // The first product's order is the default for the rest.
                      if (pid === planGroups[0]?.productId) { setOrderNumber(v); setGroupOverrides((m) => ({ ...m, [pid]: { ...m[pid], orderNumber: undefined } })); }
                      else setGroupOverrides((m) => ({ ...m, [pid]: { ...m[pid], orderNumber: v } }));
                    }}
                    onPickSupplier={(pid) => { setSupPickFor(pid); setSuppliersOpen("pick"); }} />
                )}
                orderNumber={orderNumber} onOrder={setOrderNumber} hideOrder={false} needProduct={planGroups.length === 0} warnings={warnings} dispatching={dispatching} dispatchMsg={dispatchMsg} onDispatch={dispatchNow} />
            ) : null}
            hosFor={(id) => (fleetHos.get(id) ? hosText(fleetHos.get(id)!) : null)}
            equipFor={equipFor} certNames={certs.types.map((t) => t.name)} certProblems={certProblems}
            supplier={planSupplier ? { ...planSupplier, warning: [planSupplier.warning, allocWarning].filter(Boolean).join(" ") || null } : null}
            onOpenDriver={(id) => setSelectedDriverId(id)} />
          </div>
        )}
        onOpenDriver={(id) => setSelectedDriverId(id)}
        hosAlerts={lowHours}
        liveBoard={<FleetBoard sections={["live"]} trips={fleetTrips} locations={fleet.locations} product={boardProduct} now={new Date()}
          positions={livePositions} hos={fleetHos} geo={geo} delayedTrips={new Set(liveRows.filter((r) => r.delayed).map((r) => r.tripId))}
          terminalLL={terminalLLOf} locationLL={locationLLOf}
          onOpenTrip={openTrip} openingId={nav.openingId("trip")} />}
        dispatchedBoard={!dispatchedShown.length ? undefined : <DispatchedBoard trips={dispatchedShown}
          driverName={(id) => plan.roster.find((m) => m.user_id === id)?.display_name ?? "Driver"}
          locationName={(id) => (id ? locList.locations.find((l) => l.location_id === id) : null) ? locationTitle(locList.locations.find((l) => l.location_id === id)!) : "Delivery"}
          supplierName={(id) => (id ? companySuppliers.all.find((x) => x.supplier_id === id)?.name ?? null : null)}
          onCancel={async (tid) => { const e = await cancelDispatched(tid, authUserId || ""); if (!e) dispatched.reload(); return e; }}
          onSwap={async (a, b) => { const e = await swapDispatched(a, b); dispatched.reload(); return e; }} />}
        parkedBoard={<FleetBoard sections={["parked"]} trips={fleetTrips} locations={fleet.locations} product={boardProduct} now={new Date()}
          onOpenTrip={openTrip} openingId={nav.openingId("trip")} />}
        cancelledBoard={<FleetBoard sections={["cancelled"]} cancelled={visibleCancelled} cancelledDays={CANCELLED_DAYS}
          trips={fleetTrips} locations={fleet.locations} product={boardProduct} now={new Date()}
          onOpenTrip={openTrip} openingId={nav.openingId("trip")}
          onReassignCancelled={(ct) => { setReassignErr(null); setReassigning(ct); }}
          onDismissCancelled={(id) => saveDismissed(new Set([...dismissed, id]))}
          onDismissAllCancelled={() => saveDismissed(new Set([...dismissed, ...visibleCancelled.map((c) => c.trip.trip_id)]))} />}
        dispatchedCount={dispatchedShown.length} cancelledCount={visibleCancelled.length} liveRows={liveRows}
        enRoute={{
          fleetTrips, locations: fleet.locations, terminals: terminalsCatalog as any, deliveryLocs: locList.locations, deliveryTanks: locList.tanks,
          companyId: companyId || null, userId: authUserId || null, onLocationAdded: locList.reload, onChanged: () => fleet.reload?.(),
          destLabel: (r) => {
            if (r.kind === "to_rack") { const t = terminalsCatalog.find((x) => String(x.terminal_id) === String(r.destId)); return t ? [t.terminal_name, t.city, t.state].filter(Boolean).join(", ") : r.where; }
            const l = locList.locations.find((x) => x.location_id === r.destId);
            return l ? [l.location_number ? `Store ${l.location_number}` : l.name, l.city, l.state].filter(Boolean).join(", ") : [r.where, r.place].filter(Boolean).join(", ");
          },
        }}
        regions={{ options: regionOptions, selected: regionSel, onChange: changeRegions }}
        drivers={mode === "plan" ? undefined : driverListEl}
        tools={dashTools}
      />
      <LocationsHub open={locsOpen} onClose={() => setLocsOpen(false)} companyId={companyId || null} userId={authUserId || null} role={shell.role ?? null} isSuperAdmin={!!shell.isSuperAdmin} />
      <FullscreenModal open={!!reassigning} title="Reassign to which driver?" onClose={() => setReassigning(null)}>
        {reassigning && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
            {reassigning.orderNumbers.length ? `Order ${reassigning.orderNumbers.join(", ")} · ` : ""}same rack, supplier and store. It leaves the Cancelled list once sent.
          </div>
        )}
        {reassignErr && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{reassignErr}</div>}
        {[...regionRoster].filter((m) => m.user_id !== reassigning?.trip.driver_id).sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "")).map((m) => (
          <button key={m.user_id} type="button" disabled={reassignBusy} onClick={() => void reassignTo(m.user_id)}
            style={{ display: "block", width: "100%", textAlign: "left", background: "#121213", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 15, fontWeight: 700, padding: "12px 14px", marginBottom: 6, borderRadius: 2, cursor: "pointer", opacity: reassignBusy ? 0.5 : 1 }}>
            {m.display_name ?? "Driver"}
          </button>
        ))}
      </FullscreenModal>
      <LocationPicker open={locPickerOpen} title="Drop location" origin={null} locations={locList.locations} tanks={locList.tanks}
        companyId={companyId || null} userId={authUserId || null} selectedLocationId={planLocationId}
        onLocationAdded={locList.reload}
        onPick={(to) => { setPlanLocationId(to.locationId ?? null); setLocPickerOpen(false); }} onClose={() => setLocPickerOpen(false)} />
      <AllocationModal open={allocOpen} onClose={() => setAllocOpen(false)} rows={allocRows} />
      {companyId && authUserId && (
        <SuppliersModal open={suppliersOpen !== null} onClose={() => { setSuppliersOpen(null); setSupPickFor(null); }} companyId={companyId} userId={authUserId}
          canManage={canManageSuppliers} terminals={terminalOptions} initialTerminalId={planTerminalId}
          onSelect={suppliersOpen === "pick" ? (sid) => { if (supPickFor && supPickFor !== planGroups[0]?.productId) setGroupOverrides((m) => ({ ...m, [supPickFor]: { ...m[supPickFor], supplierId: sid } })); else { setPlanSupplierId(sid); if (supPickFor) setGroupOverrides((m) => ({ ...m, [supPickFor]: { ...m[supPickFor], supplierId: undefined } })); } setSupPickFor(null); } : undefined}
          selectedSupplierId={supPickFor ? groupOverrides[supPickFor]?.supplierId ?? planSupplierId : planSupplierId} />
      )}
      <TrackSheet open={findTruckOpen} onClose={() => setFindTruckOpen(false)} companyId={companyId || null} role={shell.role ?? null} myTruckId={null} myTrailerId={null} />
      {companyId && <FleetCardsModal open={fleetCardsOpen} onClose={() => setFleetCardsOpen(false)} companyId={companyId} />}
      </>
    );
  }

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setSelectedDriverId("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>
          ‹ Change Driver
        </button>
      </div>

      {/* "Back strip" -- admin/super-admin only (dispatchers never get in a
          truck). Starts a real full-app setup session (same mechanism as
          /admin's "Set up planner for X"), not just this tab's own
          contextual card/notes view -- lets the admin use the whole app
          (Planner, Terminal, everything) as this driver. returnTo points
          back here so "← Return to Dispatch" lands where they actually
          started, not /admin. */}
      {canUseAppAs && !loading && identity && (
        <button
          type="button"
          onClick={() => {
            startSetupSession({
              targetUserId: selectedDriverId,
              targetDisplayName: identity.display_name,
              adminUserId: authUserId,
              returnTo: "/planner/dispatch",
            });
            // Hard navigation, not router.push -- the admin is already
            // inside the /planner layout, so CalculatorShellProvider is
            // already mounted and only ever reads sessionStorage once on
            // mount. A client-side push wouldn't remount it, so the new
            // setup session would silently never take effect (confirmed
            // live: content stayed the admin's own equipment/terminal data
            // after a router.push here). Matches JoinFleetView.tsx's own
            // same-class fix for the identical problem.
            window.location.href = "/planner?plan=1";
          }}
          style={{
            width: "100%", textAlign: "left" as const, padding: "12px 14px", borderRadius: 2, marginBottom: 14,
            border: "1px solid rgba(251,146,60,0.35)", background: "rgba(251,146,60,0.10)",
            color: "#fb923c", fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}
        >
          Use app as {identity.display_name} →
        </button>
      )}

      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && identity && (
        <>
          <SectionCard title="Driver">
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{identity.display_name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              {identity.division ? `Store ${identity.division}` : "—"}
              {identity.local_area ? ` – ${identity.local_area}` : ""}
              {identity.region ? `, ${identity.region}` : ""}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
              {DAY_LABELS.map((label, i) => {
                const active = schedule.days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    disabled={scheduleSaving}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", fontSize: 11, fontWeight: 800, cursor: "pointer",
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: active ? "#fff" : "rgba(255,255,255,0.05)",
                      color: active ? "#111" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              <input
                type="time" value={schedule.start}
                onChange={(e) => saveSchedule({ ...schedule, start: e.target.value })}
                style={{ width: 90, padding: "4px 6px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 12 }}
              />
              <span style={{ color: "rgba(255,255,255,0.3)", alignSelf: "center" }}>–</span>
              <input
                type="time" value={schedule.end}
                onChange={(e) => saveSchedule({ ...schedule, end: e.target.value })}
                style={{ width: 90, padding: "4px 6px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 12 }}
              />
            </div>
          </SectionCard>

          <SectionCard title="Equipment">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                Truck{equipment.truckName ? ` · ${equipment.truckName}` : ""}
                {equipment.partial && equipment.truckName && !equipment.trailerName && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fbbf24" }}> (bobtail)</span>
                )}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{equipment.truckMake ?? ""}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                Trailer{equipment.trailerName ? ` · ${equipment.trailerName}` : ""}
                {equipment.partial && equipment.trailerName && !equipment.truckName && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fbbf24" }}> (no truck)</span>
                )}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{equipment.trailerMake ?? ""}</span>
            </div>
            {!equipment.truckName && !equipment.trailerName && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No equipment currently selected.</div>
            )}
            {(equipment.truckName || equipment.trailerName) && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 6 }}>
                {equipment.permitItems.length === 0 ? (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Nothing expiring soon.</div>
                ) : (
                  equipment.permitItems.map((p) => <ExpirationLine key={p.label} label={p.label} iso={p.iso} />)
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Terminal Cards">
            <input
              type="text" value={cardSearch} onChange={(e) => setCardSearch(e.target.value)}
              placeholder="All Terminals — search…"
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13, marginBottom: 10 }}
            />
            {cardsByCity.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No terminal cards on file.</div>}
            <div style={{ display: "grid", gap: 14 }}>
              {cardsByCity.map(([city, cityCards]) => (
                <div key={city}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 }}>
                    {city}
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {cityCards.map((c) => (
                      <ExpirationLine
                        key={c.terminal_id}
                        label={c.terminal_name}
                        iso={c.expiresISO}
                        access
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Badges">
            {badges.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No badges on file.</div>}
            <div style={{ display: "grid", gap: 6 }}>
              {badges.map((b) => (
                <ExpirationLine
                  key={b.id}
                  label={b.category ? `${b.port_name} (${b.category})` : b.port_name}
                  iso={b.expiration_date}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Credentials">
            <div style={{ display: "grid", gap: 6 }}>
              <ExpirationLine label="License" iso={credentials.licenseExp} />
              <ExpirationLine label="Medical" iso={credentials.medicalExp} />
              <ExpirationLine label="TWIC" iso={credentials.twicExp} />
            </div>
          </SectionCard>

          <SectionCard title="Notes">
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes}
              placeholder="Internal notes for dispatch/lead/admin — not visible to the driver…"
              rows={3}
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13, resize: "vertical" as const }}
            />
            {notesSaving && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Saving…</div>}
          </SectionCard>
        </>
      )}
    </div>
  );
}
