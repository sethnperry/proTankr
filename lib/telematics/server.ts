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
