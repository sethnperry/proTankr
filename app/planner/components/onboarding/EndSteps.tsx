"use client";
// app/planner/components/onboarding/EndSteps.tsx
//
// Part of SoloOnboarding.tsx: location, terminal, ready, tutorial and done.

import type { SoloOnboardingModel } from "./useSoloOnboarding";
import { S } from "./helpers";

export function EndSteps({ m }: { m: SoloOnboardingModel }) {
  const { finishAll, finishTutorial, goFromReady, locationSet, onOpenLocation, onOpenTerminal, selectedCity, selectedState, step } = m;
  return (
    <>
      {/* ── Location ── */}
      {step === "location" && (
        <div style={S.card}>
          <h2 style={S.h2}>Where do you load?</h2>
          <div style={S.sub}>This is just to initialize your planner. You can change locations later.</div>
          <button style={S.primary} onClick={onOpenLocation}>{locationSet ? `${selectedCity}, ${selectedState} — Change` : "Select State & City"}</button>
        </div>
      )}

      {/* ── Terminal ── */}
      {step === "terminal" && (
        <div style={S.card}>
          <h2 style={S.h2}>Where do you load?</h2>
          <div style={S.sub}>This is just to initialize your planner. You can change terminals later.</div>
          <button style={S.primary} onClick={onOpenTerminal}>Select Terminal</button>
        </div>
      )}

      {/* ── Ready → tutorial ── */}
      {step === "ready" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your truck is ready.</h2>
          <div style={S.sub}>Now let's set up your typical load plans. We'll walk you through it once.</div>
          <button style={S.primary} onClick={goFromReady}>Next</button>
        </div>
      )}

      {/* ── Planner tutorial ── */}
      {step === "tutorial" && (
        <div style={S.card}>
          <h2 style={S.h2}>Set up your typical load plans</h2>
          <div style={S.sub}>Your compartments can carry different products depending on the load. <b style={{ color: "#fff" }}>Plans</b> let you save different load configurations so you don't have to build them every time.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" }}>
            <div>From the <b style={{ color: "#fff" }}>DROP</b> side profile you'll see your compartments. <b style={{ color: "#fff" }}>Compartment #1 is on the right.</b></div>
            <div>To configure a plan:</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Tap a compartment</li>
              <li>Tap <b style={{ color: "#fff" }}>Edit Comp</b></li>
              <li>Select a product</li>
            </ol>
            <div>Repeat for each compartment in that configuration, then <b style={{ color: "#fff" }}>Save Plan A</b>.</div>
            <div>A compartment isn't locked to a product — Plan A might put diesel in Compartment 1 while Plan B puts gasoline there. The same compartment is reused across plans.</div>
            <div>Want another? Tap the <b style={{ color: "#fff" }}>A</b> icon, pick <b style={{ color: "#fff" }}>Plan B</b>, and build a second typical load. You can add more plans later.</div>
          </div>
          <button style={S.primary} onClick={finishTutorial}>I'm Done</button>
        </div>
      )}

      {/* ── Completion ── */}
      {step === "done" && (
        <div style={S.card}>
          <h2 style={S.h2}>You're ready.</h2>
          <div style={S.sub}>Your equipment and planner are set up.</div>
          <button style={S.primary} onClick={finishAll}>Pick a plan and load</button>
        </div>
      )}
    </>
  );
}
