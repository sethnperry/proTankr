"use client";
// app/planner/modals/myTerminals/RackProductList.tsx
//
// Part of MyTerminalsModal.tsx: the rack's product list (dot, code, name, API and temp).

import type { RackProductStatusRow } from "../rackProductTypes";

export function RackProductList({ expandedRackId, expandedRackProducts, productsById }: {
  expandedRackId: string;
  expandedRackProducts: RackProductStatusRow[];
  productsById: Record<string, any>;
}) {
  return (
    <>
                          {expandedRackId && (
                            <div className="space-y-1.5">
                              {expandedRackProducts.length === 0 ? (
                                <div className="text-xs text-white/35">No products configured for this rack yet.</div>
                              ) : (
                                expandedRackProducts.map((rp) => {
                                  const p = productsById[rp.product_id];
                                  const name = p ? (p.product_name ?? p.display_name ?? "Product") : rp.product_id;
                                  const code = (p?.button_code ?? "").trim();
                                  const color = (p?.hex_code ?? "").trim() || "rgba(255,255,255,0.7)";
                                  return (
                                    <div key={rp.product_id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, opacity: rp.is_out ? 0.5 : 1, minWidth: 0 }}>
                                      <span style={{ display: "flex", alignItems: "baseline", gap: 6, flex: 1, minWidth: 0, overflow: "hidden" }}>
                                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                        <span style={{ color, fontWeight: 800, flexShrink: 0 }}>{code}</span>
                                        <span style={{ color: "#fff", fontWeight: 400, textDecoration: rp.is_out ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, minWidth: 0 }}>
                                          {name}
                                        </span>
                                      </span>
                                      <span style={{ display: "flex", gap: 12, flexShrink: 0, color: "rgba(255,255,255,0.4)" }}>
                                        <span style={{ minWidth: 44, textAlign: "right" as const }}>{rp.last_api != null ? `API ${rp.last_api}` : "API —"}</span>
                                        <span style={{ minWidth: 44, textAlign: "right" as const }}>{rp.last_temp_f != null ? `${rp.last_temp_f}°F` : "—°F"}</span>
                                      </span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
    </>
  );
}
