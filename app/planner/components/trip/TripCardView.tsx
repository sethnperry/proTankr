"use client";
// app/planner/components/trip/TripCardView.tsx
//
// The trip card: trailer bars, status heading, shipper → customer, the plan
// line, then the pickup and delivery rows. Presentational only. The driver's
// dashboard and the dispatcher's Plan board both render it, so a driver and a
// dispatcher read the same card. Each adds its own extras and footer.
import React from "react";
import type { CardRow } from "@/lib/trips/cardRows";

const muted = "rgba(255,255,255,0.5)";
const cardStyle: React.CSSProperties = {
  borderRadius: 2, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", padding: "12px 14px",
};

export type CardPlan = { label: string; comps: ({ code: string; color: string | null } | null)[] };

const labelColor = (tone: CardRow["tone"]) => (tone === "done" ? "#4ade80" : tone === "here" ? "#fff" : muted);

export function TripCardView(p: {
  bar?: React.ReactNode;
  heading: string;
  right?: React.ReactNode;
  route?: string | null;
  plan?: CardPlan | null;
  pickups: CardRow[];
  deliveries: CardRow[];
  /** Shown when the trip has no delivery yet (the driver's is a button). */
  noDelivery?: React.ReactNode;
  /** Makes a delivery's name tappable (the driver's reroute). */
  onDelivery?: (key: string) => void;
  extras?: React.ReactNode;
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ ...cardStyle, ...p.style }}>
      {p.bar && <div style={{ marginBottom: 8 }}>{p.bar}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{p.heading}</div>
        {p.right && <span style={{ marginLeft: "auto" }}>{p.right}</span>}
      </div>
      {p.route && <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{p.route}</div>}
      {p.plan && (
        <div className="dash-num" style={{ fontSize: 13, marginTop: 2, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          {p.plan.label && <><span style={{ fontWeight: 800 }}>{p.plan.label}</span><span style={{ color: muted }}>-</span></>}
          <span>
            {p.plan.comps.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: muted }}>/</span>}
                <span style={{ fontWeight: 800, color: c ? c.color ?? "#fff" : muted }}>{c ? c.code : "–"}</span>
              </React.Fragment>
            ))}
          </span>
        </div>
      )}

      {p.pickups.map((r, i) => r.tone === "tried" ? (
        <div key={r.key} style={{ fontSize: 14, marginTop: i === 0 ? 10 : 4, display: "flex", gap: 6, alignItems: "baseline" }}>
          <span style={{ color: muted, width: 66, flexShrink: 0 }}>{r.label}</span>
          <div className="pt-tabscroll" style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "nowrap" }}>
            <span style={{ color: muted, textDecoration: "line-through" }}>{r.name}</span>
            <span style={{ color: "#f87171", marginLeft: 8, fontSize: 13 }}>{r.reason}</span>
          </div>
        </div>
      ) : (
        <div key={r.key} style={{ fontSize: 14, marginTop: i === 0 ? 10 : 4 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ color: labelColor(r.tone), width: 66, flexShrink: 0, fontWeight: r.tone === "here" ? 700 : undefined }}>{r.label}</span>
            <span style={{ flex: 1, minWidth: 0, color: r.placeBright ? "#fff" : muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.place || "—"}</span>
            <span style={{ color: r.nameBright ? "#fff" : muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "55%" }}>{r.name}</span>
          </div>
        </div>
      ))}

      {p.deliveries.length === 0 && p.noDelivery}
      {p.deliveries.map((r) => {
        const nameStyle: React.CSSProperties = { color: r.nameBright ? "#fff" : muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "55%", fontSize: 14 };
        return (
          <div key={r.key} style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
            <span style={{ color: labelColor(r.tone), width: 66, flexShrink: 0, fontWeight: r.tone === "here" ? 700 : undefined }}>{r.label}</span>
            <span style={{ flex: 1, minWidth: 0, color: r.placeBright ? "#fff" : muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.place || "—"}</span>
            {r.tone === "done" || !p.onDelivery ? (
              <span style={nameStyle}>{r.name}</span>
            ) : (
              <button type="button" onClick={() => p.onDelivery!(r.key)} aria-label={`Change ${r.name}`}
                style={{ ...nameStyle, background: "none", border: "none", padding: 0, textAlign: "right", cursor: "pointer" }}>
                {r.name} ›
              </button>
            )}
          </div>
        );
      })}
      {p.extras}
      {p.footer}
    </div>
  );
}
