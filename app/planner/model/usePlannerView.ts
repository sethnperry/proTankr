"use client";
// app/planner/model/usePlannerView.ts
//
// Planner model layer (view). View: where we are on screen, orientation, landing and the leave-navigation.
// Built from hooks; no JSX. Part of the Planner composition: see docs/planner-architecture.md.

import { usePathname, useRouter } from "next/navigation";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useIsLandscape } from "../hooks/useOrientation";
import { useLeaveTo } from "../hooks/useLeaveTo";
import { usePlannerLanding } from "../hooks/usePlannerLanding";
import { useHeaderIconsSlot } from "../hooks/useHeaderIconsSlot";


export function usePlannerView() {

  // ── Shared shell state (equipment/location/terminals/expirations) ──────────
  // Equipment, location and terminals are owned once in CalculatorShellContext, so the
  // header and this host never hold two copies of the same selection.
  const shell = useCalculatorShell();
  const { setupSession, effectiveUserId, equipment, location, terminals } = shell;
  const router = useRouter();
  // This host stays mounted for every /planner screen; the plan page itself shows only
  // on bare /planner. The windows (Plan Review, load report, sheets) work on any screen.
  const pathname = usePathname();
  const active = pathname === "/planner";
  const { leaving, leaveTo } = useLeaveTo(pathname);
  // Wider than tall with room for the side rail (see useOrientation.ts).
  const isLandscape = useIsLandscape();
  // In landscape the plan is one column, capped so it does not stretch across a
  // large monitor. Compartment bars are a percentage of the column; their height is fixed.
  const LANDSCAPE_MAX_W = 1100;

  const { setOnboardingDone, onboardingActive } = usePlannerLanding(active);

  const headerIconsSlot = useHeaderIconsSlot(isLandscape);

  return {
    shell,
    setupSession,
    effectiveUserId,
    equipment,
    location,
    terminals,
    router,
    active,
    leaving,
    leaveTo,
    isLandscape,
    LANDSCAPE_MAX_W,
    setOnboardingDone,
    onboardingActive,
    headerIconsSlot,
  };
}
