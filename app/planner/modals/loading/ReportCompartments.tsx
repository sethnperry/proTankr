"use client";
// app/planner/modals/loading/ReportCompartments.tsx
//
// Load report: the read-only compartment list.

import { fmtTime } from "../../components/trip/tripUi";
import type { LoadingModel } from "./useLoadingModel";

export function ReportCompartments({ m }: { m: LoadingModel }) {
  const { productHexCodeById, productNameById, reportByProduct, reportLinesSorted, reportTotalGallons, reportTotalLbs, trip } = m;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.2, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const }}
      >
        Compartments
      </div>
      {reportLinesSorted.map((l) => {
        const dotColor = (productHexCodeById?.[l.productId] && String(productHexCodeById[l.productId]).trim()) || "rgba(255,255,255,0.5)";
        const label = productNameById.get(l.productId) ?? l.productId;
        return (
          <div key={`${l.comp}-${l.productId}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", flexShrink: 0, width: 20 }}>C{l.comp}</span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                flex: "1 1 auto",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
              }}
            >
              {label}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
              {Math.round(l.gallons)} gal
            </span>
          </div>
        );
      })}

      {trip &&
        (() => {
          // BOL and supplier per BOL, with the compartments on it. Net
          // gallons are billing-only (PTD), so the recap doesn't show them.
          const groups: { bol: string; supplier: string; comps: number[] }[] = [];
          for (const l of reportLinesSorted) {
            const d = trip.compDefaults[l.comp];
            if (!d) continue;
            const bol = d.bol || "—";
            const supplier = d.supplier || "No supplier";
            const g = groups.find((x) => x.bol === bol && x.supplier === supplier);
            if (g) g.comps.push(l.comp);
            else groups.push({ bol, supplier, comps: [l.comp] });
          }
          if (!groups.length) return null;
          const tm = trip.existingTimes;
          return (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                marginTop: 6,
                padding: "6px 10px",
                borderRadius: 2,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {groups.map((g) => (
                <div
                  key={`${g.bol}|${g.supplier}`}
                  style={{ display: "flex", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.55)", minWidth: 0 }}
                >
                  <span
                    style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}
                  >
                    BOL {g.bol} · {g.supplier}
                  </span>
                  <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>
                    {g.comps.map((c) => `C${c}`).join(" ")}
                  </span>
                </div>
              ))}
              {tm && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap" as const,
                    gap: "2px 12px",
                    paddingTop: 4,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  <span>Arrived {fmtTime(tm.arrivedAt)}</span>
                  <span>Began {fmtTime(tm.beginAt)}</span>
                  <span>Departed {fmtTime(tm.leftAt)}</span>
                </div>
              )}
            </div>
          );
        })()}

      {/* Totals -- per-product sums (2+ distinct products only, see
                below) plus the whole-load Total, grouped inside one bordered
                box so they read as their own distinct "totals" section
                instead of blending into the raw compartment list above --
                per explicit follow-up, same bordered-box treatment already
                used for the Actual Weight card further down. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          marginTop: 6,
          padding: "6px 10px",
          borderRadius: 2,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        {/* Only meaningful with 2+ distinct products -- with just one,
                  this line would just repeat the Total line below it. */}
        {reportByProduct.length > 1 &&
          reportByProduct.map((p) => {
            const dotColor =
              (productHexCodeById?.[p.productId] && String(productHexCodeById[p.productId]).trim()) || "rgba(255,255,255,0.5)";
            const label = productNameById.get(p.productId) ?? p.productId;
            return (
              <div key={p.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 2px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.45)",
                    flex: "1 1 auto",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {label} total
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>
                  {Math.round(p.gallons)} gal
                </span>
              </div>
            );
          })}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "5px 2px 2px",
            marginTop: reportByProduct.length > 1 ? 2 : 0,
            borderTop: reportByProduct.length > 1 ? "1px solid rgba(255,255,255,0.10)" : "none",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "rgba(255,255,255,0.45)",
              letterSpacing: 0.4,
              textTransform: "uppercase" as const,
            }}
          >
            Total
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>
            {Math.round(reportTotalGallons)} gal · {Math.round(reportTotalLbs).toLocaleString()} lbs
          </span>
        </div>
      </div>
    </div>
  );
}
