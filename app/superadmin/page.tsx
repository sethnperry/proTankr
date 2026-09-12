"use client";
// app/superadmin/page.tsx  ("ProTankr Dash")
//
// Internal ProTankr-operator console (super-admin only). One screen to:
//   - see fleet-wide stats
//   - pick a company (dropdown, not a nav clutter) and operate as it
//     (open its Planner / Company Admin) or manage it (rename, Solo/Fleet)
//   - invite users to the selected company, or invite a brand-new solo driver
//   - a couple of not-yet-wired placeholders for future operator tools
//
// Writes to companies still go through super_admin_update_company (companies
// has no client-write RLS). Layout is intentionally single-column/wrapping so
// it fits a phone with no horizontal run-off.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NavMenu from "@/lib/ui/NavMenu";
import { supabase } from "@/lib/supabase/client";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { DEFAULT_STALE_API_DAYS } from "@/lib/config/plannerSafety";

type CompanyRow = {
  company_id: string;
  company_name: string;
  is_solo: boolean;
  owner_user_id: string | null;
  created_at: string;
  memberCount: number;
  ownerName: string | null;
};

const INVITE_ROLES = [
  { value: "driver", label: "Driver" },
  { value: "lead", label: "Lead Driver" },
  { value: "dispatch", label: "Dispatch" },
  { value: "admin", label: "Admin" },
];

export default function ProTankrDashPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedId, setSelectedId] = useState<string>("");
  const [nameDraft, setNameDraft] = useState<string>("");

  // Invite to selected company (fleet)
  const [fEmail, setFEmail] = useState("");
  const [fRole, setFRole] = useState("driver");
  const [fRegion, setFRegion] = useState("");
  const [fBusy, setFBusy] = useState(false);
  const [fMsg, setFMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Invite a new solo driver
  const [sEmail, setSEmail] = useState("");
  const [sPaid, setSPaid] = useState(false);
  const [sBusy, setSBusy] = useState(false);
  const [sMsg, setSMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadCompanies = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [{ data: co, error: coErr }, { data: memberships, error: memErr }, { data: { user } }] = await Promise.all([
        supabase.from("companies").select("company_id, company_name, is_solo, owner_user_id, created_at").order("created_at"),
        supabase.from("user_companies").select("company_id"),
        supabase.auth.getUser(),
      ]);
      if (coErr) throw coErr;
      if (memErr) throw memErr;

      let active: string | null = null;
      if (user) {
        const { data: s } = await supabase.from("user_settings").select("active_company_id").eq("user_id", user.id).maybeSingle();
        active = (s?.active_company_id as string | null) ?? null;
      }
      setActiveCompanyId(active);

      const counts: Record<string, number> = {};
      for (const m of memberships ?? []) {
        const cid = String((m as any).company_id);
        counts[cid] = (counts[cid] ?? 0) + 1;
      }
      const ownerIds = Array.from(new Set((co ?? []).map((c: any) => c.owner_user_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (ownerIds.length) {
        const { data: names } = await supabase.rpc("get_display_names", { p_user_ids: ownerIds });
        for (const row of names ?? []) if ((row as any).user_id) nameMap[String((row as any).user_id)] = (row as any).display_name ?? "Unknown";
      }
      const rows: CompanyRow[] = (co ?? []).map((c: any) => ({
        company_id: String(c.company_id),
        company_name: c.company_name,
        is_solo: Boolean(c.is_solo),
        owner_user_id: c.owner_user_id ?? null,
        created_at: c.created_at,
        memberCount: counts[String(c.company_id)] ?? 0,
        ownerName: c.owner_user_id ? (nameMap[String(c.owner_user_id)] ?? "Unknown") : null,
      }));
      setCompanies(rows);
      setSelectedId((prev) => prev || active || rows[0]?.company_id || "");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load companies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error: rpcErr } = await supabase.rpc("is_super_admin");
      if (rpcErr || !data) { setAuthorized(false); setChecking(false); return; }
      setAuthorized(true); setChecking(false);
      await loadCompanies();
    })();
  }, [loadCompanies]);

  const selected = useMemo(() => companies.find((c) => c.company_id === selectedId) ?? null, [companies, selectedId]);
  useEffect(() => { setNameDraft(selected?.company_name ?? ""); setFMsg(null); }, [selectedId, selected?.company_name]);

  const stats = useMemo(() => ({
    companies: companies.length,
    members: companies.reduce((s, c) => s + c.memberCount, 0),
    solo: companies.filter((c) => c.is_solo).length,
    fleet: companies.filter((c) => !c.is_solo).length,
  }), [companies]);

  async function updateCompany(next: Partial<Pick<CompanyRow, "company_name" | "is_solo">>) {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("super_admin_update_company", {
        p_company_id: selected.company_id,
        p_company_name: next.company_name ?? selected.company_name,
        p_is_solo: next.is_solo ?? selected.is_solo,
      });
      if (rpcErr) throw rpcErr;
      await loadCompanies();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update company.");
    } finally {
      setBusy(false);
    }
  }

  async function useCompanyAs(dest: string) {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("set_active_company", { p_company_id: selected.company_id });
      if (rpcErr) throw rpcErr;
      window.location.href = dest; // hard nav so all shell state reloads for the new company
    } catch (e: any) {
      setError(e?.message ?? "Couldn't switch to this company (are you a member?).");
      setBusy(false);
    }
  }

  async function sendFleetInvite() {
    if (!selected) return;
    const email = fEmail.trim();
    if (!email) { setFMsg({ ok: false, text: "Enter an email." }); return; }
    setFBusy(true); setFMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ email, companyId: selected.company_id, role: fRole, region: fRegion.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status}).`);
      setFMsg({ ok: true, text: `Invited ${email} to ${selected.company_name} as ${fRole}.` });
      setFEmail(""); setFRegion("");
    } catch (e: any) {
      setFMsg({ ok: false, text: e?.message ?? "Invite failed." });
    } finally { setFBusy(false); }
  }

  async function sendSoloInvite() {
    const email = sEmail.trim();
    if (!email) { setSMsg({ ok: false, text: "Enter an email." }); return; }
    setSBusy(true); setSMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/superadmin/invite-solo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ email, comped: !sPaid }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status}).`);
      setSMsg({ ok: true, text: `Invited ${email} as a solo driver (${sPaid ? "Paid — trial" : "Free — comped"}).` });
      setSEmail("");
      await loadCompanies();
    } catch (e: any) {
      setSMsg({ ok: false, text: e?.message ?? "Invite failed." });
    } finally { setSBusy(false); }
  }

  // ── styles ──
  const base: React.CSSProperties = {
    minHeight: "100dvh", background: "#111111", color: "rgba(255,255,255,0.9)",
    fontFamily: "var(--font-outfit), Outfit, -apple-system, sans-serif",
    padding: "20px 16px 60px", boxSizing: "border-box",
  };
  const shell: React.CSSProperties = { maxWidth: 640, margin: "0 auto", width: "100%" };
  const card: React.CSSProperties = { borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", padding: 16, marginBottom: 14 };
  const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 900, marginBottom: 4 };
  const cardSub: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12 };
  const input: React.CSSProperties = { flex: "1 1 200px", minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const primaryBtn: React.CSSProperties = { padding: "10px 16px", borderRadius: 10, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
  const ghostBtn: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
  const selectBtn: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 700, textAlign: "left" };

  if (checking) return <div style={base}>Checking access…</div>;

  if (!authorized) {
    return (
      <div style={base}><div style={shell}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}><NavMenu /></div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Not authorized</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>This tool is restricted to ProTankr super admins.</div>
        <button type="button" onClick={() => router.push("/planner")} style={ghostBtn}>Back to Planner</button>
      </div></div>
    );
  }

  const msgLine = (m: { ok: boolean; text: string } | null) =>
    m ? <div style={{ marginTop: 10, fontSize: 13, color: m.ok ? "#4ade80" : "#f87171" }}>{m.text}</div> : null;

  return (
    <div style={base}><div style={shell}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.02 }}>ProTankr Dash</div>
        <NavMenu />
      </div>

      {error && <div style={{ ...card, background: "rgba(180,40,40,0.16)", borderColor: "rgba(180,40,40,0.32)", fontSize: 13 }}>{error}</div>}

      {/* Stats */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {[
          { k: "Companies", v: stats.companies },
          { k: "Members", v: stats.members },
          { k: "Solo", v: stats.solo },
          { k: "Fleet", v: stats.fleet },
        ].map((s) => (
          <div key={s.k} style={{ flex: "1 1 70px", minWidth: 70, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", padding: "12px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{loading ? "—" : s.v}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>{s.k}</div>
          </div>
        ))}
      </div>

      {/* Company picker + manage */}
      <div style={card}>
        <div style={cardTitle}>Company</div>
        <div style={cardSub}>Pick a company to operate as or manage.</div>

        <CustomSelect
          value={selectedId}
          onChange={setSelectedId}
          options={companies.map((c) => ({ value: c.company_id, label: `${c.company_name}${c.is_solo ? " · Solo" : " · Fleet"}${c.company_id === activeCompanyId ? " · (current)" : ""}` }))}
          buttonStyle={selectBtn}
        />

        {selected && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>Name</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} style={input} />
              <button style={ghostBtn} disabled={busy || !nameDraft.trim() || nameDraft.trim() === selected.company_name}
                onClick={() => updateCompany({ company_name: nameDraft.trim() })}>Save</button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
              <span>Owner: <b style={{ color: "#fff" }}>{selected.ownerName ?? "—"}</b></span>
              <span>{selected.memberCount} member{selected.memberCount !== 1 ? "s" : ""}</span>
              <span>Created {new Date(selected.created_at).toLocaleDateString()}</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button style={primaryBtn} disabled={busy} onClick={() => useCompanyAs("/planner")}>Open Planner as this</button>
              <button style={ghostBtn} disabled={busy} onClick={() => useCompanyAs("/admin")}>Company Admin</button>
              <button style={ghostBtn} disabled={busy}
                onClick={() => updateCompany({ is_solo: !selected.is_solo })}
                title="Toggle Solo/Fleet">
                {busy ? "…" : selected.is_solo ? "Make Fleet" : "Make Solo"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invite to selected company — Fleet only. A Solo company is one
          driver by definition; adding a teammate means converting it to
          Fleet first (an explicit, operator-gated decision until pricing
          exists). Solo companies keep their own "Invite Solo Driver" path
          below, which creates each driver their own separate solo account. */}
      {selected && (
        <div style={card}>
          <div style={cardTitle}>Invite to {selected.company_name}</div>
          {selected.is_solo ? (
            <>
              <div style={cardSub}>This is a <b style={{ color: "#fff" }}>Solo</b> company — one driver, no team. To add teammates it has to become a Fleet company first.</div>
              <button style={primaryBtn} disabled={busy}
                onClick={() => updateCompany({ is_solo: false })}>
                {busy ? "…" : "Make Fleet, then invite"}
              </button>
            </>
          ) : (
            <>
              <div style={cardSub}>Adds a user to this company and emails them a sign-in link. (You must be an admin of it.)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="user@email.com" autoComplete="email" inputMode="email" style={input}
                  onKeyDown={(e) => { if (e.key === "Enter") sendFleetInvite(); }} />
                <div style={{ width: 150 }}>
                  <CustomSelect value={fRole} onChange={setFRole} options={INVITE_ROLES} buttonStyle={selectBtn} />
                </div>
                <input value={fRegion} onChange={(e) => setFRegion(e.target.value)} placeholder="Region (optional)" style={{ ...input, minWidth: 130 }}
                  onKeyDown={(e) => { if (e.key === "Enter") sendFleetInvite(); }} />
                <button style={primaryBtn} disabled={fBusy} onClick={sendFleetInvite}>{fBusy ? "Sending…" : "Send Invite"}</button>
              </div>
              {msgLine(fMsg)}
            </>
          )}
        </div>
      )}

      {/* Invite Solo Driver */}
      <div style={card}>
        <div style={cardTitle}>Invite Solo Driver</div>
        <div style={cardSub}>Creates the driver their own solo account and emails them a sign-in code + install steps.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} placeholder="driver@email.com" autoComplete="email" inputMode="email" style={input}
            onKeyDown={(e) => { if (e.key === "Enter") sendSoloInvite(); }} />
          <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.15)" }}>
            {[{ paid: false, label: "Free" }, { paid: true, label: "Paid" }].map((opt) => {
              const active = sPaid === opt.paid;
              return (
                <button key={opt.label} type="button" onClick={() => setSPaid(opt.paid)}
                  style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800,
                    background: active ? (opt.paid ? "rgba(251,191,36,0.16)" : "rgba(74,222,128,0.16)") : "transparent",
                    color: active ? (opt.paid ? "#fbbf24" : "#4ade80") : "rgba(255,255,255,0.55)" }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button style={primaryBtn} disabled={sBusy} onClick={sendSoloInvite}>{sBusy ? "Sending…" : "Send Invite"}</button>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 10 }}>
          {sPaid ? "Paid — starts a trial flagged for billing when checkout is live. Full access today."
                 : "Free — comped, non-expiring access. For testers and people helping with feedback."}
        </div>
        {msgLine(sMsg)}
      </div>

      {/* Planner Safety (placeholder) */}
      <div style={card}>
        <div style={cardTitle}>Planner Safety</div>
        <div style={cardSub}>Operator-tunable safety knobs. Not editable yet — placeholder.</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 13 }}>Stale-API threshold</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 900 }}>{DEFAULT_STALE_API_DAYS}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>days</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>Change in <code>lib/config/plannerSafety.ts</code> until editable here.</div>
      </div>

      {/* Future operator tools (placeholders) */}
      <div style={{ ...card, opacity: 0.6 }}>
        <div style={cardTitle}>Coming soon</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
          <div>• Signups &amp; activity feed (recent invites, first loads)</div>
          <div>• Subscriptions &amp; billing overview (comped vs paid)</div>
          <div>• Broadcast a message to all drivers</div>
          <div>• Terminal catalog / data-quality tools</div>
        </div>
      </div>
    </div></div>
  );
}
