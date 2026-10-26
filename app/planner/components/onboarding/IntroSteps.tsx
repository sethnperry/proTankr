"use client";
// app/planner/components/onboarding/IntroSteps.tsx
//
// Part of SoloOnboarding.tsx: welcome, name and truck.

import type { SoloOnboardingModel } from "./useSoloOnboarding";
import { S, disabledPrimary } from "./helpers";

export function IntroSteps({ m }: { m: SoloOnboardingModel }) {
  const { busy, company, error, name, saveIdentity, saveTruck, setCompany, setName, setStep, setTruckNumber, step, truckNumber } = m;
  return (
    <>
      {/* ── Welcome ── */}
      {step === "welcome" && (
        <div style={S.card}>
          <h1 style={S.h1}>Welcome to ProTankr</h1>
          <div style={S.sub}>Let's get your truck and planner ready. This only takes a few minutes — you can change anything later in Settings.</div>
          <button style={S.primary} onClick={() => setStep("identity")}>Get Started</button>
        </div>
      )}

      {/* ── Identity ── */}
      {step === "identity" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your info</h2>
          <div>
            <div style={S.label}>Your name</div>
            <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus autoComplete="name" />
          </div>
          <div>
            <div style={S.label}>Company <span style={{ textTransform: "none", fontWeight: 500 }}>(optional)</span></div>
            <input style={S.input} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company or business name" autoComplete="organization" />
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button aria-busy={!!(busy)} style={disabledPrimary(busy || !name.trim())} disabled={busy || !name.trim()} onClick={saveIdentity}>{busy ? "Saving…" : "Next"}</button>
        </div>
      )}

      {/* ── Truck ── */}
      {step === "truck" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your truck</h2>
          <div>
            <div style={S.label}>Truck number</div>
            <input style={S.input} value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} placeholder="1234" autoFocus />
            <div style={S.example}>Example: 1234</div>
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button aria-busy={!!(busy)} style={disabledPrimary(busy || !truckNumber.trim())} disabled={busy || !truckNumber.trim()} onClick={saveTruck}>{busy ? "Saving…" : "Next"}</button>
        </div>
      )}

    </>
  );
}
