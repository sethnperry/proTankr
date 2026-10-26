"use client";
// app/planner/modals/loading/PlanCompartments.tsx
//
// Plan Review: the editable compartment list (tap gallons to cap).

import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../../cards/cardTheme";
import type { LoadingModel } from "./useLoadingModel";

export function PlanCompartments({ m }: { m: LoadingModel }) {
  const {
    allPlannedUnavailable,
    busy,
    capOverrides,
    onAdjustPlan,
    openGallonsOverlay,
    plannedBlockRef,
    plannedLines,
    productHexCodeById,
    productNameById,
    styles,
    supplierSection,
    terminalLabel,
    totalPlannedGallons,
  } = m;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {supplierSection}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>
          Planned compartments
        </div>
        {onAdjustPlan && (
          <button
            type="button"
            onClick={onAdjustPlan}
            disabled={busy}
            style={{ background: "none", border: "none", color: "#93c5fd", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
          >
            Adjust plan ›
          </button>
        )}
      </div>

      {plannedLines.length === 0 ? (
        allPlannedUnavailable ? (
          <div
            style={{
              borderRadius: 2,
              border: "1px solid rgba(255,170,60,0.35)",
              background: "rgba(255,170,60,0.10)",
              padding: "10px 12px",
              color: "rgba(255,225,190,0.95)",
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            None of your planned products are sold at {terminalLabel || "this terminal"}. Tap “Didn’t Load / Cancel” below to swap them for
            products carried here.
          </div>
        ) : (
          <div style={styles.help}>No filled compartments in the plan.</div>
        )
      ) : (
        <div ref={plannedBlockRef} style={{ display: "grid", gap: 8 }}>
          {plannedLines.map((x) => {
            const dotColor =
              (productHexCodeById?.[x.productId] && String(productHexCodeById[x.productId]).trim()) || "rgba(255,255,255,0.5)";
            const label = productNameById.get(x.productId) ?? x.productId;
            return (
              <div
                key={`${x.comp}-${x.productId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 2,
                  border: CARD_BORDER,
                  background: CARD_BG,
                  boxShadow: CARD_SHADOW,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.5)", flexShrink: 0, width: 24 }}>C{x.comp}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {label}
                  </span>
                  {capOverrides?.[x.comp] != null && x.gallons >= capOverrides[x.comp] - 1 && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        color: "#fb923c",
                        border: "1px solid rgba(251,146,60,0.5)",
                        borderRadius: 2,
                        padding: "1px 5px",
                      }}
                    >
                      CAPPED
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openGallonsOverlay(x.comp, x.productId, x.gallons)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "2px 6px",
                    cursor: "pointer",
                    textAlign: "right" as const,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{Math.round(x.gallons)}</div>
                </button>
              </div>
            );
          })}

          {/* Total: same card as the compartments above. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 2,
              border: CARD_BORDER,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", flex: "1 1 auto" }}>Total Gallons</span>
            <span style={{ padding: "2px 6px", fontSize: 18, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
              {Math.round(totalPlannedGallons)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
