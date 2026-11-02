// lib/ui/driver/dashboards.ts
//
// Pure: which dashboards a person can open, and the shared tools every dashboard carries.
// The title sheet on every dashboard lists exactly this. Rules come from navDestinations.ts.

import type { Role } from "./role.ts";
import { canReachDestination } from "./navDestinations.ts";

export type DashboardId = "driver" | "dispatch" | "company" | "protankr";
export type DashboardLink = { id: DashboardId; label: string; href: string };

export const DASHBOARD_TITLES: Record<DashboardId, string> = {
  driver: "Driver Dashboard",
  dispatch: "Dispatch Dashboard",
  company: "Company Dashboard",
  protankr: "ProTankr Dashboard",
};

export function reachableDashboards(role: Role | null, isSuperAdmin: boolean, isSolo: boolean): DashboardLink[] {
  const out: DashboardLink[] = [];
  if (canReachDestination("home", role, isSuperAdmin, isSolo)) out.push({ id: "driver", label: DASHBOARD_TITLES.driver, href: "/planner/home" });
  if (canReachDestination("dispatch", role, isSuperAdmin, isSolo)) out.push({ id: "dispatch", label: DASHBOARD_TITLES.dispatch, href: "/planner/dispatch" });
  if (!isSolo && (isSuperAdmin || role === "admin" || role === "lead" || role === "dispatch")) out.push({ id: "company", label: DASHBOARD_TITLES.company, href: "/admin" });
  if (isSuperAdmin) out.push({ id: "protankr", label: DASHBOARD_TITLES.protankr, href: "/superadmin" });
  return out;
}

// Which dashboard a path belongs to (null = not a dashboard route).
export function dashboardForPath(pathname: string | null): DashboardId | null {
  const p = pathname ?? "";
  if (p === "/planner/home" || p.startsWith("/planner/home/")) return "driver";
  if (p === "/planner/dispatch" || p.startsWith("/planner/dispatch/")) return "dispatch";
  if (p === "/admin" || p.startsWith("/admin/")) return "company";
  if (p === "/superadmin" || p.startsWith("/superadmin/")) return "protankr";
  return null;
}

// Where "‹ Dashboard" goes from a page that isn't a dashboard.
export function homeDashboardHref(role: Role | null, isSuperAdmin: boolean, isSolo: boolean): string {
  const list = reachableDashboards(role, isSuperAdmin, isSolo);
  return list[0]?.href ?? "/planner/home";
}

// Tiles every dashboard shows (Vault and Reports). Same destinations whatever the role.
export const SHARED_TOOLS = [
  { id: "vault", label: "Vault", sub: "Passwords and cards", href: "/planner/vault", icon: "lock" },
  { id: "reports", label: "Reports", sub: "Loads, history, fuel", href: "/planner/reports", icon: "chart" },
] as const;
