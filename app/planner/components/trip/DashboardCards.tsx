"use client";
// app/planner/components/trip/DashboardCards.tsx
//
// Readout cards for the Driver Dashboard.
//   Always shown: Terminal Status, Recent Deliveries.
//   Shown only when there's something: trucks headed to my terminal, loads
//   headed to my delivery, parked preloads.
// Each card is collapsed to a line or two; tap the header to expand.

import React, { useState } from "react";
import { apiTierColor, type ApiTier } from "../../utils/apiBasis";
import type { TerminalProductStatus, RecentDelivery } from "../../hooks/useDashboardCards";
import type { HeadingToDelivery, HeadingToTerminal, FleetTripLike } from "@/lib/trips/dashboardCards";
import type { ComposedOutageReport } from "../../hooks/useTerminalOutageReports";
import { PARK_FOR_LABEL, onBoard } from "@/lib/trips/tripFlow";

export type ProductInfoFn = (id: string | null) => { name: string; code: string; hex: string | null };

const muted = "rgba(255,255,255,0.5)";
const red = "#f87171";
const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  marginTop: 10,
  overflow: "hidden",
};

function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function ageTier(iso: string | null, now = Date.now()): ApiTier {
  if (!iso) return "low";
  const h = (now - new Date(iso).getTime()) / 3600000;
  return h <= 6 ? "high" : h <= 12 ? "recent" : h <= 24 ? "medium" : "low";
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

const gal = (n: number) => `${Math.round(n).toLocaleString("en-US")} gal`;

function Dot({ color }: { color: string }) {
  return <span style={{ width: 9, height: 9, borderRadius: 999, background: color, border: "1px solid rgba(255,255,255,0.25)", flexShrink: 0, display: "inline-block" }} />;
}

function colorOf(info: { name: string; hex: string | null }): string {
  if (info.hex) return info.hex;
  const n = info.name.toLowerCase();
  return n.includes("diesel") ? "#eab308" : n.includes("premium") ? "#ef4444" : "#ffffff";
}

function CardHeader({ title, summary, summaryColor, open, onToggle }: {
  title: string; summary: React.ReactNode; summaryColor?: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        width: "100%", display: "flex", alignItems: "baseline", gap: 10, padding: "13px 14px",
        border: "none", background: "transparent", color: "#fff", cursor: "pointer", textAlign: "left",
      }}
    >
      <span style={{ fontSize: 13, color: muted, flexShrink: 0 }}>{title}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: summaryColor ?? "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
        {summary}
      </span>
      <span style={{ color: "rgba(255,255,255,0.35)", transform: open ? "rotate(90deg)" : undefined, transition: "transform 120ms" }}>›</span>
    </button>
  );
}

const rowStyle: React.CSSProperties = {
  padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 14,
};

// ── Terminal Status (always shown) ─────────────────────────────────────────

export function TerminalStatusCard({ terminalName, rackName, products, reports, onOpenReports, onChangeTerminal }: {
  terminalName: string | null;
  rackName: string | null;
  products: TerminalProductStatus[];
  reports: ComposedOutageReport[];
  onOpenReports: () => void;
  onChangeTerminal: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!terminalName) {
    return (
      <div style={cardStyle}>
        <CardHeader title="Terminal" summary="Select a terminal" summaryColor={muted} open={false} onToggle={onChangeTerminal} />
      </div>
    );
  }
  const outCount = products.filter((p) => p.isOut).length;
  const newest = products.reduce<string | null>((m, p) => (p.updatedAt && (!m || p.updatedAt > m) ? p.updatedAt : m), null);
  const summary = reports.length > 0
    ? `${reports.length} report${reports.length === 1 ? "" : "s"}`
    : outCount > 0
      ? `${outCount} out`
      : newest ? `API ${ago(newest)}` : "No reports";
  return (
    <div style={cardStyle}>
      <CardHeader
        title="Terminal"
        summary={<><span style={{ color: "#fff" }}>{terminalName}</span><span style={{ color: reports.length || outCount ? red : muted, fontWeight: 600 }}> · {summary}</span></>}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {reports.length > 0 && (
        <button
          type="button"
          onClick={onOpenReports}
          style={{ ...rowStyle, width: "100%", display: "block", background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", color: red, fontWeight: 700, textAlign: "left", cursor: "pointer" }}
        >
          {reports.map((r) => r.tickerText).join(" · ")} ›
        </button>
      )}
      {open && (
        <>
          {rackName && (
            <div style={{ ...rowStyle, color: muted, fontSize: 12 }}>{rackName}</div>
          )}
          {products.length === 0 && (
            <div style={{ ...rowStyle, color: muted }}>No products on file for this rack.</div>
          )}
          {products.map((p) => (
            <div key={p.productId} style={{ ...rowStyle, display: "flex", alignItems: "center", gap: 8, opacity: p.isOut ? 0.55 : 1 }}>
              <Dot color={colorOf({ name: p.name, hex: p.hex })} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: p.isOut ? "line-through" : undefined }}>
                {p.name}
              </span>
              {p.isOut && <span style={{ color: red, fontSize: 12, fontWeight: 700 }}>OUT</span>}
              <span style={{ color: p.lastApi != null ? apiTierColor(ageTier(p.updatedAt)) : muted, fontWeight: 700, fontSize: 13 }}>
                {p.lastApi != null ? `API ${p.lastApi.toFixed(1)}` : "API —"}
              </span>
              <span style={{ color: muted, fontSize: 13, width: 48, textAlign: "right" }}>
                {p.lastTempF != null ? `${p.lastTempF.toFixed(0)}°F` : "—°F"}
              </span>
            </div>
          ))}
          {newest && (
            <div style={{ ...rowStyle, color: muted, fontSize: 12 }}>Last reading {ago(newest)}</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Recent Deliveries (always shown) ───────────────────────────────────────

export function RecentDeliveriesCard({ items, productInfo, onOpenTrip }: {
  items: RecentDelivery[];
  productInfo: ProductInfoFn;
  onOpenTrip: (tripId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 1);
  const latest = items[0];
  return (
    <div style={cardStyle}>
      <CardHeader
        title="Recent Deliveries"
        summary={latest ? when(latest.leftAt) : "None yet"}
        summaryColor={latest ? "#fff" : muted}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {shown.map((d) => (
        <button
          key={d.deliveryId}
          type="button"
          onClick={() => onOpenTrip(d.tripId)}
          style={{ ...rowStyle, width: "100%", display: "block", background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#fff", textAlign: "left", cursor: "pointer" }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.place}</span>
            <span style={{ color: muted, fontSize: 12, flexShrink: 0 }}>{when(d.leftAt)}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
            {d.orderNumber && <span style={{ color: muted }}>Order {d.orderNumber}</span>}
            {d.dropped.map((x) => {
              const info = productInfo(x.productId);
              return (
                <span key={String(x.productId)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Dot color={colorOf(info)} />{info.code} {gal(x.gallons)}
                </span>
              );
            })}
          </div>
        </button>
      ))}
      {open && items.length === 0 && <div style={{ ...rowStyle, color: muted }}>No completed deliveries yet.</div>}
    </div>
  );
}

// ── Conditional cards (render nothing when empty) ──────────────────────────

export function HeadingToTerminalCard({ terminalName, items, productInfo }: {
  terminalName: string | null;
  items: HeadingToTerminal[];
  productInfo: ProductInfoFn;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const arrived = items.filter((x) => x.arrived).length;
  const summary = `${items.length} truck${items.length === 1 ? "" : "s"}${arrived ? ` · ${arrived} there` : ""}`;
  return (
    <div style={cardStyle}>
      <CardHeader title={`Headed to ${terminalName ?? "this terminal"}`} summary={summary} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && items.map((x) => (
        <div key={x.tripId} style={{ ...rowStyle, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {x.driverName ?? "Driver"}{x.truckName ? <span style={{ color: muted }}> · Truck {x.truckName}</span> : null}
          </span>
          {x.productIds.map((id) => {
            const info = productInfo(id);
            return <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}><Dot color={colorOf(info)} />{info.code}</span>;
          })}
          <span style={{ fontSize: 12, fontWeight: 700, color: x.arrived ? "#4ade80" : muted }}>{x.arrived ? "At rack" : "En route"}</span>
        </div>
      ))}
    </div>
  );
}

export function HeadingToDeliveryCard({ deliveryName, items, productInfo }: {
  deliveryName: string | null;
  items: HeadingToDelivery[];
  productInfo: ProductInfoFn;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={cardStyle}>
      <CardHeader
        title={`Also going to ${deliveryName ?? "your delivery"}`}
        summary={`${items.length} load${items.length === 1 ? "" : "s"}`}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {open && items.map((x) => (
        <div key={x.tripId} style={rowStyle}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {x.driverName ?? "Driver"}{x.truckName ? <span style={{ color: muted }}> · Truck {x.truckName}</span> : null}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: x.arrived ? "#4ade80" : muted }}>{x.arrived ? "There now" : "En route"}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
            {x.aboard.map((a) => {
              const info = productInfo(a.productId);
              return <span key={String(a.productId)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Dot color={colorOf(info)} />{info.code} {gal(a.gallons)}</span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ParkedPreloadsCard({ items, productInfo, onOpenTrip }: {
  items: FleetTripLike[];
  productInfo: ProductInfoFn;
  onOpenTrip: (tripId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div style={cardStyle}>
      <CardHeader
        title="Parked preloads"
        summary={`${items.length} trailer${items.length === 1 ? "" : "s"}`}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {open && items.map((f) => {
        const byProduct = new Map<string | null, number>();
        for (const c of onBoard(f.compLoads)) byProduct.set(c.product_id, (byProduct.get(c.product_id) ?? 0) + Number(c.gross_gallons ?? 0));
        const forLabel = f.trip.parked_for ? PARK_FOR_LABEL[f.trip.parked_for] : null;
        return (
          <button
            key={f.trip.trip_id}
            type="button"
            onClick={() => onOpenTrip(f.trip.trip_id)}
            style={{ ...rowStyle, width: "100%", display: "block", background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#fff", textAlign: "left", cursor: "pointer" }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Trailer {f.trailerName ?? "—"}{f.trip.parked_where ? <span style={{ color: muted, fontWeight: 400 }}> · {f.trip.parked_where}</span> : null}
              </span>
              <span style={{ color: muted, fontSize: 12, flexShrink: 0 }}>{ago(f.trip.parked_at ?? null)}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
              {forLabel && <span style={{ color: muted }}>{forLabel}</span>}
              {[...byProduct].map(([pid, g]) => {
                const info = productInfo(pid);
                return <span key={String(pid)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Dot color={colorOf(info)} />{info.code} {gal(g)}</span>;
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
