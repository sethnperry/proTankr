"use client";
// app/planner/modals/CompartmentModal.tsx
// Product-selection-only. Headspace/cap editing moved to Binder's
// Compartments section (per-trailer, persisted cap_gallons) -- the
// planner's drag handle on each bar now handles temporary per-load
// adjustments directly, so there's no longer a "settings" concern here.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ManageTerminalProductsModal from "./ManageTerminalProductsModal";

export default function CompartmentModal({
  open,
  compNumber,
  compartments,
  compPlan,
  terminalProducts,
  styles,
  setCompPlan,
  onClose,
  selectedRackId,
  rackName,
  terminalName,
  onTerminalProductsChanged,
  myRole,
}: {
  open: boolean;
  compNumber: number | null;
  compartments: any[];
  compPlan: any;
  terminalProducts: any[];
  styles: any;
  setCompPlan: (fn: any) => void;
  onClose: () => void;
  selectedRackId?: string;
  rackName?: string;
  terminalName?: string;
  onTerminalProductsChanged?: () => void;
  myRole?: string | null;
}) {
  // Curating a terminal's active product list affects every driver who loads
  // there company-wide -- matches the equipment-cap gating precedent, not a
  // per-driver preference.
  const canManageProducts = myRole === "admin" || myRole === "dispatch" || myRole === "lead";
  const [manageOpen, setManageOpen] = useState(false);
  if (compNumber == null) return null;

  const sel = compPlan?.[compNumber];
  const isEmpty = !!sel?.empty || !sel?.productId;
  // A product selected but not among this terminal's own products -- almost
  // always a preset loaded from a different terminal. Called out explicitly
  // rather than just silently showing no row checked.
  const notAvailable = !isEmpty && !terminalProducts.some((p: any) => p.product_id === sel?.productId);

  const rowStyle = (active: boolean): React.CSSProperties => ({
    textAlign: "left", padding: "12px 14px", borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
    color: "white", cursor: "pointer",
    width: "100%", boxSizing: "border-box" as const, overflow: "hidden",
    display: "flex", alignItems: "center", gap: 12,
  });

  return (
    <FullscreenModal open={open} title={`Compartment ${compNumber}`} onClose={onClose}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
          Product for Comp {compNumber}
        </div>
        {notAvailable && (
          <div style={{ padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)", color: "#fca5a5", fontSize: 13, fontWeight: 700 }}>
            ⚠ Product Not Available at this terminal — choose a replacement below.
          </div>
        )}
        <div style={{ display: "grid", gap: 6 }}>

          {/* MT / Empty */}
          <button
            style={rowStyle(isEmpty)}
            onClick={() => {
              setCompPlan((prev: any) => ({ ...prev, [compNumber]: { ...(prev[compNumber] ?? {}), empty: true, productId: "" } }));
              onClose();
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>MT (Empty)</div>
              <div style={{ opacity: 0.5, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>Leave this compartment empty</div>
            </div>
            {isEmpty && <span style={{ fontSize: 15, color: "#fff", flexShrink: 0 }}>✓</span>}
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
                style={rowStyle(selected)}
                onClick={() => {
                  setCompPlan((prev: any) => ({ ...prev, [compNumber]: { ...(prev[compNumber] ?? {}), empty: false, productId: p.product_id } }));
                  onClose();
                }}
                title={name}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: btnColor, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: btnColor, opacity: 0.85, flexShrink: 0, letterSpacing: 0.3 }}>{btnCode}</span>
                    {/* Fill color stays the real product color (dye color) --
                        only this badge is red, for visibility that it's a
                        dyed/off-road-only variant. */}
                    {p.is_dyed && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)",
                        borderRadius: 2, padding: "1px 4px", letterSpacing: 0.4, flexShrink: 0,
                      }}>
                        DYED
                      </span>
                    )}
                  </div>
                  <div style={{ opacity: 0.5, fontSize: 12, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{sub || " "}</div>
                </div>
                {selected && <span style={{ fontSize: 15, color: "#fff", flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>

        {selectedRackId && canManageProducts && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            style={{
              marginTop: 4, padding: "10px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.55)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3,
            }}
          >
            Manage products at this terminal
          </button>
        )}
      </div>

      {selectedRackId && canManageProducts && (
        <ManageTerminalProductsModal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          rackId={selectedRackId}
          rackName={rackName}
          terminalName={terminalName}
          onChanged={() => onTerminalProductsChanged?.()}
        />
      )}
    </FullscreenModal>
  );
}
