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
    <section style={styles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Compartments</h2>
        <span style={styles.badge}>
          {!selectedTrailerId
            ? "Select equipment"
            : compLoading
            ? "Loading…"
            : `${compartments.length} compartments`}
        </span>
      </div>

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
              gap: compartments.length >= 5 ? 10 : 18,
              flexWrap: "nowrap",
            }}
          >
            {(() => {
              const n = compartments.length;
              const baseW = n === 1 ? 220 : 160;
              const w = n >= 5 ? 132 : baseW;
              const h = 330;
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
                  : String(prod?.button_code ?? prod?.product_code ?? (productName.split(/\s+/)[0] || "PRD"))
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
                      width: w,
                      height: h,
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      padding: 14,
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
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: 0.2,
                        marginBottom: 10,
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
                        marginTop: 12,
                        width: 78,
                        height: 52,
                        borderRadius: 14,
                        backgroundColor: "transparent",
                        border: `2px solid ${isEmpty ? "rgba(180,220,255,0.55)" : codeColor}`,
                        boxShadow: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 20,
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

          return (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ ...styles.help }}>
                Adjust headspace to stay safely below the top probe and set the product for compartment{" "}
                <strong>{compNumber}</strong>.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
                <div style={{ display: "flex", gap: 18, alignItems: "stretch", flexWrap: "wrap" }}>
                  {/* Comp visual */}
                  <div
                    style={{
                      width: 240,
                      maxWidth: "100%",
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      padding: 14,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, opacity: 0.9 }}>Max Volume</div>
                      <div style={{ fontWeight: 800 }}>{Math.round(trueMax)} gal</div>
                    </div>

                    <div
                      style={{
                        height: 280,
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.08)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Capped headspace tint */}
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

                      {(() => {
                        const planned = plannedGallonsByComp?.[compNumber] ?? 0;
                        const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
                        const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
                        const visualTopGap = 0.08;
                        const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

                        return (
                          <>
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
                          </>
                        );
                      })()}
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 700, opacity: 0.9 }}>Capped at</div>
                      </div>

                      <input
                        type="number"
                        inputMode="numeric"
                        value={Math.round(effMax)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v) || trueMax <= 0) return;
                          const capped = Math.max(0, Math.min(trueMax, v));
                          const pct = Math.max(0, Math.min(0.95, 1 - capped / trueMax));
                          setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: pct }));
                        }}
                        style={{ ...styles.input, width: "100%" }}
                      />

                      <button
                        style={{ ...styles.smallBtn, width: "100%" }}
                        onClick={() => setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: 0 }))}
                      >
                        Return to max
                      </button>
                    </div>
                  </div>

                  {/* Vertical slider (headspace %) */}
                  <div style={{ display: "grid", alignContent: "start", justifyItems: "center", paddingTop: 10, minWidth: 90 }}>
                    <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 10 }}>Headspace</div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={Math.round(headPct * 100)}
                      onChange={(e) => {
                        const pct = Number(e.target.value) / 100;
                        setCompHeadspacePct((prev: any) => ({ ...prev, [compNumber]: pct }));
                      }}
                      style={{
                        height: 280,
                        width: 28,
                        WebkitAppearance: "slider-vertical" as any,
                        writingMode: "bt-lr" as any,
                      }}
                    />
                    <div style={{ ...styles.badge, marginTop: 10 }}>{Math.round(headPct * 100)}%</div>
                  </div>
                </div>

                {/* Product selection */}
                <div style={{ display: "grid", gap: 10 }}>
                  <strong>Product</strong>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: 12,
                    }}
                  >
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
