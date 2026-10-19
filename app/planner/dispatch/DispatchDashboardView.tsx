"use client";
// app/planner/dispatch/DispatchDashboardView.tsx
//
// The Dispatch Dashboard, laid out like the Driver Dashboard (same
// instrument look, dashLook.tsx): title, mode switch, four squares, then the
// mode's lists. Presentational only, so it renders without a browser.
//
//   PLAN  Fire prevention. What runs out before the next load does: terminal
//         access, licenses, medical cards, TWIC, badges, equipment permits.
//         Parked preloads and cancelled loads live here too.
//   LIVE  Firefighting. Conflicts first: an active terminal report at a rack
//         where company trucks are still headed. Then loads in progress.
//
// It doesn't replace the dispatch system; it sits beside it.

import React, { useState } from "react";
import { DashStyles, SectionLabel, useDashLook } from "../home/dashLook";
import { GaugePanel, ToolPanel, type GaugeCell, type ToolItem } from "../home/DashboardChrome";
import { EXPIRY_COLOR } from "@/lib/expiry";
import type { LiveCounts, ActiveReport } from "@/lib/dispatch/conflicts";
import type { ConflictWithAck } from "@/lib/dispatch/acks";
import type { WatchTerminal } from "@/lib/dispatch/watch";
import type { NotifyState } from "@/lib/dispatch/useConflictNotifier";
import type { PlanAlert, PlanCounts } from "@/lib/dispatch/planAlerts";
import { groupBySubject } from "@/lib/dispatch/planAlerts";
import type { BoardProduct } from "./FleetBoard";
import { CardBusy, busyProps } from "@/lib/ui/pending";

export type DispatchMode = "plan" | "live";

export const HORIZONS = [7, 14, 30] as const;

const RED = EXPIRY_COLOR.expired;
const ORANGE = EXPIRY_COLOR.expiring;
const YELLOW = EXPIRY_COLOR.soon;
const GREY = "rgba(255,255,255,0.35)";

function mdy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y.slice(2)}`;
}
function daysText(days: number): string {
  if (days < 0) return `${-days}d over`;
  if (days === 0) return "today";
  return `${days}d`;
}
function clock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function reportText(r: ActiveReport, product: (id: string | null) => BoardProduct): string {
  const code = r.productId ? product(r.productId).code : null;
  switch (r.type) {
    case "out_of_product": return `Out of ${code ?? "product"}`;
    case "out_of_allocation": return `No allocation${r.supplierName ? ` · ${r.supplierName}` : ""}${code ? ` (${code})` : ""}`;
    case "long_line": return "Long line";
    case "terminal_issue": return "Terminal issue";
  }
}

function ModeSwitch({ mode, onMode }: { mode: DispatchMode; onMode: (m: DispatchMode) => void }) {
  const L = useDashLook();
  const opt = (m: DispatchMode, label: string) => {
    const on = mode === m;
    return (
      <button type="button" onClick={() => onMode(m)} className="dash-press" aria-pressed={on}
        style={{ border: "none", cursor: "pointer", padding: "7px 14px", fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
          background: on ? "#fff" : "transparent", color: on ? "#000" : L.muted, borderRadius: 1 }}>
        {label}
      </button>
    );
  };
  return (
    <div role="group" aria-label="Dashboard mode" style={{ display: "inline-flex", padding: 2, border: `1px solid ${L.hairline}`, background: "#0f0f10", flexShrink: 0 }}>
      {opt("plan", "Plan")}
      {opt("live", "Live")}
    </div>
  );
}

function ConflictCard({ c, terminal, product, onOpenTrip, openingId, isNew, onSeen, onAck }: {
  c: ConflictWithAck;
  terminal: (id: string) => { name: string; place: string | null };
  product: (id: string | null) => BoardProduct;
  onOpenTrip: (tripId: string) => void;
  openingId?: string | null;
  isNew: boolean;
  onSeen: (terminalId: string) => void;
  onAck: (terminalId: string, reportIds: string[], note: string) => Promise<boolean>;
}) {
  const L = useDashLook();
  const [handling, setHandling] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const t = terminal(c.terminalId);
  const handled = c.handled;
  const color = handled ? GREY : c.severity === "hit" ? RED : ORANGE;
  const save = async () => {
    setSaving(true);
    const ok = await onAck(c.terminalId, c.reports.map((r) => r.reportId), note);
    setSaving(false);
    if (ok) { setHandling(false); setNote(""); onSeen(c.terminalId); }
  };
  return (
    <div style={{ ...L.primary, borderColor: `${color}66`, marginBottom: 10, opacity: handled ? 0.65 : 1 }}>
      <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${L.hairline}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span aria-hidden style={{ width: 8, height: 8, background: color, flexShrink: 0, alignSelf: "center" }} />
          <span style={{ fontSize: 15, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
          {isNew && (
            <button type="button" onClick={() => onSeen(c.terminalId)} className="dash-press" aria-label="Mark as seen"
              style={{ border: "none", background: RED, color: "#000", fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", padding: "2px 6px", cursor: "pointer" }}>
              NEW
            </button>
          )}
          {t.place && <span style={{ fontSize: 12, color: L.muted, whiteSpace: "nowrap" }}>{t.place}</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {c.reports.map((r) => (
            <span key={r.reportId} style={{ fontSize: 12, fontWeight: 700, padding: "3px 7px", border: `1px solid ${RED}55`, color: "#fca5a5", background: "rgba(239,68,68,0.08)" }}>
              {reportText(r, product)} <span style={{ color: L.faint, fontWeight: 600 }}>· {clock(r.createdAt)}</span>
            </span>
          ))}
        </div>
        {handled ? (
          <div style={{ marginTop: 8, fontSize: 12, color: L.muted }}>
            <span style={{ color: "#4ade80", fontWeight: 800 }}>✓ Handled</span>
            {handled.by ? ` by ${handled.by}` : ""} · {clock(handled.at)}
            {handled.note ? <span style={{ color: "rgba(255,255,255,0.8)" }}> — {handled.note}</span> : null}
          </div>
        ) : handling ? (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): rerouted, called terminal…" maxLength={200}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }} autoFocus
              style={{ flex: "1 1 180px", minWidth: 0, background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 14, padding: "7px 9px", borderRadius: 2 }} />
            <button type="button" onClick={() => void save()} className="dash-press" {...busyProps(saving)}
              style={{ border: "none", background: "#fff", color: "#000", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 12px", cursor: "pointer" }}>
              Mark handled
            </button>
            <button type="button" onClick={() => setHandling(false)} className="dash-press"
              style={{ border: `1px solid ${L.hairline}`, background: "transparent", color: L.muted, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 10px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => { setHandling(true); onSeen(c.terminalId); }} className="dash-press"
            style={{ marginTop: 8, border: `1px solid ${L.hairline}`, background: "transparent", color: L.muted, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "5px 10px", cursor: "pointer" }}>
            Handle…
          </button>
        )}
      </div>
      {c.trucks.map((tr) => (
        <button key={tr.tripId} type="button" onClick={() => onOpenTrip(tr.tripId)} className="dash-press" {...busyProps(openingId === tr.tripId)}
          style={{ position: "relative", display: "flex", width: "100%", alignItems: "baseline", gap: 8, padding: "9px 14px", background: "none", border: "none",
            borderTop: `1px solid ${L.hairline}`, color: "#fff", cursor: "pointer", textAlign: "left" }}>
          <CardBusy on={openingId === tr.tripId} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: 700, color: tr.severity === "hit" ? "#fff" : L.muted }}>{tr.driverName ?? "Driver"}</span>
            {tr.truckName && <span style={{ color: L.muted }}> · Truck {tr.truckName}</span>}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", color: tr.arrived ? "#fff" : L.muted }}>
            {tr.arrived ? "At rack" : "En route"}{tr.severity === "maybe" ? " · plan unknown" : ""} ›
          </span>
        </button>
      ))}
    </div>
  );
}

function WatchRow({ w, terminal, product }: {
  w: WatchTerminal;
  terminal: (id: string) => { name: string; place: string | null };
  product: (id: string | null) => BoardProduct;
}) {
  const L = useDashLook();
  const t = terminal(w.terminalId);
  return (
    <div style={{ ...L.secondary, padding: "9px 14px", marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
        {t.place && <span style={{ fontSize: 12, color: L.muted, whiteSpace: "nowrap" }}>{t.place}</span>}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: L.muted }}>
        {w.reports.map((r, i) => (
          <span key={r.reportId}>{i > 0 ? " · " : ""}{reportText(r, product)} <span style={{ color: L.faint }}>{clock(r.createdAt)}</span></span>
        ))}
      </div>
    </div>
  );
}

function AlertGroup({ subject, isEquipment, items, onOpen }: {
  subject: string; isEquipment: boolean; items: PlanAlert[]; onOpen?: () => void;
}) {
  const L = useDashLook();
  const worst = EXPIRY_COLOR[items[0].state];
  const Wrap: any = onOpen ? "button" : "div";
  return (
    <Wrap {...(onOpen ? { type: "button", onClick: onOpen, className: "dash-press" } : {})}
      style={{ ...L.secondary, boxSizing: "border-box", display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "10px 14px", marginBottom: 8, cursor: onOpen ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span aria-hidden style={{ width: 8, height: 8, background: worst, flexShrink: 0, alignSelf: "center" }} />
        <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject}</span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: L.faint }}>{isEquipment ? "Unit" : "Driver"}{onOpen ? " ›" : ""}</span>
      </div>
      {items.map((a) => (
        <div key={a.key} className="dash-num" style={{ display: "flex", gap: 8, fontSize: 13, marginTop: 5 }}>
          <span style={{ flex: 1, minWidth: 0, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
          {a.detail ? (
            <span style={{ fontWeight: 800, color: EXPIRY_COLOR[a.state], textAlign: "right" }}>{a.detail}</span>
          ) : (
            <>
              <span style={{ color: L.muted }}>{mdy(a.iso)}</span>
              <span style={{ fontWeight: 800, color: EXPIRY_COLOR[a.state], minWidth: 58, textAlign: "right" }}>{daysText(a.days)}</span>
            </>
          )}
        </div>
      ))}
    </Wrap>
  );
}

export function DispatchDashboardView(props: {
  mode: DispatchMode;
  onMode: (m: DispatchMode) => void;
  companyName: string | null;
  error?: string | null;
  // LIVE
  conflicts: ConflictWithAck[];
  watch: WatchTerminal[];
  unseen: Set<string>;
  onSeen: (terminalId: string) => void;
  onSeenAll: () => void;
  notify: NotifyState;
  onEnableNotify: () => void;
  onAck: (terminalId: string, reportIds: string[], note: string) => Promise<boolean>;
  ackError?: string | null;
  counts: LiveCounts;
  reportCount: number;
  terminal: (id: string) => { name: string; place: string | null };
  product: (id: string | null) => BoardProduct;
  onOpenTrip: (tripId: string) => void;
  openingId?: string | null;
  // PLAN
  alerts: PlanAlert[];
  planCounts: PlanCounts;
  horizon: number;
  onHorizon: (d: number) => void;
  planLoading?: boolean;
  onOpenDriver: (userId: string) => void;
  // Slots
  liveBoard: React.ReactNode; // loads in progress
  planBoard: React.ReactNode; // parked + cancelled
  drivers: React.ReactNode;   // driver picker
  tools: ToolItem[];
}) {
  const L = useDashLook();
  const p = props;
  const live = p.mode === "live";

  const open = p.conflicts.filter((c) => !c.handled).length;
  const cells: GaugeCell[] = live
    ? [
        { label: "Conflicts", value: String(open), color: open ? RED : GREY, wide: true },
        { label: "At Rack", value: String(p.counts.atRack), color: p.counts.atRack ? "#fff" : GREY },
        { label: "To Rack", value: String(p.counts.enRouteToRack), color: p.counts.enRouteToRack ? "#fff" : GREY },
        { label: "Rolling", value: String(p.counts.loadedRolling), color: p.counts.loadedRolling ? "#4ade80" : GREY },
      ]
    : [
        { label: "Expired", value: String(p.planCounts.expired), color: p.planCounts.expired ? RED : GREY },
        { label: "7 Days", value: String(p.planCounts.week), color: p.planCounts.week ? ORANGE : GREY, onClick: () => p.onHorizon(7) },
        { label: `${p.horizon > 7 ? p.horizon : 30} Days`, value: String(p.planCounts.month), color: p.planCounts.month ? YELLOW : GREY, onClick: () => p.onHorizon(30) },
        { label: "Parked", value: String(p.counts.parked), color: p.counts.parked ? "#93c5fd" : GREY },
      ];

  const groups = groupBySubject(p.alerts);

  return (
    <div className="dash-wrap" style={{ paddingTop: 4, paddingBottom: 24 }}>
      <DashStyles />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...L.title, fontSize: 11, color: L.muted }}>Dispatch Dashboard</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: L.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.companyName ?? "Fleet"}
          </div>
        </div>
        <ModeSwitch mode={p.mode} onMode={p.onMode} />
      </div>
      <div style={{ fontSize: 13, color: L.faint, marginTop: 6 }}>
        {live ? "What's going wrong right now, where trucks are headed." : "What runs out before the next load does."}
      </div>

      <GaugePanel cells={cells} />
      {p.error && <div style={{ fontSize: 13, color: "#f87171", marginTop: 10 }}>{p.error}</div>}

      <div className="dash-cols" style={{ marginTop: 4 }}>
        <div>
          {live ? (
            <>
              <SectionLabel first right={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, letterSpacing: 0 }}>
                  {p.unseen.size > 0 && (
                    <button type="button" onClick={p.onSeenAll} className="dash-press"
                      style={{ border: "none", background: "transparent", color: RED, fontSize: 10, fontWeight: 800, cursor: "pointer", padding: 0, letterSpacing: 0 }}>
                      {p.unseen.size} new · mark seen
                    </button>
                  )}
                  {p.notify === "default" && (
                    <button type="button" onClick={p.onEnableNotify} className="dash-press"
                      style={{ border: `1px solid ${L.hairline}`, background: "transparent", color: L.muted, fontSize: 10, fontWeight: 800, padding: "2px 7px", cursor: "pointer", letterSpacing: 0 }}>
                      Enable alerts
                    </button>
                  )}
                  {p.notify === "granted" && <span style={{ color: "#4ade80", fontSize: 10, fontWeight: 800 }}>Alerts on</span>}
                  {p.notify === "denied" && <span style={{ color: L.faint, fontSize: 10, fontWeight: 800 }}>Alerts blocked</span>}
                  <span style={{ color: L.faint }}>{p.reportCount} report{p.reportCount === 1 ? "" : "s"}</span>
                </span>
              }>
                Conflicts
              </SectionLabel>
              {p.ackError && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>Couldn't save: {p.ackError}</div>}
              {p.conflicts.length === 0 ? (
                <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>
                  No conflicts. Nothing reported at a rack your trucks are headed to.
                </div>
              ) : p.conflicts.map((c) => (
                <ConflictCard key={c.terminalId} c={c} terminal={p.terminal} product={p.product} onOpenTrip={p.onOpenTrip} openingId={p.openingId}
                  isNew={p.unseen.has(c.terminalId)} onSeen={p.onSeen} onAck={p.onAck} />
              ))}
              {p.watch.length > 0 && (
                <>
                  <SectionLabel right={<span style={{ color: L.faint, letterSpacing: 0 }}>no truck headed there</span>}>Watch</SectionLabel>
                  {p.watch.map((w) => <WatchRow key={w.terminalId} w={w} terminal={p.terminal} product={p.product} />)}
                </>
              )}
            </>
          ) : (
            <>
              <SectionLabel first right={
                <span style={{ display: "inline-flex", gap: 4 }}>
                  {HORIZONS.map((d) => (
                    <button key={d} type="button" onClick={() => p.onHorizon(d)} className="dash-press"
                      style={{ border: `1px solid ${p.horizon === d ? "#fff" : L.hairline}`, background: p.horizon === d ? "#fff" : "transparent",
                        color: p.horizon === d ? "#000" : L.muted, fontSize: 10, fontWeight: 800, padding: "2px 7px", cursor: "pointer", letterSpacing: 0 }}>
                      {d}d
                    </button>
                  ))}
                </span>
              }>
                Expiring · next {p.horizon} days
              </SectionLabel>
              {p.planLoading && groups.length === 0 ? (
                <div style={{ fontSize: 14, color: L.muted }}>Loading…</div>
              ) : groups.length === 0 ? (
                <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>
                  Nothing expires in the next {p.horizon} days.
                </div>
              ) : groups.map((g) => (
                <AlertGroup key={g.subjectId} subject={g.subject} isEquipment={g.isEquipment} items={g.items}
                  onOpen={g.isEquipment ? undefined : () => p.onOpenDriver(g.subjectId)} />
              ))}
            </>
          )}
        </div>
        <div className="dash-side">
          <SectionLabel first>{live ? "Loads" : "Parked & cancelled"}</SectionLabel>
          {live ? p.liveBoard : p.planBoard}
          <SectionLabel>Drivers</SectionLabel>
          {p.drivers}
        </div>
      </div>
      <SectionLabel>Tools</SectionLabel>
      <ToolPanel items={p.tools} />
    </div>
  );
}
