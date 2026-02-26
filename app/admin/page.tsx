"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  hire_date: string | null;
  division: string | null;
  region: string | null;
  local_area: string | null;
};

type License = {
  license_class: string | null;
  endorsements: string[];
  restrictions: string[];
  license_number: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  state_code: string | null;
};

type MedicalCard = {
  issue_date: string | null;
  expiration_date: string | null;
  examiner_name: string | null;
};

type TwicCard = {
  card_number: string | null;
  issue_date: string | null;
  expiration_date: string | null;
};

type TerminalAccess = {
  terminal_id: string;
  terminal_name: string;
  state: string | null;
  city: string | null;
  carded_on: string;
  renewal_days: number;
  expires_on: string;
  days_until_expiry: number;
  is_expired: boolean;
};

type DriverProfile = {
  profile: Partial<Member> | null;
  license: License | null;
  medical: MedicalCard | null;
  twic: TwicCard | null;
  terminals: TerminalAccess[];
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

type SortField = "name" | "role" | "division" | "region" | "hire_date";
type SortDir = "asc" | "desc";

// ─────────────────────────────────────────────────────────────
// Style tokens
// ─────────────────────────────────────────────────────────────

const T = {
  bg:        "#0a0a0a",
  surface:   "#111",
  surface2:  "#181818",
  surface3:  "#1e1e1e",
  border:    "#2a2a2a",
  text:      "rgba(255,255,255,0.92)",
  muted:     "rgba(255,255,255,0.45)",
  accent:    "#f5a623",
  danger:    "#e05555",
  success:   "#4caf82",
  warning:   "#f5c623",
  info:      "#5ba8f5",
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
    padding: "14px 16px",
    marginBottom: 8,
  },
  sectionHead: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 12,
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
  btn: (variant: "primary" | "ghost" | "danger" | "subtle" | "icon") => ({
    padding: variant === "subtle" || variant === "icon" ? "5px 10px" : "8px 16px",
    borderRadius: T.radiusSm,
    border: variant === "ghost" ? `1px solid ${T.border}` : "none",
    background:
      variant === "primary" ? T.accent :
      variant === "danger"  ? T.danger :
      variant === "subtle" || variant === "icon" ? "rgba(255,255,255,0.06)" :
      "transparent",
    color: variant === "primary" ? "#000" : variant === "danger" ? "#fff" : T.text,
    fontWeight: variant === "primary" ? 700 : 500,
    fontSize: variant === "subtle" || variant === "icon" ? 12 : 13,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    letterSpacing: variant === "primary" ? 0.3 : 0,
    lineHeight: 1,
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
  tag: (color: string) => ({
    display: "inline-block" as const,
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
    whiteSpace: "nowrap" as const,
  }),
  divider: {
    border: "none",
    borderTop: `1px solid ${T.border}`,
    margin: "10px 0",
  },
};

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

function expiryColor(days: number | null): string {
  if (days == null) return T.muted;
  if (days < 0)   return T.danger;
  if (days < 30)  return T.warning;
  if (days < 90)  return T.accent;
  return T.success;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  try {
    const exp = new Date(dateStr + "T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor((exp.getTime() - now.getTime()) / 86400000);
  } catch { return null; }
}

function expiryLabel(days: number | null): string {
  if (days == null) return "—";
  if (days < 0)    return `Expired ${Math.abs(days)}d ago`;
  if (days === 0)  return "Expires today";
  return `${days}d left`;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}
      onClick={onClose}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius + 4, padding: "22px 20px", width: "100%", maxWidth: wide ? 680 : 480, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
          <button onClick={onClose} style={{ ...css.btn("ghost"), padding: "4px 10px", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div style={{ marginBottom: 12, width: half ? "calc(50% - 5px)" : "100%" }}>
      <label style={css.label}>{label}</label>
      {children}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>{children}</div>;
}

function Banner({ msg, type }: { msg: string; type: "error" | "success" }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, background: type === "error" ? `${T.danger}18` : `${T.success}18`, border: `1px solid ${type === "error" ? T.danger : T.success}44`, color: type === "error" ? T.danger : T.success, fontSize: 13, marginBottom: 14 }}>
      {msg}
    </div>
  );
}

function SubSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const, color: T.muted, marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  );
}

function ComplianceCard({ title, color, children, empty }: {
  title: string; color: string; children?: React.ReactNode; empty?: string;
}) {
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 14px", marginBottom: 8, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as const, color, marginBottom: 8 }}>{title}</div>
      {children ?? <div style={{ fontSize: 12, color: T.muted }}>{empty ?? "Not on file"}</div>}
    </div>
  );
}

function DataRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5, fontSize: 13 }}>
      <span style={{ color: T.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ color: highlight ?? T.text, fontWeight: highlight ? 600 : 400, textAlign: "right" as const }}>{value ?? "—"}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compartment editor
// ─────────────────────────────────────────────────────────────

function CompartmentEditor({ comps, onChange }: { comps: Compartment[]; onChange: (c: Compartment[]) => void; }) {
  function update(i: number, field: keyof Compartment, val: string) {
    onChange(comps.map((c, idx) => idx === i ? { ...c, [field]: parseFloat(val) || 0 } : c));
  }
  function add() { onChange([...comps, { comp_number: comps.length + 1, max_gallons: 0, position: comps.length }]); }
  function remove(i: number) { onChange(comps.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, comp_number: idx + 1, position: idx }))); }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>COMPARTMENTS ({comps.length})</span>
        <button type="button" onClick={add} style={css.btn("subtle")}>+ Add</button>
      </div>
      {comps.length === 0 && <div style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>No compartments added yet.</div>}
      {comps.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <div style={{ width: 28, fontSize: 12, color: T.muted, textAlign: "center" as const, fontWeight: 700 }}>{c.comp_number}</div>
          <input type="number" placeholder="Max gal" value={c.max_gallons || ""} onChange={e => update(i, "max_gallons", e.target.value)} style={{ ...css.input, width: 100 }} />
          <input type="number" placeholder="Position" value={c.position || ""} onChange={e => update(i, "position", e.target.value)} style={{ ...css.input, width: 90 }} />
          <button type="button" onClick={() => remove(i)} style={{ ...css.btn("ghost"), padding: "6px 10px", color: T.danger, borderColor: `${T.danger}44`, flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Terminal Access Editor (inside EditDriverModal)
// ─────────────────────────────────────────────────────────────

type AllTerminal = { terminal_id: string; terminal_name: string; city: string | null; state: string | null; };

function TerminalAccessEditor({ userId, companyId, supabase, existing, onReload }: {
  userId: string;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  existing: TerminalAccess[];
  onReload: () => void;
}) {
  const [allTerminals,   setAllTerminals]   = useState<AllTerminal[]>([]);
  const [addTerminalId,  setAddTerminalId]  = useState("");
  const [addCardedOn,    setAddCardedOn]    = useState(new Date().toISOString().split("T")[0]);
  const [saving,         setSaving]         = useState(false);
  const [err,            setErr]            = useState<string | null>(null);

  useEffect(() => {
    supabase.from("terminals").select("terminal_id, terminal_name, city, state")
      .eq("active", true).order("terminal_name")
      .then(({ data }) => {
        setAllTerminals((data ?? []) as AllTerminal[]);
        const first = (data ?? [])[0] as any;
        if (first && !addTerminalId) setAddTerminalId(first.terminal_id);
      });
  }, [supabase]);

  const existingIds = new Set(existing.map(t => t.terminal_id));
  const available = allTerminals.filter(t => !existingIds.has(t.terminal_id));

  async function addAccess() {
    if (!addTerminalId) return;
    setSaving(true); setErr(null);
    const { error } = await supabase.rpc("admin_get_carded", {
      p_user_id: userId,
      p_terminal_id: addTerminalId,
      p_carded_on: addCardedOn,
      p_company_id: companyId,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onReload();
    // Move to next available terminal
    const next = available.find(t => t.terminal_id !== addTerminalId);
    if (next) setAddTerminalId(next.terminal_id);
  }

  async function removeAccess(terminalId: string) {
    setSaving(true); setErr(null);
    const { error } = await supabase.rpc("admin_remove_terminal_access", {
      p_user_id: userId,
      p_terminal_id: terminalId,
      p_company_id: companyId,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onReload();
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <SubSectionTitle>Terminal Access ({existing.length})</SubSectionTitle>
      {err && <Banner msg={err} type="error" />}

      {/* Existing terminals */}
      {existing.length === 0 ? (
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>No terminal cards on file.</div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {existing.map(t => {
            const color = expiryColor(t.days_until_expiry);
            return (
              <div key={t.terminal_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}`, gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.terminal_name}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{[t.city, t.state].filter(Boolean).join(", ")}</div>
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color }}>{t.is_expired ? "EXPIRED" : expiryLabel(t.days_until_expiry)}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>Carded {fmtDate(t.carded_on)}</div>
                </div>
                <button
                  onClick={() => removeAccess(t.terminal_id)}
                  disabled={saving}
                  style={{ ...css.btn("ghost"), padding: "4px 8px", color: T.danger, borderColor: `${T.danger}33`, fontSize: 11, flexShrink: 0 }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add terminal row */}
      {available.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" as const }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={css.label}>Add Terminal</label>
            <select value={addTerminalId} onChange={e => setAddTerminalId(e.target.value)}
              style={{ ...css.select, width: "100%" }}>
              {available.map(t => (
                <option key={t.terminal_id} value={t.terminal_id}>
                  {t.terminal_name}{t.city ? ` — ${t.city}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 140 }}>
            <label style={css.label}>Carded On</label>
            <input type="date" value={addCardedOn} onChange={e => setAddCardedOn(e.target.value)} style={css.input} />
          </div>
          <button onClick={addAccess} disabled={saving || !addTerminalId}
            style={{ ...css.btn("primary"), marginBottom: 1 }}>
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Driver Profile Modal
// ─────────────────────────────────────────────────────────────

function DriverProfileModal({ member, companyId, supabase, onClose, onDone }: {
  member: Member;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [profile,  setProfile]  = useState<DriverProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  // Editable fields
  const [displayName, setDisplayName] = useState(member.display_name ?? "");
  const [hireDate,    setHireDate]    = useState(member.hire_date ?? "");
  const [division,    setDivision]    = useState(member.division ?? "");
  const [region,      setRegion]      = useState(member.region ?? "");
  const [localArea,   setLocalArea]   = useState(member.local_area ?? "");

  // License
  const [licClass,    setLicClass]    = useState("");
  const [licEndorse,  setLicEndorse]  = useState("");
  const [licRestrict, setLicRestrict] = useState("");
  const [licNumber,   setLicNumber]   = useState("");
  const [licIssue,    setLicIssue]    = useState("");
  const [licExpiry,   setLicExpiry]   = useState("");
  const [licState,    setLicState]    = useState("");

  // Medical
  const [medIssue,    setMedIssue]    = useState("");
  const [medExpiry,   setMedExpiry]   = useState("");
  const [medExaminer, setMedExaminer] = useState("");

  // TWIC
  const [twicNumber,  setTwicNumber]  = useState("");
  const [twicIssue,   setTwicIssue]   = useState("");
  const [twicExpiry,  setTwicExpiry]  = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_driver_profile", {
          p_user_id: member.user_id,
          p_company_id: companyId,
        });
        if (error) throw error;
        const d = data as DriverProfile;
        setProfile(d);

        // Populate form fields from loaded data
        setDisplayName(d.profile?.display_name ?? member.display_name ?? "");
        setHireDate(d.profile?.hire_date ?? "");
        setDivision(d.profile?.division ?? "");
        setRegion(d.profile?.region ?? "");
        setLocalArea(d.profile?.local_area ?? "");

        if (d.license) {
          setLicClass(d.license.license_class ?? "");
          setLicEndorse((d.license.endorsements ?? []).join(", "));
          setLicRestrict((d.license.restrictions ?? []).join(", "));
          setLicNumber(d.license.license_number ?? "");
          setLicIssue(d.license.issue_date ?? "");
          setLicExpiry(d.license.expiration_date ?? "");
          setLicState(d.license.state_code ?? "");
        }
        if (d.medical) {
          setMedIssue(d.medical.issue_date ?? "");
          setMedExpiry(d.medical.expiration_date ?? "");
          setMedExaminer(d.medical.examiner_name ?? "");
        }
        if (d.twic) {
          setTwicNumber(d.twic.card_number ?? "");
          setTwicIssue(d.twic.issue_date ?? "");
          setTwicExpiry(d.twic.expiration_date ?? "");
        }
      } catch (e: any) {
        setErr(e?.message ?? "Load failed.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [member.user_id, companyId, supabase]);

  async function save() {
    setSaving(true);
    setErr(null);
    setSuccess(false);

    const payload: any = {
      display_name: displayName || null,
      hire_date:    hireDate || null,
      division:     division || null,
      region:       region || null,
      local_area:   localArea || null,
    };

    if (licClass || licNumber || licExpiry) {
      payload.license = {
        license_class:   licClass || null,
        endorsements:    licEndorse ? licEndorse.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : [],
        restrictions:    licRestrict ? licRestrict.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : [],
        card_number:     licNumber || null,
        issue_date:      licIssue || null,
        expiration_date: licExpiry || null,
        state_code:      licState || null,
      };
    }

    if (medExpiry || medIssue) {
      payload.medical = {
        issue_date:      medIssue || null,
        expiration_date: medExpiry || null,
        examiner_name:   medExaminer || null,
      };
    }

    if (twicNumber || twicExpiry) {
      payload.twic = {
        card_number:     twicNumber || null,
        issue_date:      twicIssue || null,
        expiration_date: twicExpiry || null,
      };
    }

    try {
      const { error } = await supabase.rpc("upsert_driver_profile", {
        p_user_id:    member.user_id,
        p_company_id: companyId,
        p_data:       payload,
      });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => { onDone(); }, 800);
    } catch (e: any) {
      setErr(e?.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const terminals = profile?.terminals ?? [];

  return (
    <Modal title={`Edit Driver — ${member.email}`} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}
      {success && <Banner msg="Saved successfully." type="success" />}

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center" as const, color: T.muted }}>Loading profile…</div>
      ) : (
        <>
          {/* ── Profile ── */}
          <SubSectionTitle>Profile</SubSectionTitle>
          <FieldRow>
            <Field label="Display Name" half><input value={displayName} onChange={e => setDisplayName(e.target.value)} style={css.input} placeholder="Full name" /></Field>
            <Field label="Hire Date" half><input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={css.input} /></Field>
            <Field label="Division" half><input value={division} onChange={e => setDivision(e.target.value)} style={css.input} placeholder="e.g. Southeast" /></Field>
            <Field label="Region" half><input value={region} onChange={e => setRegion(e.target.value)} style={css.input} placeholder="e.g. Region 3" /></Field>
            <Field label="Local Area"><input value={localArea} onChange={e => setLocalArea(e.target.value)} style={css.input} placeholder="e.g. Tampa Bay" /></Field>
          </FieldRow>

          <hr style={css.divider} />

          {/* ── Driver's License ── */}
          <SubSectionTitle>Driver's License</SubSectionTitle>
          <FieldRow>
            <Field label="State" half>
              <input value={licState} onChange={e => setLicState(e.target.value)} style={css.input} placeholder="FL" maxLength={2} />
            </Field>
            <Field label="Class" half>
              <select value={licClass} onChange={e => setLicClass(e.target.value)} style={{ ...css.select, width: "100%" }}>
                <option value="">—</option>
                <option value="A">Class A</option>
                <option value="B">Class B</option>
                <option value="C">Class C</option>
                <option value="D">Class D</option>
              </select>
            </Field>
            <Field label="License Number" half><input value={licNumber} onChange={e => setLicNumber(e.target.value)} style={css.input} placeholder="License #" /></Field>
            <Field label="Endorsements" half><input value={licEndorse} onChange={e => setLicEndorse(e.target.value)} style={css.input} placeholder="H, N, X (comma separated)" /></Field>
            <Field label="Restrictions" half><input value={licRestrict} onChange={e => setLicRestrict(e.target.value)} style={css.input} placeholder="B, E (comma separated)" /></Field>
            <Field label="Issue Date" half><input type="date" value={licIssue} onChange={e => setLicIssue(e.target.value)} style={css.input} /></Field>
            <Field label="Expiration Date" half><input type="date" value={licExpiry} onChange={e => setLicExpiry(e.target.value)} style={css.input} /></Field>
          </FieldRow>

          <hr style={css.divider} />

          {/* ── Medical Card ── */}
          <SubSectionTitle>Medical Card</SubSectionTitle>
          <FieldRow>
            <Field label="Issue Date" half><input type="date" value={medIssue} onChange={e => setMedIssue(e.target.value)} style={css.input} /></Field>
            <Field label="Expiration Date" half><input type="date" value={medExpiry} onChange={e => setMedExpiry(e.target.value)} style={css.input} /></Field>
            <Field label="Examiner Name"><input value={medExaminer} onChange={e => setMedExaminer(e.target.value)} style={css.input} placeholder="Dr. Name" /></Field>
          </FieldRow>

          <hr style={css.divider} />

          {/* ── TWIC Card ── */}
          <SubSectionTitle>TWIC Card</SubSectionTitle>
          <FieldRow>
            <Field label="Card Number" half><input value={twicNumber} onChange={e => setTwicNumber(e.target.value)} style={css.input} placeholder="TWIC #" /></Field>
            <Field label="Issue Date" half><input type="date" value={twicIssue} onChange={e => setTwicIssue(e.target.value)} style={css.input} /></Field>
            <Field label="Expiration Date" half><input type="date" value={twicExpiry} onChange={e => setTwicExpiry(e.target.value)} style={css.input} /></Field>
          </FieldRow>

          <hr style={css.divider} />

          {/* ── Terminal Access ── */}
          <hr style={css.divider} />
          <TerminalAccessEditor
            userId={member.user_id}
            companyId={companyId}
            supabase={supabase}
            existing={terminals}
            onReload={() => {
              // Reload profile to refresh terminals list
              supabase.rpc("get_driver_profile", { p_user_id: member.user_id, p_company_id: companyId })
                .then(({ data }) => { if (data) setProfile(data as DriverProfile); });
            }}
          />

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
            <button style={css.btn("primary")} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Expanded Member Card (inline in the list)
// ─────────────────────────────────────────────────────────────

function MemberCard({ member, companyId, supabase, onRefresh, onEditProfile }: {
  member: Member;
  companyId: string;
  supabase: ReturnType<typeof createSupabaseBrowser>;
  onRefresh: () => void;
  onEditProfile: (m: Member) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [preview,  setPreview]  = useState<DriverProfile | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  async function loadPreview() {
    if (preview || loading) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_driver_profile", {
        p_user_id:    member.user_id,
        p_company_id: companyId,
      });
      setPreview(data as DriverProfile);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadPreview();
  }

  async function changeRole(role: string) {
    setSaving(true);
    await supabase.from("user_companies").update({ role }).eq("user_id", member.user_id).eq("company_id", companyId);
    setSaving(false);
    onRefresh();
  }

  async function remove() {
    if (!confirm(`Remove ${member.email} from the company?`)) return;
    setSaving(true);
    await supabase.from("user_companies").delete().eq("user_id", member.user_id).eq("company_id", companyId);
    setSaving(false);
    onRefresh();
  }

  const label    = member.display_name || member.email || `User …${member.user_id.slice(-8)}`;
  const sublabel = member.display_name ? member.email : null;

  const lic      = preview?.license;
  const med      = preview?.medical;
  const twic     = preview?.twic;
  const terminals = preview?.terminals ?? [];

  const licDays  = daysUntil(lic?.expiration_date);
  const medDays  = daysUntil(med?.expiration_date);
  const twicDays = daysUntil(twic?.expiration_date);

  const expiringSoon = [licDays, medDays, twicDays, ...terminals.map(t => t.days_until_expiry)]
    .some(d => d != null && d < 30);

  return (
    <div style={{ ...css.card, padding: 0, overflow: "hidden" }}>
      {/* ── Main row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        {/* Expand toggle */}
        <button type="button" onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 16, padding: 0, flexShrink: 0, width: 20, textAlign: "center" as const, transition: "transform 150ms", transform: expanded ? "rotate(90deg)" : "none" }}>
          ›
        </button>

        {/* Identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
            {expiringSoon && <span style={css.tag(T.warning)}>⚠ Expiring</span>}
          </div>
          {sublabel && <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{sublabel}</div>}
          {(member.division || member.region) && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
              {[member.division, member.region, member.local_area].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button onClick={() => onEditProfile(member)} style={{ ...css.btn("subtle"), fontSize: 11 }}>Edit</button>
          <select value={member.role} onChange={e => changeRole(e.target.value)} disabled={saving}
            style={{ ...css.select, fontSize: 12, padding: "5px 8px" }}>
            <option value="driver">Driver</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={remove} disabled={saving}
            style={{ ...css.btn("ghost"), padding: "5px 10px", color: T.danger, borderColor: `${T.danger}44`, fontSize: 12 }}>
            Remove
          </button>
        </div>
      </div>

      {/* ── Expanded section ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "14px 14px 14px 44px", background: T.surface2 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>

              {/* Profile details */}
              {(member.hire_date || member.division || member.region) && (
                <ComplianceCard title="Profile" color={T.info}>
                  {member.hire_date && <DataRow label="Hired" value={fmtDate(member.hire_date)} />}
                  {member.division  && <DataRow label="Division" value={member.division} />}
                  {member.region    && <DataRow label="Region" value={member.region} />}
                  {member.local_area && <DataRow label="Local" value={member.local_area} />}
                </ComplianceCard>
              )}

              {/* Driver's license */}
              <ComplianceCard title="Driver's License" color={expiryColor(licDays)} empty="Not on file">
                {lic ? (
                  <>
                    <DataRow label="Class" value={lic.license_class ? `Class ${lic.license_class}` : "—"} />
                    {lic.endorsements?.length > 0 && <DataRow label="Endorsements" value={lic.endorsements.join(", ")} />}
                    {lic.restrictions?.length > 0 && <DataRow label="Restrictions" value={lic.restrictions.join(", ")} />}
                    <DataRow label="Expires" value={fmtDate(lic.expiration_date)} highlight={expiryColor(licDays)} />
                    <DataRow label="" value={<span style={css.tag(expiryColor(licDays))}>{expiryLabel(licDays)}</span>} />
                  </>
                ) : null}
              </ComplianceCard>

              {/* Medical card */}
              <ComplianceCard title="Medical Card" color={expiryColor(medDays)} empty="Not on file">
                {med ? (
                  <>
                    <DataRow label="Issued" value={fmtDate(med.issue_date)} />
                    <DataRow label="Expires" value={fmtDate(med.expiration_date)} highlight={expiryColor(medDays)} />
                    <DataRow label="" value={<span style={css.tag(expiryColor(medDays))}>{expiryLabel(medDays)}</span>} />
                  </>
                ) : null}
              </ComplianceCard>

              {/* TWIC */}
              <ComplianceCard title="TWIC Card" color={expiryColor(twicDays)} empty="Not on file">
                {twic ? (
                  <>
                    {twic.card_number && <DataRow label="Card #" value={twic.card_number} />}
                    <DataRow label="Expires" value={fmtDate(twic.expiration_date)} highlight={expiryColor(twicDays)} />
                    <DataRow label="" value={<span style={css.tag(expiryColor(twicDays))}>{expiryLabel(twicDays)}</span>} />
                  </>
                ) : null}
              </ComplianceCard>

              {/* Terminal access */}
              <ComplianceCard title={`Terminals (${terminals.length})`} color={T.accent} empty="No terminals">
                {terminals.length > 0 ? terminals.slice(0, 4).map(t => (
                  <DataRow key={t.terminal_id}
                    label={t.terminal_name}
                    value={<span style={css.tag(expiryColor(t.days_until_expiry))}>{expiryLabel(t.days_until_expiry)}</span>}
                  />
                )) : null}
                {terminals.length > 4 && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>+{terminals.length - 4} more</div>}
              </ComplianceCard>

            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Equipment modals (Truck, Trailer, Combo, Invite)
// ─────────────────────────────────────────────────────────────

function InviteModal({ companyId, supabase, onClose, onDone }: {
  companyId: string; supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void; onDone: () => void;
}) {
  const [email,   setEmail]  = useState("");
  const [role,    setRole]   = useState("driver");
  const [status,  setStatus] = useState<{ type: "error" | "success"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!email.trim()) return;
    setLoading(true); setStatus(null);
    try {
      const { data, error } = await supabase.rpc("invite_user_to_company", {
        p_email: email.trim().toLowerCase(), p_company_id: companyId, p_role: role,
      });
      if (error) throw error;
      if ((data as any)?.status === "pending") {
        const res = await fetch("/api/admin/invite", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), companyId, role }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Invite failed.");
      }
      setStatus({ type: "success", msg: `Invite sent to ${email.trim()}.` });
      setEmail("");
    } catch (e: any) {
      setStatus({ type: "error", msg: e?.message ?? "Failed to send invite." });
    } finally { setLoading(false); }
  }

  return (
    <Modal title="Invite User" onClose={onClose}>
      {status && <Banner msg={status.msg} type={status.type} />}
      <Field label="Email Address">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="driver@company.com" style={css.input}
          onKeyDown={e => e.key === "Enter" && send()} autoFocus />
      </Field>
      <Field label="Role">
        <select value={role} onChange={e => setRole(e.target.value)} style={{ ...css.select, width: "100%" }}>
          <option value="driver">Driver</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>
        If the user already has an account they'll be added immediately. New users receive a magic link.
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

function TruckModal({ truck, companyId, supabase, onClose, onDone }: {
  truck: Truck | null; companyId: string; supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void; onDone: () => void;
}) {
  const isNew = !truck;
  const [name, setName] = useState(truck?.truck_name ?? "");
  const [region, setRegion] = useState(truck?.region ?? "");
  const [active, setActive] = useState(truck?.active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Truck name is required."); return; }
    setSaving(true); setErr(null);
    const payload = { truck_name: name.trim(), region: region.trim() || null, active, company_id: companyId };
    const { error } = isNew
      ? await supabase.from("trucks").insert(payload)
      : await supabase.from("trucks").update(payload).eq("truck_id", truck!.truck_id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onDone();
  }

  async function deleteTruck() {
    if (!confirm("Delete this truck?")) return;
    setSaving(true);
    await supabase.from("trucks").delete().eq("truck_id", truck!.truck_id);
    onDone();
  }

  return (
    <Modal title={isNew ? "Add Truck" : "Edit Truck"} onClose={onClose}>
      {err && <Banner msg={err} type="error" />}
      <Field label="Truck Name / Number"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. T-101" style={css.input} autoFocus /></Field>
      <Field label="Region (optional)"><input value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Southeast" style={css.input} /></Field>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <input type="checkbox" id="truck-active" checked={active} onChange={e => setActive(e.target.checked)} />
        <label htmlFor="truck-active" style={{ fontSize: 13, cursor: "pointer" }}>Active</label>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        {!isNew ? <button style={{ ...css.btn("danger"), fontSize: 12 }} onClick={deleteTruck} disabled={saving}>Delete</button> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={css.btn("primary")} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Truck" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

function TrailerModal({ trailer, companyId, supabase, onClose, onDone }: {
  trailer: Trailer | null; companyId: string; supabase: ReturnType<typeof createSupabaseBrowser>;
  onClose: () => void; onDone: () => void;
}) {
  const isNew = !trailer;
  const [name, setName] = useState(trailer?.trailer_name ?? "");
  const [region, setRegion] = useState(trailer?.region ?? "");
  const [cgMax, setCgMax] = useState(String(trailer?.cg_max ?? 1.0));
  const [active, setActive] = useState(trailer?.active ?? true);
  const [comps, setComps] = useState<Compartment[]>(trailer?.compartments ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Trailer name is required."); return; }
    if (comps.some(c => !c.max_gallons || c.max_gallons <= 0)) { setErr("All compartments need max gallons > 0."); return; }
    setSaving(true); setErr(null);
    const payload = { trailer_name: name.trim(), region: region.trim() || null, cg_max: parseFloat(cgMax) || 1.0, active, company_id: companyId };
    let trailerId = trailer?.trailer_id;
    if (isNew) {
      const { data, error } = await supabase.from("trailers").insert(payload).select("trailer_id").single();
      if (error) { setErr(error.message); setSaving(false); return; }
      trailerId = data.trailer_id;
    } else {
      const { error } = await supabase.from("trailers").update(payload).eq("trailer_id", trailerId!);
      if (error) { setErr(error.message); setSaving(false); return; }
      await supabase.from("trailer_compartments").delete().eq("trailer_id", trailerId!);
    }
    if (comps.length > 0) {
      const { error: compErr } = await supabase.from("trailer_compartments").insert(comps.map(c => ({ trailer_id: trailerId, comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position })));
      if (compErr) { setErr(compErr.message); setSaving(false); return; }
    }
    onDone();
  }

  async function deleteTrailer() {
    if (!confirm("Delete this trailer?")) return;
    setSaving(true);
    await supabase.from("trailer_compartments").delete().eq("trailer_id", trailer!.trailer_id);
    await supabase.from("trailers").delete().eq("trailer_id", trailer!.trailer_id);
    onDone();
  }

  return (
    <Modal title={isNew ? "Add Trailer" : "Edit Trailer"} onClose={onClose}>
      {err && <Banner msg={err} type="error" />}
      <Field label="Trailer Name / Number"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 3151" style={css.input} autoFocus /></Field>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}><label style={css.label}>Region (optional)</label><input value={region} onChange={e => setRegion(e.target.value)} style={css.input} /></div>
        <div style={{ width: 100 }}><label style={css.label}>CG Max</label><input type="number" step="0.01" value={cgMax} onChange={e => setCgMax(e.target.value)} style={css.input} /></div>
      </div>
      <div style={{ ...css.card, background: T.surface2, marginBottom: 14 }}><CompartmentEditor comps={comps} onChange={setComps} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <input type="checkbox" id="trailer-active" checked={active} onChange={e => setActive(e.target.checked)} />
        <label htmlFor="trailer-active" style={{ fontSize: 13, cursor: "pointer" }}>Active</label>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        {!isNew ? <button style={{ ...css.btn("danger"), fontSize: 12 }} onClick={deleteTrailer} disabled={saving}>Delete</button> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={css.btn("primary")} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Trailer" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

function ComboModal({ combo, companyId, trucks, trailers, supabase, onClose, onDone }: {
  combo: Combo | null; companyId: string; trucks: Truck[]; trailers: Trailer[];
  supabase: ReturnType<typeof createSupabaseBrowser>; onClose: () => void; onDone: () => void;
}) {
  const isNew = !combo;
  const [truckId, setTruckId] = useState(combo?.truck_id ?? trucks[0]?.truck_id ?? "");
  const [trailerId, setTrailerId] = useState(combo?.trailer_id ?? trailers[0]?.trailer_id ?? "");
  const [tareLbs, setTareLbs] = useState(String(combo?.tare_lbs ?? ""));
  const [target, setTarget] = useState(String(combo?.target_weight ?? "80000"));
  const [active, setActive] = useState(combo?.active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!truckId || !trailerId) { setErr("Select a truck and trailer."); return; }
    if (!tareLbs || parseFloat(tareLbs) <= 0) { setErr("Tare weight is required."); return; }
    setSaving(true); setErr(null);
    if (isNew) {
      const { error } = await supabase.rpc("couple_combo", { p_truck_id: truckId, p_trailer_id: trailerId, p_tare_lbs: parseFloat(tareLbs), p_target_weight: parseFloat(target) || 80000 });
      if (error) { setErr(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("equipment_combos").update({ truck_id: truckId, trailer_id: trailerId, tare_lbs: parseFloat(tareLbs), target_weight: parseFloat(target) || null, active }).eq("combo_id", combo!.combo_id);
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
        <div style={{ flex: 1 }}><label style={css.label}>Tare Weight (lbs)</label><input type="number" value={tareLbs} onChange={e => setTareLbs(e.target.value)} placeholder="e.g. 34000" style={css.input} /></div>
        <div style={{ flex: 1 }}><label style={css.label}>Target Gross (lbs)</label><input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 80000" style={css.input} /></div>
      </div>
      {!isNew && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <input type="checkbox" id="combo-active" checked={active} onChange={e => setActive(e.target.checked)} />
          <label htmlFor="combo-active" style={{ fontSize: 13, cursor: "pointer" }}>Active</label>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        {!isNew ? <button style={{ ...css.btn("danger"), fontSize: 12 }} onClick={deleteCombo} disabled={saving}>Delete</button> : <span />}
        <div style={{ display: "flex", gap: 10 }}>
          <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={css.btn("primary")} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Combo" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Main AdminPage
// ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [companyId,   setCompanyId]   = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [members,     setMembers]     = useState<Member[]>([]);
  const [trucks,      setTrucks]      = useState<Truck[]>([]);
  const [trailers,    setTrailers]    = useState<Trailer[]>([]);
  const [combos,      setCombos]      = useState<Combo[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);

  // Sort + filter for members
  const [search,    setSearch]    = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir,   setSortDir]   = useState<SortDir>("asc");
  const [filterRole, setFilterRole] = useState<"" | "admin" | "driver">("");

  // Modal state
  const [inviteModal,   setInviteModal]   = useState(false);
  const [profileModal,  setProfileModal]  = useState<Member | null>(null);
  const [truckModal,    setTruckModal]    = useState<Truck | null | "new">(null);
  const [trailerModal,  setTrailerModal]  = useState<Trailer | null | "new">(null);
  const [comboModal,    setComboModal]    = useState<Combo | null | "new">(null);

  const loadAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setErr("Not authenticated."); setLoading(false); return; }

      const { data: settings } = await supabase.from("user_settings").select("active_company_id").eq("user_id", uid).maybeSingle();
      const cid = settings?.active_company_id as string | null;
      if (!cid) { setErr("No active company selected."); setLoading(false); return; }
      setCompanyId(cid);

      const { data: memRow } = await supabase.from("user_companies")
        .select("role, company:companies(company_name)").eq("user_id", uid).eq("company_id", cid).maybeSingle();
      setCompanyName((memRow?.company as any)?.company_name ?? "");
      if (memRow?.role !== "admin") { setErr("Admin access required."); setLoading(false); return; }

      // Members
      const { data: memberRows } = await supabase.from("user_companies").select("user_id, role").eq("company_id", cid);
      const { data: profileRows } = await supabase.from("profiles").select("user_id, display_name, hire_date, division, region, local_area");
      const { data: emailRows } = await supabase.rpc("get_company_member_emails", { p_company_id: cid });

      const profileMap = Object.fromEntries((profileRows ?? []).map((p: any) => [p.user_id, p]));
      const emailMap = Object.fromEntries(((emailRows ?? []) as any[]).map(r => [r.user_id, r.email]));

      setMembers(((memberRows ?? []) as any[]).map(m => ({
        user_id:      m.user_id,
        role:         m.role,
        email:        emailMap[m.user_id] ?? "",
        display_name: profileMap[m.user_id]?.display_name ?? null,
        hire_date:    profileMap[m.user_id]?.hire_date ?? null,
        division:     profileMap[m.user_id]?.division ?? null,
        region:       profileMap[m.user_id]?.region ?? null,
        local_area:   profileMap[m.user_id]?.local_area ?? null,
      })));

      // Trucks
      const { data: truckRows } = await supabase.from("trucks").select("truck_id, truck_name, active, region, status_code").eq("company_id", cid).order("truck_name");
      setTrucks((truckRows ?? []) as Truck[]);

      // Trailers + compartments
      const { data: trailerRows } = await supabase.from("trailers").select("trailer_id, trailer_name, active, cg_max, region, status_code").eq("company_id", cid).order("trailer_name");
      const tIds = (trailerRows ?? []).map((t: any) => t.trailer_id);
      let compMap: Record<string, Compartment[]> = {};
      if (tIds.length > 0) {
        const { data: compRows } = await supabase.from("trailer_compartments").select("trailer_id, comp_number, max_gallons, position").in("trailer_id", tIds).order("comp_number");
        for (const c of (compRows ?? []) as any[]) {
          if (!compMap[c.trailer_id]) compMap[c.trailer_id] = [];
          compMap[c.trailer_id].push({ comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position });
        }
      }
      setTrailers(((trailerRows ?? []) as Trailer[]).map(t => ({ ...t, compartments: compMap[t.trailer_id] ?? [] })));

      // Combos
      const { data: comboRows } = await supabase.from("equipment_combos")
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, truck:trucks(truck_name), trailer:trailers(trailer_name)")
        .eq("company_id", cid).order("combo_name");
      setCombos((comboRows ?? []) as unknown as Combo[]);

    } catch (e: any) {
      setErr(e?.message ?? "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Sort + filter members ──────────────────────────────────
  const filteredMembers = useMemo(() => {
    let ms = [...members];
    if (filterRole) ms = ms.filter(m => m.role === filterRole);
    if (search.trim()) {
      const q = search.toLowerCase();
      ms = ms.filter(m =>
        (m.display_name ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.division ?? "").toLowerCase().includes(q) ||
        (m.region ?? "").toLowerCase().includes(q)
      );
    }
    ms.sort((a, b) => {
      let av = "", bv = "";
      if (sortField === "name")     { av = (a.display_name ?? a.email).toLowerCase(); bv = (b.display_name ?? b.email).toLowerCase(); }
      if (sortField === "role")     { av = a.role; bv = b.role; }
      if (sortField === "division") { av = a.division ?? ""; bv = b.division ?? ""; }
      if (sortField === "region")   { av = a.region ?? ""; bv = b.region ?? ""; }
      if (sortField === "hire_date"){ av = a.hire_date ?? ""; bv = b.hire_date ?? ""; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return ms;
  }, [members, search, sortField, sortDir, filterRole]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortBtn({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <button onClick={() => toggleSort(field)} style={{ ...css.btn("subtle"), fontSize: 11, padding: "4px 8px", background: active ? "rgba(245,166,35,0.12)" : "rgba(255,255,255,0.05)", color: active ? T.accent : T.muted }}>
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </button>
    );
  }

  if (loading) return <div style={{ ...css.page, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }}>Loading…</div>;
  if (err) return <div style={css.page}><Banner msg={err} type="error" /></div>;

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
          <h2 style={css.sectionTitle}>Users ({filteredMembers.length}{members.length !== filteredMembers.length ? ` of ${members.length}` : ""})</h2>
          <button style={css.btn("primary")} onClick={() => setInviteModal(true)}>+ Invite</button>
        </div>

        {/* Search + sort toolbar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" as const, alignItems: "center" }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, division…"
            style={{ ...css.input, width: "auto", flex: 1, minWidth: 160, padding: "7px 10px" }}
          />
          <select value={filterRole} onChange={e => setFilterRole(e.target.value as any)}
            style={{ ...css.select, fontSize: 12, padding: "7px 10px" }}>
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="driver">Driver</option>
          </select>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
            <SortBtn field="name" label="Name" />
            <SortBtn field="role" label="Role" />
            <SortBtn field="division" label="Division" />
            <SortBtn field="region" label="Region" />
            <SortBtn field="hire_date" label="Hire Date" />
          </div>
        </div>

        {filteredMembers.length === 0 && (
          <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No members match your search.</div>
        )}
        {filteredMembers.map(m => (
          <MemberCard
            key={m.user_id}
            member={m}
            companyId={companyId!}
            supabase={supabase}
            onRefresh={loadAll}
            onEditProfile={setProfileModal}
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
        {trucks.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trucks yet.</div>}
        {trucks.map(t => (
          <div key={t.truck_id} style={{ ...css.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.truck_name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                {t.region && <span>{t.region}</span>}
                <span style={css.tag(t.active ? T.success : T.muted)}>{t.active ? "Active" : "Inactive"}</span>
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
        {trailers.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trailers yet.</div>}
        {trailers.map(t => (
          <div key={t.trailer_id} style={{ ...css.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.trailer_name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                <span>{(t.compartments ?? []).length} comps</span>
                {t.region && <span>· {t.region}</span>}
                <span style={css.tag(t.active ? T.success : T.muted)}>{t.active ? "Active" : "Inactive"}</span>
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
        {combos.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No combos yet.</div>}
        {combos.map(c => (
          <div key={c.combo_id} style={{ ...css.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.combo_name}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2, display: "flex", gap: 8, alignItems: "center" }}>
                <span>Tare {c.tare_lbs?.toLocaleString()} lbs</span>
                {c.target_weight && <span>· Target {c.target_weight.toLocaleString()} lbs</span>}
                <span style={css.tag(c.active ? T.success : T.muted)}>{c.active ? "Active" : "Inactive"}</span>
              </div>
            </div>
            <button style={css.btn("subtle")} onClick={() => setComboModal(c)}>Edit</button>
          </div>
        ))}
      </section>

      {/* ── Modals ── */}
      {inviteModal && <InviteModal companyId={companyId!} supabase={supabase} onClose={() => setInviteModal(false)} onDone={() => { setInviteModal(false); loadAll(); }} />}
      {profileModal && <DriverProfileModal member={profileModal} companyId={companyId!} supabase={supabase} onClose={() => setProfileModal(null)} onDone={() => { setProfileModal(null); loadAll(); }} />}
      {truckModal && <TruckModal truck={truckModal === "new" ? null : truckModal} companyId={companyId!} supabase={supabase} onClose={() => setTruckModal(null)} onDone={() => { setTruckModal(null); loadAll(); }} />}
      {trailerModal && <TrailerModal trailer={trailerModal === "new" ? null : trailerModal} companyId={companyId!} supabase={supabase} onClose={() => setTrailerModal(null)} onDone={() => { setTrailerModal(null); loadAll(); }} />}
      {comboModal && <ComboModal combo={comboModal === "new" ? null : comboModal} companyId={companyId!} trucks={trucks.filter(t => t.active)} trailers={trailers.filter(t => t.active)} supabase={supabase} onClose={() => setComboModal(null)} onDone={() => { setComboModal(null); loadAll(); }} />}
    </div>
  );
}
