"use client";
// app/planner/modals/decouple/ConfirmStep.tsx
//
// Decouple dialog step.


import { D } from "./helpers";
import { BackBtn } from "./BackBtn";
import { SummaryRow } from "./SummaryRow";
import type { DecoupleModel } from "./useDecouple";

export function ConfirmStep({ m }: { m: DecoupleModel }) {
  const { truckName, trailerName, setStep, scenario, busy, err, sharedLocation, truckStatus, truckLocation, truckNotes, trailerStatus, trailerLocation, trailerNotes, needsTare, newTareLbs, setNewTareLbs, handleConfirm, truckWarn, trailerWarn, newTruckName, newTrailerName } = m;
  return scenario ? (
    <div>
      <BackBtn onClick={() => setStep("details")} />
      <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>Confirm Decouple</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.5 }}>
        Review before confirming. This will deactivate the combo and update each unit's status.
      </div>

      {/* Scenario-specific summary */}
      {scenario === "swap_truck" && (
        <>
          <SummaryRow label={`Parking — ${truckName}`} code={truckStatus}
            location={truckLocation} notes={truckNotes} />
          <div style={{ padding: "10px 13px", borderRadius: 2, marginBottom: 8,
            border: needsTare ? "1px solid rgba(251,191,36,0.40)" : "1px solid rgba(64,180,255,0.25)",
            background: needsTare ? "rgba(180,120,0,0.12)" : "rgba(32,100,200,0.12)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>
              New combo
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.85)", marginBottom: 2 }}>
              {newTruckName} / {trailerName}
            </div>
            {!needsTare && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
                {trailerName} status unchanged · will be recoupled immediately
              </div>
            )}
            {needsTare && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, marginBottom: 6 }}>
                  ⚠ New pairing — tare weight required
                </div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.40)", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 5 }}>
                  Tare weight (lbs) *
                </label>
                <input type="number" inputMode="numeric" placeholder="e.g. 34800"
                  value={newTareLbs} onChange={(e) => setNewTareLbs(e.target.value)}
                  style={{ ...D.input, fontSize: 16, fontWeight: 700, marginBottom: 8 }}
                  autoFocus />
                <div style={{ padding: "8px 10px", borderRadius: 2, background: "rgba(255,185,0,0.07)", border: "1px solid rgba(255,185,0,0.18)", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", letterSpacing: 0.8, marginBottom: 3 }}>⛽ WEIGH-IN REMINDER</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", lineHeight: 1.5 }}>
                    Ensure saddle tank(s) are <strong style={{ color: "rgba(255,255,255,0.82)" }}>completely full</strong> before weighing. Enter from a <strong style={{ color: "rgba(255,255,255,0.82)" }}>certified scale ticket</strong>.
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {scenario === "swap_trailer" && (
        <>
          <SummaryRow label={`Parking — ${trailerName}`} code={trailerStatus}
            location={trailerLocation} notes={trailerNotes} />
          <div style={{ padding: "10px 13px", borderRadius: 2, marginBottom: 8,
            border: needsTare ? "1px solid rgba(251,191,36,0.40)" : "1px solid rgba(167,139,250,0.25)",
            background: needsTare ? "rgba(180,120,0,0.12)" : "rgba(100,70,200,0.12)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>
              New combo
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.85)", marginBottom: 2 }}>
              {truckName} / {newTrailerName}
            </div>
            {!needsTare && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
                {truckName} status unchanged · will be recoupled immediately
              </div>
            )}
            {needsTare && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, marginBottom: 6 }}>
                  ⚠ New pairing — tare weight required
                </div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.40)", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 5 }}>
                  Tare weight (lbs) *
                </label>
                <input type="number" inputMode="numeric" placeholder="e.g. 34800"
                  value={newTareLbs} onChange={(e) => setNewTareLbs(e.target.value)}
                  style={{ ...D.input, fontSize: 16, fontWeight: 700, marginBottom: 8 }}
                  autoFocus />
                <div style={{ padding: "8px 10px", borderRadius: 2, background: "rgba(255,185,0,0.07)", border: "1px solid rgba(255,185,0,0.18)", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", letterSpacing: 0.8, marginBottom: 3 }}>⛽ WEIGH-IN REMINDER</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", lineHeight: 1.5 }}>
                    Ensure saddle tank(s) are <strong style={{ color: "rgba(255,255,255,0.82)" }}>completely full</strong> before weighing. Enter from a <strong style={{ color: "rgba(255,255,255,0.82)" }}>certified scale ticket</strong>.
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {scenario === "drop_trailer" && (
        <>
          <SummaryRow label={`Trailer staying — ${trailerName}`} code={trailerStatus}
            location={trailerLocation} notes={trailerNotes} />
          <div style={{ padding: "10px 13px", borderRadius: 2, marginBottom: 8,
            border: "1px solid rgba(103,232,249,0.20)", background: "rgba(0,150,180,0.10)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>Truck</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 2,
                background: "rgba(103,232,249,0.15)", color: "#67e8f9" }}>IN USE</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{truckName}</span>
            </div>
          </div>
        </>
      )}

      {scenario === "park_both" && (
        <>
          <div style={{ padding: "10px 13px", borderRadius: 2, marginBottom: 8,
            border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>Shared location</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>📍 {sharedLocation}</div>
          </div>
          <SummaryRow label={`Truck — ${truckName}`} code={truckStatus} location="" notes={truckNotes} />
          <SummaryRow label={`Trailer — ${trailerName}`} code={trailerStatus} location="" notes={trailerNotes} />
        </>
      )}

      {(truckWarn || trailerWarn) && (
        <div style={{ ...D.err, background: "rgba(180,80,20,0.18)", border: "1px solid rgba(220,120,40,0.35)", color: "rgba(255,200,140,0.95)", marginTop: 4 }}>
          ⚠ One or more units will be marked{" "}
          <strong>{[truckWarn && truckStatus, trailerWarn && trailerStatus].filter(Boolean).join(" / ")}</strong>.
          Others will see a warning before coupling them.
        </div>
      )}

      {err && <div style={{ ...D.err, marginTop: 8 }}>{err}</div>}

      <button type="button" onClick={handleConfirm} disabled={busy}
        style={{ ...D.btn, ...D.btnDestructive, width: "100%", textAlign: "center" as const,
          padding: "15px 0", fontSize: 16, marginTop: 10, opacity: busy ? 0.55 : 1 }}>
        {busy ? (scenario === "swap_truck" || scenario === "swap_trailer" ? "Swapping…" : "Decoupling…") : needsTare ? "Submit Tare & Confirm" : "Confirm"}
      </button>
    </div>
  ) : null;
}
