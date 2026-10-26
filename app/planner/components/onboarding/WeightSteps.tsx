"use client";
// app/planner/components/onboarding/WeightSteps.tsx
//
// Part of SoloOnboarding.tsx: tare and planner target.

import type { SoloOnboardingModel } from "./useSoloOnboarding";
import { DEFAULT_TARGET_LBS, S, disabledPrimary, fmt, digits } from "./helpers";

export function WeightSteps({ m }: { m: SoloOnboardingModel }) {
  const { backTo, busy, coupleAndContinue, error, saveTare, setTareInput, setTargetInput, step, tareInput, targetInput, trailerNumber, truckNumber } = m;
  return (
    <>
      {/* ── Tare ── */}
      {step === "tare" && (
        <div style={S.card}>
          <h2 style={S.h2}>Let's set up your equipment</h2>
          <div style={S.sub}>We're pairing <b style={{ color: "#fff" }}>Truck {truckNumber || "—"}</b> with <b style={{ color: "#fff" }}>Trailer {trailerNumber || "—"}</b>.</div>
          <div>
            <div style={S.label}>Combined tare weight</div>
            <div style={{ position: "relative" }}>
              <input style={S.input} value={tareInput} inputMode="numeric" pattern="[0-9]*"
                onChange={(e) => setTareInput(digits(e.target.value))}
                onFocus={(e) => e.target.select()} placeholder="34800" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveTare(); }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>lbs</span>
            </div>
          </div>
          <div style={S.warn}>
            <b>Fill the saddle tank(s) prior to weighing for tare.</b> This gives you a little fuel-burn buffer between the loading terminal and DOT scale.
            <div style={{ marginTop: 8 }}>If unknown, enter an estimate and <b>don't forget to enter the correct tare in Settings prior to loading.</b></div>
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(!tareInput)} disabled={!tareInput} onClick={saveTare}>Save & Continue</button>
        </div>
      )}

      {/* ── Planner target ── */}
      {step === "target" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your planner target</h2>
          <div>
            <div style={S.label}>Target gross weight</div>
            <div style={{ position: "relative" }}>
              <input style={S.input} value={targetInput} inputMode="numeric" pattern="[0-9]*"
                onChange={(e) => setTargetInput(digits(e.target.value))}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === "Enter") coupleAndContinue(); }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>lbs</span>
            </div>
          </div>
          <div style={S.warn}>
            We set a target for the planner at {fmt(DEFAULT_TARGET_LBS)} lbs. You can change this in Settings. We recommend staying ~500 lbs under 80,000 for API drift until more users are verifying the data.
          </div>
          {Number(targetInput) > 80000 && <div style={{ ...S.err, color: "#fbbf24" }}>That's above the 80,000 lb federal limit — double-check this is what you want.</div>}
          {error && <div style={S.err}>{error}</div>}
          <button aria-busy={!!(busy)} style={disabledPrimary(busy || !targetInput)} disabled={busy || !targetInput} onClick={coupleAndContinue}>{busy ? "Pairing…" : "Next"}</button>
          <button style={S.secondary} onClick={backTo("tare")}>‹ Back</button>
        </div>
      )}

    </>
  );
}
