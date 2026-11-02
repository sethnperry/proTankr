"use client";
// app/admin/MaintenanceView.tsx
//
// Unit maintenance for managers, in three parts: Units (last done and next due, permits, the latest inspection),
// Campaigns (who has and has not inspected, create one) and Review (campaign inspections waiting for an admin).
// Presentational: rows in, callbacks out, no data code, so it renders without a browser.

import React, { useState } from "react";
import { ModeSwitch } from "@/app/planner/components/dash/DashChrome";
import { EXPIRY_COLOR } from "@/lib/expiry";
import { conditionLabel } from "@/lib/maintenance/inspection";
import type { CampaignBoard, UnitRow, BoardInspection } from "@/lib/maintenance/board";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const panel: React.CSSProperties = { background: "#0f0f10", border: `1px solid ${HAIR}`, padding: 12, marginBottom: 8 };
const btn = (on?: boolean): React.CSSProperties => ({ padding: "10px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });

export type MaintTab = "units" | "campaigns" | "review";

export function MaintenanceView(p: {
  tab: MaintTab;
  onTab: (t: MaintTab) => void;
  units: UnitRow[];
  campaigns: CampaignBoard[];
  review: (BoardInspection & { unitName: string })[];
  driverName: (id: string) => string;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onCreateCampaign: (c: { name: string; unit_kind: "truck" | "trailer" | "both"; region: string; due_on: string }) => Promise<void>;
  onCloseCampaign: (id: string) => void;
  onReview: (inspectionId: string) => void;
  regions: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [f, setF] = useState({ name: "", unit_kind: "both" as "truck" | "trailer" | "both", region: "", due_on: "" });
  const [saving, setSaving] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <ModeSwitch mode={p.tab} modes={[{ id: "units", label: "Units" }, { id: "campaigns", label: "Campaigns" }, { id: "review", label: `Review${p.review.length ? ` ${p.review.length}` : ""}` }]} onMode={p.onTab} />
      </div>
      {p.error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{p.error}</div>}
      {p.loading && <div style={{ color: MUTE, fontSize: 14 }}>Loading…</div>}

      {p.tab === "units" && p.units.map((r) => (
        <div key={`${r.unit.kind}:${r.unit.id}`} style={panel}>
          <button type="button" onClick={() => setOpen(open === r.unit.id ? null : r.unit.id)} style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, textAlign: "left" }}>
            <span aria-hidden style={{ width: 10, height: 10, background: r.worst ? EXPIRY_COLOR[r.worst] : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>{r.unit.kind === "truck" ? "Truck" : "Trailer"} {r.unit.name}</span>
            <span style={{ fontSize: 12, color: MUTE }}>{r.inspection ? `Inspected ${dayLabel(r.inspection.at)} · ${conditionLabel(r.inspection.overall)}` : "Never inspected"}</span>
          </button>
          {open === r.unit.id && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              {r.inspection && r.inspection.failed.length > 0 && <div style={{ color: "#fbbf24", marginBottom: 8 }}>Watch: {r.inspection.failed.join(", ")}</div>}
              {r.services.length === 0 && <div style={{ color: MUTE }}>No service types set up for this unit.</div>}
              {r.services.map((s) => (
                <div key={s.name} style={{ display: "flex", gap: 8, padding: "5px 0", borderTop: `1px solid ${HAIR}` }}>
                  <span style={{ flex: 1, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ color: MUTE }}>{s.lastDate ? `Last ${s.lastDate}` : "—"}</span>
                  <span style={{ minWidth: 120, textAlign: "right", color: s.state ? EXPIRY_COLOR[s.state] : "#fff" }}>{s.next}</span>
                </div>
              ))}
              {r.permits.length > 0 && <div style={{ ...{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: MUTE }, marginTop: 10, marginBottom: 4 }}>Permits</div>}
              {r.permits.map((x) => (
                <div key={x.name} style={{ display: "flex", gap: 8, padding: "4px 0" }}>
                  <span style={{ flex: 1 }}>{x.name}</span>
                  <span style={{ color: EXPIRY_COLOR[x.state] }}>{x.days == null ? "No date" : x.days < 0 ? `Expired ${-x.days}d ago` : `${x.days}d`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {p.tab === "units" && !p.loading && p.units.length === 0 && <div style={{ color: MUTE }}>No units.</div>}

      {p.tab === "campaigns" && (
        <>
          {p.canEdit && !form && <button type="button" style={{ ...btn(true), width: "100%", marginBottom: 12 }} onClick={() => setForm(true)}>New campaign</button>}
          {form && (
            <div style={{ ...panel, padding: 14 }}>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name, e.g. Fall tire check"
                style={{ width: "100%", boxSizing: "border-box", padding: 10, fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.28)", border: `1px solid ${HAIR}`, borderRadius: 0, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {(["both", "truck", "trailer"] as const).map((k) => <button key={k} type="button" style={{ ...btn(f.unit_kind === k), flex: 1 }} onClick={() => setF({ ...f, unit_kind: k })}>{k === "both" ? "All units" : k === "truck" ? "Trucks" : "Trailers"}</button>)}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <button type="button" style={btn(!f.region)} onClick={() => setF({ ...f, region: "" })}>All regions</button>
                {p.regions.map((r) => <button key={r} type="button" style={btn(f.region === r)} onClick={() => setF({ ...f, region: r })}>{r}</button>)}
              </div>
              <label style={{ fontSize: 12, color: MUTE }}>Due by (optional)<input type="date" value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} style={{ display: "block", marginTop: 4, padding: 10, fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.28)", border: `1px solid ${HAIR}`, colorScheme: "dark" }} /></label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="button" disabled={saving || !f.name.trim()} style={{ ...btn(true), flex: 1, opacity: f.name.trim() ? 1 : 0.5 }}
                  onClick={async () => { setSaving(true); await p.onCreateCampaign(f); setSaving(false); setForm(false); setF({ name: "", unit_kind: "both", region: "", due_on: "" }); }}>{saving ? "Saving…" : "Start campaign"}</button>
                <button type="button" style={btn()} onClick={() => setForm(false)}>Cancel</button>
              </div>
            </div>
          )}
          {p.campaigns.map((b) => (
            <div key={b.campaign.campaign_id} style={{ ...panel, opacity: b.campaign.closed_at ? 0.55 : 1 }}>
              <button type="button" onClick={() => setOpen(open === b.campaign.campaign_id ? null : b.campaign.campaign_id)} style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, textAlign: "left" }}>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>{b.campaign.name}{b.campaign.closed_at ? " (closed)" : ""}</span>
                <span className="dash-num" style={{ fontSize: 14, fontWeight: 800, color: b.outstanding.length ? "#fbbf24" : "#4ade80" }}>{b.done.length} of {b.targets}</span>
              </button>
              <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{[b.campaign.unit_kind === "both" ? "All units" : b.campaign.unit_kind === "truck" ? "Trucks" : "Trailers", b.campaign.region, b.campaign.due_on ? `due ${b.campaign.due_on}` : null].filter(Boolean).join(" · ")}</div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.12)", marginTop: 8 }}><div style={{ height: 4, width: `${b.targets ? (b.done.length / b.targets) * 100 : 0}%`, background: "#fff" }} /></div>
              {open === b.campaign.campaign_id && (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  {b.outstanding.length > 0 && <><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fbbf24", marginBottom: 4 }}>Outstanding</div><div style={{ marginBottom: 8 }}>{b.outstanding.map((u) => u.name).join(", ")}</div></>}
                  {b.done.length > 0 && <><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#4ade80", marginBottom: 4 }}>Done</div><div>{b.done.map((u) => u.name).join(", ")}</div></>}
                  {p.canEdit && !b.campaign.closed_at && <button type="button" style={{ ...btn(), marginTop: 12 }} onClick={() => p.onCloseCampaign(b.campaign.campaign_id)}>Close campaign</button>}
                </div>
              )}
            </div>
          ))}
          {!p.loading && p.campaigns.length === 0 && !form && <div style={{ color: MUTE }}>No campaigns yet. Start one to ask every unit to be inspected.</div>}
        </>
      )}

      {p.tab === "review" && (
        <>
          {p.review.length === 0 && !p.loading && <div style={{ color: MUTE }}>Nothing to review. Only inspections made for a campaign come here.</div>}
          {p.review.map((i) => (
            <div key={i.inspection_id} style={panel}>
              <div style={{ display: "flex", gap: 8 }}><span style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>{i.unitName}</span><span style={{ fontSize: 12, color: i.overall === "good" ? "#4ade80" : i.overall === "fair" ? "#fbbf24" : "#f87171" }}>{conditionLabel(i.overall)}</span></div>
              <div style={{ fontSize: 12, color: MUTE }}>{p.driverName(i.driver_id)} · {dayLabel(i.created_at)}</div>
              {i.items.filter((x) => x.condition !== "good").map((x) => <div key={x.key} style={{ fontSize: 13, marginTop: 4 }}>{x.label}: {conditionLabel(x.condition)}{x.note ? ` — ${x.note}` : ""}</div>)}
              {p.canEdit && <button type="button" style={{ ...btn(true), marginTop: 10 }} onClick={() => p.onReview(i.inspection_id)}>Mark reviewed</button>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
