"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

/**
 * PlannerControls
 * - Receives state + setters from parent (page.tsx)
 * - Keeps this file build-safe (Turbopack friendly)
 */
export default function PlannerControls(props: any) {
  const {
    styles,

    // compartments data
    selectedTrailerId,
    compLoading,
    compartments,
    compError,

    // computed helpers + plan state
    headspacePctForComp,
    effectiveMaxGallonsForComp,
    plannedGallonsByComp,
    compPlan,
    terminalProducts,

    // setters for modal + plan
    setCompModalComp,
    setCompModalOpen,
    setCompPlan,

    // modal state
    compModalOpen,
    compModalComp,

    // plan slots UI (built in page.tsx)
    snapshotSlots,
  } = props;

  const renderCompStrip = () => {
    const n = Array.isArray(compartments) ? compartments.length : 0;

    // Height scales with number of compartments - fewer comps = taller
    const h = n >= 5 ? "min(280px, 40vw)" : n >= 4 ? "min(300px, 50vw)" : "min(320px, 55vw)";
    const ordered = [...(compartments ?? [])]
      .slice()
      .sort((a: any, b: any) => Number(a.comp_number) - Number(b.comp_number))
      .reverse();

    return ordered.map((c: any) => {
      const compNumber = Number(c.comp_number);
      const trueMax = Number(c.max_gallons ?? 0);
      const headPct = headspacePctForComp?.(compNumber) ?? 0;
      const effMax = effectiveMaxGallonsForComp?.(compNumber, trueMax) ?? trueMax;
      const planned = plannedGallonsByComp?.[compNumber] ?? 0;

      const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
      const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
      const visualTopGap = 0.08;
      const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

      const sel = compPlan?.[compNumber];
      const isEmpty = !!sel?.empty || !sel?.productId;

      const code = isEmpty ? "MT" : String(sel?.productId ?? "PRD");
      // Color selection (safe fallback)
      let codeColor = "rgba(255,255,255,0.9)";
      if (isEmpty) codeColor = "rgba(180,220,255,0.9)";
      else if (typeof sel?.hex_code === "string" && sel.hex_code.trim()) codeColor = sel.hex_code.trim();

      const atMax = headPct <= 0.000001;

      return (
        <div
          key={String(compNumber)}
          onClick={() => {
            setCompModalComp?.(compNumber);
            setCompModalOpen?.(true);
          }}
          style={{
            flex: "1 1 0",
            minWidth: 0,
            height: h,
            borderRadius: 18,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            padding: "10px 6px 10px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            userSelect: "none",
          }}
          title={`Comp ${compNumber}`}
        >
          <div
            style={{
              fontSize: "clamp(16px, 3.5vw, 22px)",
              fontWeight: 800,
              letterSpacing: 0.2,
              marginBottom: 8,
              color: atMax ? "#ffb020" : "rgba(255,255,255,0.92)",
            }}
          >
            {compNumber}
          </div>

          {/* Tank */}
          <div
            style={{
              position: "relative",
              width: "80%",
              flex: 1,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            {/* Fill */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: `${Math.round(fillPct * 100)}%`,
                background: "rgba(90,180,255,0.35)",
              }}
            />
          </div>

          {/* Product button */}
          <div
            style={{
              marginTop: 8,
              width: "80%",
              minWidth: 0,
              height: 44,
              borderRadius: 12,
              backgroundColor: "transparent",
              border: `2px solid ${isEmpty ? "rgba(180,220,255,0.55)" : codeColor}`,
              boxShadow: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "clamp(13px, 3.5vw, 20px)",
              color: isEmpty ? "rgba(180,220,255,0.92)" : codeColor,
            }}
          >
            {code}
          </div>

          {/* Planned gallons */}
          <div style={{ marginTop: 8, fontSize: 16, color: "rgba(220,220,220,0.85)" }}>
            {planned > 0 ? Math.round(planned).toString() : ""}
          </div>
        </div>
      );
    });
  };

  const renderCompModal = () => {
    if (compModalComp == null) return null;

    const compNumber = Number(compModalComp);
    const sel = compPlan?.[compNumber];
    const isEmpty = !!sel?.empty || !sel?.productId;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          Select product for <strong>Comp {compNumber}</strong>
        </div>

        {/* MT / Empty */}
        <button
          style={{
            textAlign: "left",
            padding: 14,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.14)",
            background: isEmpty ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
            color: "white",
            cursor: "pointer",
          }}
          onClick={() => {
            setCompPlan?.((prev: any) => ({
              ...prev,
              [compNumber]: { empty: true, productId: "" },
            }));
            setCompModalOpen?.(false);
            setCompModalComp?.(null);
          }}
        >
          <div style={{ fontWeight: 800 }}>MT (Empty)</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Leave this compartment empty</div>
        </button>

        <div style={{ display: "grid", gap: 10 }}>
          {(terminalProducts ?? []).map((p: any) => {
            const selected = !isEmpty && sel?.productId === p.product_id;
            const name = (p.product_name ?? p.display_name ?? p.product_code ?? "Product").toString();
            const sub = (p.description ?? "").toString();
            const btnCode = ((p.button_code ?? p.product_code ?? "PRD").toString().trim() || "PRD").toUpperCase();

            return (
              <button
                key={p.product_id}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: selected ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setCompPlan?.((prev: any) => ({
                    ...prev,
                    [compNumber]: { empty: false, productId: p.product_id },
                  }));
                  setCompModalOpen?.(false);
                  setCompModalComp?.(null);
                }}
                title={name}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 54,
                      height: 44,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.20)",
                      background: "rgba(0,0,0,0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      letterSpacing: 0.5,
                      color: "rgba(255,255,255,0.92)",
                      flex: "0 0 auto",
                    }}
                  >
                    {btnCode}
                  </div>
                  <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: 13, lineHeight: 1.25 }}>{sub || "\u00A0"}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section style={{ ...(styles?.section ?? {}), border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles?.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles?.error}>Error loading compartments: {compError}</div>}

      {/* Plan slots (centered above compartments) */}
      {snapshotSlots ? (
        <div style={{ marginTop: 8, marginBottom: 10 }}>
          {snapshotSlots}
        </div>
      ) : null}

      {/* Driver compartment strip (primary interface) */}
      {selectedTrailerId && !compLoading && !compError && (compartments?.length ?? 0) > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: (compartments?.length ?? 0) >= 5 ? 6 : 10,
              flexWrap: "nowrap",
              width: "100%",
            }}
          >
            {renderCompStrip()}
          </div>
        </div>
      )}

      {selectedTrailerId && !compLoading && !compError && (compartments?.length ?? 0) === 0 && (
        <div style={styles?.help}>No compartments found for this trailer.</div>
      )}

      <FullscreenModal
        open={!!compModalOpen}
        title={compModalComp != null ? `Compartment ${compModalComp}` : "Compartment"}
        onClose={() => {
          setCompModalOpen?.(false);
          setCompModalComp?.(null);
        }}
      >
        {renderCompModal()}
      </FullscreenModal>
    </section>
  );
}
