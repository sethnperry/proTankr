"use client";
// lib/ui/driver/useDashIdentity.ts
//
// Who is signed in, which company is active, their role, and the company switch / sign out.
// The identity half of the old hamburger menu, shared by every dashboard's header and footer.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isRole, type Role } from "./role";

export type DashMembership = {
  company_id: string;
  role: string;
  company: { company_id: string; company_name: string; is_solo: boolean | null } | null;
};

export type DashIdentity = {
  ready: boolean;
  userId: string;
  email: string;
  name: string;
  role: Role | null;
  isSuperAdmin: boolean;
  isSolo: boolean;
  companyId: string;
  companyName: string;
  memberships: DashMembership[];
  switching: boolean;
  switchCompany: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export function useDashIdentity(): DashIdentity {
  const router = useRouter();
  const [state, setState] = useState({ ready: false, userId: "", email: "", name: "", memberships: [] as DashMembership[], activeId: "", isSuperAdmin: false });
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const [{ data: mRows }, { data: sRow }, { data: sa }, { data: prof }] = await Promise.all([
        supabase.from("user_companies").select("company_id, role, company:companies(company_id, company_name, is_solo)").eq("user_id", user.id),
        supabase.from("user_settings").select("active_company_id").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("is_super_admin"),
        supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const ms = (mRows ?? []) as unknown as DashMembership[];
      setState({
        ready: true, userId: user.id, email: user.email ?? "",
        name: String((prof as any)?.display_name ?? "").trim(),
        memberships: ms,
        activeId: (sRow?.active_company_id as string | null) ?? ms[0]?.company_id ?? "",
        isSuperAdmin: Boolean(sa),
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const switchCompany = useCallback(async (id: string) => {
    if (id === state.activeId || switching) return;
    setSwitching(true);
    setState((s) => ({ ...s, activeId: id }));
    await supabase.rpc("set_active_company", { p_company_id: id });
    window.location.reload();
  }, [state.activeId, switching]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/login");
  }, [router]);

  const active = state.memberships.find((m) => m.company_id === state.activeId);
  const raw = active?.role ?? "";
  return {
    ready: state.ready, userId: state.userId, email: state.email,
    name: state.name || state.email.split("@")[0] || "",
    role: isRole(raw) ? raw : null,
    isSuperAdmin: state.isSuperAdmin,
    isSolo: Boolean(active?.company?.is_solo),
    companyId: state.activeId,
    companyName: active?.company?.company_name ?? "",
    memberships: state.memberships,
    switching, switchCompany, signOut,
  };
}
