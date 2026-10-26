"use client";
// app/planner/hooks/usePlannerLanding.ts
//
// Where a person lands on bare /planner, and whether solo first-run onboarding
// is still in the way.
//
// - Each role lands on its own dashboard (see defaultLandingPath): admin goes to
//   the Company Dashboard, dispatch to Dispatch, drivers to the Driver Dashboard. A super admin is never redirected
//   (both screens stay reachable). A solo driver is role 'admin' but is not a
//   fleet admin, so isSolo has to be known before deciding.
// - The redirect decision waits for role, super-admin status and isSolo to all
//   resolve; they load independently and without an ordering guarantee.
// - A deliberate visit (?begin=, ?report=, ?plan=) stays on the Planner.
// - The check runs once per page load (module flag), because this host remounts
//   on navigation and must not bounce someone off a Planner they chose to open.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCalculatorShell } from "../CalculatorShellContext";
import { isOnboardingComplete } from "../utils/onboardingProgress";
import { defaultLandingPath } from "@/lib/ui/driver/navDestinations";

let hasCheckedDefaultLanding = false;

export function usePlannerLanding(active: boolean) {
  const shell = useCalculatorShell();
  const router = useRouter();
  const { effectiveUserId } = shell;

  const [onboardingDone, setOnboardingDone] = useState(false);
  useEffect(() => {
    setOnboardingDone(isOnboardingComplete(effectiveUserId || null));
  }, [effectiveUserId]);
  const onboardingActive = shell.isSolo === true && !onboardingDone && !!effectiveUserId && !!shell.companyId;

  useEffect(() => {
    if (hasCheckedDefaultLanding) return;
    if (!active) {
      hasCheckedDefaultLanding = true; // opened on another screen: no landing redirect
      return;
    }
    if (shell.role == null) return;
    if (!shell.isSuperAdminResolved) return;
    if (shell.isSolo === null) return;
    const qs = new URLSearchParams(window.location.search);
    const target = defaultLandingPath(shell.role, shell.isSuperAdmin, shell.isSolo === true);
    // A solo driver finishes first-run onboarding here before landing anywhere else.
    if (target && shell.isSolo === true && !onboardingDone) return;
    hasCheckedDefaultLanding = true;
    if (qs.get("begin") || qs.get("report") || qs.get("plan")) return;
    if (target) router.replace(target);
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, onboardingDone, active, router]);

  return { onboardingDone, setOnboardingDone, onboardingActive };
}
