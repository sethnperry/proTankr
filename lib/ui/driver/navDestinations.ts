// lib/ui/driver/navDestinations.ts
//
// Single source of truth for "who can reach what" now that every Planner
// destination (Planner/Dispatch/Cards/Vault) lives only in the hamburger nav
// menu, not a visible tab bar. Both the landing-redirect effect
// (app/planner/page.tsx) and the nav menu itself (lib/ui/NavMenu.tsx) import
// from here instead of each independently re-deriving the same role checks
// -- this codebase has repeated, explicit precedent against exactly that
// class of duplicated logic drifting apart (CustomSelect.tsx,
// ServiceTypeManager.tsx's own header comments, and this session's own
// TabBar/PresetDial centering-bug lesson, where the same fix existed in one
// place and simply wasn't ported to its second copy).
//
// Role→destination rules, decided in a multi-message design conversation:
// - planner (the existing driver-style Planner page): driver, lead, or any
//   super admin (so one account can verify that view without reassigning
//   roles, matching this project's standing precedent).
// - dispatch (the existing Dispatch page, now ALSO admin's Planner): admin,
//   dispatch, or super admin.
// - cards: driver, lead, or super admin -- admin/dispatch no longer need it,
//   since their own Dispatch page already shows a selected driver's Terminal
//   Cards/Badges/Credentials inline.
// - vault: always, every role -- personal to every role including admin, no
//   exceptions, unchanged from today.

import type { Role } from "./role";

export type NavDestination = "planner" | "dispatch" | "cards" | "vault";

// isSolo: a solo company is a single driver who happens to hold role 'admin'
// (solo users are always provisioned as 'admin' -- see CLAUDE.md). They are
// drivers in practice, so they navigate the driver-style Planner/Cards/Vault
// and never the fleet Dispatch page. Without this, a real invited solo driver
// (role 'admin', not a super admin) would be redirected off /planner to
// /planner/dispatch and never reach the driver planner or its first-run
// onboarding. Defaults false so fleet call sites are unchanged.
export function canReachDestination(
  dest: NavDestination,
  role: Role | null,
  isSuperAdmin: boolean,
  isSolo: boolean = false
): boolean {
  if (isSolo) return dest === "planner" || dest === "cards" || dest === "vault";
  switch (dest) {
    case "planner":
      return isSuperAdmin || role === "driver" || role === "lead";
    case "dispatch":
      return isSuperAdmin || role === "admin" || role === "dispatch";
    case "cards":
      return isSuperAdmin || role === "driver" || role === "lead";
    case "vault":
      return true;
  }
}

// Where a role lands on a bare app entry -- null means "no redirect, stay
// put." A super admin is NEVER redirected either way (they get both Planner
// and Dispatch reachable, on purpose, so land wherever they navigate to).
// This reverses a 2026-08-04 decision that admin should never auto-redirect
// off the driver-style Planner -- that reasoning is superseded now that
// admin's Planner IS the Dispatch page, not a shared page with both.
export function defaultLandingPath(role: Role | null, isSuperAdmin: boolean, isSolo: boolean = false): string | null {
  if (isSuperAdmin) return null;
  if (isSolo) return null; // solo = driver-style, stays on the driver Planner
  if (role === "admin" || role === "dispatch") return "/planner/dispatch";
  return null;
}
