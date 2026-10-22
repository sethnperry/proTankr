"use client";
// app/planner/components/trip/DashboardCards.tsx
//
// Readout cards for the Driver Dashboard.
//   Always shown: Terminal status, Recent Deliveries (selected store).
//   Shown only when there's something: trucks headed to my terminal, loads
//   headed to my delivery, parked preloads.
// Each card is collapsed to a line or two; tap the header to expand.

import React, { useState } from "react";
import { CardBusy, Spinner, busyProps } from "@/lib/ui/pending";
import { apiTierColor, type ApiTier } from "../../utils/apiBasis";
import type { TerminalProductStatus, StoreDelivery } from "../../hooks/useDashboardCards";
import type { HeadingToDelivery, HeadingToTerminal, FleetTripLike } from "@/lib/trips/dashboardCards";
import type { ComposedOutageReport } from "../../hooks/useTerminalOutageReports";
import { PARK_FOR_LABEL, onBoard } from "@/lib/trips/tripFlow";

export type ProductInfoFn = (id: string | null) => { name: string; code: string; hex: string | null };

const muted = "rgba(255,255,255,0.5)";
const red = "#f87171";
// Surface comes from the dashboard's look (dashLook.tsx sets these CSS
// variables on the page); the fallbacks are the plain look.
const cardStyle: React.CSSProperties = {
  borderRadius: "var(--dash-card-radius, 14px)" as any,
  border: "var(--dash-card-border, 1px solid rgba(255,255,255,0.10))",
  background: "var(--dash-card-bg, rgba(255,255,255,0.03))",
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

// A card that shows one summary line until tapped, then its content.
export function CollapsibleCard({ title, summary, summaryColor, children }: {
  title: string; summary: React.ReactNode; summaryColor?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={cardStyle}>
      <CardHeader title={title} summary={summary} summaryColor={summaryColor} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && <div style={{ padding: "0 10px 10px" }}>{children}</div>}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 14,
};

// ── Terminal Status (always shown) ─────────────────────────────────────────

export function TerminalStatusCard({ placeLabel, terminalName, rackName, products, reports, onOpenReports, onChangeTerminal, onUpdate, defaultOpen = false }: {
  // "City, ST" of the terminal: the card's label.
  placeLabel: string | null;
  terminalName: string | null;
  rackName: string | null;
  products: TerminalProductStatus[];
  reports: ComposedOutageReport[];
  onOpenReports: () => void;
  onChangeTerminal: () => void;
  // Opens the status update window (products out/available, long line, ...).
  onUpdate: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const title = placeLabel || "Terminal";
  if (!terminalName) {
    return (
      <div style={cardStyle}>
        <CardHeader title={title} summary="Select a terminal" summaryColor={muted} open={false} onToggle={onChangeTerminal} />
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
        title={title}
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
        <button
          type="button"
          onClick={onUpdate}
          style={{ display: "block", width: "100%", padding: 0, border: "none", background: "transparent", color: "#fff", textAlign: "left", cursor: "pointer" }}
        >
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
          <div style={{ ...rowStyle, display: "flex", color: muted, fontSize: 12 }}>
            <span style={{ flex: 1 }}>{newest ? `Last reading ${ago(newest)}` : ""}</span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Update status ›</span>
          </div>
        </button>
      )}
    </div>
  );
}

// ── Recent Deliveries (always shown) ───────────────────────────────────────
// For the selected delivery location, every carrier. Collapsed shows the
// latest drop; tap a drop for the store's tank levels after it.

export function RecentDeliveriesCard({ storeName, items, productInfo, onOpenTrip, onPickStore, openingId, alwaysOpen = false, max }: {
  openingId?: string | null;
  // Inside the To Drop window: no collapse, list up to `max`.
  alwaysOpen?: boolean;
  max?: number;
  storeName: string | null;
  items: StoreDelivery[];
  productInfo: ProductInfoFn;
  onOpenTrip: (tripId: string) => void;
  onPickStore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!storeName) {
    return (
      <div style={cardStyle}>
        <CardHeader title="Recent Deliveries" summary="Select a delivery location" summaryColor={muted} open={false} onToggle={onPickStore} />
      </div>
    );
  }
  const shown = (open || alwaysOpen ? items : items.slice(0, 1)).slice(0, max ?? items.length);
  return (
    <div style={cardStyle}>
      <CardHeader title={alwaysOpen && max ? `Previous ${max} deliveries` : "Recent Deliveries"} summary={storeName} open={open || alwaysOpen} onToggle={() => { if (!alwaysOpen) setOpen((o) => !o); }} />
      {shown.map((d) => {
        const isOpen = expanded === d.deliveryId;
        return (
          <div key={d.deliveryId} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : d.deliveryId)}
              aria-expanded={isOpen}
              style={{ ...rowStyle, borderTop: "none", width: "100%", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", color: "#fff", textAlign: "left", cursor: "pointer" }}
            >
              <span style={{ flex: "0 1 auto", minWidth: 0, maxWidth: "40%", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: d.ownCompany ? "#fff" : "rgba(255,255,255,0.8)" }}>
                {d.isMine ? "You" : d.who}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                {d.products.map((x) => {
                  const info = productInfo(x.productId);
                  return (
                    <span key={String(x.productId)} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                      <Dot color={colorOf(info)} />{info.code} {gal(x.gallons)}
                    </span>
                  );
                })}
              </span>
              <span style={{ color: muted, fontSize: 12, flexShrink: 0 }}>{when(d.leftAt)}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 14px 10px", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0" }}>
                  <span style={{ color: muted }}>Driver</span><span style={{ fontWeight: 700 }}>{d.isMine ? "You" : d.who}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0" }}>
                  <span style={{ color: muted }}>Delivered</span><span style={{ fontWeight: 700 }}>{when(d.leftAt)}</span>
                </div>
                {d.products.map((x, i) => {
                  const info = productInfo(x.productId);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                      <Dot color={colorOf(info)} />
                      <span style={{ flex: 1 }}>{info.code} <span style={{ color: muted }}>{info.name}</span></span>
                      <span style={{ fontWeight: 700 }}>{gal(x.gallons)}</span>
                    </div>
                  );
                })}
                <div style={{ height: 6 }} />
                {d.tanks.length === 0 ? (
                  <div style={{ color: muted }}>No tank readings recorded.</div>
                ) : (
                  <>
                    <div style={{ color: muted, fontSize: 12, marginBottom: 4 }}>Tank levels after</div>
                    {d.tanks.map((t, i) => {
                      const info = productInfo(t.productId);
                      return (
                        <div key={`${t.tankNumber}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                          <Dot color={colorOf(info)} />
                          <span style={{ flex: 1 }}>Tank {t.tankNumber} <span style={{ color: muted }}>{info.code}</span></span>
                          <span style={{ fontWeight: 700 }}>
                            {t.unit === "inches" ? `${t.after.toLocaleString("en-US")} in` : gal(t.after)}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
                {d.tripId && (
                  <button type="button" onClick={() => onOpenTrip(d.tripId!)} {...busyProps(openingId === d.tripId)} style={{ marginTop: 6, padding: 0, border: "none", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Open PTD {openingId === d.tripId ? <Spinner size={11} /> : "›"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {items.length === 0 && <div style={{ ...rowStyle, color: muted }}>No deliveries recorded here yet.</div>}
      <button type="button" onClick={onPickStore} style={{ ...rowStyle, width: "100%", display: "block", background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", color: muted, fontSize: 12, textAlign: "left", cursor: "pointer" }}>
        Change location ›
      </button>
    </div>
  );
}

// ── Conditional cards (render nothing when empty) ──────────────────────────

export function HeadingToTerminalCard({ terminalName, items, productInfo, defaultOpen = false, emptyText }: {
  terminalName: string | null;
  items: HeadingToTerminal[];
  productInfo: ProductInfoFn;
  defaultOpen?: boolean;
  // Shown instead of nothing when the list is empty (inside a sheet).
  emptyText?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) {
    if (!emptyText) return null;
    return <div style={cardStyle}><div style={{ ...rowStyle, borderTop: "none", color: muted }}>{emptyText}</div></div>;
  }
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

export function HeadingToDeliveryCard({ deliveryName, items, productInfo, defaultOpen = false, emptyText }: {
  deliveryName: string | null;
  items: HeadingToDelivery[];
  productInfo: ProductInfoFn;
  defaultOpen?: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) {
    if (!emptyText) return null;
    return <div style={cardStyle}><div style={{ ...rowStyle, borderTop: "none", color: muted }}>{emptyText}</div></div>;
  }
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

export function ParkedPreloadsCard({ items, productInfo, onOpenTrip, openingId }: {
  openingId?: string | null;
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
            {...busyProps(openingId === f.trip.trip_id)}
            style={{ ...rowStyle, width: "100%", display: "block", position: "relative", background: "transparent", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#fff", textAlign: "left", cursor: "pointer" }}
          >
            <CardBusy on={openingId === f.trip.trip_id} />
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
