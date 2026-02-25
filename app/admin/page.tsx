"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import NavMenu from "@/lib/ui/NavMenu";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Member = {
  user_id: string;
  role: string;
  email: string;
  display_name: string | null;
};

type Truck = {
  truck_id: string;
  truck_name: string;
  active: boolean;
  region: string | null;
  status_code: string | null;
};

type Compartment = {
  comp_number: number;
  max_gallons: number;
  position: number;
};

type Trailer = {
  trailer_id: string;
  trailer_name: string;
  active: boolean;
  cg_max: number;
  region: string | null;
  status_code: string | null;
  compartments?: Compartment[];
};

type Combo = {
  combo_id: string;
  combo_name: string;
  truck_id: string;
  trailer_id: string;
  tare_lbs: number;
  target_weight: number | null;
  active: boolean;
  truck?: { truck_name: string } | { truck_name: string }[] | null;
  trailer?: { trailer_name: string } | { trailer_name: string }[] | null;
};

// ─────────────────────────────────────────────────────────────
// Style tokens — matches app dark theme
// ─────────────────────────────────────────────────────────────

const T = {
  bg:        "#0a0a0a",
  surface:   "#111",
  surface2:  "#181818",
  border:    "#2a2a2a",
  borderHov: "#444",
  text:      "rgba(255,255,255,0.92)",
  muted:     "rgba(255,255,255,0.45)",
  accent:    "#f5a623",
  danger:    "#e05555",
  success:   "#4caf82",
  radius:    12,
  radiusSm:  8,
};

const css = {
  page: {
    minHeight: "100vh",
    background: T.bg,
    color: T.text,
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "24px 16px 64px",
    maxWidth: 900,
    margin: "0 auto",
    boxSizing: "border-box" as const,
  },
  heading: {
    fontSize: "clamp(20px, 4vw, 28px)",
    fontWeight: 800,
    letterSpacing: -0.5,
    margin: 0,
  },
  subheading: {
    fontSize: 13,
    color: T.muted,
    marginTop: 4,
    marginBottom: 0,
  },
  card: {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    padding: "16px 18px",
    marginBottom: 10,
  },
  sectionHead: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 14,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    color: T.muted,
    margin: 0,
  },
  btn: (variant: "primary" | "ghost" | "danger" | "subtle") => ({
    padding: variant === "subtle" ? "5px 10px" : "8px 16px",
    borderRadius: T.radiusSm,
    border: variant === "ghost" ? `1px solid ${T.border}` : "none",
    background:
      variant === "primary" ? T.accent :
      variant === "danger"  ? T.danger :
      variant === "subtle"  ? "rgba(255,255,255,0.06)" :
      "transparent",
    color:
      variant === "primary" ? "#000" :
      variant === "danger"  ? "#fff" :
      T.text,
    fontWeight: variant === "primary" ? 700 : 500,
    fontSize: variant === "subtle" ? 12 : 13,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    letterSpacing: variant === "primary" ? 0.3 : 0,
  }),
  input: {
    padding: "9px 12px",
    borderRadius: T.radiusSm,
    border: `1px solid ${T.border}`,
    background: T.surface2,
    color: T.text,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  select: {
    padding: "9px 12px",
    borderRadius: T.radiusSm,
    border: `1px solid ${T.border}`,
    background: T.surface2,
    color: T.text,
    fontSize: 13,
    outline: "none",
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: T.muted,
    display: "block" as const,
    marginBottom: 5,
  },
  row: {
    display: "flex" as const,
    gap: 10,
    alignItems: "center" as const,
    flexWrap: "wrap" as const,
  },
  tag: (color: string) => ({
    display: "inline-block" as const,
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    background: `${color}22`,
    color: color,
    border: `1px solid ${color}44`,
  }),
  divider: {
    border: "none",
    borderTop: `1px solid ${T.border}`,
    margin: "10px 0",
  },
};

// ─────────────────────────────────────────────────────────────
// Modal wrapper
// ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius + 4,
        padding: "24px 22px",
        width: "100%",
        maxWidth: 480,
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
          <button onClick={onClose} style={{ ...css.btn("ghost"), padding: "4px 10px", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Field component
// ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={css.label}>{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Error / Success banner
// ─────────────────────────────────────────────────────────────

function Banner({ msg, type }: { msg: string; type: "error" | "success" }) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: T.radiusSm,
      background: type === "error" ? `${T.danger}18` : `${T.success}18`,
      border: `1px solid ${type === "error" ? T.danger : T.success}44`,
      color: type === "error" ? T.danger : T.success,
      fontSize: 13,
      marginBottom: 14,
    }}>{msg}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compartment editor
// ─────────────────────────────────────────────────────────────

function CompartmentEditor({ comps, onChange }: {
  comps: Compartment[];
  onChange: (c: Compartment[]) => void;
}) {
  function update(i: number, field: keyof Compartment, val: string) {
    const next = comps.map((c, idx) => idx === i ? { ...c, [field]: field === "comp_number" ? parseInt(val) || 0 : parseFloat(val) || 0 } : c);
    onChange(next);
  }
  function add() {
    onChange([...comps, { comp_number: comps.length + 1, max_gallons: 0, position: comps.length }]);
  }
  function remove(i: number) {
    onChange(comps.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, comp_number: idx + 1, position: idx })));
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>COMPARTMENTS ({comps.length})</span>
        <button type="button" onClick={add} style={css.btn("subtle")}>+ Add</button>
      </div>
      {comps.length === 0 && (
        <div style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>No compartments added yet.</div>
      )}
      {comps.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <div style={{ width: 28, fontSize: 12, color: T.muted, textAlign: "center", fontWeight: 700 }}>
            {c.comp_number}
          </div>
          <input
            type="number"
            placeholder="Max gal"
            value={c.max_gallons || ""}
            onChange={e => update(i, "max_gallons", e.target.value)}
            style={{ ...css.input, width: 100 }}
          />
          <input
            type="number"
            placeholder="Position"
            value={c.position || ""}
            onChange={e => update(i, "position", e.target.value)}
            style={{ ...css.input, width: 90 }}
          />
          <button type="button" onClick={() => remove(i)} style={{ ...css.btn("ghost"), padding: "6px 10px", color: T.danger, borderColor: `${T.danger}44`, flexShrink: 0 }}>✕</button>
        </div>
      ))}
      {comps.length > 0 && (
        <div style={{ display: "flex", gap: 16, fontSize: 11, color: T.muted, paddingLeft: 36, marginTop: 2 }}>
          <span>Max gal</span><span>CG position</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Admin Page
// ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [companyId, setCompanyId]   = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [userRole, setUserRole]     = useState<string | null>(null);
  const [members, setMembers]       = useState<Member[]>([]);
  const [trucks, setTrucks]         = useState<Truck[]>([]);
  const [trailers, setTrailers]     = useState<Trailer[]>([]);
  const [combos, setCombos]         = useState<Combo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState<string | null>(null);

  // Modal state
  const [inviteModal,   setInviteModal]   = useState(false);
  const [truckModal,    setTruckModal]    = useState<Truck | null | "new">(null);
  const [trailerModal,  setTrailerModal]  = useState<Trailer | null | "new">(null);
  const [comboModal,    setComboModal]    = useState<Combo | null | "new">(null);

  // ── Load data ──────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setErr("Not authenticated."); setLoading(false); return; }

      // Active company
      const { data: settings } = await supabase
        .from("user_settings")
        .select("active_company_id")
        .eq("user_id", uid)
        .maybeSingle();

      const cid = settings?.active_company_id as string | null;
      if (!cid) { setErr("No active company selected."); setLoading(false); return; }
      setCompanyId(cid);

      // Company name + user role
      const { data: memRow } = await supabase
        .from("user_companies")
        .select("role, company:companies(company_name)")
        .eq("user_id", uid)
        .eq("company_id", cid)
        .maybeSingle();

      setUserRole(memRow?.role ?? null);
      setCompanyName((memRow?.company as any)?.company_name ?? "");

      if (memRow?.role !== "admin") {
        setErr("Admin access required for this page.");
        setLoading(false);
        return;
      }

      // Members
      // Load members with emails via RPC (emails aren't accessible from client directly)
      const { data: memberRows } = await supabase
        .from("user_companies")
        .select("user_id, role")
        .eq("company_id", cid);

      const { data: profileRows } = await supabase
        .from("profiles")
        .select("user_id, display_name");

      // Get emails for members via RPC
      const memberIds = (memberRows ?? []).map((m: any) => m.user_id);
      let emailMap: Record<string, string> = {};
      if (memberIds.length > 0) {
        const { data: emailRows } = await supabase
          .rpc("get_company_member_emails", { p_company_id: cid });
        for (const row of (emailRows ?? []) as any[]) {
          emailMap[row.user_id] = row.email;
        }
      }

      const profileMap = Object.fromEntries((profileRows ?? []).map((p: any) => [p.user_id, p.display_name]));

      const cleanMembers: Member[] = ((memberRows ?? []) as any[]).map(m => ({
        user_id: m.user_id,
        role: m.role,
        email: emailMap[m.user_id] ?? "",
        display_name: profileMap[m.user_id] ?? null,
      }));
      setMembers(cleanMembers);

      // Trucks
      const { data: truckRows } = await supabase
        .from("trucks")
        .select("truck_id, truck_name, active, region, status_code")
        .eq("company_id", cid)
        .order("truck_name");
      setTrucks((truckRows ?? []) as Truck[]);

      // Trailers + compartments
      const { data: trailerRows } = await supabase
        .from("trailers")
        .select("trailer_id, trailer_name, active, cg_max, region, status_code")
        .eq("company_id", cid)
        .order("trailer_name");

      const tIds = (trailerRows ?? []).map((t: any) => t.trailer_id);
      let compMap: Record<string, Compartment[]> = {};
      if (tIds.length > 0) {
        const { data: compRows } = await supabase
          .from("trailer_compartments")
          .select("trailer_id, comp_number, max_gallons, position")
          .in("trailer_id", tIds)
          .order("comp_number");
        for (const c of (compRows ?? []) as any[]) {
          if (!compMap[c.trailer_id]) compMap[c.trailer_id] = [];
          compMap[c.trailer_id].push({ comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position });
        }
      }
      setTrailers(((trailerRows ?? []) as Trailer[]).map(t => ({ ...t, compartments: compMap[t.trailer_id] ?? [] })));

      // Combos
      const { data: comboRows } = await supabase
        .from("equipment_combos")
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, truck:trucks(truck_name), trailer:trailers(trailer_name)")
        .eq("company_id", cid)
        .order("combo_name");
      setCombos((comboRows ?? []) as unknown as Combo[]);

    } catch (e: any) {
      setErr(e?.message ?? "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Guards ─────────────────────────────────────────────────

  if (loading) return (
    <div style={{ ...css.page, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }}>
      Loading…
    </div>
  );

  if (err) return (
    <div style={css.page}>
      <Banner msg={err} type="error" />
    </div>
  );

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={css.page}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 12 }}>
        <div>
          <h1 style={css.heading}>{companyName}</h1>
          <p style={css.subheading}>Company Admin</p>
        </div>
        <NavMenu />
      </div>

      {/* ── USERS ── */}
      <section style={{ marginBottom: 32 }}>
        <div style={css.sectionHead}>
          <h2 style={css.sectionTitle}>Users ({members.length})</h2>
          <button style={css.btn("primary")} onClick={() => setInviteModal(true)}>
            + Invite
          </button>
        </div>

        {members.length === 0 && (
          <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No members found.</div>
        )}

        {members.map(m => (
          <MemberRow
            key={m.user_id}
            member={m}
            currentUserId={companyId ?? ""}
            onRefresh={loadAll}
            companyId={companyId!}
            supabase={supabase}
          />
        ))}
      </section>

      <hr style={css.divider} />

      {/* ── TRUCKS ── */}
      <section style={{ marginBottom: 32, marginTop: 28 }}>
        <div style={css.sectionHead}>
          <h2 style={css.sectionTitle}>Trucks ({trucks.filter(t => t.active).length} active)</h2>
          <button style={css.btn("primary")} onClick={() => setTruckModal("new")}>+ Add Truck</button>
        </div>

        {trucks.length === 0 && (
          <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trucks yet.</div>
        )}
        {trucks.map(t => (
          <div key={t.truck_id} style={{ ...css.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.truck_name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                {t.region && <span style={{ marginRight: 8 }}>{t.region}</span>}
                <span style={css.tag(t.active ? T.success : T.muted)}>
                  {t.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <button style={css.btn("subtle")} onClick={() => setTruckModal(t)}>Edit</button>
          </div>
        ))}
      </section>

      <hr style={css.divider} />

      {/* ── TRAILERS ── */}
      <section style={{ marginBottom: 32, marginTop: 28 }}>
        <div style={css.sectionHead}>
          <h2 style={css.sectionTitle}>Trailers ({trailers.filter(t => t.active).length} active)</h2>
          <button style={css.btn("primary")} onClick={() => setTrailerModal("new")}>+ Add Trailer</button>
        </div>

        {trailers.length === 0 && (
          <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trailers yet.</div>
        )}
        {trailers.map(t => (
          <div key={t.trailer_id} style={{ ...css.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.trailer_name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                <span>{(t.compartments ?? []).length} comps</span>
                {t.region && <span>· {t.region}</span>}
                <span style={css.tag(t.active ? T.success : T.muted)}>
                  {t.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <button style={css.btn("subtle")} onClick={() => setTrailerModal(t)}>Edit</button>
          </div>
        ))}
      </section>

      <hr style={css.divider} />

      {/* ── COMBOS ── */}
      <section style={{ marginTop: 28 }}>
        <div style={css.sectionHead}>
          <h2 style={css.sectionTitle}>Equipment Combos ({combos.filter(c => c.active).length} active)</h2>
          <button style={css.btn("primary")} onClick={() => setComboModal("new")}>+ Add Combo</button>
        </div>

        {combos.length === 0 && (
          <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No combos yet.</div>
        )}
        {combos.map(c => (
          <div key={c.combo_id} style={{ ...css.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.combo_name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                <span>Tare {c.tare_lbs?.toLocaleString()} lbs</span>
                {c.target_weight && <span>· Target {c.target_weight.toLocaleString()} lbs</span>}
                <span style={css.tag(c.active ? T.success : T.muted)}>
                  {c.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            <button style={css.btn("subtle")} onClick={() => setComboModal(c)}>Edit</button>
          </div>
        ))}
      </section>

      {/* ── Modals ── */}
      {inviteModal && (
        <InviteModal
          companyId={companyId!}
          supabase={supabase}
          onClose={() => setInviteModal(false)}
          onDone={() => { setInviteModal(false); loadAll(); }}
        />
      )}

      {truckModal && (
        <TruckModal
          truck={truckModal === "new" ? null : truckModal}
          companyId={companyId!}
          supabase={supabase}
          onClose={() => setTruckModal(null)}
          onDone={() => { setTruckModal(null); loadAll(); }}
        />
      )}

      {trailerModal && (
        <TrailerModal
          trailer={trailerModal === "new" ? null : trailerModal}
          companyId={companyId!}
          supabase={supabase}
          onClose={() => setTrailerModal(null)}
          onDone={() => { setTrailerModal(null); loadAll(); }}
        />
      )}

      {comboModal && (
        <ComboModal
          combo={comboModal === "new" ? null : comboModal}
          companyId={companyId!}
          trucks={trucks.filter(t => t.active)}
          trailers={trailers.filter(t => t.active)}
          supabase={supabase}
          onClose={() => setComboModal(null)}
          onDone={() => { setComboModal(null); loadAll(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Member Row
// ─────────────────────────────────────────────────────────────

function MemberRow({ member, companyId, supabase, onRefresh }: {
  member: Member;
  currentUserId: string;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function changeRole(role: string) {
    setSaving(true);
    await supabase.from("user_companies")
      .update({ role })
      .eq("user_id", member.user_id)
      .eq("company_id", companyId);
    setSaving(false);
    onRefresh();
  }

  async function remove() {
    if (!confirm(`Remove this user from the company?`)) return;
    setSaving(true);
    await supabase.from("user_companies")
      .delete()
      .eq("user_id", member.user_id)
      .eq("company_id", companyId);
    setSaving(false);
    onRefresh();
  }

  const label = member.display_name || member.email || `User …${member.user_id.slice(-8)}`;
  const sublabel = member.display_name && member.email ? member.email : null;

  return (
    <div style={{ ...css.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {sublabel && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sublabel}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <select
          value={member.role}
          onChange={e => changeRole(e.target.value)}
          disabled={saving}
          style={{ ...css.select, fontSize: 12, padding: "5px 8px" }}
        >
          <option value="driver">Driver</option>
          <option value="admin">Admin</option>
        </select>
        <button
          onClick={remove}
          disabled={saving}
          style={{ ...css.btn("ghost"), padding: "5px 10px", color: T.danger, borderColor: `${T.danger}44`, fontSize: 12 }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Invite Modal
// ─────────────────────────────────────────────────────────────

function InviteModal({ companyId, supabase, onClose, onDone }: {
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role,  setRole]  = useState("driver");
  const [status, setStatus] = useState<{ type: "error" | "success"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!email.trim()) return;
    setLoading(true);
    setStatus(null);

    try {
      // Try RPC first — handles existing users entirely client-side
      const { data, error } = await supabase.rpc("invite_user_to_company", {
        p_email: email.trim().toLowerCase(),
        p_company_id: companyId,
        p_role: role,
      });

      if (error) throw error;

      // If user doesn't exist yet, call the API route to send a Supabase auth invite
      if ((data as any)?.status === "pending") {
        const res = await fetch("/api/admin/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), companyId, role }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Invite failed.");
      }

      setStatus({ type: "success", msg: `Invite sent to ${email.trim()}.` });
      setEmail("");
    } catch (e: any) {
      setStatus({ type: "error", msg: e?.message ?? "Failed to send invite." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Invite User" onClose={onClose}>
      {status && <Banner msg={status.msg} type={status.type} />}

      <Field label="Email Address">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="driver@company.com"
          style={css.input}
          onKeyDown={e => e.key === "Enter" && send()}
          autoFocus
        />
      </Field>

      <Field label="Role">
        <select value={role} onChange={e => setRole(e.target.value)} style={{ ...css.select, width: "100%" }}>
          <option value="driver">Driver</option>
          <option value="admin">Admin</option>
        </select>
      </Field>

      <div style={{ fontSize: 12, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>
        The user will receive a magic link email. If they don't have an account yet, one will be created automatically.
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={css.btn("primary")} onClick={send} disabled={loading || !email.trim()}>
          {loading ? "Sending…" : "Send Invite"}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Truck Modal
// ─────────────────────────────────────────────────────────────

function TruckModal({ truck, companyId, supabase, onClose, onDone }: {
  truck: Truck | null;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void;
  onDone: () => void;
}) {
  const isNew = !truck;
  const [name,   setName]   = useState(truck?.truck_name ?? "");
  const [region, setRegion] = useState(truck?.region ?? "");
  const [active, setActive] = useState(truck?.active ?? true);
  const [err,    setErr]    = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Truck name is required."); return; }
    setSaving(true);
    setErr(null);

    const payload = {
      truck_name: name.trim(),
      region: region.trim() || null,
      active,
      company_id: companyId,
    };

    const { error } = isNew
      ? await supabase.from("trucks").insert(payload)
      : await supabase.from("trucks").update(payload).eq("truck_id", truck!.truck_id);

    if (error) { setErr(error.message); setSaving(false); return; }
    onDone();
  }

  async function deleteTruck() {
    if (!confirm("Delete this truck? This cannot be undone.")) return;
    setSaving(true);
    await supabase.from("trucks").delete().eq("truck_id", truck!.truck_id);
    onDone();
  }

  return (
    <Modal title={isNew ? "Add Truck" : "Edit Truck"} onClose={onClose}>
      {err && <Banner msg={err} type="error" />}

      <Field label="Truck Name / Number">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. T-101" style={css.input} autoFocus />
      </Field>

      <Field label="Region (optional)">
        <input value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Southeast" style={css.input} />
      </Field>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <input type="checkbox" id="truck-active" checked={active} onChange={e => setActive(e.target.checked)} />
        <label htmlFor="truck-active" style={{ fontSize: 13, cursor: "pointer" }}>Active</label>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        {!isNew
          ? <button style={{ ...css.btn("danger"), fontSize: 12 }} onClick={deleteTruck} disabled={saving}>Delete</button>
          : <span />
        }
        <div style={{ display: "flex", gap: 10 }}>
          <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={css.btn("primary")} onClick={save} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Add Truck" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Trailer Modal
// ─────────────────────────────────────────────────────────────

function TrailerModal({ trailer, companyId, supabase, onClose, onDone }: {
  trailer: Trailer | null;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void;
  onDone: () => void;
}) {
  const isNew = !trailer;
  const [name,   setName]   = useState(trailer?.trailer_name ?? "");
  const [region, setRegion] = useState(trailer?.region ?? "");
  const [cgMax,  setCgMax]  = useState(String(trailer?.cg_max ?? 1.0));
  const [active, setActive] = useState(trailer?.active ?? true);
  const [comps,  setComps]  = useState<Compartment[]>(trailer?.compartments ?? []);
  const [err,    setErr]    = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Trailer name is required."); return; }
    if (comps.some(c => !c.max_gallons || c.max_gallons <= 0)) {
      setErr("All compartments need a max gallons value greater than 0."); return;
    }
    setSaving(true);
    setErr(null);

    const payload = {
      trailer_name: name.trim(),
      region: region.trim() || null,
      cg_max: parseFloat(cgMax) || 1.0,
      active,
      company_id: companyId,
    };

    let trailerId = trailer?.trailer_id;

    if (isNew) {
      const { data, error } = await supabase.from("trailers").insert(payload).select("trailer_id").single();
      if (error) { setErr(error.message); setSaving(false); return; }
      trailerId = data.trailer_id;
    } else {
      const { error } = await supabase.from("trailers").update(payload).eq("trailer_id", trailerId!);
      if (error) { setErr(error.message); setSaving(false); return; }
      // Delete existing compartments to replace
      await supabase.from("trailer_compartments").delete().eq("trailer_id", trailerId!);
    }

    // Insert compartments
    if (comps.length > 0) {
      const compPayload = comps.map(c => ({
        trailer_id: trailerId,
        comp_number: c.comp_number,
        max_gallons: c.max_gallons,
        position: c.position,
      }));
      const { error: compErr } = await supabase.from("trailer_compartments").insert(compPayload);
      if (compErr) { setErr(compErr.message); setSaving(false); return; }
    }

    onDone();
  }

  async function deleteTrailer() {
    if (!confirm("Delete this trailer? Compartments will also be deleted.")) return;
    setSaving(true);
    await supabase.from("trailer_compartments").delete().eq("trailer_id", trailer!.trailer_id);
    await supabase.from("trailers").delete().eq("trailer_id", trailer!.trailer_id);
    onDone();
  }

  return (
    <Modal title={isNew ? "Add Trailer" : "Edit Trailer"} onClose={onClose}>
      {err && <Banner msg={err} type="error" />}

      <Field label="Trailer Name / Number">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 3151" style={css.input} autoFocus />
      </Field>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Region (optional)</label>
          <input value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Southeast" style={css.input} />
        </div>
        <div style={{ width: 100 }}>
          <label style={css.label}>CG Max</label>
          <input type="number" step="0.01" value={cgMax} onChange={e => setCgMax(e.target.value)} style={css.input} />
        </div>
      </div>

      <div style={{ ...css.card, background: T.surface2, marginBottom: 14 }}>
        <CompartmentEditor comps={comps} onChange={setComps} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <input type="checkbox" id="trailer-active" checked={active} onChange={e => setActive(e.target.checked)} />
        <label htmlFor="trailer-active" style={{ fontSize: 13, cursor: "pointer" }}>Active</label>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        {!isNew
          ? <button style={{ ...css.btn("danger"), fontSize: 12 }} onClick={deleteTrailer} disabled={saving}>Delete</button>
          : <span />
        }
        <div style={{ display: "flex", gap: 10 }}>
          <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={css.btn("primary")} onClick={save} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Add Trailer" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Combo Modal
// ─────────────────────────────────────────────────────────────

function ComboModal({ combo, companyId, trucks, trailers, supabase, onClose, onDone }: {
  combo: Combo | null;
  companyId: string;
  trucks: Truck[];
  trailers: Trailer[];
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void;
  onDone: () => void;
}) {
  const isNew = !combo;
  const [truckId,   setTruckId]   = useState(combo?.truck_id ?? trucks[0]?.truck_id ?? "");
  const [trailerId, setTrailerId] = useState(combo?.trailer_id ?? trailers[0]?.trailer_id ?? "");
  const [tareLbs,   setTareLbs]   = useState(String(combo?.tare_lbs ?? ""));
  const [target,    setTarget]    = useState(String(combo?.target_weight ?? "80000"));
  const [active,    setActive]    = useState(combo?.active ?? true);
  const [err,       setErr]       = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  async function save() {
    if (!truckId || !trailerId) { setErr("Select a truck and trailer."); return; }
    if (!tareLbs || parseFloat(tareLbs) <= 0) { setErr("Tare weight is required."); return; }
    setSaving(true);
    setErr(null);

    if (isNew) {
      const { error } = await supabase.rpc("couple_combo", {
        p_truck_id: truckId,
        p_trailer_id: trailerId,
        p_tare_lbs: parseFloat(tareLbs),
        p_target_weight: parseFloat(target) || 80000,
      });
      if (error) { setErr(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("equipment_combos")
        .update({
          truck_id: truckId,
          trailer_id: trailerId,
          tare_lbs: parseFloat(tareLbs),
          target_weight: parseFloat(target) || null,
          active,
        })
        .eq("combo_id", combo!.combo_id);
      if (error) { setErr(error.message); setSaving(false); return; }
    }
    onDone();
  }

  async function deleteCombo() {
    if (!confirm("Delete this combo?")) return;
    setSaving(true);
    await supabase.from("equipment_combos").delete().eq("combo_id", combo!.combo_id);
    onDone();
  }

  return (
    <Modal title={isNew ? "Add Combo" : "Edit Combo"} onClose={onClose}>
      {err && <Banner msg={err} type="error" />}

      <Field label="Truck">
        <select value={truckId} onChange={e => setTruckId(e.target.value)} style={{ ...css.select, width: "100%" }}>
          {trucks.length === 0 && <option value="">No active trucks</option>}
          {trucks.map(t => <option key={t.truck_id} value={t.truck_id}>{t.truck_name}</option>)}
        </select>
      </Field>

      <Field label="Trailer">
        <select value={trailerId} onChange={e => setTrailerId(e.target.value)} style={{ ...css.select, width: "100%" }}>
          {trailers.length === 0 && <option value="">No active trailers</option>}
          {trailers.map(t => <option key={t.trailer_id} value={t.trailer_id}>{t.trailer_name}</option>)}
        </select>
      </Field>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Tare Weight (lbs)</label>
          <input type="number" value={tareLbs} onChange={e => setTareLbs(e.target.value)} placeholder="e.g. 34000" style={css.input} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Target Gross (lbs)</label>
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 80000" style={css.input} />
        </div>
      </div>

      {!isNew && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <input type="checkbox" id="combo-active" checked={active} onChange={e => setActive(e.target.checked)} />
          <label htmlFor="combo-active" style={{ fontSize: 13, cursor: "pointer" }}>Active</label>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        {!isNew
          ? <button style={{ ...css.btn("danger"), fontSize: 12 }} onClick={deleteCombo} disabled={saving}>Delete</button>
          : <span />
        }
        <div style={{ display: "flex", gap: 10 }}>
          <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={css.btn("primary")} onClick={save} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Add Combo" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
