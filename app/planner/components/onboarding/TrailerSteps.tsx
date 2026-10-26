"use client";
// app/planner/components/onboarding/TrailerSteps.tsx
//
// Part of SoloOnboarding.tsx: trailer, capacities and safety caps.

import type { SoloOnboardingModel } from "./useSoloOnboarding";
import { SAFETY_BUFFER_GAL, S, disabledPrimary, fmt, digits } from "./helpers";

export function TrailerSteps({ m }: { m: SoloOnboardingModel }) {
  const { busy, capIdx, capInput, caps, commitTrailer, compCount, error, safetyCapFor, saveCap, setCapIdx, setCapInput, setCompCount, setCurrentEquipment, setError, setStep, setTrailerNumber, skipTrailerBobtail, startTrailer, step, trailerNumber } = m;
  return (
    <>
      {/* ── Trailer ── */}
      {step === "trailer" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your trailer</h2>
          <div>
            <div style={S.label}>Trailer number</div>
            <input style={S.input} value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} placeholder="5678" autoFocus />
          </div>
          <div>
            <div style={S.label}>Number of compartments</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} onClick={() => setCompCount(n)} style={{
                  width: 52, height: 52, borderRadius: 2, fontSize: 18, fontWeight: 800, cursor: "pointer",
                  border: compCount === n ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                  background: compCount === n ? "#fff" : "rgba(255,255,255,0.06)",
                  color: compCount === n ? "#000" : "#fff",
                }}>{n}</button>
              ))}
            </div>
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(!trailerNumber.trim())} disabled={!trailerNumber.trim()} onClick={startTrailer}>Next</button>
          {setCurrentEquipment && (
            <button aria-busy={!!(busy)} style={S.secondary} disabled={busy} onClick={skipTrailerBobtail}>
              {busy ? "Skipping…" : "Skip — I'm bobtail (no trailer yet)"}
            </button>
          )}
        </div>
      )}

      {/* ── Compartment capacities ── */}
      {step === "caps" && (
        <div style={S.card}>
          <div style={S.label}>Compartment {capIdx + 1} of {compCount}</div>
          <h2 style={S.h2}>Compartment {capIdx + 1}</h2>
          <div>
            <div style={S.label}>Total capacity?</div>
            <div style={{ position: "relative" }}>
              <input style={S.input} value={capInput} inputMode="numeric" pattern="[0-9]*"
                onChange={(e) => setCapInput(digits(e.target.value))}
                onFocus={(e) => e.target.select()} placeholder="4000" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveCap(); }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>gal</span>
            </div>
            <div style={S.example}>Example: 4,000 gal</div>
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(!capInput)} disabled={!capInput} onClick={saveCap}>Next</button>
          {capIdx > 0 && (
            <button style={S.secondary} onClick={() => { setCapIdx(capIdx - 1); setCapInput(caps[capIdx - 1] != null ? String(caps[capIdx - 1]) : ""); setError(null); }}>‹ Previous compartment</button>
          )}
        </div>
      )}

      {/* ── Safety caps ── */}
      {step === "safety" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your safety caps</h2>
          <div style={S.sub}>We recommend keeping the product level below the overfill-prevention probes. We've set each compartment {SAFETY_BUFFER_GAL} gallons below its total capacity as a starting point.</div>
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.3, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <div>Comp</div><div style={{ textAlign: "right" }}>Total Capacity</div><div style={{ textAlign: "right" }}>Safety Cap</div>
            </div>
            {caps.map((c, i) => {
              const total = Number(c) || 0;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "11px 12px", fontSize: 14, borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                  <div>Comp {i + 1}</div>
                  <div style={{ textAlign: "right" }}>{fmt(total)} gal</div>
                  <div style={{ textAlign: "right", fontWeight: 700 }}>{fmt(safetyCapFor(total))} gal</div>
                </div>
              );
            })}
          </div>
          <div style={S.sub}>You can adjust the safety cap later in Trailer Settings.</div>
          {error && <div style={S.err}>{error}</div>}
          <button aria-busy={!!(busy)} style={disabledPrimary(busy)} disabled={busy} onClick={commitTrailer}>{busy ? "Saving…" : "Next"}</button>
          <button style={S.secondary} onClick={() => { setCapIdx(compCount - 1); setCapInput(caps[compCount - 1] != null ? String(caps[compCount - 1]) : ""); setError(null); setStep("caps"); }}>‹ Edit capacities</button>
        </div>
      )}

    </>
  );
}
