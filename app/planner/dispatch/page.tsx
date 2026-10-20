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
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { startSetupSession } from "@/lib/setupSession";
import { useCalculatorShell } from "../CalculatorShellContext";
import DriverPicker from "../components/DriverPicker";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { addDaysISO_, formatMDYWithCountdown_ } from "../utils/dates";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { CANCELLED_DAYS, useCancelledTrips } from "@/lib/trips/useCancelledTrips";
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
import { PlanLoadCard, type TerminalOption, type DriverEquip } from "./PlanLoadCard";
import { trailerCert, certBlocks } from "@/lib/dispatch/certs";
import { SuppliersModal } from "./SuppliersModal";
import { useTerminalSuppliers } from "@/lib/suppliers/useTerminalSuppliers";
import { useCompanySuppliers, useSupplierContracts } from "@/lib/suppliers/useSupplierAdmin";
import { LocationPicker } from "../components/trip/LocationPicker";
import { useDeliveryLocationList } from "@/lib/trips/useTripData";
import { useFleetReports, usePlanData, useConflictAcks, useLocationDeliveries, useDriverEquipment, useTerminalCerts } from "@/lib/dispatch/useDispatchData";
import { onBoard } from "@/lib/trips/tripFlow";

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
      router.replace("/planner");
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
  const fleetReports = useFleetReports(fleet.trips, plan.usedTerminalIds);
  const rawConflicts = useMemo(
    () => findConflicts(fleet.trips, fleetReports.reports, fleetReports.plannedByLoad),
    [fleet.trips, fleetReports.reports, fleetReports.plannedByLoad],
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
    () => liveCounts(fleet.trips.map((f) => ({ ...f, loadedComps: onBoard(f.compLoads).length }))),
    [fleet.trips],
  );
  // ── Planning a load: drop location -> terminal -> drivers ───────────────
  const [planLocationId, setPlanLocationId] = useState<string | null>(null);
  const [planTerminalId, setPlanTerminalId] = useState<string | null>(null);
  const [showNotCarded, setShowNotCarded] = useState(false);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const locList = useDeliveryLocationList(companyId || null, authUserId || null);
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
    for (const f of fleet.trips) m.set(f.trip.driver_id, f.trip.status === "parked" ? "Parked" : "On a load");
    return m;
  }, [fleet.trips]);
  const planning = !!planLocationId || !!planTerminalId;
  const ranked = useMemo(() => rankDrivers({
    roster: plan.roster, deliveries: history.rows, access: plan.input?.access,
    terminalId: planTerminalId, renewalDays: planTerminalId ? plan.input?.terminals.get(planTerminalId)?.renewal_days ?? null : null,
    busy: busyByDriver,
  }), [plan.roster, history.rows, plan.input, planTerminalId, busyByDriver]);

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

  const alerts = useMemo(
    () => focusAlerts(plan.input ? planAlerts(plan.input, 30) : [], planning ? ranked.focusIds : null),
    [plan.input, planning, ranked.focusIds]);
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
      { icon: "card", label: "Fleet Cards", onClick: () => setFleetCardsOpen(true) },
      { icon: "terminal" as const, label: "Suppliers", onClick: () => setSuppliersOpen("manage") },
      { icon: "chart", label: "Reports", busy: nav.is("reports"), onClick: () => nav.go("reports", "/planner/reports") },
      ...(shell.role === "admin" || shell.isSuperAdmin
        ? [{ icon: "terminal" as const, label: "Company", busy: nav.is("company"), onClick: () => nav.go("company", "/admin") }]
        : []),
    ];
    return (
      <>
      <DispatchDashboardView
        mode={mode} onMode={setMode} companyName={companyName}
        error={fleet.error ?? fleetReports.error ?? (mode === "plan" ? plan.error : null)}
        conflicts={conflicts} counts={counts} reportCount={fleetReports.reports.length}
        watch={watch} unseen={notifier.unseen} onSeen={notifier.markSeen} onSeenAll={notifier.markAllSeen}
        notify={notifier.permission} onEnableNotify={notifier.enable}
        onAck={acks.ack} ackError={acks.error}
        terminal={terminalInfo} product={boardProduct} onOpenTrip={openTrip} openingId={nav.openingId("trip")}
        alerts={alerts} planCounts={pCounts} planLoading={plan.loading}
        focusCount={planning ? ranked.focusIds.size : null}
        notCarded={planTerminalId && planLocationId ? { count: ranked.notCarded.length, shown: showNotCarded, onToggle: () => setShowNotCarded((v) => !v) } : null}
        planner={
          <PlanLoadCard location={planLocation} terminal={planTerminal} terminals={terminalOptions} result={ranked}
            historyLoading={history.loading} historyError={history.error} showNotCarded={showNotCarded && !!planTerminalId}
            onPickLocation={() => setLocPickerOpen(true)}
            onClearLocation={() => { setPlanLocationId(null); setShowNotCarded(false); }}
            onPickTerminal={(id) => { setPlanTerminalId(id); setPlanSupplierId(null); if (!id) setShowNotCarded(false); }}
            equipFor={equipFor} certNames={certs.types.map((t) => t.name)} certProblems={certProblems}
            supplier={planSupplier} onPickSupplier={() => setSuppliersOpen("pick")} onClearSupplier={() => setPlanSupplierId(null)}
            onOpenDriver={(id) => setSelectedDriverId(id)} />
        }
        onOpenDriver={(id) => setSelectedDriverId(id)}
        liveBoard={<FleetBoard sections={["live"]} trips={fleet.trips} locations={fleet.locations} product={boardProduct} now={new Date()}
          onOpenTrip={openTrip} openingId={nav.openingId("trip")} />}
        planBoard={<FleetBoard sections={["parked", "cancelled"]} cancelled={cancelledTrips.trips} cancelledDays={CANCELLED_DAYS}
          trips={fleet.trips} locations={fleet.locations} product={boardProduct} now={new Date()}
          onOpenTrip={openTrip} openingId={nav.openingId("trip")} />}
        drivers={<div id="dispatch-drivers"><DriverPicker companyId={companyId} onPick={(id) => setSelectedDriverId(id)} /></div>}
        tools={dashTools}
      />
      <LocationPicker open={locPickerOpen} title="Drop location" origin={null} locations={locList.locations} tanks={locList.tanks}
        companyId={companyId || null} userId={authUserId || null} selectedLocationId={planLocationId}
        onToggleStar={locList.toggleStar} onLocationAdded={locList.reload}
        onPick={(to) => { setPlanLocationId(to.locationId ?? null); setLocPickerOpen(false); }} onClose={() => setLocPickerOpen(false)} />
      {companyId && authUserId && (
        <SuppliersModal open={suppliersOpen !== null} onClose={() => setSuppliersOpen(null)} companyId={companyId} userId={authUserId}
          canManage={canManageSuppliers} terminals={terminalOptions} initialTerminalId={planTerminalId}
          onSelect={suppliersOpen === "pick" ? (sid) => setPlanSupplierId(sid) : undefined} selectedSupplierId={planSupplierId} />
      )}
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
            window.location.href = "/planner";
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
