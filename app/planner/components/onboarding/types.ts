"use client";
// app/planner/components/onboarding/types.ts
//
// Part of SoloOnboarding.tsx.




export type Step =
  | "welcome"
  | "identity"
  | "truck"
  | "trailer"
  | "caps"
  | "safety"
  | "tare"
  | "target"
  | "location"
  | "terminal"
  | "ready"
  | "tutorial"
  | "done"
  | "resolving";

export type SoloOnboardingProps = {
  userId: string;
  companyId: string;
  displayName?: string | null;

  // location state (read) -- from shell.location
  selectedState: string;
  selectedCity: string;
  selectedTerminalId: string;

  // open the app's real pickers (shell.setLocOpen / shell.setTermOpen)
  onOpenLocation: () => void;
  onOpenTerminal: () => void;

  // equipment (shell.equipment)
  fetchCombos: () => Promise<void> | void;
  setSelectedComboId: (id: string) => void;
  // Phase 2 — persist a truck-only (bobtail) held unit when the driver skips
  // the trailer step. Optional so a caller that predates Phase 2 still works
  // (the Skip button simply hides when it isn't provided).
  setCurrentEquipment?: (truckId: string | null, trailerId: string | null) => Promise<void>;

  // called once onboarding is fully complete -- lets the page stop rendering us
  onComplete: () => void;
};

export type OnboardingState = ReturnType<typeof import("./useOnboardingState").useOnboardingState>;
