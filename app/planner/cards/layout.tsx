"use client";
// app/planner/cards/layout.tsx
//
// Shared access gate for every Cards route (page.tsx, badges/page.tsx,
// credentials/page.tsx) -- all three previously had no route-level gate at
// all, relying entirely on the (now-removed) tab bar simply not showing
// this tab to admin/dispatch. Now that admin/dispatch have their own
// Planner (the Dispatch page, app/planner/dispatch/page.tsx) and Cards is
// lead/driver-only (see lib/ui/driver/navDestinations.ts), a real gate is
// needed here too -- one shared layout instead of tripling the same
// redirect effect across three page files, since all three shared the
// identical isDispatchContext check before this.
//
// Redirects a blocked admin/dispatch visit to /planner/dispatch (their real
// destination now), not a generic /planner they may not be able to reach
// either -- symmetric with the new gate on the Dispatch page
// (app/planner/dispatch/page.tsx) sending a blocked driver/lead back to
// /planner.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCalculatorShell } from "../CalculatorShellContext";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";

export default function CardsLayout({ children }: { children: React.ReactNode }) {
  const shell = useCalculatorShell();
  const router = useRouter();

  // Gated on isSuperAdminResolved, same reasoning as the landing redirect in
  // page.tsx and the new gate on the Dispatch page -- role and isSuperAdmin
  // resolve via two independent effects with no ordering guarantee.
  useEffect(() => {
    if (shell.role == null) return;
    if (!shell.isSuperAdminResolved) return;
    if (shell.isSolo === null) return; // a solo admin CAN reach Cards -- wait for resolution before deciding
    if (!canReachDestination("cards", shell.role, shell.isSuperAdmin, shell.isSolo)) {
      router.replace("/planner/dispatch");
    }
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, router]);

  return <>{children}</>;
}
