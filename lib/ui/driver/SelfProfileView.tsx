// lib/ui/driver/SelfProfileView.tsx
"use client";
// Self-service profile view (name, hire date, division/region/local area,
// employee #) -- shared by app/profile/page.tsx and the Settings modal's
// embedded Profile screen so there's one fetch/edit implementation instead
// of two. Driver's License/Medical Card/TWIC/Port IDs/Terminals are
// intentionally omitted here (hideComplianceCards/hideComplianceFields) --
// the Cards tab (Terminals/Badges/Credentials) is the source of truth for
// that data now.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { T } from "./tokens";
import { MemberCard } from "./MemberCard";
import { DriverProfileModal } from "./DriverProfileModal";
import type { Member } from "./types";

export function SelfProfileView() {
  const [member,     setMember]     = useState<Member | null>(null);
  const [companyId,  setCompanyId]  = useState<string | null>(null);
  const [editing,    setEditing]    = useState(false);
  const [onSavedCb,  setOnSavedCb]  = useState<((updated: Partial<Member>) => void) | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr("Not logged in."); setLoading(false); return; }

      const { data: memberships } = await supabase
        .from("user_companies")
        .select("company_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!memberships) { setErr("No company membership found."); setLoading(false); return; }

      setCompanyId(memberships.company_id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, hire_date, division, region, local_area, employee_number")
        .eq("user_id", user.id)
        .maybeSingle();

      setMember({
        user_id:         user.id,
        role:            memberships.role,
        email:           user.email ?? "",
        display_name:    profile?.display_name ?? null,
        hire_date:       profile?.hire_date ?? null,
        division:        profile?.division ?? null,
        region:          profile?.region ?? null,
        local_area:      profile?.local_area ?? null,
        employee_number: profile?.employee_number ?? null,
      });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      {loading && (
        <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>
      )}

      {err && !loading && (
        <div style={{ color: T.danger, fontSize: 13 }}>{err}</div>
      )}

      {member && companyId && !loading && (
        <>
          <MemberCard
            member={member}
            companyId={companyId}
            onRefresh={load}
            onEditProfile={(m, onSaved) => { setOnSavedCb(() => onSaved); setEditing(true); }}
            hideRoleDropdown
            hideRemove
            hideComplianceCards
            currentUserId={member.user_id}
          />

          {editing && (
            <DriverProfileModal
              member={member}
              companyId={companyId}
              hideComplianceFields
              showPersonalFields
              onClose={() => setEditing(false)}
              onDone={(updated) => { setEditing(false); load(); onSavedCb?.(updated); }}
            />
          )}
        </>
      )}
    </div>
  );
}
