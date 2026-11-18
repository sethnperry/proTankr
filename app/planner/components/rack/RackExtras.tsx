"use client";
// app/planner/components/rack/RackExtras.tsx
//
// What the old rack window held, folded into Plan Review: an "Arrived 4:12 PM · waiting 3 min · avg load time 42 min"
// header line, and under Begin Loading three buttons: Terminal notes (notes, who else is at the rack, the product list),
// Supplier, and STUD. Nothing here stamps a time: the arrival stamp was made on Arrive and Begin Loading still sets the
// loading start. Reads the planner model with usePlanner().

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { usePlanner } from "../../PlannerContext";
import { useTerminalStatus } from "../../hooks/useDashboardCards";
import { useActiveOutageBanner } from "../../hooks/useTerminalOutageReports";
import { SiteAverage, SiteNotes } from "../site/SiteNotes";
import { SiteBoard } from "../../dispatch/SiteBoard";
import { TerminalStatusSheet } from "../trip/TerminalStatusSheet";
import ConnectedSupplierPanel from "../ConnectedSupplierPanel";
import { stampClock } from "../StampQuestion";

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.12)";
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
const btn: React.CSSProperties = { width: "100%", padding: "12px 16px", border: `1px solid ${hair}`, background: "#0f0f10", color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: 700, cursor: "pointer", borderRadius: 2 };

function useRackContext() {
  const p = usePlanner() as any;
  const terminalId: string | null = p.shell.location.selectedTerminalId ? String(p.shell.location.selectedTerminalId) : null;
  const pickup = (p.tripPickup ?? p.tripWaitingPickup ?? null) as { arrived_at: string | null; begin_at: string | null; rack_id: string | null } | null;
  return { p, terminalId, pickup };
}

/** "Arrived 4:12 PM · waiting 3 min · avg load time 42 min" on one line. Only until loading begins. */
export function ArrivalLine() {
  const { terminalId, pickup } = useRackContext();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  if (!pickup?.arrived_at || pickup.begin_at) return null;
  const waiting = Math.max(0, Math.round((now - Date.parse(pickup.arrived_at)) / 60000));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, padding: "6px 2px 2px", fontSize: 13, color: muted }}>
      <span style={cap}>Arrived</span>
      <b className="dash-num" style={{ color: "#fff", fontSize: 15 }}>{stampClock(pickup.arrived_at)}</b>
      <span>· waiting <b className="dash-num" style={{ color: "#fff" }}>{waiting} min</b></span>
      {terminalId && <><span>·</span><SiteAverage kind="terminal" id={terminalId} /></>}
    </div>
  );
}

/** Terminal notes, Supplier and STUD, shown under Begin Loading. */
export function RackExtras() {
  const { p, terminalId, pickup } = useRackContext();
  const [notesOpen, setNotesOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [studOpen, setStudOpen] = useState(false);
  const userId: string | null = p.effectiveUserId || null;
  const companyId: string | null = p.shell.companyId || null;
  const status = useTerminalStatus(terminalId, pickup?.rack_id ?? (p.shell.location.selectedRackId ? String(p.shell.location.selectedRackId) : null));
  const alerts = useActiveOutageBanner(terminalId, userId, "all");
  const fleet = useFleetTrips(companyId);
  const terminalName: string = p.terminalLabel || "Terminal";
  const productFor = useMemo(() => (id: string | null) => {
    const name = (id && p.productNameById?.get(String(id))) || "Product";
    return { name: String(name), code: String(name.split(" ")[0] || "PRD").toUpperCase(), hex: (id && p.productHexCodeById?.get?.(String(id))) || null };
  }, [p.productNameById, p.productHexCodeById]);
  if (!terminalId) return null;
  return (
    <>
      <button type="button" className="dash-press" onClick={() => setNotesOpen(true)} style={btn}>Terminal notes</button>
      <button type="button" className="dash-press" onClick={() => setSupplierOpen(true)} style={btn}>Supplier</button>
      <button type="button" className="dash-press" onClick={() => setStudOpen(true)} style={{ ...btn, background: "#fff", color: "#000", fontWeight: 800 }}>STUD</button>

      <FullscreenModal open={notesOpen} title={terminalName} onClose={() => setNotesOpen(false)} footer={null}>
        <SiteNotes kind="terminal" id={terminalId} mode="edit" userId={userId} />
        <div style={{ marginTop: 10 }}>
          <SiteBoard kind="terminal" id={terminalId} name={terminalName} hideName trips={fleet.trips} product={productFor} now={new Date()}
            etaFor={() => null} canOpen={() => false} onOpenTrip={() => undefined} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", margin: "18px 0 8px", paddingBottom: 6, borderBottom: `1px solid ${hair}` }}>
          <span style={{ ...cap, flex: 1 }}>Products</span>
          {status.rackName && <span style={{ ...cap, color: "rgba(255,255,255,0.4)" }}>{status.rackName}</span>}
        </div>
        <div style={{ background: "#0f0f10", border: `1px solid ${hair}` }}>
          {status.products.length === 0
            ? <div style={{ padding: "11px 14px", color: muted, fontSize: 14 }}>No products on file for this rack.</div>
            : status.products.map((r, i) => (
              <div key={r.productId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 10px 0", borderTop: i ? `1px solid ${hair}` : "none", opacity: r.isOut ? 0.55 : 1 }}>
                <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: r.hex ?? "#fff", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: r.isOut ? "line-through" : undefined }}>{r.name}</span>
                {r.isOut && <span style={{ ...cap, color: "#f87171" }}>Out</span>}
                <span className="dash-num" style={{ fontSize: 13, fontWeight: 700, color: r.lastApi != null ? "#fff" : muted }}>{r.lastApi != null ? r.lastApi.toFixed(1) : "—"}</span>
                <span className="dash-num" style={{ fontSize: 13, color: muted, width: 44, textAlign: "right" }}>{r.lastTempF != null ? `${r.lastTempF.toFixed(0)}°F` : "—"}</span>
              </div>
            ))}
        </div>
      </FullscreenModal>

      <FullscreenModal open={supplierOpen} title="Supplier" onClose={() => setSupplierOpen(false)} footer={null}>
        <ConnectedSupplierPanel />
      </FullscreenModal>

      <TerminalStatusSheet
        open={studOpen} onClose={() => setStudOpen(false)} terminalId={terminalId} terminalName={terminalName}
        rackId={status.rackId} rackName={status.rackCount > 1 ? status.rackName : null}
        products={status.products} reports={alerts.reports} companyId={companyId} userId={userId}
        truckLabel={p.shell.equipment.currentTruckName ?? ""}
        onChanged={() => { void status.reload(); alerts.refresh(); }}
      />
    </>
  );
}
