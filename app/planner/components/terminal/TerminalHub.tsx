"use client";
// app/planner/components/terminal/TerminalHub.tsx
//
// The one Terminal screen, shared everywhere (Driver and Dispatch dashboards, the Locations tool, the city
// picker). It opens on the currently selected terminal: product snapshot, trucks headed there, STUD,
// Suppliers, Search Terminals, then your card there, training and the company letter, gauging, racks and
// the fleet's cards. "Search Terminals" uses the same Select Location picker (favorite cities on top, the
// rest hidden until expanded); picking a terminal brings you back here on it.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { useDashLook } from "../../home/dashLook";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useTerminalStatus } from "../../hooks/useDashboardCards";
import { useActiveOutageBanner } from "../../hooks/useTerminalOutageReports";
import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { headingToTerminal } from "@/lib/trips/dashboardCards";
import { HeadingToTerminalCard, TerminalStatusCard } from "../trip/DashboardCards";
import { TerminalStatusSheet } from "../trip/TerminalStatusSheet";
import { GaugingAskSheet } from "../trip/GaugingAskSheet";
import { TerminalDriversTraining, TerminalTrainingSection } from "../locations/TerminalTrainingSection";
import TerminalOutageDetailModal from "../../modals/TerminalOutageDetailModal";
import EditTerminalModal from "../../modals/EditTerminalModal";
import { SuppliersModal } from "../../dispatch/SuppliersModal";
import FleetCardsModal from "@/app/admin/FleetCardsModal";
import { openAccessSteps } from "../access/useAccessSteps";
import { accessStateFor, DARK_EXP_COLOR } from "../../cards/cardTheme";
import { addDaysISO_, formatMDYWithCountdown_ } from "../../utils/dates";

export function TerminalHub() {
  const shell = useCalculatorShell();
  // Nothing runs (no polling) until the screen is opened.
  if (!shell.terminalHubOpen) return null;
  return <TerminalHubBody />;
}

function TerminalHubBody() {
  const shell = useCalculatorShell();
  const L = useDashLook();
  const userId = shell.effectiveUserId ?? null;
  const companyId = shell.companyId ?? null;
  const tid = shell.location.selectedTerminalId ? String(shell.location.selectedTerminalId) : null;

  const catalog = useTerminalsCatalog().data;
  const t = useMemo(() => (tid ? catalog.find((x) => String(x.terminal_id) === tid) ?? null : null), [catalog, tid]);
  const name = t?.terminal_name ?? null;
  const place = t ? [t.city, t.state].filter(Boolean).join(", ") || null : null;

  const status = useTerminalStatus(tid, shell.location.selectedRackId ?? null);
  const alerts = useActiveOutageBanner(tid, userId, "all");
  const fleet = useFleetTrips(companyId);
  const products = useProductsCatalog().data;
  const headed = useMemo(() => headingToTerminal(fleet.trips, tid, userId), [fleet.trips, tid, userId]);
  const productInfo = (id: string | null) => {
    const p = id ? products.find((x) => x.product_id === id) : null;
    const nm = String(p?.display_name || p?.product_name || "Product");
    return { name: nm, code: String(p?.button_code ?? (nm.split(" ")[0] || "PRD")).trim().toUpperCase(), hex: p?.hex_code ?? null };
  };

  const staff = shell.isSuperAdmin || shell.role === "admin" || shell.role === "dispatch" || shell.role === "lead";
  const manager = shell.isSuperAdmin || shell.role === "admin" || shell.role === "dispatch";

  const [studOpen, setStudOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [racksOpen, setRacksOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [gaugeOpen, setGaugeOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const close = () => { shell.setTerminalHubOpen(false); };
  // Search always starts at the city picker (favorites on top) so the driver can change city.
  const searchCities = () => { shell.setHubAfterPick(true); shell.setLocOpen(true); };

  // Your card at this terminal (what My Terminals showed).
  const lastVisit = tid ? shell.terminals.accessDateByTerminalId[tid] ?? "" : "";
  const renewal = Number(t?.renewal_days ?? 90) || 90;
  const expiresISO = lastVisit ? addDaysISO_(lastVisit, renewal) : "";
  const cardState = accessStateFor(expiresISO || null);
  const card = tid ? shell.cardDataByTerminalId[tid] : undefined;
  const starred = tid ? shell.myTerminalIdSet.has(tid) : false;

  const gaugeText = (() => {
    const c = t?.gauging_cutoff, m = t?.gauging_minutes;
    if (!c || m == null) return "Not known yet";
    const end = (Number(c.slice(0, 2)) * 60 + Number(c.slice(3)) + m) % 1440;
    return `${c} to ${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")} terminal time`;
  })();

  const row: React.CSSProperties = { ...L.secondary, display: "flex", width: "100%", textAlign: "left", color: "#fff", padding: "12px 14px", marginBottom: 8, cursor: "pointer", justifyContent: "space-between", gap: 8, fontSize: 15, fontWeight: 700 };
  const dark: React.CSSProperties = { width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 800, background: "#050505", color: "#fff", border: `1px solid ${L.hairline}`, cursor: "pointer" };
  const caps: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted };

  return (
    <>
      <FullscreenModal open title={name ?? "Terminal"} onClose={close} footer={null}>
        {!tid || !name ? (
          <>
            <div style={{ ...L.secondary, padding: 14, color: L.muted, fontSize: 14, marginBottom: 12 }}>No terminal selected yet. Search for one to see its status, suppliers and training.</div>
            <button type="button" className="dash-press" onClick={searchCities} style={dark}>Search Terminals</button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: L.muted }}>{place ?? ""}</span>
              <button type="button" onClick={() => void shell.terminals.toggleTerminalStar(tid, starred)} aria-label={starred ? "Remove from My Terminals" : "Add to My Terminals"}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: starred ? "rgba(234,179,8,0.95)" : L.muted }}>
                {starred ? "★ In My Terminals" : "☆ Add to My Terminals"}
              </button>
            </div>

            <TerminalStatusCard
              defaultOpen
              placeLabel={place}
              terminalName={name}
              rackName={status.rackCount > 1 ? status.rackName : null}
              products={status.products}
              reports={alerts.reports}
              onOpenReports={() => setAlertsOpen(true)}
              onChangeTerminal={searchCities}
              onUpdate={() => setStudOpen(true)}
            />
            <div style={{ marginTop: 10 }}>
              <HeadingToTerminalCard defaultOpen terminalName={name} items={headed} productInfo={productInfo} emptyText="No other company trucks headed here right now." />
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
              <button type="button" className="dash-press" onClick={() => setStudOpen(true)} style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 800, ...L.cta }}>STUD</button>
              {companyId && (
                <button type="button" className="dash-press" onClick={() => setSuppliersOpen(true)} style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 800, ...L.secondary, color: "#fff", cursor: "pointer" }}>Suppliers · {name}</button>
              )}
              <button type="button" className="dash-press" onClick={searchCities} style={dark}>Search Terminals</button>
            </div>

            <div style={{ ...caps, margin: "20px 0 8px" }}>Your card here</div>
            <div style={{ ...L.secondary, padding: "10px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                <span style={{ color: L.muted }}>Expiration</span>
                <span style={{ fontWeight: 700, color: expiresISO ? DARK_EXP_COLOR[cardState] : L.muted }}>{expiresISO ? formatMDYWithCountdown_(expiresISO) : "Not carded"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                <span style={{ color: L.muted }}>Card number</span><span style={{ fontWeight: 700 }}>{card?.cardNumber || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                <span style={{ color: L.muted }}>PIN</span><span style={{ fontWeight: 700 }}>{card?.pin || "—"}</span>
              </div>
            </div>
            <button type="button" className="dash-press" onClick={() => openAccessSteps({ terminalId: tid })} style={row}><span>Access steps</span><span style={{ color: L.muted }}>›</span></button>

            <div style={{ ...caps, margin: "16px 0 8px" }}>Training and letter</div>
            <TerminalTrainingSection terminalId={tid} terminalName={name} userId={userId} companyId={companyId} staff={false} />

            <button type="button" className="dash-press" onClick={() => setGaugeOpen(true)} style={row}>
              <span>Gauging<span style={{ display: "block", fontSize: 12, fontWeight: 500, color: L.muted }}>{gaugeText}</span></span><span style={{ color: L.muted }}>Edit ›</span>
            </button>

            {/* Everything an admin, dispatcher or lead can do here that a driver can't. */}
            {staff && (
              <div style={{ marginTop: 18 }}>
                <button type="button" className="dash-press" onClick={() => setAdminOpen((v) => !v)} aria-expanded={adminOpen}
                  style={{ ...row, marginBottom: adminOpen ? 8 : 0, background: "#050505", border: `1px solid ${L.hairline}` }}>
                  <span>Admin</span><span style={{ color: L.muted }}>{adminOpen ? "▲" : "▼"}</span>
                </button>
                {adminOpen && (
                  <div>
                    <TerminalDriversTraining terminalId={tid} userId={userId} companyId={companyId} />
                    <button type="button" className="dash-press" onClick={() => setRacksOpen(true)} style={row}><span>Racks &amp; products</span><span style={{ color: L.muted }}>›</span></button>
                    {manager && <button type="button" className="dash-press" onClick={() => setCardsOpen(true)} style={row}><span>Terminal cards</span><span style={{ color: L.muted }}>›</span></button>}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </FullscreenModal>

      {tid && name && (
        <>
          <TerminalStatusSheet
            open={studOpen} onClose={() => setStudOpen(false)} terminalId={tid} terminalName={name}
            rackId={status.rackId} rackName={status.rackCount > 1 ? status.rackName : null}
            products={status.products} reports={alerts.reports} companyId={companyId} userId={userId}
            truckLabel={shell.equipment.currentTruckName ?? ""}
            onChanged={() => { void status.reload(); alerts.refresh(); }}
          />
          <TerminalOutageDetailModal open={alertsOpen} onClose={() => setAlertsOpen(false)} reports={alerts.reports} timeZone={alerts.timeZone} onCleared={alerts.refresh} />
          {companyId && userId && (
            <SuppliersModal open={suppliersOpen} onClose={() => setSuppliersOpen(false)} companyId={companyId} userId={userId} canManage={manager}
              terminals={catalog.map((x) => ({ id: String(x.terminal_id), name: x.terminal_name ?? "Terminal", used: false, place: x.city ? `${x.city}${x.state ? `, ${x.state}` : ""}` : null, city: x.city ?? null, state: x.state ?? null }))}
              initialTerminalId={tid} />
          )}
          {gaugeOpen && <GaugingAskSheet terminalId={tid} terminalName={name} initial={{ cutoff: t?.gauging_cutoff ?? null, minutes: t?.gauging_minutes ?? null }} onClose={() => setGaugeOpen(false)} />}
          {racksOpen && <EditTerminalModal open onClose={() => setRacksOpen(false)} terminalId={tid} terminalName={name} onChanged={() => { void status.reload(); void shell.terminals.loadMyTerminals(); }} />}
          {cardsOpen && companyId && <FleetCardsModal open onClose={() => setCardsOpen(false)} companyId={companyId} initialTerminalId={tid} />}
        </>
      )}
    </>
  );
}
