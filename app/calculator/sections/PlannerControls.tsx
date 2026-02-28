"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

/**
 * PlannerControls
 * - Owns NO state.
 * - Receives everything via props from page.tsx
 * - Pure UI extraction to shrink page.tsx safely.
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
    setCompHeadspacePct,

    // modal state
    compModalOpen,
    compModalComp,

    // NEW: plan slots UI (built in page.tsx)
    snapshotSlots,
  } = props;

  return (
    <section style={{ ...styles.section, border: "none", background: "transparent", padding: 0 }}>
      {!selectedTrailerId && <div style={styles.help}>Select equipment to load compartments.</div>}
      {compError && <div style={styles.error}>Error loading compartments: {compError}</div>}

      

      {/* Plan slots (centered above compartments) */}
      {selectedTrailerId && snapshotSlots ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 8,
            marginBottom: 10,
          }}
        >
          {snapshotSlots}
        </div>
      ) : null}

      {/* Driver compartment strip (primary interface) */}
      {selectedTrailerId && !compLoading && !compError && compartments.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: compartments.length >= 5 ? 6 : 10,
              flexWrap: "nowrap",
              width: "100%",
            }}
          >
            {(() => {
              const n = compartments.length;
              // Each compartment gets an equal share, with a min of 0 and max driven by flex
              // Height scales with number of compartments — fewer comps = taller
              const h = n >= 5 ? "min(280px, 40vw)" : n >= 4 ? "min(300px, 50vw)" : "min(320px, 55vw)";
              const ordered = [...compartments]
                .slice()
                .sort((a: any, b: any) => Number(a.comp_number) - Number(b.comp_number))
                .reverse();

              return ordered.map((c: any) => {
                const compNumber = Number(c.comp_number);
                const trueMax = Number(c.max_gallons ?? 0);
                const headPct = headspacePctForComp(compNumber);
                const effMax = effectiveMaxGallonsForComp(compNumber, trueMax);
                const planned = plannedGallonsByComp?.[compNumber] ?? 0;

                const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
                const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
                const visualTopGap = 0.08;
                const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

                const sel = compPlan?.[compNumber];
                const isEmpty = !!sel?.empty || !sel?.productId;
                const prod = !isEmpty ? terminalProducts.find((p: any) => p.product_id === sel?.productId) : null;

                const productName = isEmpty
                  ? ""
                  : ((prod?.display_name ?? prod?.product_name ?? "").trim() || "Product");

                const code = isEmpty
                  ? "MT"
                  : String(prod?.button_code ?? prod?.product_code ?? (productName.split(" ")[0] || "PRD"))
                      .trim()
                      .toUpperCase();

                const codeColor = isEmpty
                  ? "rgba(180,220,255,0.9)"
                  : typeof prod?.hex_code === "string" && prod.hex_code.trim()
                  ? prod.hex_code.trim()
                  : "rgba(255,255,255,0.9)";

                const atMax = headPct <= 0.000001;

                return (
                  <div
                    key={String(c.comp_number)}
                    onClick={() => {
                      setCompModalComp(compNumber);
                      setCompModalOpen(true);
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
                    {/* Comp number label (amber when at max) */}
                    <div
                      style={{
                        fontSize: "clamp(16px, 3.5vw, 22px)",
                        fontWeight: 800,
                        letterSpacing: 0.2,
                        marginBottom: 8,
                        color: atMax ? "#ffb020" : "rgba(255,255,255,0.72)",
                      }}
                    >
                      {compNumber}
                    </div>

                    {/* Tank */}
                    <div
                      style={{
                        width: "100%",
                        flex: 1,
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.08)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Capped headspace tint (no line) */}
                      {headPct > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 0,
                            height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                            background: "rgba(0,0,0,0.16)",
                          }}
                        />
                      )}

                      {/* Fluid */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: `${fillPct * 100}%`,
                          background: "rgba(185,245,250,0.85)",
                        }}
                      />

                      {/* Wavy surface line */}
                      {fillPct > 0 && (
                        <svg
                          width="100%"
                          height="16"
                          viewBox="0 0 100 16"
                          preserveAspectRatio="none"
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: `calc(${fillPct * 100}% - 8px)`,
                            opacity: 0.9,
                          }}
                        >
                          <path
                            d="M0,8 C10,2 20,14 30,8 C40,2 50,14 60,8 C70,2 80,14 90,8 C95,6 98,6 100,8"
                            fill="none"
                            stroke="rgba(120,210,220,0.95)"
                            strokeWidth="2"
                          />
                        </svg>
                      )}
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
            })()}
          </div>
        </div>
      )}

      {selectedTrailerId && !compLoading && !compError && compartments.length === 0 && (
        <div style={styles.help}>No compartments found for this trailer.</div>
      )}

      <FullscreenModal
        open={compModalOpen}
        title={compModalComp != null ? `Compartment ${compModalComp}` : "Compartment"}
        onClose={() => {
          setCompModalOpen(false);
          setCompModalComp(null);
        }}
      >
        {compModalComp == null ? null : (() => {
          const compNumber = compModalComp;
          const c = compartments.find((x: any) => Number(x.comp_number) === compNumber);
          const trueMax = Number(c?.max_gallons ?? 0);
          const headPct = headspacePctForComp(compNumber);
          const effMax = effectiveMaxGallonsForComp(compNumber, trueMax);
          const sel = compPlan?.[compNumber];
          const isEmpty = !!sel?.empty || !sel?.productId;
          const planned = plannedGallonsByComp?.[compNumber] ?? 0;
          const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
          const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
          const visualTopGap = 0.08;
          const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

          return (
            <div style={{ display: "grid", gap: 16 }}>

              {/* ── Tank + headspace side by side — always, on all screen sizes ── */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>

                {/* Tank visual — compact, fixed width */}
                <div style={{
                  flex: "0 0 auto", width: "min(140px, 38vw)",
                  borderRadius: 16, background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)", padding: 10,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>Max</div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{Math.round(trueMax)} gal</div>
                  </div>

                  {/* Tank body */}
                  <div style={{ height: "min(200px, 46vw)", borderRadius: 12, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
                    {/* Headspace tint */}
                    {headPct > 0 && (
                      <div style={{ position: "absolute", left: 0, right: 0, top: 0,
                        height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                        background: "rgba(255,160,0,0.18)",
                        borderBottom: "1px dashed rgba(255,160,0,0.4)" }} />
                    )}
                    {/* Fill */}
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0,
                      height: `${fillPct * 100}%`, background: "rgba(185,245,250,0.85)" }} />
                    {/* Wave */}
                    {fillPct > 0 && (
                      <svg width="100%" height="16" viewBox="0 0 100 16" preserveAspectRatio="none"
                        style={{ position: "absolute", left: 0, right: 0, bottom: `calc(${fillPct * 100}% - 8px)`, opacity: 0.9 }}>
                        <path d="M0,8 C10,2 20,14 30,8 C40,2 50,14 60,8 C70,2 80,14 90,8 C95,6 98,6 100,8"
                          fill="none" stroke="rgba(120,210,220,0.95)" strokeWidth="2" />
                      </svg>
                    )}
                    {/* Headspace % label inside tint */}
                    {headPct > 0.04 && (
                      <div style={{ position: "absolute", top: "50%", left: 0, right: 0,
                        transform: `translateY(calc(-50% + ${(headPct * -0.5) * 100}%))`,
                        textAlign: "center", fontSize: 10, fontWeight: 800,
                        color: "rgba(255,160,0,0.85)", pointerEvents: "none" }}>
                        {Math.round(headPct * 100)}%
                      </div>
                    )}
                  </div>

                  {/* Capped at label */}
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 10, opacity: 0.6 }}>Capped</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: headPct > 0 ? "#fbbf24" : "rgba(255,255,255,0.85)" }}>
                      {Math.round(effMax)} gal
                    </div>
                  </div>
                </div>

                {/* Headspace controls — fill remaining space */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>
                    Headspace
                  </div>

                  {/* Horizontal slider */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min={0} max={30} step={1}
                      value={Math.round(headPct * 100)}
                      onChange={(e) => {
                        const pct = Number(e.target.value) / 100;
                        setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: pct }));
                      }}
                      style={{ flex: 1, height: 36, accentColor: "#fbbf24", cursor: "pointer" }}
                    />
                    <div style={{ ...styles.badge, minWidth: 38, textAlign: "center", color: headPct > 0 ? "#fbbf24" : undefined }}>
                      {Math.round(headPct * 100)}%
                    </div>
                  </div>

                  {/* Manual gallon input */}
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>Set cap (gallons)</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="number" inputMode="numeric" value={Math.round(effMax)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v) || trueMax <= 0) return;
                          const capped = Math.max(0, Math.min(trueMax, v));
                          const pct = Math.max(0, Math.min(0.95, 1 - capped / trueMax));
                          setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: pct }));
                        }}
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <button style={{ ...styles.smallBtn, flexShrink: 0 }}
                        onClick={() => setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: 0 }))}>
                        Max
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.4 }}>
                    Set headspace to load safely below the top probe. 0% = fill to compartment max.
                  </div>
                </div>
              </div>

                {/* Product selection */}
                <div style={{ display: "grid", gap: 10 }}>
                  <strong style={{ fontSize: 14 }}>Product for Comp {compNumber}</strong>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: 10 }}>
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
                        setCompPlan((prev: any) => ({
                          ...prev,
                          [compNumber]: { empty: true, productId: "" },
                        }));
                        setCompModalOpen(false);
                        setCompModalComp(null);
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 54,
                            height: 44,
                            borderRadius: 12,
                            border: "1px solid rgba(180,220,255,0.9)",
                            background: "rgba(0,0,0,0.35)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                            letterSpacing: 0.5,
                            color: "rgba(180,220,255,0.9)",
                            flex: "0 0 auto",
                          }}
                        >
                          MT
                        </div>
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 800 }}>MT (Empty)</div>
                          <div style={{ opacity: 0.7, fontSize: 13 }}>Leave this compartment empty</div>
                        </div>
                      </div>
                    </button>

                    {terminalProducts.map((p: any) => {
                      const selected = !isEmpty && sel?.productId === p.product_id;
                      const btnCode = ((p.button_code ?? p.product_code ?? "").trim() || "PRD").toUpperCase();
                      const btnColor = (p.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
                      const name = (p.product_name ?? p.display_name ?? "").trim() || "Product";
                      const sub = (p.description ?? "").trim();

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
                            setCompPlan((prev: any) => ({
                              ...prev,
                              [compNumber]: { empty: false, productId: p.product_id },
                            }));
                            setCompModalOpen(false);
                            setCompModalComp(null);
                          }}
                          title={name}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                              style={{
                                width: 54,
                                height: 44,
                                borderRadius: 12,
                                backgroundColor: "transparent",
                                border: `2px solid ${btnColor}`,
                                boxShadow: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 900,
                                letterSpacing: 0.5,
                                color: btnColor,
                                flex: "0 0 auto",
                              }}
                            >
                              {btnCode.toUpperCase()}
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
              </div>
            </div>
          );
        })()}
      </FullscreenModal>
    </section>
  );
}
