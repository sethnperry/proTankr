"use client";
// app/planner/components/FuelBurnOverlay.tsx
//
// Load Report's "adjust for fuel burn" window -- same shell as
// ValueEntryOverlay (the Tune window): top-pinned #161616 card so the number
// pad never covers the field, Cancel / Apply buttons.
//
// Two ways to say how much fuel is gone since the full-tank tare:
//   Tank + Gauge -- tank size (remembered on the truck after the first time)
//                   + tap the gauge mark. Easiest: one tap once the size is saved.
//   Gallons      -- type the gallons burned directly.
// Only fuel ALREADY burned -- never what the driver expects to burn before the
// scale. See utils/fuelBurn.ts for the conservative-density reasoning.

import React, { useEffect, useMemo, useState } from "react";
import { GAUGE_STOPS, burnedFromGauge, burnCreditLbs, DIESEL_CREDIT_LBS_PER_GAL } from "../utils/fuelBurn";

type Mode = "gauge" | "gallons";

type Props = {
  open: boolean;
  /** Tank size saved on the truck, if any. */
  savedTankGallons: number | null;
  /** Previously applied value, so reopening shows what was entered. */
  initialGallons: number | null;
  onCancel: () => void;
  /** gallonsBurned, plus the tank size to remember when it was entered/changed in gauge mode. */
  onApply: (gallonsBurned: number, tankGallonsToSave: number | null) => void;
};

function digits(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  return v;
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
  letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4,
};

export default function FuelBurnOverlay({ open, savedTankGallons, initialGallons, onCancel, onApply }: Props) {
  const [mode, setMode] = useState<Mode>("gauge");
  const [tankStr, setTankStr] = useState("");
  const [gaugeFraction, setGaugeFraction] = useState<number | null>(null);
  const [gallonsStr, setGallonsStr] = useState("");

  // Re-seed every time the window opens.
  useEffect(() => {
    if (!open) return;
    setMode("gauge");
    setTankStr(savedTankGallons != null && savedTankGallons > 0 ? String(savedTankGallons) : "");
    setGaugeFraction(null);
    setGallonsStr(initialGallons != null && initialGallons > 0 ? String(Math.round(initialGallons)) : "");
  }, [open, savedTankGallons, initialGallons]);

  const tank = Number(tankStr);
  const tankValid = Number.isFinite(tank) && tank > 0;

  const gallonsBurned = useMemo(() => {
    if (mode === "gauge") {
      if (!tankValid || gaugeFraction == null) return null;
      return burnedFromGauge(tank, gaugeFraction);
    }
    const g = Number(gallonsStr);
    return Number.isFinite(g) && g > 0 ? g : null;
  }, [mode, tankValid, tank, gaugeFraction, gallonsStr]);

  if (!open) return null;

  const canApply = gallonsBurned != null && gallonsBurned > 0;

  function apply() {
    if (!canApply) return;
    const tankToSave = mode === "gauge" && tankValid && tank !== savedTankGallons ? tank : null;
    onApply(gallonsBurned!, tankToSave);
  }

  const modeBtn = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      style={{
        flex: 1, padding: "9px 0", borderRadius: 4, cursor: "pointer",
        border: mode === m ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.12)",
        background: mode === m ? "rgba(255,255,255,0.10)" : "transparent",
        color: mode === m ? "#fff" : "rgba(255,255,255,0.55)",
        fontSize: 13, fontWeight: 700,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingLeft: 24, paddingRight: 24, paddingBottom: 24,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 320,
          background: "#161616", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 4, padding: 20,
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" }}>
          Adjust for Fuel Burn
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", textAlign: "center", lineHeight: 1.4 }}>
          Your tare was weighed with full tanks. Tell us how much fuel is gone since then.
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {modeBtn("gauge", "Tank + Gauge")}
          {modeBtn("gallons", "Gallons")}
        </div>

        {mode === "gauge" ? (
          <>
            <div>
              <div style={labelStyle}>Total tank size (all tanks)</div>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tankStr}
                  placeholder="e.g. 200"
                  onChange={(e) => setTankStr(digits(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  style={{
                    width: "100%", textAlign: "center", background: "transparent",
                    border: "none", borderBottom: "1px solid rgba(255,255,255,0.20)",
                    color: "#fff", fontSize: 28, fontWeight: 700, padding: "4px 0",
                  }}
                />
                <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>gal</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4, textAlign: "center" }}>
                {savedTankGallons != null && savedTankGallons > 0 ? "Saved for this truck" : "We'll remember this for this truck"}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Gauge now</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {GAUGE_STOPS.map((s) => {
                  const on = gaugeFraction === s.fraction;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setGaugeFraction(s.fraction)}
                      style={{
                        padding: "12px 0", borderRadius: 4, cursor: "pointer",
                        border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.12)",
                        background: on ? "#fff" : "rgba(255,255,255,0.03)",
                        color: on ? "#000" : "rgba(255,255,255,0.85)",
                        fontSize: 15, fontWeight: 800,
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6, textAlign: "center" }}>
                Between marks? Pick the fuller one.
              </div>
            </div>
          </>
        ) : (
          <div>
            <div style={labelStyle}>Gallons burned since tare</div>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={gallonsStr}
                onChange={(e) => setGallonsStr(digits(e.target.value))}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                style={{
                  width: "100%", textAlign: "center", background: "transparent",
                  border: "none", borderBottom: "1px solid rgba(255,255,255,0.20)",
                  color: "#fff", fontSize: 40, fontWeight: 700, padding: "4px 0",
                }}
              />
              <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>gal</span>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textAlign: "center", minHeight: 16 }}>
          {canApply ? (
            <>≈ <b style={{ color: "#fff" }}>{Math.round(gallonsBurned!)} gal</b> burned · <b style={{ color: "#fff" }}>−{Math.round(burnCreditLbs(gallonsBurned!)).toLocaleString()} lbs</b></>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.35)" }}>Diesel counted at a light {DIESEL_CREDIT_LBS_PER_GAL} lb/gal</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, width: "100%" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
              color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 4, border: "none",
              background: "#fff", color: "#000", fontSize: 14, fontWeight: 700,
              cursor: canApply ? "pointer" : "default", opacity: canApply ? 1 : 0.4,
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
