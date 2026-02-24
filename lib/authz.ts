// lib/authz.ts
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

// lib/authz.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getActiveCompanyId(supabase: SupabaseClient) {
  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  const user = userRes.user;
  if (!user) return null;

  const { data: sRow, error: sErr } = await supabase
    .from("user_settings")
    .select("active_company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (sErr) throw sErr;
  return (sRow?.active_company_id as string | null) ?? null;
}

/**
 * Get the logged-in user (server-side).
 * Redirects to /login if missing.
 */
export async function getSessionUserOrRedirect() {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  return { supabase, user: data.user };
}

/**
 * Optional app-side helper (NOT DB truth) for quickly gating UI.
 * DB truth is public.super_admins + requireSuperAdmin().
 */
export function isSuperAdminEmail(email?: string | null) {
  const raw = process.env.SUPER_ADMIN_EMAILS || "";
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return !!email && set.has(email.toLowerCase());
}

/**
 * DB-truth super-admin check.
 * Requires you inserted the user into public.super_admins.
 * If not super-admin, sends them back to /calculator.
 */
export async function requireSuperAdmin() {
  const { supabase, user } = await getSessionUserOrRedirect();

  const { data, error } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) redirect("/calculator");

  return { supabase, user };
}

/**
 * Require at least one company membership.
 * If logged in but no memberships, send to /join.
 */
export async function requireMembershipOrJoin() {
  const { supabase, user } = await getSessionUserOrRedirect();

  const { data, error } = await supabase
    .from("user_companies")
    .select("company_id")
    .eq("user_id", user.id)
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) redirect("/join");

  return { supabase, user };
}

/**
 * Utility: fetch memberships (handy for dropdowns in server components).
 */
export async function getMyMemberships() {
  const { supabase, user } = await getSessionUserOrRedirect();

  const { data, error } = await supabase
    .from("user_companies")
    .select("company_id, role, companies(company_id, company_name)")
    .eq("user_id", user.id);

  if (error) throw error;

  const memberships =
    (data ?? []).map((r: any) => ({
      company_id: r.company_id as string,
      role: r.role as string,
      company_name: (r.companies?.company_name ?? "Company") as string,
    })) ?? [];

  return { supabase, user, memberships };
}