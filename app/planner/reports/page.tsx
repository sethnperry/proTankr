"use client";
// app/planner/reports/page.tsx
//
// One consolidated hub for every report that used to be scattered across
// separate entry points (My Loads button on the Planner, Scale/Service/Wash
// history tucked inside the Equipment modal, the bell icon's Expiring Items,
// and the Cards tab's Terminals/Credentials sub-tabs). Reached from the
// hamburger nav rather than the Planner/Cards/Vault tab bar -- it's a
// destination, not a 4th peer tab.
//
// Deliberately reuses the existing report modals as-is (MyLoadsModal,
// ScaleHistoryModal, RecordHistoryModal, ExpirationModal) rather than
// rebuilding their data/UI here -- this page is just a front door that
// wires them up. Terminal Cards and Credentials already have full pages of
// their own (the Cards tab), so their tiles just navigate there.
//
// 2026-08-17 overhaul: admin/dispatch can now switch whose Loads/Credentials
// they're viewing (matches the existing "other drivers' loads" permission
// matrix in CLAUDE.md -- dispatch+admin, not lead), and admin/dispatch/lead
// get an equipment picker to scope Scale/Service/Wash History to any
// company combo, not just their own currently-selected Planner equipment.
// Plain drivers see none of this -- unchanged, still their own identity and
// their own Planner-selected equipment throughout.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useLoadHistory } from "../hooks/useLoadHistory";
import MyLoadsModal from "../modals/MyLoadsModal";
import ScaleHistoryModal from "../modals/ScaleHistoryModal";
import RecordHistoryModal from "../modals/RecordHistoryModal";
import TerminalCardsPickerModal from "../modals/TerminalCardsPickerModal";
import TerminalCardsReportModal from "../modals/TerminalCardsReportModal";
import CredentialsReportModal, { type LicenseData, type MedicalData, type TwicData } from "../modals/CredentialsReportModal";
import DriverPicker from "../components/DriverPicker";
import EquipmentComboPicker from "../components/EquipmentComboPicker";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import UtilizationReportModal from "./UtilizationReportModal";
import { useDriverPeriodUtilization } from "@/lib/capacity/useUtilization";
import { useUtilizationPeriod } from "@/lib/capacity/useUtilizationPeriod";
import { UTILIZATION_METRIC_LABEL } from "@/lib/capacity/computeUtilization";
import { fetchServiceTypes } from "../modals/ServiceTypeManager";
import { computeUnitServiceDue } from "../modals/SoloEquipmentModal";
import { cardStateFor, type CardState } from "../cards/cardTheme";
import { daysUntilISO_ } from "../utils/dates";
import { GRAPHITE, GRAPHITE_DARKER } from "../theme";
import { buildTerminalCardsReportBody, type TerminalCardsScope, type TerminalStatusItem } from "./buildTerminalCardsReport";

type EquipRow = { truck_id?: string; trailer_id?: string; truck_name?: string; trailer_name?: string; active: boolean | null };

// cardTheme.ts's own EXP_COLOR assumes a light "pearl card-wallet"
// background (its own doc comment says so) -- ReportTile below renders on
// a dark graphite gradient, so EXP_COLOR's near-black "valid"/"not_set"
// colors were invisible there. Same fix already applied in
// FleetCardsModal.tsx/FleetCredentialsModal.tsx/dispatch/page.tsx for the
// identical reason -- same state names, colors re-picked for a dark surface.
const DARK_EXP_COLOR: Record<CardState, string> = {
  not_set: "rgba(255,255,255,0.35)",
  valid: "rgba(255,255,255,0.85)",
  expiring: "#f59e0b",
  expired: "#ef4444",
  inactive: "rgba(255,255,255,0.35)",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
}

// ── Section label + tile ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function SwitcherPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 10,
      }}
    >
      {label}
      <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
    </button>
  );
}

function ReportTile({ title, sub, stat, statColor, onClick, disabled }: {
  title: string; sub: string; stat?: string; statColor?: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <div
      role="button" tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 8,
        background: disabled ? "rgba(255,255,255,0.03)" : `linear-gradient(135deg, ${GRAPHITE} 0%, ${GRAPHITE_DARKER} 100%)`,
        border: disabled ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.10)",
        boxShadow: disabled ? "none" : "0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        cursor: disabled ? "default" : "pointer", userSelect: "none" as const,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: disabled ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.92)" }}>{title}</div>
        <div style={{ fontSize: 12, color: disabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{sub}</div>
      </div>
      {stat && (
        <div style={{ fontSize: 13, fontWeight: 800, color: statColor ?? (disabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.55)"), textAlign: "right" as const, flexShrink: 0, whiteSpace: "nowrap" as const }}>
          {stat}
        </div>
      )}
      {!disabled && <span style={{ fontSize: 16, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>›</span>}
    </div>
  );
}

// ── Reports hub ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const shell = useCalculatorShell();
  const { effectiveUserId, equipment, terminals, expirations, role } = shell;

  // Other drivers' loads/credentials are dispatch+admin only, matching the
  // permission matrix already documented in CLAUDE.md ("Other drivers'
  // loads" -- dispatch, admin; lead does NOT get this). Equipment picking
  // below is deliberately a wider set (admin/dispatch/lead) -- a separate,
  // narrower read-only carve-out for this specific reports view, not a
  // change to the general equipment-edit permission matrix.
  //
  // !shell.isSolo is required here too -- a solo company's sole member is
  // always role 'admin' (per navDestinations.ts), so without this a solo
  // driver would get canViewOthers === true and be offered a driver-picker
  // that could only ever list themself.
  const canViewOthers = !shell.isSolo && (role === "admin" || role === "dispatch");
  const canPickEquipment = role === "admin" || role === "dispatch" || role === "lead";

  const [viewedUserId, setViewedUserId] = useState(effectiveUserId);
  const [viewedUserName, setViewedUserName] = useState("");
  useEffect(() => { setViewedUserId(effectiveUserId); setViewedUserName(""); }, [effectiveUserId]);

  const loadHistory = useLoadHistory(viewedUserId);
  useEffect(() => { loadHistory.fetch(null); }, [viewedUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [trucks, setTrucks] = useState<EquipRow[]>([]);
  const [trailers, setTrailers] = useState<EquipRow[]>([]);

  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      const { data: s } = await supabase.from("user_settings").select("active_company_id").eq("user_id", effectiveUserId).maybeSingle();
      const cid = (s?.active_company_id as string | null) ?? null;
      setCompanyId(cid);
      if (cid) {
        const [{ data: t }, { data: tr }] = await Promise.all([
          supabase.from("trucks").select("truck_id, truck_name, active").eq("company_id", cid).eq("active", true).order("truck_name"),
          supabase.from("trailers").select("trailer_id, trailer_name, active").eq("company_id", cid).eq("active", true).order("trailer_name"),
        ]);
        setTrucks((t ?? []) as EquipRow[]);
        setTrailers((tr ?? []) as EquipRow[]);
      }
    })();
  }, [effectiveUserId]);

  const [driverName, setDriverName] = useState("");
  const [license, setLicense] = useState<LicenseData>(null);
  const [medical, setMedical] = useState<MedicalData>(null);
  const [twic, setTwic] = useState<TwicData>(null);

  const credSummary = useMemo(() => {
    const dates = [license?.expiration_date, medical?.expiration_date, twic?.expiration_date].filter(Boolean) as string[];
    if (dates.length === 0) return { label: "Not on file", color: DARK_EXP_COLOR.not_set };
    const soonestDays = Math.min(...dates.map((d) => daysUntilISO_(d) ?? 99999));
    const soonestIso = dates[dates.map((d) => daysUntilISO_(d) ?? 99999).indexOf(soonestDays)];
    const state = cardStateFor(soonestIso);
    return { label: `${soonestDays}d to next exp.`, color: DARK_EXP_COLOR[state] };
  }, [license, medical, twic]);

  // Credentials are scoped to whichever driver is currently picked (same as
  // Loads) -- not effectiveUserId, so an admin viewing another driver's
  // loads sees that same driver's credentials, not their own.
  useEffect(() => {
    if (!viewedUserId) return;
    (async () => {
      const [{ data: profile }, { data: lic }, { data: med }, { data: tw }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("user_id", viewedUserId).maybeSingle(),
        supabase.from("driver_licenses").select("*").eq("user_id", viewedUserId).maybeSingle(),
        supabase.from("driver_medical_cards").select("*").eq("user_id", viewedUserId).maybeSingle(),
        supabase.from("driver_twic_cards").select("*").eq("user_id", viewedUserId).maybeSingle(),
      ]);
      setDriverName((profile?.display_name as string | null) ?? "");
      setLicense((lic as LicenseData) ?? null);
      setMedical((med as MedicalData) ?? null);
      setTwic((tw as TwicData) ?? null);
    })();
  }, [viewedUserId]);

  const [myLoadsOpen, setMyLoadsOpen] = useState(false);
  const [utilizationOpen, setUtilizationOpen] = useState(false);

  // Payload utilization for whoever is being viewed -- follows viewedUserId,
  // so admin/dispatch using the existing driver picker above see that
  // driver's own figures. The period comes from the shared hook rather than
  // being computed here, so this and the Planner card can't disagree.
  const utilPeriod = useUtilizationPeriod(companyId);
  const utilization = useDriverPeriodUtilization(viewedUserId || null, utilPeriod.since);
  // Deep-link target from the Planner's "View This Load in Reports" link
  // (RecallDifferentEquipmentSheet.tsx, via ?loadId=... -- see
  // CLAUDE.md "different-equipment recall"). Reads the query string
  // directly rather than next/navigation's useSearchParams -- this repo's
  // own app/demo/ended/page.tsx already hit a real client/server hydration
  // mismatch from that hook's Suspense-based resolution, and this page has
  // no SSR value worth reconciling for it either. Strips the param via
  // history.replaceState once consumed, so a later reload of this same
  // URL doesn't keep re-opening the modal.
  const [deepLinkLoadId, setDeepLinkLoadId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("loadId");
      if (id) {
        setDeepLinkLoadId(id);
        setMyLoadsOpen(true);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {}
  }, []);
  const [scaleHistoryOpen, setScaleHistoryOpen] = useState(false);
  const [serviceHistoryOpen, setServiceHistoryOpen] = useState(false);
  const [washHistoryOpen, setWashHistoryOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [terminalReport, setTerminalReport] = useState<{ title: string; body: string } | null>(null);
  const [credentialsReportOpen, setCredentialsReportOpen] = useState(false);
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [equipPickerOpen, setEquipPickerOpen] = useState(false);
  const [reportComboId, setReportComboId] = useState<string | null>(null);

  const isViewingOther = viewedUserId !== effectiveUserId;
  const loadsTitle = canViewOthers && isViewingOther ? "Loads" : "My Loads";

  // Privileged roles can override which combo Scale/Service/Wash History
  // reports on; everyone else always sees their own Planner-selected
  // equipment, unchanged.
  const resolvedCombo = useMemo(() => {
    if (canPickEquipment && reportComboId) {
      return (equipment.combos ?? []).find((c) => String(c.combo_id) === String(reportComboId)) ?? null;
    }
    return equipment.selectedCombo;
  }, [canPickEquipment, reportComboId, equipment.combos, equipment.selectedCombo]);

  const resolvedLabel = useMemo(() => {
    if (!resolvedCombo) return null;
    const name = String(resolvedCombo.combo_name ?? "").trim();
    if (name) return name;
    const t = equipment.truckNameById[resolvedCombo.truck_id ?? ""] ?? resolvedCombo.truck_id ?? "?";
    const tr = equipment.trailerNameById[resolvedCombo.trailer_id ?? ""] ?? resolvedCombo.trailer_id ?? "?";
    return `Truck ${t} / Trailer ${tr}`;
  }, [resolvedCombo, equipment.truckNameById, equipment.trailerNameById]);

  const hasEquipment = !!resolvedCombo;
  const equipmentFallbackSub = hasEquipment
    ? (resolvedLabel ?? "Selected equipment")
    : (canPickEquipment ? "Tap Select Equipment above" : "Select equipment on the Planner first");

  // Differentiated sub-labels (2026-08-17): tare weight for Scale, next
  // service due for Service, last wash date for Wash -- previously all
  // three shared one identical "equipmentSub" unit-number label.
  const [serviceSub, setServiceSub] = useState<string | null>(null);
  const [washSub, setWashSub] = useState<string | null>(null);

  useEffect(() => {
    setServiceSub(null);
    setWashSub(null);
    if (!companyId || !resolvedCombo) return;
    const truckId = resolvedCombo.truck_id ?? "";
    const trailerId = resolvedCombo.trailer_id ?? "";
    if (!truckId && !trailerId) return;
    let cancelled = false;
    (async () => {
      const types = await fetchServiceTypes(companyId);
      if (cancelled) return;

      // Service due: truck's own due status when a truck exists (matches
      // "next truck service due" per the original spec), else trailer's.
      const serviceUnitLabel: "Truck" | "Trailer" = truckId ? "Truck" : "Trailer";
      const serviceIdField = truckId ? "truck_id" : "trailer_id";
      const serviceIdValue = truckId || trailerId;
      const { data: records } = await supabase
        .from("service_records").select("service_type_id, date, reading_value, created_at")
        .eq(serviceIdField, serviceIdValue);
      if (cancelled) return;
      const due = computeUnitServiceDue(serviceUnitLabel, (records ?? []) as any, types);
      setServiceSub(due.display);

      // Wash: most recent across BOTH truck and trailer, not truck-only --
      // a combo's trailer can have real wash history even when its truck
      // doesn't (or vice versa), and only checking one silently hid the
      // other, misreporting "No wash recorded" when one genuinely existed.
      const washQueries = [
        truckId ? supabase.from("wash_records").select("washed_at").eq("truck_id", truckId).order("washed_at", { ascending: false }).limit(1) : null,
        trailerId ? supabase.from("wash_records").select("washed_at").eq("trailer_id", trailerId).order("washed_at", { ascending: false }).limit(1) : null,
      ].filter((q): q is NonNullable<typeof q> => q !== null);
      const washResults = await Promise.all(washQueries);
      if (cancelled) return;
      const washDates = washResults.map((r) => r.data?.[0]?.washed_at as string | undefined).filter((d): d is string => !!d);
      const latestWash = washDates.length ? washDates.reduce((a, b) => (b > a ? b : a)) : null;
      setWashSub(latestWash ? `Last washed ${fmtDate(latestWash)}` : "No wash recorded");
    })();
    return () => { cancelled = true; };
  }, [companyId, resolvedCombo?.combo_id, resolvedCombo?.truck_id, resolvedCombo?.trailer_id]);

  const scaleSub = hasEquipment && resolvedCombo?.tare_lbs != null
    ? `Tare ${resolvedCombo.tare_lbs.toLocaleString()} lbs`
    : equipmentFallbackSub;
  const serviceSubFinal = hasEquipment && serviceSub ? serviceSub : equipmentFallbackSub;
  const washSubFinal = hasEquipment && washSub ? washSub : equipmentFallbackSub;

  const terminalsExpiringSoon = useMemo(() => {
    let count = 0;
    for (const t of terminals.terminals ?? []) {
      const tid = String((t as any).terminal_id);
      const iso = terminals.terminalDisplayInfo(t, tid);
      const state = cardStateFor(iso);
      if (state === "expiring" || state === "expired" || state === "inactive") count++;
    }
    return count;
  }, [terminals.terminals, terminals.terminalDisplayInfo]);

  const expiringCount = expirations.expiredCount + expirations.warningCount;

  const cityOptions = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of terminals.terminals ?? []) {
      const city = String((t as any).city ?? "Unknown");
      if (!map.has(city)) map.set(city, (t as any).state ?? null);
    }
    return Array.from(map.entries()).map(([city, state]) => ({ city, state })).sort((a, b) => a.city.localeCompare(b.city));
  }, [terminals.terminals]);

  const handlePickCity = (city: string, stateCode: string | null, scope: TerminalCardsScope) => {
    const starred: TerminalStatusItem[] = (terminals.terminals ?? [])
      .filter((t: any) => String(t.city ?? "Unknown") === city)
      .map((t: any) => {
        const tid = String(t.terminal_id);
        const expiresISO = terminals.terminalDisplayInfo(t, tid);
        return { tid, name: String(t.terminal_name ?? "Terminal"), state: cardStateFor(expiresISO), expiresISO };
      });
    const catalog = (terminals.terminalCatalog ?? [])
      .filter((c: any) => String(c.city ?? "Unknown") === city)
      .map((c: any) => ({ terminal_id: String(c.terminal_id), name: String(c.terminal_name ?? "Terminal") }));

    const body = buildTerminalCardsReportBody({ city, stateCode, scope, starred, catalog });
    setTerminalReport({ title: `Terminal Cards — ${city}${stateCode ? `, ${stateCode}` : ""}`, body });
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Reports</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Everything you can pull up, in one place.</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        <div>
          {canViewOthers && (
            <SwitcherPill
              label={isViewingOther ? `Viewing ${viewedUserName || "driver"}` : "Viewing myself"}
              onClick={() => setDriverPickerOpen(true)}
            />
          )}
          <SectionLabel>{loadsTitle}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ReportTile
              title={loadsTitle}
              sub="Completed and planned loads across all equipment"
              stat={loadHistory.loading ? undefined : `${loadHistory.rows.length}`}
              onClick={() => setMyLoadsOpen(true)}
            />
            <ReportTile
              title={UTILIZATION_METRIC_LABEL}
              sub="How much of the available capacity each load used"
              stat={
                utilization.isLoading
                  ? undefined
                  : utilization.summary.utilization_pct != null
                    ? `${utilization.summary.utilization_pct.toFixed(1)}%`
                    : "No data"
              }
              onClick={() => setUtilizationOpen(true)}
            />
          </div>
        </div>

        <div>
          <SectionLabel>Compliance</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ReportTile
              title="Terminal Cards"
              sub="Share who's carded where, by city"
              stat={terminalsExpiringSoon > 0 ? `${terminalsExpiringSoon} expiring` : "All current"}
              statColor={terminalsExpiringSoon > 0 ? "#b45309" : undefined}
              onClick={() => setCityPickerOpen(true)}
            />
            <ReportTile
              title="Credentials"
              sub="Printable report — driver's license, medical card, TWIC"
              stat={credSummary?.label}
              statColor={credSummary?.color}
              onClick={() => setCredentialsReportOpen(true)}
            />
          </div>
        </div>

        <div>
          <SectionLabel>Equipment</SectionLabel>
          {canPickEquipment && (
            <SwitcherPill
              label={resolvedLabel ?? "Select Equipment"}
              onClick={() => setEquipPickerOpen(true)}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ReportTile
              title="Scale History"
              sub={scaleSub}
              onClick={() => setScaleHistoryOpen(true)}
              disabled={!hasEquipment}
            />
            <ReportTile
              title="Service History"
              sub={serviceSubFinal}
              onClick={() => setServiceHistoryOpen(true)}
              disabled={!hasEquipment}
            />
            <ReportTile
              title="Wash History"
              sub={washSubFinal}
              onClick={() => setWashHistoryOpen(true)}
              disabled={!hasEquipment}
            />
            <ReportTile
              title="Expiring Items"
              sub="Truck & trailer permits, terminal card renewals"
              stat={expiringCount > 0 ? `${expiringCount}` : "None"}
              statColor={expiringCount > 0 ? "#b91c1c" : undefined}
              onClick={() => shell.setExpModalOpen(true)}
            />
          </div>
        </div>

      </div>

      <UtilizationReportModal
        open={utilizationOpen}
        onClose={() => setUtilizationOpen(false)}
        periodLabel={utilPeriod.longLabel}
        summary={utilization.summary}
        rows={utilization.rows}
        loading={utilization.isLoading}
        isViewingOther={isViewingOther}
        driverName={viewedUserName}
      />

      <MyLoadsModal
        open={myLoadsOpen} onClose={() => setMyLoadsOpen(false)}
        authUserId={viewedUserId}
        rows={loadHistory.rows}
        loading={loadHistory.loading}
        error={loadHistory.error}
        linesCache={loadHistory.linesCache}
        linesLoading={loadHistory.linesLoading}
        onFetchLines={loadHistory.fetchLines}
        onFetchRange={loadHistory.fetch}
        terminalCatalog={terminals.terminalCatalog ?? []}
        combos={equipment.combos ?? []}
        // Delete is owner-checked server-side (delete_load's auth.uid()
        // must match) -- an admin/dispatch viewing another driver's loads
        // would see a working-looking Delete button that always fails,
        // same reason AdminLoadsModal.tsx omits it entirely. headerOverride
        // similarly avoids a modal titled "My Loads" while actually
        // showing someone else's history.
        onDeleteLoad={isViewingOther ? undefined : loadHistory.deleteLoad}
        headerOverride={isViewingOther ? `${viewedUserName || "Driver"}'s Loads` : undefined}
        initialExpandLoadId={deepLinkLoadId}
      />

      {hasEquipment && companyId && (
        <>
          <ScaleHistoryModal
            open={scaleHistoryOpen} onClose={() => setScaleHistoryOpen(false)}
            companyId={companyId}
            comboId={resolvedCombo!.combo_id}
            truckName={equipment.truckNameById[resolvedCombo!.truck_id ?? ""]}
            trailerName={equipment.trailerNameById[resolvedCombo!.trailer_id ?? ""]}
          />
          <RecordHistoryModal
            open={serviceHistoryOpen} onClose={() => setServiceHistoryOpen(false)}
            kind="service" title="Service History"
            companyId={companyId}
            truckId={resolvedCombo!.truck_id ?? ""}
            trailerId={resolvedCombo!.trailer_id ?? ""}
            trucks={trucks as any}
            trailers={trailers as any}
          />
          <RecordHistoryModal
            open={washHistoryOpen} onClose={() => setWashHistoryOpen(false)}
            kind="wash" title="Wash History"
            companyId={companyId}
            truckId={resolvedCombo!.truck_id ?? ""}
            trailerId={resolvedCombo!.trailer_id ?? ""}
            trucks={trucks as any}
            trailers={trailers as any}
          />
        </>
      )}

      <TerminalCardsPickerModal
        open={cityPickerOpen} onClose={() => setCityPickerOpen(false)}
        cities={cityOptions}
        onPick={handlePickCity}
      />
      <TerminalCardsReportModal
        open={!!terminalReport} onClose={() => setTerminalReport(null)}
        title={terminalReport?.title ?? ""} body={terminalReport?.body ?? ""}
      />
      <CredentialsReportModal
        open={credentialsReportOpen} onClose={() => setCredentialsReportOpen(false)}
        driverName={driverName} license={license} medical={medical} twic={twic}
      />

      {canViewOthers && (
        <FullscreenModal open={driverPickerOpen} title="View Whose Reports?" onClose={() => setDriverPickerOpen(false)}>
          <DriverPicker
            companyId={companyId}
            onPick={(id, name) => { setViewedUserId(id); setViewedUserName(name); setDriverPickerOpen(false); }}
          />
        </FullscreenModal>
      )}

      {canPickEquipment && (
        <EquipmentComboPicker
          open={equipPickerOpen}
          onClose={() => setEquipPickerOpen(false)}
          combos={equipment.combos ?? []}
          truckNameById={equipment.truckNameById}
          trailerNameById={equipment.trailerNameById}
          onPick={(comboId) => { setReportComboId(comboId); setEquipPickerOpen(false); }}
        />
      )}
    </div>
  );
}
