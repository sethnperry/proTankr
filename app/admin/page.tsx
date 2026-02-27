"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import NavMenu from "@/lib/ui/NavMenu";

// ── Shared driver components ──────────────────────────────────
import { T, css } from "@/lib/ui/driver/tokens";
import { Modal, Field, FieldRow, Banner, SubSectionTitle } from "@/lib/ui/driver/primitives";
import { MemberCard } from "@/lib/ui/driver/MemberCard";
import { DriverProfileModal } from "@/lib/ui/driver/DriverProfileModal";
import type { Member } from "@/lib/ui/driver/types";

// ─────────────────────────────────────────────────────────────
// Types (admin-only — trucks, trailers, combos)
// ─────────────────────────────────────────────────────────────

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
type SortDir   = "asc"  | "desc";

// ─────────────────────────────────────────────────────────────
// Compartment editor (admin-only)
// ─────────────────────────────────────────────────────────────

function CompartmentEditor({ comps, onChange }: { comps: Compartment[]; onChange: (c: Compartment[]) => void }) {
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
// Invite Modal
// ─────────────────────────────────────────────────────────────

function InviteModal({ companyId, onClose, onDone }: {
  companyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email,   setEmail]   = useState("");
  const [role,    setRole]    = useState("driver");
  const [status,  setStatus]  = useState<{ type: "error" | "success"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!email.trim()) return;
    setLoading(true); setStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), companyId, role }),
      });
      let json: any = {};
      try { json = await res.json(); } catch { /* empty body */ }
      if (!res.ok) throw new Error(json?.error ?? `Invite failed (${res.status}).`);
      setStatus({ type: "success", msg: `Invite sent to ${email.trim()}. They'll receive a magic link to join.` });
      setEmail("");
      setTimeout(() => onDone(), 2000);
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

// ─────────────────────────────────────────────────────────────
// Truck Modal
// ─────────────────────────────────────────────────────────────

function TruckModal({ truck, companyId, onClose, onDone }: {
  truck: Truck | null; companyId: string;
  onClose: () => void; onDone: () => void;
}) {
  const isNew = !truck;
  const [name,   setName]   = useState(truck?.truck_name ?? "");
  const [region, setRegion] = useState(truck?.region ?? "");
  const [active, setActive] = useState(truck?.active ?? true);
  const [err,    setErr]    = useState<string | null>(null);
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

// ─────────────────────────────────────────────────────────────
// Trailer Modal
// ─────────────────────────────────────────────────────────────

function TrailerModal({ trailer, companyId, onClose, onDone }: {
  trailer: Trailer | null; companyId: string;
  onClose: () => void; onDone: () => void;
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
      const { error: compErr } = await supabase.from("trailer_compartments").insert(
        comps.map(c => ({ trailer_id: trailerId, comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position }))
      );
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

// ─────────────────────────────────────────────────────────────
// Combo Modal
// ─────────────────────────────────────────────────────────────

function ComboModal({ combo, companyId, trucks, trailers, onClose, onDone }: {
  combo: Combo | null; companyId: string; trucks: Truck[]; trailers: Trailer[];
  onClose: () => void; onDone: () => void;
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

  const [companyId,   setCompanyId]   = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [members,     setMembers]     = useState<Member[]>([]);
  const [trucks,      setTrucks]      = useState<Truck[]>([]);
  const [trailers,    setTrailers]    = useState<Trailer[]>([]);
  const [combos,      setCombos]      = useState<Combo[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);

  const [usersOpen,    setUsersOpen]    = useState(false);
  const [trucksOpen,   setTrucksOpen]   = useState(false);
  const [trailersOpen, setTrailersOpen] = useState(false);
  const [combosOpen,   setCombosOpen]   = useState(false);

  const [search,     setSearch]     = useState("");
  const [sortField,  setSortField]  = useState<SortField>("name");
  const [sortDir,    setSortDir]    = useState<SortDir>("asc");
  const [filterRole, setFilterRole] = useState<"" | "admin" | "driver">("");

  const [inviteModal,  setInviteModal]  = useState(false);
  const [profileModal, setProfileModal] = useState<{ member: Member; onSaved: (updated: Partial<Member>) => void } | null>(null);
  const [truckModal,   setTruckModal]   = useState<Truck | null | "new">(null);
  const [trailerModal, setTrailerModal] = useState<Trailer | null | "new">(null);
  const [comboModal,   setComboModal]   = useState<Combo | null | "new">(null);

  const loadAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setErr("Not authenticated."); setLoading(false); return; }
      setCurrentUserId(uid);

      const { data: settings } = await supabase.from("user_settings").select("active_company_id").eq("user_id", uid).maybeSingle();
      const cid = settings?.active_company_id as string | null;
      if (!cid) { setErr("No active company selected."); setLoading(false); return; }
      setCompanyId(cid);

      const { data: memRow } = await supabase.from("user_companies")
        .select("role, company:companies(company_name)").eq("user_id", uid).eq("company_id", cid).maybeSingle();
      setCompanyName((memRow?.company as any)?.company_name ?? "");
      if (memRow?.role !== "admin") { setErr("Admin access required."); setLoading(false); return; }

      const { data: memberRows } = await supabase.from("user_companies").select("user_id, role").eq("company_id", cid);
      const { data: profileRows } = await supabase.from("profiles").select("user_id, display_name, hire_date, division, region, local_area, employee_number");
      const { data: emailRows } = await supabase.rpc("get_company_member_emails", { p_company_id: cid });

      const profileMap = Object.fromEntries((profileRows ?? []).map((p: any) => [p.user_id, p]));
      const emailMap   = Object.fromEntries(((emailRows ?? []) as any[]).map(r => [r.user_id, r.email]));

      setMembers(((memberRows ?? []) as any[]).map(m => ({
        user_id:         m.user_id,
        role:            m.role,
        email:           emailMap[m.user_id] ?? "",
        display_name:    profileMap[m.user_id]?.display_name ?? null,
        hire_date:       profileMap[m.user_id]?.hire_date ?? null,
        division:        profileMap[m.user_id]?.division ?? null,
        region:          profileMap[m.user_id]?.region ?? null,
        local_area:      profileMap[m.user_id]?.local_area ?? null,
        employee_number: profileMap[m.user_id]?.employee_number ?? null,
      })));

      const { data: truckRows } = await supabase.from("trucks").select("truck_id, truck_name, active, region, status_code").eq("company_id", cid).order("truck_name");
      setTrucks((truckRows ?? []) as Truck[]);

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

      const { data: comboRows } = await supabase.from("equipment_combos")
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, truck:trucks(truck_name), trailer:trailers(trailer_name)")
        .eq("company_id", cid).order("combo_name");
      setCombos((comboRows ?? []) as unknown as Combo[]);

    } catch (e: any) {
      setErr(e?.message ?? "Load failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredMembers = useMemo(() => {
    let ms = [...members];
    if (filterRole) ms = ms.filter(m => m.role === filterRole);
    if (search.trim()) {
      const q = search.toLowerCase();
      ms = ms.filter(m =>
        (m.display_name ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.division ?? "").toLowerCase().includes(q) ||
        (m.region ?? "").toLowerCase().includes(q) ||
        (m.local_area ?? "").toLowerCase().includes(q) ||
        (m.employee_number ?? "").toLowerCase().includes(q)
      );
    }
    ms.sort((a, b) => {
      let av = "", bv = "";
      if (sortField === "name")      { av = (a.display_name ?? a.email).toLowerCase(); bv = (b.display_name ?? b.email).toLowerCase(); }
      if (sortField === "role")      { av = a.role; bv = b.role; }
      if (sortField === "division")  { av = a.division ?? ""; bv = b.division ?? ""; }
      if (sortField === "region")    { av = a.region ?? ""; bv = b.region ?? ""; }
      if (sortField === "hire_date") { av = a.hire_date ?? ""; bv = b.hire_date ?? ""; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return ms;
  }, [members, search, sortField, sortDir, filterRole]);

  if (loading) return <div style={{ ...css.page, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }}>Loading…</div>;
  if (err)     return <div style={css.page}><Banner msg={err} type="error" /></div>;

  const plusBtn = {
    ...css.btn("primary"),
    width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  } as const;

  return (
    <div style={css.page}>
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
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" as const, flex: 1 }}
            onClick={() => setUsersOpen(v => !v)}>
            <span style={{ transition: "transform 150ms", transform: usersOpen ? "rotate(90deg)" : "none", display: "inline-block", fontSize: 14 }}>›</span>
            Users ({members.length})
          </h2>
          <button style={plusBtn} onClick={() => setInviteModal(true)}>+</button>
        </div>

        {usersOpen && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" as const }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, email, employee #…"
                style={{ ...css.input, flex: 1, minWidth: 140, padding: "7px 10px" }} />
              <select value={filterRole} onChange={e => setFilterRole(e.target.value as any)}
                style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="">All roles</option>
                <option value="admin">Admin</option>
                <option value="driver">Driver</option>
              </select>
              <select value={`${sortField}:${sortDir}`}
                onChange={e => { const [f, d] = e.target.value.split(":"); setSortField(f as SortField); setSortDir(d as SortDir); }}
                style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="name:asc">Name A→Z</option>
                <option value="name:desc">Name Z→A</option>
                <option value="role:asc">Role A→Z</option>
                <option value="division:asc">Division A→Z</option>
                <option value="region:asc">Region A→Z</option>
                <option value="hire_date:asc">Hire Date ↑</option>
                <option value="hire_date:desc">Hire Date ↓</option>
              </select>
            </div>
            {filteredMembers.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No members match your search.</div>}
            {filteredMembers.map(m => (
              <MemberCard key={m.user_id} member={m} companyId={companyId!}
                onRefresh={loadAll} onEditProfile={(member, onSaved) => setProfileModal({ member, onSaved })}
                currentUserId={currentUserId} />
            ))}
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── TRUCKS ── */}
      <section style={{ marginBottom: 32, marginTop: 28 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" as const }} onClick={() => setTrucksOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: trucksOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Trucks ({trucks.filter(t => t.active).length} active)
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTruckModal("new"); }}>+</button>
        </div>
        {trucksOpen && (
          <>
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
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── TRAILERS ── */}
      <section style={{ marginBottom: 32, marginTop: 28 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" as const }} onClick={() => setTrailersOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: trailersOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Trailers ({trailers.filter(t => t.active).length} active)
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTrailerModal("new"); }}>+</button>
        </div>
        {trailersOpen && (
          <>
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
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── COMBOS ── */}
      <section style={{ marginTop: 28 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" as const }} onClick={() => setCombosOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: combosOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Equipment Combos ({combos.filter(c => c.active).length} active)
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setComboModal("new"); }}>+</button>
        </div>
        {combosOpen && (
          <>
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
          </>
        )}
      </section>

      {/* ── Modals ── */}
      {inviteModal  && <InviteModal companyId={companyId!} onClose={() => setInviteModal(false)} onDone={() => { setInviteModal(false); loadAll(); }} />}
      {profileModal && <DriverProfileModal member={profileModal.member} companyId={companyId!} onClose={() => setProfileModal(null)} onDone={(updated) => { profileModal.onSaved(updated); setProfileModal(null); }} onRemove={() => { setProfileModal(null); loadAll(); }} />}
      {truckModal   && <TruckModal   truck={truckModal === "new" ? null : truckModal} companyId={companyId!} onClose={() => setTruckModal(null)} onDone={() => { setTruckModal(null); loadAll(); }} />}
      {trailerModal && <TrailerModal trailer={trailerModal === "new" ? null : trailerModal} companyId={companyId!} onClose={() => setTrailerModal(null)} onDone={() => { setTrailerModal(null); loadAll(); }} />}
      {comboModal   && <ComboModal   combo={comboModal === "new" ? null : comboModal} companyId={companyId!} trucks={trucks.filter(t => t.active)} trailers={trailers.filter(t => t.active)} onClose={() => setComboModal(null)} onDone={() => { setComboModal(null); loadAll(); }} />}
    </div>
  );
}
