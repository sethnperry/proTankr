// lib/telematics/server.ts
//
// Server-only helpers for the /api/telematics routes: who is calling, whether
// they are an admin of the company, and the company's provider connection.

import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { decryptSecret } from "./crypto";
import { geotabProvider } from "./geotab";
import type { TelematicsProvider } from "./types";
import type { Member } from "./matchDrivers";

export async function callerId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;
  const { data } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  return data?.user?.id ?? null;
}

export async function companyRole(userId: string, companyId: string): Promise<{ role: string | null; superAdmin: boolean }> {
  const admin = getServiceSupabase();
  const [m, s] = await Promise.all([
    admin.from("user_companies").select("role").eq("user_id", userId).eq("company_id", companyId).maybeSingle(),
    admin.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  return { role: (m.data as { role?: string } | null)?.role ?? null, superAdmin: !!s.data };
}

export const isCompanyAdmin = (r: { role: string | null; superAdmin: boolean }) => r.superAdmin || r.role === "admin" || r.role === "owner";

export async function providerFor(companyId: string): Promise<TelematicsProvider | null> {
  const { data } = await getServiceSupabase()
    .from("telematics_connections").select("database_name, user_name, credentials_enc, status").eq("company_id", companyId).maybeSingle();
  const c = data as { database_name: string; user_name: string; credentials_enc: string; status: string } | null;
  if (!c || c.status !== "active") return null;
  return geotabProvider({ database: c.database_name, userName: c.user_name, password: decryptSecret(c.credentials_enc) });
}

/** The company's members with the identity fields used to match provider drivers. */
export async function rosterMembers(companyId: string): Promise<Member[]> {
  const admin = getServiceSupabase();
  const { data: uc } = await admin.from("user_companies").select("user_id").eq("company_id", companyId);
  const ids = ((uc ?? []) as { user_id: string }[]).map((x) => x.user_id);
  if (!ids.length) return [];
  const { data: prof } = await admin.from("profiles").select("user_id, display_name, employee_number").in("user_id", ids);
  const byId = new Map(((prof ?? []) as { user_id: string; display_name: string | null; employee_number: string | null }[]).map((p) => [p.user_id, p]));
  const emails = await Promise.all(ids.map(async (id) => (await admin.auth.admin.getUserById(id)).data.user?.email ?? null));
  return ids.map((id, i) => ({ user_id: id, email: emails[i], display_name: byId.get(id)?.display_name ?? null, employee_number: byId.get(id)?.employee_number ?? null }));
}

/** Provider trailer id -> the company's trailer, for hookup detection. */
export async function trailerNames(companyId: string): Promise<Map<string, { trailerId: string; name: string }>> {
  const admin = getServiceSupabase();
  const { data } = await admin.from("telematics_trailer_map").select("provider_trailer_id, trailer_id").eq("company_id", companyId);
  const rows = (data ?? []) as { provider_trailer_id: string; trailer_id: string }[];
  if (!rows.length) return new Map();
  const { data: tr } = await admin.from("trailers").select("trailer_id, trailer_name").in("trailer_id", rows.map((r) => r.trailer_id));
  const nm = new Map(((tr ?? []) as { trailer_id: string; trailer_name: string }[]).map((t) => [t.trailer_id, t.trailer_name]));
  return new Map(rows.map((r) => [r.provider_trailer_id, { trailerId: r.trailer_id, name: nm.get(r.trailer_id) ?? "" }]));
}
