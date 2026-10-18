"use client";
// modals/TerminalCardsPickerModal.tsx
//
// Two-step quick-share flow for the Terminal Cards report: tap a city, then
// pick a scope (Active only / Active + Expired / All terminals). Picking a
// scope immediately hands off to the caller (which builds the report body
// and opens TerminalCardsReportModal) -- no separate "generate" step, since
// the whole point is a driver being able to answer "where are you carded"
// in as few taps as possible.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TerminalCardsScope } from "../reports/buildTerminalCardsReport";

type CityOption = { city: string; state: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  cities: CityOption[];
  onPick: (city: string, state: string | null, scope: TerminalCardsScope) => void;
};

const cityBtn: React.CSSProperties = {
  padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)",
  fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left" as const,
};

const scopeBtn: React.CSSProperties = {
  padding: "14px 16px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)",
  fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left" as const,
  display: "flex", flexDirection: "column" as const, gap: 2,
};
const scopeSub: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.40)" };

export default function TerminalCardsPickerModal({ open, onClose, cities, onPick }: Props) {
  const [picked, setPicked] = useState<CityOption | null>(null);

  useEffect(() => { if (open) setPicked(null); }, [open]);

  if (!open || typeof document === "undefined") return null;

  function handleScope(scope: TerminalCardsScope) {
    if (!picked) return;
    onPick(picked.city, picked.state, scope);
    onClose();
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "80dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 12px", gap: 10 }}>
          {picked && (
            <button type="button" onClick={() => setPicked(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, flexShrink: 0 }}>
              ‹ Back
            </button>
          )}
          <div style={{ flex: 1, fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>
            {picked ? picked.city : "Terminal Cards Report"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 18px 28px" }}>
          {!picked ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>Pick a city to share</div>
              {cities.map((c) => (
                <button key={c.city} type="button" onClick={() => setPicked(c)} style={cityBtn}>
                  {c.city}{c.state ? `, ${c.state}` : ""}
                </button>
              ))}
              {cities.length === 0 && (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "24px 0" }}>
                  No starred terminals yet.
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" onClick={() => handleScope("active")} style={scopeBtn}>
                Only active cards
                <span style={scopeSub}>Cards that are currently good</span>
              </button>
              <button type="button" onClick={() => handleScope("activeExpired")} style={scopeBtn}>
                Include expired cards
                <span style={scopeSub}>Active cards plus any that have lapsed</span>
              </button>
              <button type="button" onClick={() => handleScope("all")} style={scopeBtn}>
                All terminals in {picked.city}
                <span style={scopeSub}>Every terminal here, carded or not, with status</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
