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
import { DashStyles, useDashLook } from "../../home/dashLook";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useTerminalStatus } from "../../hooks/useDashboardCards";
import { useActiveOutageBanner } from "../../hooks/useTerminalOutageReports";
import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { headingToTerminal } from "@/lib/trips/dashboardCards";
import { TerminalStatusSheet } from "../trip/TerminalStatusSheet";
import { GaugingAskSheet } from "../trip/GaugingAskSheet";
import { TerminalDriversTraining, useTrainingDetail } from "../locations/TerminalTrainingSection";
import { TerminalCardEdit } from "./TerminalCardEdit";
import { trainingStatus } from "@/lib/terminals/training";
import { EXPIRY_COLOR } from "@/lib/expiry";
import TerminalOutageDetailModal from "../../modals/TerminalOutageDetailModal";
import EditTerminalModal from "../../modals/EditTerminalModal";
import { SuppliersModal } from "../../dispatch/SuppliersModal";
import FleetCardsModal from "@/app/admin/FleetCardsModal";
import { openAccessSteps } from "../access/useAccessSteps";
import { accessStateFor, DARK_EXP_COLOR } from "../../cards/cardTheme";
import { addDaysISO_, formatMDY } from "../../utils/dates";
import { daysUntilIso } from "@/lib/expiry";
import { parseTicker } from "../../utils/tickerMarkup";

export function TerminalHub() {
  const shell = useCalculatorShell();
  // Nothing runs (no polling) until the screen is opened.
  if (!shell.terminalHubOpen) return null;
  return <TerminalHubBody />;
}

// ── Pieces. Flat, square, hairline-ruled, small-caps labels: the same instrument look as the dashboard. ──────
const HAIR = "rgba(255,255,255,0.12)";
const MUTED = "rgba(255,255,255,0.52)";
const PANEL: React.CSSProperties = { background: "#0f0f10", border: `1px solid ${HAIR}` };
const caps: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED };

function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "22px 0 8px", paddingBottom: 6, borderBottom: `1px solid ${HAIR}` }}>
      <span style={{ ...caps, flex: 1 }}>{children}</span>{right}
    </div>
  );
}

function Readout({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: React.ReactNode }) {
  return (
    <div style={{ background: "#0f0f10", padding: "10px 12px", minWidth: 0 }}>
      <div style={caps}>{label}</div>
      <div className="dash-num" style={{ fontSize: 18, fontWeight: 800, color: color ?? "#fff", marginTop: 6, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Row({ label, value, onClick, strong }: { label: React.ReactNode; value?: React.ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button type="button" className="dash-press" onClick={onClick}
      style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, textAlign: "left", color: "#fff", background: "#0f0f10", border: "none", borderTop: `1px solid ${HAIR}`, padding: "13px 14px", cursor: "pointer", fontSize: 15, fontWeight: strong ? 800 : 700 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {value && <span style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>{value}</span>}
      <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
    </button>
  );
}

/** A date and a plain countdown under it: "11/30/26" and "23 days left" (or "Expired 5 days ago"). */
const dateAndCount = (iso: string): [string, string] => {
  const d = daysUntilIso(iso);
  const note = d == null ? "" : d < 0 ? `Expired ${-d} day${d === -1 ? "" : "s"} ago` : d === 0 ? "Expires today" : `${d} day${d === 1 ? "" : "s"} left`;
  return [formatMDY(iso), note];
};

const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

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

  // Viewing a rack here never changes the rack you're loading at.
  const [rackPick, setRackPick] = useState<string | null>(null);
  const racks = useQuery({
    queryKey: ["hubRacks", tid], enabled: !!tid, staleTime: 60_000,
    queryFn: async () => ((await supabase.from("terminal_racks").select("rack_id, rack_name").eq("terminal_id", tid!).order("rack_name")).data ?? []) as { rack_id: string; rack_name: string }[],
  }).data ?? [];
  const status = useTerminalStatus(tid, rackPick ?? shell.location.selectedRackId ?? null);
  const alerts = useActiveOutageBanner(tid, userId, "all");
  const fleet = useFleetTrips(companyId);
  const products = useProductsCatalog().data;
  const headed = useMemo(() => headingToTerminal(fleet.trips, tid, userId), [fleet.trips, tid, userId]);
  const pinfo = (id: string | null) => {
    const p = id ? products.find((x) => x.product_id === id) : null;
    const nm = String(p?.display_name || p?.product_name || "Product");
    return { name: nm, code: String(p?.button_code ?? (nm.split(" ")[0] || "PRD")).trim().toUpperCase(), hex: (p?.hex_code as string | null) ?? null };
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
  const [cardEditOpen, setCardEditOpen] = useState(false);
  const [enrouteOpen, setEnrouteOpen] = useState(false);
  const trainingDetail = useTrainingDetail(tid ?? "", userId, false).data;

  const close = () => { shell.setTerminalHubOpen(false); };
  // Search starts at the city picker (favorite cities on top) so the driver can change city.
  const searchCities = () => { shell.setHubAfterPick(true); shell.setLocOpen(true); };

  // Your access at this terminal.
  const lastVisit = tid ? shell.terminals.accessDateByTerminalId[tid] ?? "" : "";
  const renewal = Number(t?.renewal_days ?? 90) || 90;
  const expiresISO = lastVisit ? addDaysISO_(lastVisit, renewal) : "";
  const cardState = accessStateFor(expiresISO || null);
  const card = tid ? shell.cardDataByTerminalId[tid] : undefined;
  const starred = tid ? shell.myTerminalIdSet.has(tid) : false;
  const tr = trainingStatus(trainingDetail?.req, trainingDetail?.mine);
  const trColor = tr.state === "none" ? MUTED : EXPIRY_COLOR[tr.state];
  const [accDate, accNote] = expiresISO ? dateAndCount(expiresISO) : ["Not carded", "No visit on file"];
  const [trDate, trNote] = tr.state === "none" ? ["Not required", "Nothing needed here"] : trainingDetail?.mine?.expires_at ? dateAndCount(trainingDetail.mine.expires_at) : [tr.text, "Tap to set it"];

  const gaugeText = (() => {
    const c = t?.gauging_cutoff, m = t?.gauging_minutes;
    if (!c || m == null) return "Not known yet";
    const end = (Number(c.slice(0, 2)) * 60 + Number(c.slice(3)) + m) % 1440;
    return `${c} to ${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  })();

  const outCount = status.products.filter((p) => p.isOut).length;
  const reportCount = alerts.reports.length;
  const newest = status.products.reduce<string | null>((m, p) => (p.updatedAt && (!m || p.updatedAt > m) ? p.updatedAt : m), null);
  const statusLine = reportCount ? `${reportCount} report${reportCount === 1 ? "" : "s"}` : outCount ? `${outCount} out` : newest ? `API ${ago(newest)} ago` : "No reports";
  const statusRed = reportCount > 0 || outCount > 0;

  return (
    <>
      <DashStyles />
      <FullscreenModal open title={name ?? "Terminal"} onClose={close} footer={null}>
        {!tid || !name ? (
          <>
            <div style={{ ...PANEL, padding: 14, color: MUTED, fontSize: 14, marginBottom: 12 }}>No terminal selected yet. Search for one to see its status, suppliers and training.</div>
            <button type="button" className="dash-press" onClick={searchCities} style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer" }}>Search Terminals</button>
          </>
        ) : (
          <>
            {/* Plate */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{name}</div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{place ?? ""}<span style={{ color: statusRed ? "#f87171" : MUTED, fontWeight: 700 }}> · {statusLine}</span></div>
              </div>
              <button type="button" onClick={() => void shell.terminals.toggleTerminalStar(tid, starred)} aria-label={starred ? "Remove from My Terminals" : "Add to My Terminals"}
                style={{ background: "none", border: `1px solid ${HAIR}`, width: 40, height: 40, cursor: "pointer", fontSize: 18, color: starred ? "rgba(234,179,8,0.95)" : MUTED }}>{starred ? "★" : "☆"}</button>
            </div>

            {/* My access: tap to edit the card and open training, the company letter and access steps */}
            <Label right={<span style={{ ...caps, color: "rgba(255,255,255,0.4)" }}>Tap to edit</span>}>My access</Label>
            <button type="button" className="dash-press" onClick={() => setCardEditOpen(true)} aria-label="Edit card, training and access steps"
              style={{ display: "block", width: "100%", padding: 0, border: `1px solid ${HAIR}`, background: HAIR, textAlign: "left", cursor: "pointer", color: "#fff" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                <Readout label="Access expires" value={accDate} color={expiresISO ? DARK_EXP_COLOR[cardState] : MUTED} sub={accNote} />
                <Readout label="Training cert" value={trDate} color={trColor} sub={trNote} />
              </div>
              <div style={{ background: "#0f0f10", padding: "10px 12px", marginTop: 1, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={caps}>Card · PIN</span>
                <span className="dash-num" style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800 }}>{card?.cardNumber || "—"}<span style={{ color: MUTED }}>  ·  </span>{card?.pin || "—"}</span>
              </div>
            </button>

            {/* Company trucks headed here */}
            <Label right={headed.length > 0 ? <button type="button" onClick={() => setEnrouteOpen((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 11, fontWeight: 700 }}>{enrouteOpen ? "Hide ▲" : "Show ▼"}</button> : null}>
              En route · {headed.length}
            </Label>
            {headed.length === 0 ? (
              <div style={{ ...PANEL, padding: "11px 14px", color: MUTED, fontSize: 14 }}>No other company trucks headed here right now.</div>
            ) : (
              <div style={PANEL}>
                {(enrouteOpen ? headed : headed.slice(0, 2)).map((x, i) => (
                  <div key={x.tripId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: i ? `1px solid ${HAIR}` : "none", fontSize: 14 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.driverName ?? "Driver"}{x.truckName ? <span style={{ color: MUTED }}> · {x.truckName}</span> : null}</span>
                    {x.productIds.map((id) => { const pi = pinfo(id); return <span key={id} style={{ ...caps, color: "#fff", display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: pi.hex ?? "#fff", display: "inline-block" }} />{pi.code}</span>; })}
                    <span style={{ ...caps, color: x.arrived ? "#4ade80" : MUTED }}>{x.arrived ? "At rack" : "En route"}</span>
                  </div>
                ))}
                {!enrouteOpen && headed.length > 2 && <div style={{ padding: "8px 14px", borderTop: `1px solid ${HAIR}`, color: MUTED, fontSize: 12 }}>+ {headed.length - 2} more</div>}
              </div>
            )}

            {/* Products */}
            <Label right={racks.length > 1 ? (
              <span style={{ display: "inline-flex", gap: 4 }}>
                {racks.map((r) => (
                  <button key={r.rack_id} type="button" onClick={() => setRackPick(r.rack_id)}
                    style={{ padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${r.rack_id === status.rackId ? "#fff" : HAIR}`, background: r.rack_id === status.rackId ? "#fff" : "transparent", color: r.rack_id === status.rackId ? "#000" : MUTED }}>{r.rack_name}</button>
                ))}
              </span>
            ) : status.rackName ? <span style={{ ...caps, color: "rgba(255,255,255,0.4)" }}>{status.rackName}</span> : null}>
              Products
            </Label>
            {reportCount > 0 && (
              <button type="button" onClick={() => setAlertsOpen(true)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", marginBottom: 8, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.45)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {alerts.reports.map((r) => parseTicker(r.tickerText).map((x) => x.text).join("")).slice(0, 2).join(" · ")} ›
              </button>
            )}
            <div style={PANEL}>
              {status.products.length === 0 ? (
                <div style={{ padding: "11px 14px", color: MUTED, fontSize: 14 }}>No products on file for this rack.</div>
              ) : status.products.map((p, i) => (
                <div key={p.productId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 10px 0", borderTop: i ? `1px solid ${HAIR}` : "none", opacity: p.isOut ? 0.55 : 1 }}>
                  <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: p.hex ?? "#fff", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: p.isOut ? "line-through" : undefined }}>{p.name}</span>
                  {p.isOut && <span style={{ ...caps, color: "#f87171" }}>Out</span>}
                  <span className="dash-num" style={{ fontSize: 13, fontWeight: 700, color: p.lastApi != null ? "#fff" : MUTED }}>{p.lastApi != null ? p.lastApi.toFixed(1) : "—"}</span>
                  <span className="dash-num" style={{ fontSize: 13, color: MUTED, width: 44, textAlign: "right" }}>{p.lastTempF != null ? `${p.lastTempF.toFixed(0)}°F` : "—"}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <button type="button" className="dash-press" onClick={() => setStudOpen(true)} style={{ width: "100%", marginTop: 12, padding: "15px 0", fontSize: 15, fontWeight: 800, ...L.cta, cursor: "pointer" }}>STUD</button>
            <div style={{ ...PANEL, marginTop: 12 }}>
              <Row label="Gauging" value={gaugeText} onClick={() => setGaugeOpen(true)} />
              {companyId && <Row label={`Suppliers · ${name}`} onClick={() => setSuppliersOpen(true)} />}
            </div>
            <button type="button" className="dash-press" onClick={searchCities} style={{ width: "100%", marginTop: 12, padding: "15px 0", fontSize: 15, fontWeight: 800, background: "#050505", color: "#fff", border: `1px solid ${HAIR}`, cursor: "pointer" }}>Search Terminals</button>

            {/* Everything an admin, dispatcher or lead can do here that a driver can't. */}
            {staff && (
              <div style={{ marginTop: 18 }}>
                <button type="button" className="dash-press" onClick={() => setAdminOpen((v) => !v)} aria-expanded={adminOpen}
                  style={{ display: "flex", width: "100%", alignItems: "center", padding: "13px 14px", background: "#050505", border: `1px solid ${HAIR}`, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  <span style={{ flex: 1, textAlign: "left" }}>Admin</span><span style={{ color: MUTED }}>{adminOpen ? "▲" : "▼"}</span>
                </button>
                {adminOpen && (
                  <div style={{ marginTop: 8 }}>
                    <TerminalDriversTraining terminalId={tid} userId={userId} companyId={companyId} />
                    <div style={PANEL}>
                      <Row label="Racks & products" onClick={() => setRacksOpen(true)} />
                      {manager && <Row label="Terminal cards" onClick={() => setCardsOpen(true)} />}
                    </div>
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
          <TerminalCardEdit open={cardEditOpen} terminalId={tid} terminalName={name} onClose={() => setCardEditOpen(false)} />
          {gaugeOpen && <GaugingAskSheet terminalId={tid} terminalName={name} initial={{ cutoff: t?.gauging_cutoff ?? null, minutes: t?.gauging_minutes ?? null }} onClose={() => setGaugeOpen(false)} />}
          {racksOpen && <EditTerminalModal open onClose={() => setRacksOpen(false)} terminalId={tid} terminalName={name} onChanged={() => { void status.reload(); void shell.terminals.loadMyTerminals(); }} />}
          {cardsOpen && companyId && <FleetCardsModal open onClose={() => setCardsOpen(false)} companyId={companyId} initialTerminalId={tid} />}
        </>
      )}
    </>
  );
}
