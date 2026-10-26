"use client";
// app/planner/components/PlannerGates.tsx
//
// The two full-screen gates in front of the Planner: first-run solo onboarding,
// and the equipment / location / terminal setup checklist. Only one shows at a
// time; the checklist is suppressed while onboarding is active.

import SetupGate from "./SetupGate";
import SoloOnboarding from "./SoloOnboarding";
import { useCalculatorShell } from "../CalculatorShellContext";

type Props = {
  onboardingActive: boolean;
  /** True on the Plan page, where location and terminal aren't needed. */
  active: boolean;
  terminalLabel: string;
  onOnboardingComplete: () => void;
};

export function PlannerGates({ onboardingActive, active, terminalLabel, onOnboardingComplete }: Props) {
  const { effectiveUserId, companyId, equipment, location, setEquipOpen, setLocOpen, setTermOpen } = useCalculatorShell();

  if (onboardingActive) {
    return (
      <SoloOnboarding
        userId={effectiveUserId}
        companyId={companyId!}
        selectedState={location.selectedState}
        selectedCity={location.selectedCity}
        selectedTerminalId={location.selectedTerminalId}
        onOpenLocation={() => setLocOpen(true)}
        onOpenTerminal={() => setTermOpen(true)}
        fetchCombos={equipment.fetchCombos}
        setSelectedComboId={equipment.setSelectedComboId}
        setCurrentEquipment={equipment.setCurrentEquipment}
        onComplete={onOnboardingComplete}
      />
    );
  }
  return (
    <SetupGate
      comboSelected={!!equipment.selectedComboId || equipment.isBobtail || equipment.isTrailerOnly}
      locationSelected={!!(location.selectedState && location.selectedCity) || active}
      terminalSelected={!!location.selectedTerminalId || active}
      equipmentLabel={equipment.equipmentLabel}
      locationLabel={location.locationLabel}
      terminalLabel={terminalLabel}
      onOpenEquipment={() => setEquipOpen(true)}
      onOpenLocation={() => setLocOpen(true)}
      onOpenTerminal={() => setTermOpen(true)}
    />
  );
}
