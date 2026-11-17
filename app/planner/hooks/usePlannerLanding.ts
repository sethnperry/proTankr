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

const LANDING_KEY = "proTankr:landing";

export function usePlannerLanding(active: boolean) {
  const shell = useCalculatorShell();
  const router = useRouter();
  const { effectiveUserId } = shell;

  const [onboardingDone, setOnboardingDone] = useState(false);
  useEffect(() => {
    setOnboardingDone(isOnboardingComplete(effectiveUserId || null));
  }, [effectiveUserId]);
  const onboardingActive = shell.isSolo === true && !onboardingDone && !!effectiveUserId && !!shell.companyId;

  // Opening the app cold: go straight to where this phone landed last time, without waiting for role, super-admin and
  // company lookups. The checks below still run for a first visit, and each dashboard guards itself.
  useEffect(() => {
    if (hasCheckedDefaultLanding || !active) return;
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("begin") || qs.get("report") || qs.get("plan")) return;
    let last: string | null = null;
    try { last = localStorage.getItem(LANDING_KEY); } catch { /* storage blocked */ }
    if (last && last.startsWith("/")) { hasCheckedDefaultLanding = true; router.replace(last); }
  }, [active, router]);

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
    // A super admin has no role-based landing; opening the app still starts on the Driver Dashboard, not the plan editor.
    const target = defaultLandingPath(shell.role, shell.isSuperAdmin, shell.isSolo === true) ?? (shell.isSuperAdmin ? "/planner/home" : null);
    // A solo driver finishes first-run onboarding here before landing anywhere else.
    if (target && shell.isSolo === true && !onboardingDone) return;
    hasCheckedDefaultLanding = true;
    if (qs.get("begin") || qs.get("report") || qs.get("plan")) return;
    if (target) { try { localStorage.setItem(LANDING_KEY, target); } catch { /* storage blocked */ } router.replace(target); }
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, onboardingDone, active, router]);

  return { onboardingDone, setOnboardingDone, onboardingActive };
}
