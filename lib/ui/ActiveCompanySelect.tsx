"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

type Membership = {
  company_id: string;
  role: string;
  company?: { company_id: string; company_name: string } | null;
};

export default function ActiveCompanySelect() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return;

        const { data: mRows, error: mErr } = await supabase
          .from("user_companies")
          .select("company_id, role, company:companies(company_id, company_name)")
          .eq("user_id", user.id);

        if (mErr) throw mErr;

        const ms: Membership[] = (mRows ?? []) as any;
        if (cancelled) return;
        setMemberships(ms);

        const { data: sRow, error: sErr } = await supabase
          .from("user_settings")
          .select("active_company_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (sErr) throw sErr;

        const current = (sRow?.active_company_id as string | null) ?? "";

        // If no active company set yet, pick the first membership and set it.
        if (!current && ms.length > 0) {
          const first = ms[0].company_id;
          const { error: setErr2 } = await supabase.rpc("set_active_company", { p_company_id: first });
          if (setErr2) throw setErr2;
          if (!cancelled) setActiveCompanyId(first);
        } else {
          if (!cancelled) setActiveCompanyId(current);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load companies.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onChange(nextId: string) {
    setErr(null);
    setActiveCompanyId(nextId);

    const { error } = await supabase.rpc("set_active_company", { p_company_id: nextId });
    if (error) setErr(error.message);
  }

  if (loading) return <span style={{ opacity: 0.7 }}>Company…</span>;
  if (err) return <span style={{ color: "#f88" }}>{err}</span>;

  // If only one company, no need to show dropdown.
 if (memberships.length === 0) {
  return <span style={{ opacity: 0.7 }}>No company</span>;
}

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ opacity: 0.8 }}>Company</span>
  <select
  value={activeCompanyId}
  onChange={(e) => onChange(e.target.value)}
  disabled={memberships.length <= 1}
  
   style={{
    padding: "6px 10px",
    borderRadius: 10,
    backgroundColor: "#000",
    color: "#fff",
    border: "1px solid #333",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
  }}
>
  {memberships.map((m) => (
    <option
      key={m.company_id}
      value={m.company_id}
      style={{ backgroundColor: "#000", color: "#fff" }}
    >
      {m.company?.company_name ?? "Company"}
    </option>
  ))}
</select>
      
    </div>
  );
}