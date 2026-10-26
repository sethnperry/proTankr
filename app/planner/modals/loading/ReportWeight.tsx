"use client";
// app/planner/modals/loading/ReportWeight.tsx
//
// Load report: weights and the fuel-burn correction.

import FuelBurnOverlay from "../../components/FuelBurnOverlay";
import { correctedGrossLbs, burnCreditLbs, LEGAL_GROSS_LBS as LEGAL_LIMIT_LBS } from "../../utils/fuelBurn";
import { weightColor } from "./weight";
import type { LoadingModel } from "./useLoadingModel";

export function ReportWeight({ m }: { m: LoadingModel }) {
  const {
    burnGallons,
    burnOpen,
    burnSaveError,
    fuelTankGallons,
    liveFuelPct,
    onSaveFuelTankGallons,
    report,
    setBurnGallons,
    setBurnOpen,
    setBurnSaveError,
    targetWeight,
  } = m;
  if (!report) return null;
  return (
    report.actualGrossLbs != null && (
      <>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 14px",
            borderRadius: 2,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "rgba(255,255,255,0.45)",
              letterSpacing: 0.4,
              textTransform: "uppercase" as const,
            }}
          >
            Actual Weight
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: weightColor(report.actualGrossLbs, targetWeight) }}>
            {Math.round(report.actualGrossLbs).toLocaleString()} lbs
          </div>
        </div>
        {report.actualGrossLbs > LEGAL_LIMIT_LBS &&
          (burnGallons != null ? (
            (() => {
              const corrected = correctedGrossLbs(report.actualGrossLbs!, burnGallons);
              return (
                <button
                  type="button"
                  onClick={() => setBurnOpen(true)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    width: "100%",
                    textAlign: "left" as const,
                    padding: "12px 14px",
                    borderRadius: 2,
                    cursor: "pointer",
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.45)",
                        letterSpacing: 0.4,
                        textTransform: "uppercase" as const,
                      }}
                    >
                      After Fuel Burn
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: weightColor(corrected, targetWeight) }}>
                      {Math.round(corrected).toLocaleString()} lbs
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      width: "100%",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.45)",
                    }}
                  >
                    <span>
                      {Math.round(burnGallons)} gal burned · −{Math.round(burnCreditLbs(burnGallons)).toLocaleString()} lbs
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>edit ›</span>
                  </div>
                  {corrected > LEGAL_LIMIT_LBS && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>
                      Still about {Math.round(corrected - LEGAL_LIMIT_LBS).toLocaleString()} lbs over legal.
                    </div>
                  )}
                </button>
              );
            })()
          ) : (
            <button
              type="button"
              onClick={() => setBurnOpen(true)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                padding: "12px 14px",
                borderRadius: 2,
                cursor: "pointer",
                textAlign: "left" as const,
                border: "1px solid rgba(248,113,113,0.35)",
                background: "rgba(248,113,113,0.08)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#f87171" }}>Likely over the legal limit</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Adjust for fuel burned since your tare</span>
              </div>
              <span style={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }}>›</span>
            </button>
          ))}
        {burnSaveError && <div style={{ fontSize: 12, color: "rgba(255,210,210,0.9)" }}>{burnSaveError}</div>}
        <FuelBurnOverlay
          open={burnOpen}
          savedTankGallons={fuelTankGallons ?? null}
          liveFuelPct={liveFuelPct ?? null}
          initialGallons={burnGallons}
          onCancel={() => setBurnOpen(false)}
          onApply={(gal, tankToSave) => {
            setBurnGallons(gal);
            setBurnOpen(false);
            setBurnSaveError(null);
            if (tankToSave != null && onSaveFuelTankGallons) {
              onSaveFuelTankGallons(tankToSave).catch((e: any) => {
                setBurnSaveError(`Couldn't save the tank size to this truck: ${e?.message ?? "unknown error"}`);
              });
            }
          }}
        />
      </>
    )
  );
}
