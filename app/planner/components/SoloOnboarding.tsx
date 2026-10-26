"use client";
// app/planner/components/SoloOnboarding.tsx
//
// Guided first-run setup for a SOLO driver: a full-screen gate (z-index 45, above SetupGate,
// below FullscreenModal so the reused location/terminal pickers render on top).
// It wraps the existing equipment/planner logic rather than duplicating it. Resumable:
// the starting step comes from real DB state, plus a small local draft for the trailer
// sub-steps. Model: onboarding/useSoloOnboarding; steps: onboarding/*Steps.

import { createPortal } from "react-dom";
import type { SoloOnboardingProps } from "./onboarding/types";
import { S, DOT_STEPS } from "./onboarding/helpers";
import { useSoloOnboarding } from "./onboarding/useSoloOnboarding";
import { IntroSteps } from "./onboarding/IntroSteps";
import { TrailerSteps } from "./onboarding/TrailerSteps";
import { WeightSteps } from "./onboarding/WeightSteps";
import { EndSteps } from "./onboarding/EndSteps";

export type { SoloOnboardingProps } from "./onboarding/types";

export default function SoloOnboarding(props: SoloOnboardingProps) {
  const m = useSoloOnboarding(props);
  if (m.hidden) return null;
  return createPortal(
    <div style={S.screen} data-onboarding="">
      {m.showDots && (
        <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 18px)", left: 0, right: 0, display: "flex", gap: 5, justifyContent: "center" }}>
          {DOT_STEPS.map((s, i) => (
            <div key={s} style={{
              width: i === m.dotIndex ? 16 : 5, height: 5, borderRadius: 2,
              background: i <= m.dotIndex ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.15)",
              transition: "all 0.25s ease",
            }} />
          ))}
        </div>
      )}
      <IntroSteps m={m} />
      <TrailerSteps m={m} />
      <WeightSteps m={m} />
      <EndSteps m={m} />
    </div>,
    document.body
  );
}
