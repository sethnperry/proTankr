"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import NavMenu from "@/lib/ui/NavMenu";
import { T, css } from "@/lib/ui/driver/tokens";
import { MemberCard } from "@/lib/ui/driver/MemberCard";
import { DriverProfileModal } from "@/lib/ui/driver/DriverProfileModal";
import type { Member } from "@/lib/ui/driver/types";

export default function ProfilePage() {
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

      // Get the user's active company membership
      const { data: memberships } = await supabase
        .from("user_companies")
        .select("company_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!memberships) { setErr("No company membership found."); setLoading(false); return; }

      setCompanyId(memberships.company_id);

      // Get profile data
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
    <div style={css.page}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={css.heading}>Profile</h1>
          <p style={css.subheading}>Your compliance cards and personal details.</p>
        </div>
        <NavMenu />
      </div>

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
            currentUserId={member.user_id}
          />

          {editing && (
            <DriverProfileModal
              member={member}
              companyId={companyId}
             
              onClose={() => setEditing(false)}
              onDone={(updated) => { setEditing(false); load(); onSavedCb?.(updated); }}
            />
          )}
        </>
      )}
    </div>
  );
}
