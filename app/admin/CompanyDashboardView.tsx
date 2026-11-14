"use client";
// app/admin/CompanyDashboardView.tsx
//
// The Company Dashboard, laid out like the Dispatch Dashboard (instrument look): a mode switch (Now, Period, Desk),
// eight gauges, the fleet strip, the day ribbon, the compliance heatmap, campaign bars and the tools panel. It only
// draws what lib/company/company.ts built and calls back for anything that opens something. Presentational: no
// Supabase import, so it renders outside a browser.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { SectionLabel, useDashLook } from "@/app/planner/home/dashLook";
import { ToolPanel, type GaugeCell, type ToolItem } from "@/app/planner/home/DashboardChrome";
import { DashColumns } from "@/app/planner/components/dash/DashColumns";
import { EXPIRY_COLOR } from "@/lib/expiry";
import { ACTIVITY_COLOR, ACTIVITY_LABEL, FLEET_COLOR, FLEET_LABEL, type Activity, type CampaignBar, type FleetBox, type FleetState, type Gauge, type GaugeKey, type HeatCell, type Heatmap, type NeedsItem, type RibbonLane } from "@/lib/company/company";
import type { HosAlert } from "@/lib/dispatch/hosAlerts";

export type CompanyMode = "now" | "period" | "desk";

export type CompanyDashboardProps = {
  mode: CompanyMode;
  gauges: Gauge[];
  onGauge: (k: GaugeKey) => void;
  fleet: { boxes: FleetBox[]; counts: Record<FleetState, number> };
  ribbon: { lanes: RibbonLane[]; dayLabel: string };
  heat: Heatmap;
  campaigns: CampaignBar[];
  needs: { items: NeedsItem[]; total: number };
  hosRisk: HosAlert[];
  tools: ToolItem[];
  /** Period mode: the period picker and the company's headline figures. */
  periodSlot?: React.ReactNode;
  statsSlot?: React.ReactNode;
  /** The old "Needs Attention" list (equipment, permits, shifts), kept inside the Needs you sheet. */
  needsSlot?: React.ReactNode;
  /** The On shift sheet: drivers actually on shift, each with their day. Without it, the day ribbon's names are listed. */
  onShiftSlot?: React.ReactNode;
  deskSlot?: React.ReactNode;
  onOpenNeed: (k: NeedsItem["key"]) => void;
  loading?: boolean;
};

const HOURS = [0, 6, 12, 18];

function Fleet({ fleet, onBox }: { fleet: CompanyDashboardProps["fleet"]; onBox: (b: FleetBox) => void }) {
  const L = useDashLook();
  if (fleet.boxes.length === 0) return <div style={{ color: L.muted, fontSize: 13 }}>No units.</div>;
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {fleet.boxes.map((b) => (
          <button key={b.id} type="button" onClick={() => onBox(b)} className="dash-press" aria-label={`${b.kind} ${b.name} ${FLEET_LABEL[b.state]} ${b.days} days`}
            style={{ position: "relative", width: 38, height: 38, padding: 0, border: `1px solid ${FLEET_COLOR[b.state]}`, background: "#0a0a0b", cursor: "pointer", overflow: "hidden", borderRadius: 1 }}>
            <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${Math.round(b.fill * 100)}%`, background: FLEET_COLOR[b.state], opacity: 0.45 }} />
            <span style={{ position: "relative", fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>{b.name.length > 6 ? b.name.slice(-6) : b.name}</span>
            {b.kind === "trailer" && <span aria-hidden style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, background: "#fff", opacity: 0.7 }} />}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 11, color: L.muted }}>
        {(["deadline", "readyline", "in_use", "available"] as FleetState[]).map((s) => (
          <span key={s}><span aria-hidden style={{ display: "inline-block", width: 9, height: 9, background: FLEET_COLOR[s], marginRight: 5 }} />{FLEET_LABEL[s]} {fleet.counts[s]}</span>
        ))}
        <span>Square fills with days in that status. Dot = trailer.</span>
      </div>
    </div>
  );
}

function Ribbon({ ribbon }: { ribbon: CompanyDashboardProps["ribbon"] }) {
  const L = useDashLook();
  if (ribbon.lanes.length === 0) return <div style={{ color: L.muted, fontSize: 13 }}>No driver activity {ribbon.dayLabel}.</div>;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: "4px 8px", alignItems: "center" }}>
        <span />
        <div style={{ position: "relative", height: 12 }}>
          {HOURS.map((h) => <span key={h} style={{ position: "absolute", left: `${(h / 24) * 100}%`, fontSize: 9, color: L.faint, transform: h ? "translateX(-50%)" : undefined }}>{h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}</span>)}
        </div>
        {ribbon.lanes.map((lane) => (
          <React.Fragment key={lane.userId}>
            <span style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lane.name}</span>
            <div style={{ position: "relative", height: 14, background: "#0a0a0b", border: `1px solid ${L.hairline}` }}>
              {HOURS.slice(1).map((h) => <span key={h} aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: `${(h / 24) * 100}%`, borderLeft: `1px solid ${L.hairline}` }} />)}
              {lane.segs.map((s, i) => (
                <span key={i} title={`${ACTIVITY_LABEL[s.activity]} · ${s.source}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${s.left * 100}%`, width: `${Math.max(s.width * 100, 0.4)}%`, background: ACTIVITY_COLOR[s.activity],
                  borderTop: s.source === "manual" ? "2px dashed #000" : undefined, boxShadow: s.source === "geotab" ? "inset 0 0 0 1px rgba(255,255,255,0.7)" : undefined }} />
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 11, color: L.muted }}>
        {(Object.keys(ACTIVITY_COLOR) as Activity[]).map((a) => <span key={a}><span aria-hidden style={{ display: "inline-block", width: 9, height: 9, background: ACTIVITY_COLOR[a], marginRight: 5 }} />{ACTIVITY_LABEL[a]}</span>)}
        <span>Outlined = Geotab. Dashed top = entered by hand.</span>
      </div>
    </div>
  );
}

function Heat({ heat, onCell }: { heat: Heatmap; onCell: (title: string, c: HeatCell) => void }) {
  const L = useDashLook();
  if (heat.rows.length === 0) return <div style={{ color: L.muted, fontSize: 13 }}>Nothing outstanding.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead><tr><th style={{ textAlign: "left", padding: "4px 8px 6px 0", color: L.muted, fontWeight: 700 }} />{heat.columns.map((c) => <th key={c} style={{ padding: "4px 6px 6px", color: L.muted, fontWeight: 800, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{c}</th>)}</tr></thead>
        <tbody>
          {heat.rows.map((r) => (
            <tr key={r.label}>
              <td style={{ padding: "3px 8px 3px 0", fontWeight: 700, whiteSpace: "nowrap" }}>{r.label}</td>
              {r.cells.map((c, i) => (
                <td key={i} style={{ padding: 2, textAlign: "center" }}>
                  {c.count > 0
                    ? <button type="button" onClick={() => onCell(`${r.label} · ${heat.columns[i]}`, c)} className="dash-press" style={{ width: "100%", minWidth: 38, padding: "7px 0", border: "none", cursor: "pointer", fontWeight: 900, color: "#000", background: c.worst ? EXPIRY_COLOR[c.worst] : "#fff" }}>{c.count}</button>
                    : <span style={{ color: L.faint }}>·</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ bars }: { bars: CampaignBar[] }) {
  const L = useDashLook();
  if (bars.length === 0) return <div style={{ color: L.muted, fontSize: 13 }}>No open campaigns.</div>;
  return (
    <div>
      {bars.map((b) => {
        const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
        return (
          <div key={b.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800 }}><span>{b.name}</span><span style={{ color: L.muted, fontWeight: 600 }}>{b.due ? `due ${b.due.slice(5).replace("-", "/")}` : ""}</span></div>
            <div style={{ height: 10, background: "#0a0a0b", border: `1px solid ${L.hairline}`, margin: "4px 0" }}><div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#4ade80" : "#60a5fa" }} /></div>
            <div style={{ fontSize: 12, color: L.muted }}>{b.done} of {b.total} done · {b.outstanding} outstanding{b.pending ? ` · ${b.pending} to review` : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

export function CompanyDashboardView(p: CompanyDashboardProps) {
  const L = useDashLook();
  const [cell, setCell] = useState<{ title: string; c: HeatCell } | null>(null);
  const [sheet, setSheet] = useState<"needs" | "down" | "hours" | "heat" | "shift" | null>(null);
  const first = p.gauges.slice(0, 4), second = p.gauges.slice(4);
  const open = (k: GaugeKey) => {
    if (k === "needs") return setSheet("needs");
    if (k === "down") return setSheet("down");
    if (k === "hours") return setSheet("hours");
    if (k === "compliance") return setSheet("heat");
    if (k === "shift") return setSheet("shift");
    p.onGauge(k);
  };
  const cells = (gs: Gauge[]): GaugeCell[] => gs.map((g) => ({ label: g.label, value: g.value, unit: g.unit, color: g.color, onClick: () => open(g.key) }));
  const down = p.fleet.boxes.filter((b) => b.state === "deadline");

  return (
    <div>
      {p.mode === "desk" ? (
        <div>{p.deskSlot ?? <div style={{ color: L.muted, fontSize: 14, padding: "20px 0" }}>The Desk is next: errors, stuck syncs and a driver's timeline in one place.</div>}</div>
      ) : (
        <>
          {p.mode === "period" && p.periodSlot && <div style={{ marginBottom: 10 }}>{p.periodSlot}</div>}
          <DashColumns a={cells(first)} b={cells(second)}
            left={<><SectionLabel first>Tools</SectionLabel><ToolPanel items={p.tools} /></>}
            right={p.mode === "now" ? (
              <>
                <SectionLabel first>Fleet · {p.fleet.boxes.length} units</SectionLabel>
                <Fleet fleet={p.fleet} onBox={() => setSheet("down")} />
                <SectionLabel>Today · drivers by hour</SectionLabel>
                <Ribbon ribbon={p.ribbon} />
              </>
            ) : (
              <>
                <SectionLabel first>Compliance by region</SectionLabel>
                <Heat heat={p.heat} onCell={(title, c) => setCell({ title, c })} />
                <SectionLabel>Inspection campaigns</SectionLabel>
                <Bars bars={p.campaigns} />
                {p.statsSlot && <><SectionLabel>Company</SectionLabel>{p.statsSlot}</>}
              </>
            )} />
        </>
      )}

      <FullscreenModal open={sheet === "needs"} title="Needs you" onClose={() => setSheet(null)} footer={null}>
        {p.needs.items.length === 0 && !p.needsSlot && <div style={{ color: L.muted, fontSize: 14 }}>Nothing is waiting on you.</div>}
        {p.needs.items.map((i) => (
          <button key={i.key} type="button" onClick={() => { setSheet(null); p.onOpenNeed(i.key); }} className="dash-press"
            style={{ ...L.secondary, display: "flex", width: "100%", justifyContent: "space-between", padding: "14px", marginBottom: 8, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", textAlign: "left" }}>
            <span>{i.label}</span><span style={{ color: EXPIRY_COLOR.expiring }}>{i.count} ›</span>
          </button>
        ))}
        {p.needsSlot}
      </FullscreenModal>

      <FullscreenModal open={sheet === "down"} title="Down" onClose={() => setSheet(null)} footer={null}>
        {down.length === 0 && <div style={{ color: L.muted, fontSize: 14 }}>No units in Deadline.</div>}
        {down.map((b) => <div key={b.id} style={{ ...L.secondary, display: "flex", justifyContent: "space-between", padding: "12px 14px", marginBottom: 6, fontSize: 14 }}><b>{b.kind === "truck" ? "Truck" : "Trailer"} {b.name}</b><span style={{ color: L.muted }}>{b.days}d in Deadline</span></div>)}
      </FullscreenModal>

      <FullscreenModal open={sheet === "hours"} title="Hours risk" onClose={() => setSheet(null)} footer={null}>
        {p.hosRisk.length === 0 && <div style={{ color: L.muted, fontSize: 14 }}>Nobody is low on hours.</div>}
        {p.hosRisk.map((h) => <div key={h.userId} style={{ ...L.secondary, padding: "12px 14px", marginBottom: 6, fontSize: 14 }}><b>{h.driverName}</b>{h.truckName ? ` · ${h.truckName}` : ""}<div style={{ color: h.color, fontSize: 13 }}>{h.text}</div></div>)}
      </FullscreenModal>

      <FullscreenModal open={sheet === "shift"} title="On shift" onClose={() => setSheet(null)} footer={null}>
        {p.onShiftSlot ?? (
          <>
            {p.ribbon.lanes.length === 0 && <div style={{ color: L.muted, fontSize: 14 }}>No driver activity {p.ribbon.dayLabel}.</div>}
            {p.ribbon.lanes.map((l) => <div key={l.userId} style={{ ...L.secondary, display: "flex", justifyContent: "space-between", padding: "12px 14px", marginBottom: 6, fontSize: 14 }}><b>{l.name}</b></div>)}
          </>
        )}
      </FullscreenModal>

      <FullscreenModal open={sheet === "heat"} title="Compliance by region" onClose={() => setSheet(null)} footer={null}>
        <Heat heat={p.heat} onCell={(title, c) => { setSheet(null); setCell({ title, c }); }} />
      </FullscreenModal>

      <FullscreenModal open={!!cell} title={cell?.title ?? ""} onClose={() => setCell(null)} footer={null}>
        {cell?.c.items.map((i, n) => (
          <div key={`${i.subjectId}${n}`} style={{ ...L.secondary, display: "flex", justifyContent: "space-between", padding: "12px 14px", marginBottom: 6, fontSize: 14 }}>
            <b>{i.subject}</b><span style={{ color: EXPIRY_COLOR[i.state] }}>{i.label}</span>
          </div>
        ))}
      </FullscreenModal>
    </div>
  );
}
