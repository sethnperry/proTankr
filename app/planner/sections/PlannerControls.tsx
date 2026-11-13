"use client";

import React from "react";
import { HEADSPACE_SCALE } from "../utils/headspace";

/**
 * PlannerControls - compartment strip.
 * Tall thin bars, product color fill from bottom, product code below, comp
 * number above. Gallons show under a bar only when the driver set a custom
 * cap. Tapping anywhere on a compartment opens its detail window, where the
 * caps are changed.
 */
export default function PlannerControls(props: any) {
  const {
    styles, selectedTrailerId, compLoading, compartments, compError,
    persistedCapForComp, effectiveMaxGallonsForComp, plannedGallonsByComp,
    compPlan, setCompPlan, terminalProducts, selectedComp, onSelectComp,
    selectedTerminalId, isLandscape,
  } = props;
  // Reverted 2026-09-02: an earlier pass made this whole chain (section ->
  // bar-holder wrapper -> bar-columns row -> each bar) grow to fill
  // whatever height page.tsx's row gave this component, matching the
  // info-card column's own (often taller) height -- explicit follow-up
  // rejected that outright ("we definitely don't want to stretch the
  // compartment height at all... same ratio no matter the screen size,
  // let's not even scale it, just shift it over"). The bar height is back
  // to a fixed clamp (see barH below) in every orientation; nothing in
  // this component stretches to match a sibling anymore.
  // Fixed white now, per explicit direction ("change the compartment
  // handles... to white") -- was themeFill(darkMode, accentColor), which
  // rendered graphite/accent-tinted; this element no longer follows the
  // accent color at all.
  
  return (
    <section style={{ border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles.error}>Error loading compartments: {compError}</div>}

      {selectedTrailerId && !compLoading && !compError && compartments.length > 0 && (
        <div style={{ marginTop: 6, marginBottom: 2, position: "relative" as const }}>
          <div style={{
            display: "flex",
            justifyContent: "center",
            // Widened for portrait -- per explicit direction ("the
            // compartments are too close and cluttered looking in
            // portrait mode") -- landscape untouched (its own fixed-width
            // + uniform-scale sizing model, unrelated to this and
            // explicitly deferred: "next we can fix the landscape").
            // BAR_GAP below (used for the width calc) must stay in sync
            // with this value or the bars would overflow/underflow their
            // container.
            gap: isLandscape ? 12 : 20,
            flexWrap: "nowrap",
            width: "100%",
            alignItems: "flex-end",
            // Room for the custom-cap gallons hung below the bars.
            paddingBottom: compartments.some((c: any) => compPlan?.[Number(c.comp_number)]?.capOverride != null) ? 20 : 0,
          }}>
            {(() => {
              const n = compartments.length;
              // Landscape: a single FIXED reference height (not a vh- or
              // vw-based formula) -- page.tsx's own uniform transform:scale
              // on the whole compartments+buttons(+recap) block is what
              // adapts this to the actual screen size now, and it needs
              // ONE stable pre-scale value to scale correctly. A
              // viewport-relative formula here would be a SECOND,
              // uncoordinated scaling mechanism layered on top of the
              // outer one -- exactly what caused the bars to visibly
              // distort (different aspect ratios at different screen
              // sizes) in an earlier pass: this component's own vh-clamp
              // varied with viewport HEIGHT while the outer wrapper scaled
              // by WIDTH, so the two compounded into a shape that changed
              // with screen size instead of staying locked. 100px is the
              // reference value the outer scale multiplies from.
              // Drawn HEADSPACE_SCALE (110%) taller than the old bars: the
              // fill and cap handle below are measured against this scaled
              // height, so a full compartment stops short of the top and the
              // headspace is visible.
              const barH = isLandscape
                ? `${Math.round(100 * HEADSPACE_SCALE)}px`
                : n >= 5 ? `calc(min(110px, 20vw) * ${HEADSPACE_SCALE})` : n >= 4 ? `calc(min(120px, 22vw) * ${HEADSPACE_SCALE})` : `calc(min(130px, 25vw) * ${HEADSPACE_SCALE})`;

              const ordered = [...compartments]
                .sort((a: any, b: any) => Number(a.comp_number) - Number(b.comp_number))
                .reverse(); // right-to-left display (5,4,3,2,1)

              // Total physical capacity for proportional widths -- widths
              // reflect the compartment's real size on the trailer, not a
              // temporarily-adjusted cap.
              const totalCap = ordered.reduce((sum: number, c: any) => sum + Number(c.max_gallons ?? 0), 0);
              const gapPx = isLandscape ? 12 : 20;

              return ordered.map((c: any) => {
                const trueMax = Number(c.max_gallons ?? 0);
                const capFraction = totalCap > 0 ? trueMax / totalCap : 1 / n;
                const barW = `calc(${(capFraction * 100).toFixed(4)}% - ${((n - 1) * gapPx / n).toFixed(2)}px)`;
                const compNumber = Number(c.comp_number);
                const persistedCap: number = persistedCapForComp(compNumber);
                const effMax = effectiveMaxGallonsForComp(compNumber, persistedCap);
                const hasOverride = compPlan?.[compNumber]?.capOverride != null;
                const planned = plannedGallonsByComp?.[compNumber] ?? 0;
                // Percentages are of the SCALED bar (trueMax * 110%), which is
                // what leaves visible headspace above a full compartment.
                const scaledMax = trueMax * HEADSPACE_SCALE;
                const plannedPct = scaledMax > 0 ? Math.max(0, Math.min(1, planned / scaledMax)) : 0;
                const capPct = scaledMax > 0 ? Math.max(0, Math.min(1, effMax / scaledMax)) : 0;
                const fillPct = Math.max(0, Math.min(plannedPct, capPct));

                const sel = compPlan?.[compNumber];
                const isEmpty = !!sel?.empty || !sel?.productId;
                const prod = !isEmpty ? terminalProducts.find((p: any) => p.product_id === sel?.productId) : null;
                // A product selected but not found among this terminal's own
                // products means the plan (almost always a preset loaded
                // from a different terminal) references something not sold
                // here -- distinct from "empty," needs its own callout, not
                // a silent generic-teal fallback.
                const notAvailable = !isEmpty && !prod;
                const productName = isEmpty ? "" : ((prod?.display_name ?? prod?.product_name ?? "").trim() || "Product");
                const code = isEmpty
                  ? "MT"
                  : notAvailable
                    ? "N/A"
                    : String(prod?.button_code ?? prod?.product_code ?? (productName.split(" ")[0] || "PRD")).trim().toUpperCase();

                // Product fill color — use hex_code if available
                const hexColor = typeof prod?.hex_code === "string" && prod.hex_code.trim() ? prod.hex_code.trim() : null;
                const fillColor = isEmpty
                  ? "rgba(255,255,255,0.08)"
                  : notAvailable
                    ? "repeating-linear-gradient(135deg, rgba(239,68,68,0.35) 0px, rgba(239,68,68,0.35) 6px, rgba(239,68,68,0.15) 6px, rgba(239,68,68,0.15) 12px)"
                    : (hexColor ?? "rgba(64,220,200,0.82)");
                const codeColor = isEmpty ? "rgba(255,255,255,0.30)" : notAvailable ? "#ef4444" : (hexColor ?? "rgba(255,255,255,0.85)");

                const capLineTopPct = (1 - capPct) * 100;
                return (
                  <div
                    key={String(c.comp_number)}
                    onClick={() => onSelectComp?.(compNumber)}
                    title={`Comp ${compNumber}`}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      cursor: "pointer", userSelect: "none", position: "relative",
                      width: barW, flexShrink: 0, flexGrow: 0,
                    }}
                  >
                    {/* Comp number above, with a reset control when a temporary
                        override is active. marginBottom is 8 (not 4) so the
                        cap dimmer's dashed boundary -- which sits flush at the
                        bar's top edge when a compartment's cap is at/near its
                        full max -- never visually touches this label. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                      <div style={{
                        fontSize: "clamp(11px, 2.4vw, 13px)", fontWeight: 700,
                        color: hasOverride ? "#ffb020" : "rgba(255,255,255,0.45)",
                        letterSpacing: 0.2,
                      }}>
                        {compNumber}
                      </div>
                    </div>

                    {/* Bar — no border, square corners, flat bottom. Selection
                        state (surfaces "Edit Comp N Product" in the action row
                        above) is tracked but no longer drawn as a ring here.
                        Always a fixed height (barH) -- reverted 2026-09-02,
                        see the header comment above: an earlier pass let
                        this grow via flex:1 to match the info-card column's
                        height in landscape, which is exactly what explicit
                        follow-up rejected ("we definitely don't want to
                        stretch the compartment height at all"). */}
                    <div style={{
                      width: "100%",
                      height: barH,
                      borderRadius: 0,
                      background: "rgba(255,255,255,0.06)",
                      position: "relative", overflow: "visible",
                    }}>
                      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 0 }}>
                        {/* Dimmer above the cap line -- unusable for this load */}
                        {capPct < 0.999 && (
                          <div style={{
                            position: "absolute", left: 0, right: 0, top: 0,
                            height: `${Math.max(0, (1 - capPct)) * 100}%`,
                            background: "rgba(0,0,0,0.22)",
                            borderBottom: "1px dashed rgba(255,160,0,0.4)",
                          }} />
                        )}

                        {/* Product fill — from bottom, full bar width */}
                        <div style={{
                          position: "absolute", left: 0, right: 0, bottom: 0,
                          height: `${fillPct * 100}%`,
                          background: fillColor,
                          transition: "height 300ms ease, background 200ms ease",
                        }} />
                      </div>

                    </div>

                    {/* Product code — outside bar, below, colored */}
                    <div style={{
                      marginTop: 5,
                      fontSize: "clamp(11px, 2.8vw, 14px)", fontWeight: 800,
                      color: codeColor,
                      letterSpacing: 0.3,
                    }}>
                      {code}
                    </div>

                    {/* Gallons only when the driver set a custom cap. Hung below the
                        column (not in the flow) so bars never shift; the strip
                        pads its bottom to make room instead. */}
                    {hasOverride && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, textAlign: "center", marginTop: 2, fontSize: "clamp(10px, 2.4vw, 13px)", fontWeight: 600, color: "rgba(140,140,140,0.9)", letterSpacing: -0.2 }}>
                        {Math.round(effMax).toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {selectedTrailerId && !compLoading && !compError && compartments.length === 0 && (
        <div style={styles.help}>No compartments found for this trailer.</div>
      )}

    </section>
  );
}
