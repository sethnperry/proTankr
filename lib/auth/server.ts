// lib/auth/server.ts
//
// Server-only sign-in helpers for API routes: who is calling (from the Bearer token), their role in a company, and whether
// that makes them an admin. Not tied to any provider; the telematics routes use them too.

import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";

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
