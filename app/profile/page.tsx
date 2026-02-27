"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import NavMenu from "@/lib/ui/NavMenu";
import { T, css } from "@/lib/ui/driver/tokens";
import { MemberCard } from "@/lib/ui/driver/MemberCard";
import { DriverProfileModal } from "@/lib/ui/driver/DriverProfileModal";
import type { Member } from "@/lib/ui/driver/types";

export default function ProfilePage() {
  const supabase  = useMemo(() => createSupabaseBrowser(), []);
  const [member,     setMember]     = useState<Member | null>(null);
  const [companyId,  setCompanyId]  = useState<string | null>(null);
  const [editing,    setEditing]    = useState(false);
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
            supabase={supabase}
            onRefresh={load}
            onEditProfile={() => setEditing(true)}
            hideRoleDropdown  // can't reassign own role
            hideRemove        // can't remove yourself
          />

          {editing && (
            <DriverProfileModal
              member={member}
              companyId={companyId}
              supabase={supabase}
              onClose={() => setEditing(false)}
              onDone={() => { setEditing(false); load(); }}
              // no onRemove prop = no Remove User button
            />
          )}
        </>
      )}
    </div>
  );
}
