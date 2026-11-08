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
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DashStyles, SectionLabel, useDashLook } from "../home/dashLook";
import { ModeSwitch, RegionButton, type RegionFilter } from "../components/dash/DashChrome";
export type { RegionFilter };
import { ToolPanel, type GaugeCell, type ToolItem } from "../home/DashboardChrome";
import { DashColumns } from "../components/dash/DashColumns";
import { EXPIRY_COLOR } from "@/lib/expiry";
import type { LiveCounts, ActiveReport } from "@/lib/dispatch/conflicts";
import type { ConflictWithAck } from "@/lib/dispatch/acks";
import type { WatchTerminal } from "@/lib/dispatch/watch";
import type { NotifyState } from "@/lib/dispatch/useConflictNotifier";
import type { PlanAlert, PlanCounts } from "@/lib/dispatch/planAlerts";
import { groupBySubject } from "@/lib/dispatch/planAlerts";
import type { HosAlert } from "@/lib/dispatch/hosAlerts";
import type { BoardProduct } from "./FleetBoard";
import { CardBusy, busyProps } from "@/lib/ui/pending";
import { ExpirationsSheet } from "../home/DashboardSheets";
import { DelayedSheet } from "./LiveSheet";
import { EnRouteSheet } from "./EnRouteSheet";
import { liveChipCounts, type LiveRow } from "@/lib/dispatch/liveGroups";
import { outageAge } from "@/app/planner/utils/dates";

export type DispatchMode = "plan" | "live";


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
    case "rack_down": return "Rack down";
  }
}

const nameInitials = (n?: string | null) => (n ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const unitTag = (unit: string | null | undefined, ini: string) => [String(unit ?? "").replace(/^truck\s*/i, "").trim(), ini].filter(Boolean).join("-");

type FrictionGroup = { key: string; c: ConflictWithAck; type: string; reports: ActiveReport[] }; // newest report first

function FrictionList({ conflicts, terminal, product, initialsOf, isNew, onSeen, onAck, onOpenTrip }: {
  conflicts: ConflictWithAck[];
  terminal: (id: string) => { name: string; place: string | null };
  product: (id: string | null) => BoardProduct;
  initialsOf: (userId: string) => string;
  isNew: (terminalId: string) => boolean;
  onSeen: (terminalId: string) => void;
  onAck: (terminalId: string, reportIds: string[], note: string) => Promise<boolean>;
  onOpenTrip: (tripId: string) => void;
}) {
  const L = useDashLook();
  const [selKey, setSelKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One row per kind of problem at a terminal; its reports are the friction events.
  const groups: FrictionGroup[] = conflicts.flatMap((c) => {
    const byType = new Map<string, ActiveReport[]>();
    for (const r of c.reports) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
    return [...byType].map(([type, reports]) => ({ key: `${c.terminalId}|${type}`, c, type, reports: [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
  }).sort((a, b) => b.reports[0].createdAt.localeCompare(a.reports[0].createdAt));
  const sel = groups.find((g) => g.key === selKey) ?? null;
  const tm = (id: string) => { const t = terminal(id); return t.place ? `${t.name}, ${t.place.split(",")[0]}` : t.name; };
  const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const label = (g: FrictionGroup) => {
    if (g.type === "out_of_product") return `Out of ${[...new Set(g.reports.map((r) => (r.productId ? product(r.productId).code : null)).filter(Boolean))].join(", ") || "product"}`;
    return reportText(g.reports[0], product);
  };
  const last = (g: FrictionGroup) => {
    const r = g.reports[0];
    const who = unitTag(r.truckLabel, r.reporterId ? initialsOf(r.reporterId) : "");
    return `${who ? `${who} · ` : ""}${outageAge(Date.parse(r.createdAt), Date.now())} ago`;
  };
  const trucksOf = (g: FrictionGroup) => g.c.trucks.filter((t) => t.reportIds.some((id) => g.reports.some((r) => r.reportId === id)));
  const close = () => setSelKey(null);
  const tRow = { ...L.secondary, display: "block", width: "100%", textAlign: "left" as const, color: "#fff", padding: "8px 12px", marginBottom: 4, cursor: "pointer" };
  return (
    <>
      {groups.map((g) => {
        const color = g.c.handled ? GREY : g.c.severity === "hit" ? RED : ORANGE;
        return (
          <button key={g.key} type="button" className="dash-press" onClick={() => { setSelKey(g.key); onSeen(g.c.terminalId); }}
            style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "9px 12px", marginBottom: 6, cursor: "pointer", borderColor: `${color}77`, opacity: g.c.handled ? 0.6 : 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color }}>{label(g).toUpperCase()}</span>
              <span style={{ fontWeight: 600 }}> at {tm(g.c.terminalId)}</span>
              {isNew(g.c.terminalId) && <span style={{ marginLeft: 8, background: RED, color: "#000", fontSize: 10, fontWeight: 900, padding: "1px 5px" }}>NEW</span>}
              {g.c.handled && <span style={{ marginLeft: 8, color: "#4ade80", fontSize: 11 }}>✓ handled</span>}
            </div>
            <div style={{ fontSize: 12, color: L.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last(g)}</div>
          </button>
        );
      })}
      <FullscreenModal open={!!sel} title={sel ? `${label(sel)} · ${tm(sel.c.terminalId)}` : ""} onClose={close}>
        {sel && (() => {
          const ts = trucksOf(sel);
          const en = ts.filter((t) => !t.arrived), there = ts.filter((t) => t.arrived);
          const section = (list: typeof ts, text: string) => list.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, margin: "0 0 6px" }}>{list.length} trk {text} {tm(sel.c.terminalId)}</div>
              {list.map((t) => (
                <button key={t.tripId} type="button" className="dash-press" onClick={() => { close(); onOpenTrip(t.tripId); }} style={tRow}>
                  <span style={{ fontWeight: 800 }}>{unitTag(t.truckName, nameInitials(t.driverName))}</span>
                  {!t.arrived && <span style={{ color: L.muted }}>{t.etaMs ? ` · ETA ${hhmm(t.etaMs)}` : " · ETA unknown"}</span>}
                </button>
              ))}
            </div>
          );
          return (
            <>
              <div style={{ fontSize: 13, color: L.muted, marginBottom: 12 }}>
                {sel.reports.length} friction event{sel.reports.length === 1 ? "" : "s"} · last {last(sel)}
              </div>
              {section(en, "En route to")}
              {section(there, "At")}
              {!sel.c.handled && (
                <button type="button" className="dash-press" {...busyProps(saving)}
                  onClick={async () => { setSaving(true); const ok = await onAck(sel.c.terminalId, sel.reports.map((r) => r.reportId), ""); setSaving(false); if (ok) close(); }}
                  style={{ marginTop: 4, border: "none", background: "#fff", color: "#000", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "9px 14px", cursor: "pointer" }}>
                  Mark handled
                </button>
              )}
            </>
          );
        })()}
      </FullscreenModal>
    </>
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
  initialsOf: (userId: string) => string;
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
  regionNote?: string | null;
  planCounts: PlanCounts;
  planLoading?: boolean;
  // Planning a load: the picker card, how many drivers the expirations are narrowed to, and the not-carded chip.
  planner?: React.ReactNode;
  focusCount?: number | null;
  notCarded?: { count: number; shown: boolean; onToggle: () => void } | null;
  // Supplier contracts at or near their limit (count, worst level color) and how to open the list.
  allocation?: { count: number; color: string; onOpen: () => void } | null;
  onOpenDriver: (userId: string) => void;
  // LIVE chips: every load in progress, classified (liveGroups.ts)
  liveRows: LiveRow[];
  // Everything the En Route window needs to show and edit trips (see EnRouteSheet).
  enRoute?: Omit<React.ComponentProps<typeof EnRouteSheet>, "open" | "rows" | "onClose" | "onOpenTrip">;
  // Slots
  liveBoard: React.ReactNode; // loads in progress
  hosAlerts: HosAlert[]; // LIVE: drivers on loads in progress low on hours
  parkedBoard: React.ReactNode; // parked preloads, opened from the Parked chip
  cancelledBoard: React.ReactNode; // cancelled loads (renders nothing when there are none)
  dispatchedCount: number;
  cancelledCount: number;
  regions: RegionFilter;
  /** The shared header, given the mode switch and region filter to place on its right. */
  header?: (controls: React.ReactNode) => React.ReactNode;
  footer?: React.ReactNode;
  dispatchedBoard?: React.ReactNode; // loads sent to drivers, not begun yet
  drivers?: React.ReactNode;  // driver picker (side column); omitted when the planner holds it
  tools: ToolItem[];
}) {
  const L = useDashLook();
  const p = props;
  const live = p.mode === "live";

  const [expOpen, setExpOpen] = useState(false);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [hosOpen, setHosOpen] = useState(false);
  const [sheet, setSheet] = useState<null | "enroute" | "onsite" | "delayed" | "cancelled" | "dispatched" | "friction">(null);
  const lc = liveChipCounts(p.liveRows);
  // Loads dispatch told to park that have not parked yet count with the parked ones.
  const parkingRows = p.liveRows.filter((r) => r.parking);
  const parkedCount = p.counts.parked + parkingRows.length;
  // One expirations tile, worst tier first: expired (red), then 7 days
  // (orange), then 30 days (yellow). Counts only that tier, so resolving the
  // reds moves the tile down to the oranges.
  const pc = p.planCounts;
  const scope = p.focusCount != null ? ` · ${p.focusCount} driver${p.focusCount === 1 ? "" : "s"}` : "";
  const expTile0 = pc.expired
    ? { label: "Expired", count: pc.expired, color: RED }
    : pc.week
      ? { label: "Expiring · 7 days", count: pc.week, color: ORANGE }
      : pc.month
        ? { label: "Expiring · 30 days", count: pc.month, color: YELLOW }
        : { label: "Expirations", count: 0, color: GREY };
  const expTile = p.focusCount != null && pc.expired + pc.week + pc.month === 0
    ? { ...expTile0, label: `Expirations${scope}` }
    : { ...expTile0, label: `${expTile0.label}${p.focusCount != null ? scope : ""}` };

  const open = p.conflicts.filter((c) => !c.handled).length;
  const cells: GaugeCell[] = live
    ? [
        { label: "Friction", value: String(open), color: open ? RED : GREY, onClick: () => setSheet("friction") },
        { label: "En Route", value: String(lc.enRoute), color: lc.enRoute ? "#fff" : GREY, onClick: () => setSheet("enroute") },
        { label: "On Site", value: String(lc.onSite), color: lc.onSite ? "#fff" : GREY, onClick: () => setSheet("onsite") },
        { label: "Delayed", value: String(lc.delayed), color: lc.delayed ? ORANGE : GREY, onClick: () => setSheet("delayed") },
      ]
    : [
        { label: expTile.label, value: String(expTile.count), color: expTile.color, onClick: () => setExpOpen(true) },
        p.allocation
          ? { label: "Allocation", value: String(p.allocation.count), color: p.allocation.color, onClick: p.allocation.onOpen }
          : { label: "Allocation", value: "0", color: GREY },
        // Only while planning a load: how many drivers aren't carded at the terminal.
        ...(p.notCarded
          ? [{ label: p.notCarded.shown ? "Not carded ✓" : "Not carded", value: String(p.notCarded.count), color: p.notCarded.count ? ORANGE : GREY, onClick: p.notCarded.onToggle }]
          : []),
      ];

  const groups = groupBySubject(p.alerts);
  // Second row (Plan and Live): the load states.
  const cells2: GaugeCell[] = [
    { label: "Cancelled", value: String(p.cancelledCount), color: p.cancelledCount ? "#fff" : GREY, onClick: () => setSheet("cancelled") },
    { label: "Parked", value: String(parkedCount), color: parkedCount ? "#93c5fd" : GREY, onClick: () => setParkedOpen(true) },
    { label: "Dispatched", value: String(p.dispatchedCount), color: p.dispatchedCount ? "#93c5fd" : GREY, onClick: () => setSheet("dispatched") },
    { label: "Low hours", value: String(p.hosAlerts.length), color: p.hosAlerts.some((a) => a.level === "red") ? RED : p.hosAlerts.length ? ORANGE : GREY, onClick: () => setHosOpen(true) },
  ];

  return (
    <div className="dash-wrap d2" style={{ paddingTop: 4, paddingBottom: 24 }}>
      <DashStyles />
      {(() => {
        const controls = (
          <>
            <RegionButton r={p.regions} />
            <ModeSwitch mode={p.mode} modes={[{ id: "plan", label: "Plan" }, { id: "live", label: "Live" }]} onMode={p.onMode} />
          </>
        );
        return p.header ? p.header(controls) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.companyName ?? "Fleet"}</div>
            <div style={{ ...L.title, fontSize: 11, color: L.muted, marginTop: 2 }}>Dispatch Dashboard</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>{controls}</div>
          </>
        );
      })()}

      {p.error && <div style={{ fontSize: 13, color: "#f87171", marginTop: 10 }}>{p.error}</div>}

      <div style={{ height: 12 }} />
      <DashColumns a={cells} b={cells2}
        left={
          <>
            {!live && (<><SectionLabel first>Plan a load</SectionLabel>{p.planner}</>)}
            <SectionLabel first={live}>Tools</SectionLabel>
            <ToolPanel items={p.tools} />
            {p.footer}
          </>
        }
        right={
          <>
            {live ? <>{p.liveBoard}</> : (
              <>
                {p.dispatchedBoard && <SectionLabel first>Dispatched · not begun</SectionLabel>}
                {p.dispatchedBoard}
                {p.cancelledBoard}
              </>
            )}
            {p.drivers && (<><SectionLabel first={live ? false : !p.dispatchedBoard}>Drivers</SectionLabel>{p.drivers}</>)}
          </>
        } />
      <FullscreenModal open={hosOpen} title={`Low on hours (${p.hosAlerts.length})`} onClose={() => setHosOpen(false)}>
        {p.hosAlerts.length === 0 ? (
          <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>No driver on a load has under 2 hours left on a clock.</div>
        ) : p.hosAlerts.map((a) => (
          <button key={a.userId} type="button" className="dash-press" onClick={() => { setHosOpen(false); p.onOpenTrip(a.tripId); }}
            style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "10px 12px", marginBottom: 8, cursor: "pointer", borderColor: a.level === "red" ? RED : undefined }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{a.driverName}{a.truckName && <span style={{ fontWeight: 600, color: L.muted }}> · {a.truckName}</span>}</div>
            <div className="dash-num" style={{ fontSize: 13, marginTop: 3, color: a.color }}>{a.text}</div>
          </button>
        ))}
        <div style={{ fontSize: 12, color: L.faint, marginTop: 6 }}>Clocks refresh about every 3 minutes. Tap a driver to open their load.</div>
      </FullscreenModal>
      <FullscreenModal open={sheet === "friction"} title={`Friction (${open})`} onClose={() => setSheet(null)}>
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
                Friction
              </SectionLabel>
              {p.ackError && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>Couldn't save: {p.ackError}</div>}
              {p.conflicts.length === 0 ? (
                <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>
                  No friction. Nothing reported at a rack your trucks are headed to.
                </div>
              ) : (
                <FrictionList conflicts={p.conflicts} terminal={p.terminal} product={p.product} initialsOf={p.initialsOf}
                  isNew={(id) => p.unseen.has(id)} onSeen={p.onSeen} onAck={p.onAck} onOpenTrip={(id) => { setSheet(null); p.onOpenTrip(id); }} />
              )}
              {p.watch.length > 0 && (
                <>
                  <SectionLabel right={<span style={{ color: L.faint, letterSpacing: 0 }}>no truck headed there</span>}>Watch</SectionLabel>
                  {p.watch.map((w) => <WatchRow key={w.terminalId} w={w} terminal={p.terminal} product={p.product} />)}
                </>
              )}
      </FullscreenModal>
      {p.enRoute && <EnRouteSheet open={sheet === "enroute"} rows={p.liveRows.filter((r) => r.kind === "to_rack" || r.kind === "to_drop")} {...p.enRoute}
        onClose={() => setSheet(null)} onOpenTrip={p.onOpenTrip} />}
      <DelayedSheet open={sheet === "onsite"} mode="onsite" rows={p.liveRows.filter((r) => r.kind === "loading" || r.kind === "unloading")}
        onClose={() => setSheet(null)} onOpenTrip={p.onOpenTrip} openingId={p.openingId} />
      <DelayedSheet open={sheet === "delayed"} rows={p.liveRows.filter((r) => r.delayed || r.recovered)}
        onClose={() => setSheet(null)} onOpenTrip={p.onOpenTrip} openingId={p.openingId} />
      <FullscreenModal open={sheet === "cancelled"} title={`Cancelled loads (${p.cancelledCount})`} onClose={() => setSheet(null)}>
        {p.cancelledBoard}
      </FullscreenModal>
      <FullscreenModal open={sheet === "dispatched"} title={`Dispatched · not begun (${p.dispatchedCount})`} onClose={() => setSheet(null)}>
        {p.dispatchedBoard ?? <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>No loads sent and waiting.</div>}
      </FullscreenModal>
      <FullscreenModal open={parkedOpen} title={`Parked loads (${parkedCount})`} onClose={() => setParkedOpen(false)}>
        {parkingRows.length > 0 && (
          <>
            <SectionLabel first>Parking it</SectionLabel>
            {parkingRows.map((r) => (
              <button key={r.tripId} type="button" className="dash-press" onClick={() => { setParkedOpen(false); p.onOpenTrip(r.tripId); }}
                style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "9px 12px", marginBottom: 6, cursor: "pointer", borderColor: "#93c5fd66" }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}><span style={{ color: "#93c5fd" }}>PARKING IT</span> <span style={{ fontWeight: 600 }}>· {r.driverName}</span></div>
                <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{[r.truckName ? `Truck ${r.truckName}` : null, r.trailerName ? `Trailer ${r.trailerName}` : null].filter(Boolean).join(" · ")}{r.orders[0] ? ` · Order ${r.orders[0]}` : ""}</div>
              </button>
            ))}
            {p.counts.parked > 0 && <SectionLabel>Parked</SectionLabel>}
          </>
        )}
        {p.parkedBoard}
      </FullscreenModal>
      <ExpirationsSheet open={expOpen} onClose={() => setExpOpen(false)} title={`Expirations${scope}`} loading={p.planLoading}
        note={p.regionNote ?? null}
        groups={groups.map((g) => ({
          title: g.subject,
          onOpen: g.isEquipment ? undefined : () => { setExpOpen(false); p.onOpenDriver(g.subjectId); },
          rows: g.items.map((a) => ({
            key: a.key, name: a.label, sub: a.detail ? null : mdy(a.iso), state: a.state,
            detail: a.detail ?? daysText(a.days),
          })),
        }))} />
    </div>
  );
}
