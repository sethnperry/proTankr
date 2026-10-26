"use client";
// app/planner/components/onboarding/useSoloOnboarding.ts
//
// Part of SoloOnboarding.tsx: composes state + actions and the small derived values the views use.

import type { Step, SoloOnboardingProps } from "./types";
import { DOT_STEPS } from "./helpers";
import { useOnboardingState } from "./useOnboardingState";
import { useOnboardingActions } from "./useOnboardingActions";

export function useSoloOnboarding(props: SoloOnboardingProps) {
  const s = useOnboardingState(props);
  const a = useOnboardingActions(s);
  const dotIndex = DOT_STEPS.indexOf(s.step);
  const showDots = dotIndex >= 0;
  const backTo = (to: Step) => () => { s.setError(null); s.setStep(to); };
  const hidden = !s.mounted || s.step === "resolving";
  return { ...s, ...a, dotIndex, showDots, backTo, hidden };
}

export type SoloOnboardingModel = ReturnType<typeof useSoloOnboarding>;
