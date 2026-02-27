"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import NavMenu from "@/lib/ui/NavMenu";

import { T, css, fmtDate, expiryColor, daysUntil } from "@/lib/ui/driver/tokens";
import { Modal, Field, FieldRow, Banner, SubSectionTitle } from "@/lib/ui/driver/primitives";
import { MemberCard } from "@/lib/ui/driver/MemberCard";
import { DriverProfileModal } from "@/lib/ui/driver/DriverProfileModal";
import type { Member } from "@/lib/ui/driver/types";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Truck = {
  truck_id: string; truck_name: string; active: boolean;
  vin_number: string | null; make: string | null; model: string | null; year: number | null;
  region: string | null; local_area: string | null;
  status_code: string | null; status_location: string | null; in_use_by: string | null;
  in_use_by_name?: string | null;
  reg_expiration_date: string | null; reg_enforcement_date: string | null;
  inspection_shop: string | null; inspection_issue_date: string | null; inspection_expiration_date: string | null;
  ifta_expiration_date: string | null; ifta_enforcement_date: string | null;
  phmsa_expiration_date: string | null; alliance_expiration_date: string | null;
  fleet_ins_expiration_date: string | null; hazmat_lic_expiration_date: string | null;
  inner_bridge_expiration_date: string | null;
  other_permit_label: string | null; other_permit_expiration_date: string | null;
  notes: string | null;
};

type Compartment = { comp_number: number; max_gallons: number; position: number; };

type Trailer = {
  trailer_id: string; trailer_name: string; active: boolean;
  vin_number: string | null; make: string | null; model: string | null; year: number | null;
  cg_max: number; region: string | null; local_area: string | null;
  status_code: string | null; status_location: string | null; in_use_by: string | null;
  in_use_by_name?: string | null; last_load_config: string | null;
  compartments?: Compartment[];
  trailer_reg_expiration_date: string | null; trailer_reg_enforcement_date: string | null;
  trailer_inspection_shop: string | null; trailer_inspection_issue_date: string | null;
  trailer_inspection_expiration_date: string | null;
  tank_v_expiration_date: string | null; tank_k_expiration_date: string | null;
  tank_l_expiration_date: string | null; tank_t_expiration_date: string | null;
  tank_i_expiration_date: string | null; tank_p_expiration_date: string | null;
  tank_uc_expiration_date: string | null; notes: string | null;
};

type Combo = {
  combo_id: string; combo_name: string; truck_id: string; trailer_id: string;
  tare_lbs: number; target_weight: number | null; active: boolean;
  claimed_by?: string | null;
  truck?: { truck_name: string } | { truck_name: string }[] | null;
  trailer?: { trailer_name: string } | { trailer_name: string }[] | null;
  in_use_by_name?: string | null;
};

type SortField = "name" | "role" | "division" | "region" | "hire_date";
type SortDir   = "asc"  | "desc";
type ActiveFilter = "" | "active" | "inactive";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtExpiryInline(dateStr: string | null | undefined, days: number | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    const base = `${mm}-${dd}-${yyyy}`;
    if (days == null) return base;
    if (days < 0)     return `${base} (${days}d)`;
    if (days === 0)   return `${base} (today)`;
    return `${base} (+${days}d)`;
  } catch { return dateStr; }
}

function ExpiryField({ label, date, enforcement }: { label: string; date: string | null; enforcement?: string | null }) {
  const days = daysUntil(date);
  const color = expiryColor(days);
  const enfDays = enforcement ? daysUntil(enforcement) : null;
  const enfColor = expiryColor(enfDays);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" as const, marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
        <span style={{ fontSize: 12, color, fontWeight: days != null && days < 30 ? 600 : 400 }}>
          Exp: {fmtExpiryInline(date, days)}
        </span>
        {enforcement !== undefined && (
          <span style={{ fontSize: 12, color: enfColor, fontWeight: enfDays != null && enfDays < 30 ? 600 : 400 }}>
            Enf: {fmtExpiryInline(enforcement, enfDays)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PermitRow — single permit line with attachment + notes toggle
// ─────────────────────────────────────────────────────────────

function PermitRow({ label, date, enforcement, extra }: {
  label: string; date: string | null; enforcement?: string | null; extra?: React.ReactNode;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const days = daysUntil(date);
  const color = expiryColor(days);
  const enfDays = enforcement != null ? daysUntil(enforcement) : null;
  const enfColor = expiryColor(enfDays);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text, flex: 1 }}>{label}</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          {date && <span style={{ fontSize: 12, color, fontWeight: days != null && days < 30 ? 600 : 400 }}>
            Exp: {fmtExpiryInline(date, days)}
          </span>}
          {enforcement != null && enforcement && <span style={{ fontSize: 12, color: enfColor }}>
            Enf: {fmtExpiryInline(enforcement, enfDays)}
          </span>}
          {!date && <span style={{ fontSize: 12, color: T.muted }}>—</span>}
          {/* 📎 attachment placeholder */}
          <button type="button" title="Attach file" style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 14, padding: "2px 4px" }}>📎</button>
          {/* ▼ notes toggle */}
          <button type="button" title="Notes" onClick={() => setNotesOpen(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 11, padding: "2px 4px", transform: notesOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>▼</button>
          {/* ☑ driver task checkbox */}
          <input type="checkbox" title="Driver task" style={{ width: 13, height: 13, accentColor: T.accent }} />
        </div>
      </div>
      {extra}
      {notesOpen && (
        <textarea placeholder="Notes…" rows={2}
          style={{ ...css.input, width: "100%", marginTop: 6, fontSize: 11, resize: "vertical" as const }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compartment editor
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
// TruckCard — collapsed + expanded
// ─────────────────────────────────────────────────────────────

function TruckCard({ truck, onEdit }: { truck: Truck; onEdit: () => void }) {
  const [open, setOpen] = useState(false);

  const statusColor = truck.status_code === "active" ? T.success
    : truck.status_code === "inactive" ? T.muted : T.warning;

  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      {/* Collapsed header */}
      <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: "pointer", userSelect: "none" as const }}>
        {/* Left: unit number + region/area */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{truck.truck_name}</span>
            {(truck.region || truck.local_area) && (
              <span style={{ fontSize: 11, color: T.muted }}>
                {[truck.region, truck.local_area].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          {truck.vin_number && <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{truck.vin_number}</div>}
        </div>
        {/* Right: Edit + in use / not in use */}
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <button type="button" style={{ ...css.btn("subtle"), padding: "3px 10px", fontSize: 11 }} onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          <span style={{ fontSize: 11, color: truck.in_use_by_name ? T.accent : T.muted }}>
            {truck.in_use_by_name ? `In use · ${truck.in_use_by_name}` : "Not in use"}
          </span>
        </div>
      </div>
      {/* Bottom status bar */}
      <div style={{ padding: "4px 12px 8px", display: "flex", justifyContent: "flex-end" }}>
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>
          {[truck.status_code, truck.status_location].filter(Boolean).join(" · ") || "—"}
        </span>
      </div>
      {/* Expanded permit book */}
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 12px 4px" }} onClick={e => e.stopPropagation()}>
          {(truck.make || truck.model || truck.year) && (
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
              {[truck.year, truck.make, truck.model].filter(Boolean).join(" ")}
            </div>
          )}
          <SubSectionTitle>Permit Book</SubSectionTitle>
          <PermitRow label="Registration" date={truck.reg_expiration_date} enforcement={truck.reg_enforcement_date} />
          <PermitRow label="Annual Inspection" date={truck.inspection_expiration_date} extra={
            (truck.inspection_shop || truck.inspection_issue_date) ? (
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                {[truck.inspection_shop, truck.inspection_issue_date && `Issued ${fmtDate(truck.inspection_issue_date)}`].filter(Boolean).join(" · ")}
              </div>
            ) : null
          } />
          <PermitRow label="IFTA Permit + Decals" date={truck.ifta_expiration_date} enforcement={truck.ifta_enforcement_date} />
          <PermitRow label="PHMSA HazMat Permit" date={truck.phmsa_expiration_date} />
          <PermitRow label="Alliance Uniform HazMat Permit" date={truck.alliance_expiration_date} />
          <PermitRow label="Fleet Insurance Cab Card" date={truck.fleet_ins_expiration_date} />
          <PermitRow label="HazMat Transportation License" date={truck.hazmat_lic_expiration_date} />
          <PermitRow label="Inner Bridge Permit" date={truck.inner_bridge_expiration_date} />
          {(truck.other_permit_label || truck.other_permit_expiration_date) && (
            <PermitRow label={truck.other_permit_label || "Other Permit"} date={truck.other_permit_expiration_date} />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TrailerCard — collapsed + expanded
// ─────────────────────────────────────────────────────────────

function TrailerCard({ trailer, onEdit }: { trailer: Trailer; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const comps = trailer.compartments ?? [];
  const totalGal = comps.reduce((s, c) => s + c.max_gallons, 0);
  const compSummary = comps.length > 0
    ? `${comps.length} Comps ${comps.map(c => c.max_gallons.toLocaleString()).join("/")} = ${totalGal.toLocaleString()} max`
    : null;
  const statusColor = trailer.status_code === "active" ? T.success : trailer.status_code === "inactive" ? T.muted : T.warning;

  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: "pointer", userSelect: "none" as const }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{trailer.trailer_name}</span>
            {(trailer.region || trailer.local_area) && (
              <span style={{ fontSize: 11, color: T.muted }}>{[trailer.region, trailer.local_area].filter(Boolean).join(" · ")}</span>
            )}
          </div>
          {trailer.vin_number && <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{trailer.vin_number}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <button type="button" style={{ ...css.btn("subtle"), padding: "3px 10px", fontSize: 11 }} onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          <span style={{ fontSize: 11, color: trailer.in_use_by_name ? T.accent : T.muted }}>
            {trailer.in_use_by_name ? `In use · ${trailer.in_use_by_name}` : "Not in use"}
          </span>
        </div>
      </div>
      <div style={{ padding: "4px 12px 8px", display: "flex", justifyContent: "flex-end" }}>
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>
          {[trailer.status_code, trailer.status_location].filter(Boolean).join(" · ") || "—"}
        </span>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 12px 4px" }} onClick={e => e.stopPropagation()}>
          {(trailer.make || trailer.model || trailer.year) && (
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{[trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ")}</div>
          )}
          {compSummary && <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{compSummary}</div>}
          {trailer.last_load_config && <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>Residue Last Contained — {trailer.last_load_config}</div>}
          <SubSectionTitle>Permit Book</SubSectionTitle>
          <PermitRow label="Trailer Registration" date={trailer.trailer_reg_expiration_date} enforcement={trailer.trailer_reg_enforcement_date} />
          <PermitRow label="Annual Inspection" date={trailer.trailer_inspection_expiration_date} extra={
            (trailer.trailer_inspection_shop || trailer.trailer_inspection_issue_date) ? (
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                {[trailer.trailer_inspection_shop, trailer.trailer_inspection_issue_date && `Issued ${fmtDate(trailer.trailer_inspection_issue_date)}`].filter(Boolean).join(" · ")}
              </div>
            ) : null
          } />
          <SubSectionTitle>Tank Inspections</SubSectionTitle>
          <PermitRow label="V — Annual External Visual" date={trailer.tank_v_expiration_date} />
          <PermitRow label="K — Annual Leakage Test" date={trailer.tank_k_expiration_date} />
          <PermitRow label="L — Annual Lining Inspection" date={trailer.tank_l_expiration_date} />
          <PermitRow label="T — 2 Year Thickness Test" date={trailer.tank_t_expiration_date} />
          <PermitRow label="I — 5 Year Internal Visual" date={trailer.tank_i_expiration_date} />
          <PermitRow label="P — 5 Year Pressure Test" date={trailer.tank_p_expiration_date} />
          <PermitRow label="UC — 5 Year Upper Coupler" date={trailer.tank_uc_expiration_date} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ComboCard — collapsed + expanded (load log tap)
// ─────────────────────────────────────────────────────────────

function ComboCard({ combo, onEdit }: { combo: Combo; onEdit: () => void }) {
  const truckName   = Array.isArray(combo.truck)   ? combo.truck[0]?.truck_name   : combo.truck?.truck_name;
  const trailerName = Array.isArray(combo.trailer) ? combo.trailer[0]?.trailer_name : combo.trailer?.trailer_name;

  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>
            {truckName || "—"} / {trailerName || "—"}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
            Tare {combo.tare_lbs?.toLocaleString() ?? "—"} lbs
            {combo.target_weight ? ` · Target ${combo.target_weight.toLocaleString()} lbs` : ""}
            {combo.in_use_by_name ? ` · In use: ${combo.in_use_by_name}` : ""}
          </div>
        </div>
        <button type="button" style={{ ...css.btn("subtle"), padding: "3px 10px", fontSize: 11, flexShrink: 0 }} onClick={onEdit}>Edit</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Invite Modal
// ─────────────────────────────────────────────────────────────

function InviteModal({ companyId, onClose, onDone }: { companyId: string; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("driver");
  const [status, setStatus] = useState<{ type: "error" | "success"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  async function send() {
    if (!email.trim()) return; setLoading(true); setStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/invite", { method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), companyId, role }) });
      let json: any = {}; try { json = await res.json(); } catch {}
      if (!res.ok) throw new Error(json?.error ?? `Invite failed (${res.status}).`);
      setStatus({ type: "success", msg: `Invite sent to ${email.trim()}.` }); setEmail("");
      setTimeout(() => onDone(), 2000);
    } catch (e: any) { setStatus({ type: "error", msg: e?.message ?? "Failed." }); }
    finally { setLoading(false); }
  }
  return (
    <Modal title="Invite User" onClose={onClose}>
      {status && <Banner msg={status.msg} type={status.type} />}
      <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={css.input} onKeyDown={e => e.key === "Enter" && send()} autoFocus /></Field>
      <Field label="Role"><select value={role} onChange={e => setRole(e.target.value)} style={{ ...css.select, width: "100%" }}><option value="driver">Driver</option><option value="admin">Admin</option></select></Field>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>If the user already has an account they'll be added immediately. New users receive a magic link.</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={css.btn("primary")} onClick={send} disabled={loading || !email.trim()}>{loading ? "Sending…" : "Send Invite"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Truck Modal (edit / add)
// ─────────────────────────────────────────────────────────────

function TruckModal({ truck, companyId, onClose, onDone }: { truck: Truck | null; companyId: string; onClose: () => void; onDone: () => void }) {
  const isNew = !truck;
  const [name,   setName]   = useState(truck?.truck_name ?? "");
  const [vin,    setVin]    = useState(truck?.vin_number ?? "");
  const [make,   setMake]   = useState(truck?.make ?? "");
  const [model,  setModel]  = useState(truck?.model ?? "");
  const [year,   setYear]   = useState(String(truck?.year ?? ""));
  const [region, setRegion] = useState(truck?.region ?? "");
  const [local,  setLocal]  = useState(truck?.local_area ?? "");
  const [status, setStatus] = useState(truck?.status_code ?? "");
  const [statusLoc, setStatusLoc] = useState(truck?.status_location ?? "");
  const [active, setActive] = useState(truck?.active ?? true);
  // Permit book
  const [regExp,    setRegExp]    = useState(truck?.reg_expiration_date ?? "");
  const [regEnf,    setRegEnf]    = useState(truck?.reg_enforcement_date ?? "");
  const [insShop,   setInsShop]   = useState(truck?.inspection_shop ?? "");
  const [insIssue,  setInsIssue]  = useState(truck?.inspection_issue_date ?? "");
  const [insExp,    setInsExp]    = useState(truck?.inspection_expiration_date ?? "");
  const [iftaExp,   setIftaExp]   = useState(truck?.ifta_expiration_date ?? "");
  const [iftaEnf,   setIftaEnf]   = useState(truck?.ifta_enforcement_date ?? "");
  const [phmsaExp,  setPhmsaExp]  = useState(truck?.phmsa_expiration_date ?? "");
  const [alliExp,   setAlliExp]   = useState(truck?.alliance_expiration_date ?? "");
  const [fleetExp,  setFleetExp]  = useState(truck?.fleet_ins_expiration_date ?? "");
  const [hazLicExp, setHazLicExp] = useState(truck?.hazmat_lic_expiration_date ?? "");
  const [ibExp,     setIbExp]     = useState(truck?.inner_bridge_expiration_date ?? "");
  const [otherLabel,setOtherLabel]= useState(truck?.other_permit_label ?? "");
  const [otherExp,  setOtherExp]  = useState(truck?.other_permit_expiration_date ?? "");
  const [notes,     setNotes]     = useState(truck?.notes ?? "");
  const [err, setErr] = useState<string | null>(null); const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Truck name is required."); return; }
    setSaving(true); setErr(null);
    const payload: any = {
      truck_name: name.trim(), vin_number: vin || null, make: make || null, model: model || null,
      year: year ? parseInt(year) : null, region: region || null, local_area: local || null,
      status_code: status || null, status_location: statusLoc || null, active, company_id: companyId,
      reg_expiration_date: regExp || null, reg_enforcement_date: regEnf || null,
      inspection_shop: insShop || null, inspection_issue_date: insIssue || null, inspection_expiration_date: insExp || null,
      ifta_expiration_date: iftaExp || null, ifta_enforcement_date: iftaEnf || null,
      phmsa_expiration_date: phmsaExp || null, alliance_expiration_date: alliExp || null,
      fleet_ins_expiration_date: fleetExp || null, hazmat_lic_expiration_date: hazLicExp || null,
      inner_bridge_expiration_date: ibExp || null,
      other_permit_label: otherLabel || null, other_permit_expiration_date: otherExp || null, notes: notes || null,
    };
    const { error } = isNew
      ? await supabase.from("trucks").insert(payload)
      : await supabase.from("trucks").update(payload).eq("truck_id", truck!.truck_id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onDone();
  }

  async function deleteTruck() {
    if (!confirm("Delete this truck?")) return; setSaving(true);
    await supabase.from("trucks").delete().eq("truck_id", truck!.truck_id); onDone();
  }

  const d = (label: string, val: string, set: (v: string) => void, type = "text", ph = "") => (
    <Field label={label} half><input type={type} value={val} onChange={e => set(e.target.value)} style={css.input} placeholder={ph} /></Field>
  );

  return (
    <Modal title={isNew ? "Add Truck" : "Edit Truck"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}
      <SubSectionTitle>Identification</SubSectionTitle>
      <FieldRow>
        {d("Unit Number", name, setName, "text", "e.g. T-101")}
        {d("VIN", vin, setVin, "text", "VIN number")}
        {d("Make", make, setMake, "text", "e.g. Kenworth")}
        {d("Model", model, setModel, "text", "e.g. T680")}
        {d("Year", year, setYear, "number", "e.g. 2022")}
        {d("Region", region, setRegion, "text", "e.g. Southeast")}
        {d("Local Area", local, setLocal, "text", "e.g. Tampa Bay")}
        <Field label="Status" half>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...css.select, width: "100%" }}>
            <option value="">— Select —</option>
            <option value="active">Active</option>
            <option value="parked">Parked</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        {d("Status Location", statusLoc, setStatusLoc, "text", "e.g. Yard 1")}
      </FieldRow>
      <hr style={css.divider} />
      <SubSectionTitle>Permit Book</SubSectionTitle>
      <FieldRow>
        {d("Reg Expiration", regExp, setRegExp, "date")} {d("Reg Enforcement", regEnf, setRegEnf, "date")}
        {d("Inspection Shop", insShop, setInsShop, "text", "Shop name")} {d("Inspection Issue", insIssue, setInsIssue, "date")} {d("Inspection Expiration", insExp, setInsExp, "date")}
        {d("IFTA Expiration", iftaExp, setIftaExp, "date")} {d("IFTA Enforcement", iftaEnf, setIftaEnf, "date")}
        {d("PHMSA HazMat Exp", phmsaExp, setPhmsaExp, "date")}
        {d("Alliance HazMat Exp", alliExp, setAlliExp, "date")}
        {d("Fleet Insurance Exp", fleetExp, setFleetExp, "date")}
        {d("HazMat Lic Exp", hazLicExp, setHazLicExp, "date")}
        {d("Inner Bridge Exp", ibExp, setIbExp, "date")}
        {d("Other Permit Label", otherLabel, setOtherLabel, "text", "e.g. State Permit")} {d("Other Permit Exp", otherExp, setOtherExp, "date")}
      </FieldRow>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...css.input, width: "100%", resize: "vertical" as const }} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        {!isNew ? <button style={{ ...css.btn("danger"), fontSize: 12 }} onClick={deleteTruck} disabled={saving}>Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
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

function TrailerModal({ trailer, companyId, onClose, onDone }: { trailer: Trailer | null; companyId: string; onClose: () => void; onDone: () => void }) {
  const isNew = !trailer;
  const [name,    setName]    = useState(trailer?.trailer_name ?? "");
  const [vin,     setVin]     = useState(trailer?.vin_number ?? "");
  const [make,    setMake]    = useState(trailer?.make ?? "");
  const [model,   setModel]   = useState(trailer?.model ?? "");
  const [year,    setYear]    = useState(String(trailer?.year ?? ""));
  const [region,  setRegion]  = useState(trailer?.region ?? "");
  const [local,   setLocal]   = useState(trailer?.local_area ?? "");
  const [cgMax,   setCgMax]   = useState(String(trailer?.cg_max ?? 1.0));
  const [status,  setStatus]  = useState(trailer?.status_code ?? "");
  const [statusLoc, setStatusLoc] = useState(trailer?.status_location ?? "");
  const [active,  setActive]  = useState(trailer?.active ?? true);
  const [comps,   setComps]   = useState<Compartment[]>(trailer?.compartments ?? []);
  // Trailer permit book
  const [trRegExp,  setTrRegExp]  = useState(trailer?.trailer_reg_expiration_date ?? "");
  const [trRegEnf,  setTrRegEnf]  = useState(trailer?.trailer_reg_enforcement_date ?? "");
  const [trInsShop, setTrInsShop] = useState(trailer?.trailer_inspection_shop ?? "");
  const [trInsIssue,setTrInsIssue]= useState(trailer?.trailer_inspection_issue_date ?? "");
  const [trInsExp,  setTrInsExp]  = useState(trailer?.trailer_inspection_expiration_date ?? "");
  // Tank inspections
  const [tankV,  setTankV]  = useState(trailer?.tank_v_expiration_date ?? "");
  const [tankK,  setTankK]  = useState(trailer?.tank_k_expiration_date ?? "");
  const [tankL,  setTankL]  = useState(trailer?.tank_l_expiration_date ?? "");
  const [tankT,  setTankT]  = useState(trailer?.tank_t_expiration_date ?? "");
  const [tankI,  setTankI]  = useState(trailer?.tank_i_expiration_date ?? "");
  const [tankP,  setTankP]  = useState(trailer?.tank_p_expiration_date ?? "");
  const [tankUC, setTankUC] = useState(trailer?.tank_uc_expiration_date ?? "");
  const [notes,  setNotes]  = useState(trailer?.notes ?? "");
  const [err, setErr] = useState<string | null>(null); const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Trailer name is required."); return; }
    if (comps.some(c => !c.max_gallons || c.max_gallons <= 0)) { setErr("All compartments need max gallons > 0."); return; }
    setSaving(true); setErr(null);
    const payload: any = {
      trailer_name: name.trim(), vin_number: vin || null, make: make || null, model: model || null,
      year: year ? parseInt(year) : null, region: region || null, local_area: local || null,
      cg_max: parseFloat(cgMax) || 1.0, status_code: status || null, status_location: statusLoc || null,
      active, company_id: companyId,
      trailer_reg_expiration_date: trRegExp || null, trailer_reg_enforcement_date: trRegEnf || null,
      trailer_inspection_shop: trInsShop || null, trailer_inspection_issue_date: trInsIssue || null,
      trailer_inspection_expiration_date: trInsExp || null,
      tank_v_expiration_date: tankV || null, tank_k_expiration_date: tankK || null,
      tank_l_expiration_date: tankL || null, tank_t_expiration_date: tankT || null,
      tank_i_expiration_date: tankI || null, tank_p_expiration_date: tankP || null,
      tank_uc_expiration_date: tankUC || null, notes: notes || null,
    };
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
    if (!confirm("Delete this trailer?")) return; setSaving(true);
    await supabase.from("trailer_compartments").delete().eq("trailer_id", trailer!.trailer_id);
    await supabase.from("trailers").delete().eq("trailer_id", trailer!.trailer_id); onDone();
  }

  const d = (label: string, val: string, set: (v: string) => void, type = "text", ph = "") => (
    <Field label={label} half><input type={type} value={val} onChange={e => set(e.target.value)} style={css.input} placeholder={ph} /></Field>
  );

  return (
    <Modal title={isNew ? "Add Trailer" : "Edit Trailer"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}
      <SubSectionTitle>Identification</SubSectionTitle>
      <FieldRow>
        {d("Unit Number", name, setName, "text", "e.g. 3151")}
        {d("VIN", vin, setVin, "text", "VIN number")}
        {d("Make", make, setMake, "text", "e.g. Polar")}
        {d("Model", model, setModel, "text", "e.g. Tank")}
        {d("Year", year, setYear, "number", "e.g. 2020")}
        {d("Region", region, setRegion, "text", "e.g. Southeast")}
        {d("Local Area", local, setLocal, "text", "e.g. Tampa Bay")}
        <Field label="CG Max" half><input type="number" step="0.01" value={cgMax} onChange={e => setCgMax(e.target.value)} style={css.input} /></Field>
        <Field label="Status" half>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...css.select, width: "100%" }}>
            <option value="">— Select —</option>
            <option value="active">Active</option>
            <option value="parked">Parked</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        {d("Status Location", statusLoc, setStatusLoc, "text", "e.g. Yard 1")}
      </FieldRow>
      <hr style={css.divider} />
      <div style={{ ...css.card, background: T.surface2, marginBottom: 14 }}><CompartmentEditor comps={comps} onChange={setComps} /></div>
      <hr style={css.divider} />
      <SubSectionTitle>Permit Book</SubSectionTitle>
      <FieldRow>
        {d("Reg Expiration", trRegExp, setTrRegExp, "date")} {d("Reg Enforcement", trRegEnf, setTrRegEnf, "date")}
        {d("Inspection Shop", trInsShop, setTrInsShop, "text", "Shop name")} {d("Inspection Issue", trInsIssue, setTrInsIssue, "date")} {d("Inspection Expiration", trInsExp, setTrInsExp, "date")}
      </FieldRow>
      <SubSectionTitle>Tank Inspections</SubSectionTitle>
      <FieldRow>
        {d("V — External Visual", tankV, setTankV, "date")}
        {d("K — Leakage Test", tankK, setTankK, "date")}
        {d("L — Lining Inspection", tankL, setTankL, "date")}
        {d("T — Thickness Test (2yr)", tankT, setTankT, "date")}
        {d("I — Internal Visual (5yr)", tankI, setTankI, "date")}
        {d("P — Pressure Test (5yr)", tankP, setTankP, "date")}
        {d("UC — Upper Coupler (5yr)", tankUC, setTankUC, "date")}
      </FieldRow>
      <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...css.input, width: "100%", resize: "vertical" as const }} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        {!isNew ? <button style={{ ...css.btn("danger"), fontSize: 12 }} onClick={deleteTrailer} disabled={saving}>Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={css.btn("primary")} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Trailer" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Combo Modal  (edit only — creation via Couple flow)
// ─────────────────────────────────────────────────────────────

function ComboModal({ combo, companyId, trucks, trailers, onClose, onDone, onDecouple }: {
  combo: Combo | null; companyId: string; trucks: Truck[]; trailers: Trailer[];
  onClose: () => void; onDone: () => void; onDecouple?: () => void;
}) {
  const isNew = !combo;
  const [truckId,   setTruckId]   = useState(combo?.truck_id ?? trucks[0]?.truck_id ?? "");
  const [trailerId, setTrailerId] = useState(combo?.trailer_id ?? trailers[0]?.trailer_id ?? "");
  const [tareLbs,   setTareLbs]   = useState(String(combo?.tare_lbs ?? ""));
  const [target,    setTarget]    = useState(String(combo?.target_weight ?? "80000"));
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
      const { error } = await supabase.from("equipment_combos").update({ truck_id: truckId, trailer_id: trailerId, tare_lbs: parseFloat(tareLbs), target_weight: parseFloat(target) || null }).eq("combo_id", combo!.combo_id);
      if (error) { setErr(error.message); setSaving(false); return; }
    }
    onDone();
  }

  async function deleteCombo() {
    if (!confirm("Delete this combo?")) return; setSaving(true);
    await supabase.from("equipment_combos").delete().eq("combo_id", combo!.combo_id); onDone();
  }

  const btnSz = { ...css.btn("ghost"), fontSize: 13, padding: "8px 14px" };

  return (
    <Modal title={isNew ? "New Combo" : "Edit Combo"} onClose={onClose}>
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
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {!isNew && <button style={{ ...btnSz, color: T.danger, borderColor: `${T.danger}44` }} onClick={deleteCombo} disabled={saving}>Delete</button>}
          {!isNew && onDecouple && <button style={{ ...btnSz, color: T.warning, borderColor: `${T.warning}44` }} onClick={onDecouple} disabled={saving}>Decouple</button>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnSz} onClick={onClose}>Cancel</button>
          <button style={{ ...css.btn("primary"), fontSize: 13, padding: "8px 14px" }} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Couple" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// CoupleModal — search trucks + trailers, couple them
// ─────────────────────────────────────────────────────────────

function CoupleModal({ companyId, trucks, trailers, onClose, onDone }: {
  companyId: string; trucks: Truck[]; trailers: Trailer[];
  onClose: () => void; onDone: () => void;
}) {
  const [truckSearch,   setTruckSearch]   = useState("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [truckId,   setTruckId]   = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [tareLbs,   setTareLbs]   = useState("");
  const [target,    setTarget]    = useState("80000");
  const [statusLoc, setStatusLoc] = useState("");
  const [err,       setErr]       = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  const filteredTrucks   = trucks.filter(t =>
    !truckSearch || [t.truck_name, t.vin_number, t.region, t.local_area, t.status_code, t.status_location].some(v => v?.toLowerCase().includes(truckSearch.toLowerCase()))
  );
  const filteredTrailers = trailers.filter(t =>
    !trailerSearch || [t.trailer_name, t.vin_number, t.region, t.local_area, t.status_code, t.status_location].some(v => v?.toLowerCase().includes(trailerSearch.toLowerCase()))
  );

  async function couple() {
    if (!truckId || !trailerId) { setErr("Select a truck and trailer."); return; }
    if (!tareLbs || parseFloat(tareLbs) <= 0) { setErr("Tare weight is required."); return; }
    setSaving(true); setErr(null);
    const { error } = await supabase.rpc("couple_combo", {
      p_truck_id: truckId, p_trailer_id: trailerId,
      p_tare_lbs: parseFloat(tareLbs), p_target_weight: parseFloat(target) || 80000,
    });
    if (error) { setErr(error.message); setSaving(false); return; }
    if (statusLoc) {
      await supabase.from("trucks").update({ status_location: statusLoc, status_code: "active" }).eq("truck_id", truckId);
      await supabase.from("trailers").update({ status_location: statusLoc, status_code: "active" }).eq("trailer_id", trailerId);
    }
    onDone();
  }

  const selStyle = (selected: boolean) => ({
    ...css.card, cursor: "pointer", marginBottom: 4, fontSize: 12,
    borderColor: selected ? T.accent : T.border,
    background: selected ? `${T.accent}18` : T.surface,
  });

  return (
    <Modal title="Couple Equipment" onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <SubSectionTitle>Truck</SubSectionTitle>
          <input value={truckSearch} onChange={e => setTruckSearch(e.target.value)} placeholder="Search number, make, model, region…" style={{ ...css.input, marginBottom: 8, fontSize: 12 }} />
          <div style={{ maxHeight: 220, overflowY: "auto" as const }}>
            {filteredTrucks.map(t => (
              <div key={t.truck_id} style={selStyle(truckId === t.truck_id)} onClick={() => setTruckId(t.truck_id)}>
                <div style={{ fontWeight: 700 }}>{t.truck_name}</div>
                <div style={{ color: T.muted }}>{[t.region, t.local_area, t.status_code, t.status_location].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SubSectionTitle>Trailer</SubSectionTitle>
          <input value={trailerSearch} onChange={e => setTrailerSearch(e.target.value)} placeholder="Search number, make, model, region…" style={{ ...css.input, marginBottom: 8, fontSize: 12 }} />
          <div style={{ maxHeight: 220, overflowY: "auto" as const }}>
            {filteredTrailers.map(t => (
              <div key={t.trailer_id} style={selStyle(trailerId === t.trailer_id)} onClick={() => setTrailerId(t.trailer_id)}>
                <div style={{ fontWeight: 700 }}>{t.trailer_name}</div>
                <div style={{ color: T.muted }}>{[t.region, t.local_area, t.status_code, t.status_location].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <div style={{ flex: 1 }}><label style={css.label}>Tare Weight (lbs)</label><input type="number" value={tareLbs} onChange={e => setTareLbs(e.target.value)} placeholder="e.g. 34000" style={css.input} /></div>
        <div style={{ flex: 1 }}><label style={css.label}>Target Gross (lbs)</label><input type="number" value={target} onChange={e => setTarget(e.target.value)} style={css.input} /></div>
        <div style={{ flex: 1 }}><label style={css.label}>Location (optional)</label><input value={statusLoc} onChange={e => setStatusLoc(e.target.value)} placeholder="e.g. Yard 1" style={css.input} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={css.btn("primary")} onClick={couple} disabled={saving || !truckId || !trailerId}>{saving ? "Coupling…" : "Couple"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Main AdminPage
// ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [companyId,     setCompanyId]     = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [companyName,   setCompanyName]   = useState<string>("");
  const [members,       setMembers]       = useState<Member[]>([]);
  const [trucks,        setTrucks]        = useState<Truck[]>([]);
  const [trailers,      setTrailers]      = useState<Trailer[]>([]);
  const [combos,        setCombos]        = useState<Combo[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState<string | null>(null);

  const [usersOpen,    setUsersOpen]    = useState(false);
  const [trucksOpen,   setTrucksOpen]   = useState(false);
  const [trailersOpen, setTrailersOpen] = useState(false);
  const [combosOpen,   setCombosOpen]   = useState(false);

  // Users filters
  const [search,     setSearch]     = useState("");
  const [sortField,  setSortField]  = useState<SortField>("name");
  const [sortDir,    setSortDir]    = useState<SortDir>("asc");
  const [filterRole, setFilterRole] = useState<"" | "admin" | "driver">("");

  // Equipment filters
  const [truckFilter,   setTruckFilter]   = useState<ActiveFilter>("");
  const [truckSearch,   setTruckSearch]   = useState("");
  const [truckSort,     setTruckSort]     = useState("name:asc");
  const [trailerFilter, setTrailerFilter] = useState<ActiveFilter>("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [trailerSort,   setTrailerSort]   = useState("name:asc");
  const [comboSearch,   setComboSearch]   = useState("");

  // Modals
  const [inviteModal,  setInviteModal]  = useState(false);
  const [profileModal, setProfileModal] = useState<{ member: Member; onSaved: (u: Partial<Member>) => void } | null>(null);
  const [truckModal,   setTruckModal]   = useState<Truck | null | "new">(null);
  const [trailerModal, setTrailerModal] = useState<Trailer | null | "new">(null);
  const [comboModal,   setComboModal]   = useState<Combo | null | "new">(null);
  const [coupleModal,  setCoupleModal]  = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setErr("Not authenticated."); return; }
      setCurrentUserId(uid);
      const { data: settings } = await supabase.from("user_settings").select("active_company_id").eq("user_id", uid).maybeSingle();
      const cid = settings?.active_company_id as string | null;
      if (!cid) { setErr("No active company selected."); return; }
      setCompanyId(cid);
      const { data: memRow } = await supabase.from("user_companies").select("role, company:companies(company_name)").eq("user_id", uid).eq("company_id", cid).maybeSingle();
      setCompanyName((memRow?.company as any)?.company_name ?? "");
      if (memRow?.role !== "admin") { setErr("Admin access required."); return; }

      // Members
      const { data: memberRows } = await supabase.from("user_companies").select("user_id, role").eq("company_id", cid);
      const { data: profileRows } = await supabase.from("profiles").select("user_id, display_name, hire_date, division, region, local_area, employee_number");
      const { data: emailRows } = await supabase.rpc("get_company_member_emails", { p_company_id: cid });
      const profileMap = Object.fromEntries((profileRows ?? []).map((p: any) => [p.user_id, p]));
      const emailMap   = Object.fromEntries(((emailRows ?? []) as any[]).map(r => [r.user_id, r.email]));
      setMembers(((memberRows ?? []) as any[]).map(m => ({
        user_id: m.user_id, role: m.role, email: emailMap[m.user_id] ?? "",
        display_name: profileMap[m.user_id]?.display_name ?? null, hire_date: profileMap[m.user_id]?.hire_date ?? null,
        division: profileMap[m.user_id]?.division ?? null, region: profileMap[m.user_id]?.region ?? null,
        local_area: profileMap[m.user_id]?.local_area ?? null, employee_number: profileMap[m.user_id]?.employee_number ?? null,
      })));

      // Trucks + trailers via roster RPC (joins active combo → claimed_by → profile display name)
      const { data: rosterData, error: rosterErr } = await supabase.rpc("get_equipment_roster", { p_company_id: cid });
      if (rosterErr) throw rosterErr;
      const roster = rosterData as { trucks: any[]; trailers: any[] };
      const truckRows    = roster?.trucks   ?? [];
      const trailerRows  = roster?.trailers ?? [];

      // Compartments
      const tIds = trailerRows.map((t: any) => t.trailer_id);
      let compMap: Record<string, Compartment[]> = {};
      if (tIds.length > 0) {
        const { data: compRows } = await supabase.from("trailer_compartments")
          .select("trailer_id, comp_number, max_gallons, position")
          .in("trailer_id", tIds).order("comp_number");
        for (const c of (compRows ?? []) as any[]) {
          if (!compMap[c.trailer_id]) compMap[c.trailer_id] = [];
          compMap[c.trailer_id].push({ comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position });
        }
      }

      // Active combos — include claimed_by for display
      const { data: comboRows } = await supabase.from("equipment_combos")
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, claimed_by, truck:trucks(truck_name), trailer:trailers(trailer_name)")
        .eq("company_id", cid).eq("active", true).order("combo_name");

      // Resolve combo claimed_by to display names
      const claimedIds = [...new Set((comboRows ?? []).map((c: any) => c.claimed_by).filter(Boolean))];
      let claimedNameMap: Record<string, string> = {};
      if (claimedIds.length > 0) {
        const { data: claimedNames } = await supabase.from("profiles").select("user_id, display_name").in("user_id", claimedIds);
        claimedNameMap = Object.fromEntries((claimedNames ?? []).map((r: any) => [r.user_id, r.display_name ?? ""]));
      }

      setTrucks(truckRows as Truck[]);
      setTrailers(trailerRows.map((t: any) => ({ ...t, compartments: compMap[t.trailer_id] ?? [] })) as Trailer[]);
      setCombos(((comboRows ?? []) as any[]).map(c => ({ ...c, in_use_by_name: c.claimed_by ? claimedNameMap[c.claimed_by] ?? null : null })) as unknown as Combo[]);
    } catch (e: any) { setErr(e?.message ?? "Load failed."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Filtered/sorted members
  const filteredMembers = useMemo(() => {
    let ms = [...members];
    if (filterRole) ms = ms.filter(m => m.role === filterRole);
    if (search.trim()) {
      const q = search.toLowerCase();
      ms = ms.filter(m => [m.display_name, m.email, m.division, m.region, m.local_area, m.employee_number].some(v => v?.toLowerCase().includes(q)));
    }
    ms.sort((a, b) => {
      const av = (sortField === "name" ? (a.display_name ?? a.email) : sortField === "role" ? a.role : sortField === "division" ? a.division : sortField === "region" ? a.region : a.hire_date) ?? "";
      const bv = (sortField === "name" ? (b.display_name ?? b.email) : sortField === "role" ? b.role : sortField === "division" ? b.division : sortField === "region" ? b.region : b.hire_date) ?? "";
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return ms;
  }, [members, search, sortField, sortDir, filterRole]);

  // Filtered/sorted trucks
  const filteredTrucks = useMemo(() => {
    let ts = [...trucks];
    if (truckFilter === "active") ts = ts.filter(t => t.active);
    if (truckFilter === "inactive") ts = ts.filter(t => !t.active);
    if (truckSearch.trim()) {
      const q = truckSearch.toLowerCase();
      ts = ts.filter(t => [t.truck_name, t.vin_number, t.region, t.local_area, t.status_code, t.status_location].some(v => v?.toLowerCase().includes(q)));
    }
    const [sf, sd] = truckSort.split(":");
    ts.sort((a, b) => {
      const av = (sf === "name" ? a.truck_name : sf === "region" ? a.region : sf === "status" ? a.status_code : a.truck_name) ?? "";
      const bv = (sf === "name" ? b.truck_name : sf === "region" ? b.region : sf === "status" ? b.status_code : b.truck_name) ?? "";
      return sd === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return ts;
  }, [trucks, truckFilter, truckSearch, truckSort]);

  // Filtered/sorted trailers
  const filteredTrailers = useMemo(() => {
    let ts = [...trailers];
    if (trailerFilter === "active") ts = ts.filter(t => t.active);
    if (trailerFilter === "inactive") ts = ts.filter(t => !t.active);
    if (trailerSearch.trim()) {
      const q = trailerSearch.toLowerCase();
      ts = ts.filter(t => [t.trailer_name, t.vin_number, t.region, t.local_area, t.status_code, t.status_location].some(v => v?.toLowerCase().includes(q)));
    }
    const [sf, sd] = trailerSort.split(":");
    ts.sort((a, b) => {
      const av = (sf === "name" ? a.trailer_name : sf === "region" ? a.region : a.trailer_name) ?? "";
      const bv = (sf === "name" ? b.trailer_name : sf === "region" ? b.region : b.trailer_name) ?? "";
      return sd === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return ts;
  }, [trailers, trailerFilter, trailerSearch, trailerSort]);

  // Filtered combos (active only by default) + optional search by driver
  const filteredCombos = useMemo(() => {
    let cs = combos.filter(c => c.active);
    if (comboSearch.trim()) {
      const q = comboSearch.toLowerCase();
      cs = cs.filter(c => {
        const tn = Array.isArray(c.truck) ? c.truck[0]?.truck_name : c.truck?.truck_name;
        const tr = Array.isArray(c.trailer) ? c.trailer[0]?.trailer_name : c.trailer?.trailer_name;
        return [tn, tr, c.in_use_by_name].some(v => v?.toLowerCase().includes(q));
      });
    }
    return cs;
  }, [combos, comboSearch]);

  if (loading) return <div style={{ ...css.page, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }}>Loading…</div>;
  if (err)     return <div style={css.page}><Banner msg={err} type="error" /></div>;

  const plusBtn = { ...css.btn("primary"), width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const;
  const filterRow = { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" as const };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 12 }}>
        <div><h1 style={css.heading}>{companyName}</h1><p style={css.subheading}>Company Admin</p></div>
        <NavMenu />
      </div>

      {/* ── USERS ── */}
      <section style={{ marginBottom: 32 }}>
        <div style={css.sectionHead}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" as const, flex: 1 }} onClick={() => setUsersOpen(v => !v)}>
            <span style={{ transition: "transform 150ms", transform: usersOpen ? "rotate(90deg)" : "none", display: "inline-block", fontSize: 14 }}>›</span>
            Users ({members.length})
          </h2>
          <button style={plusBtn} onClick={() => setInviteModal(true)}>+</button>
        </div>
        {usersOpen && (
          <>
            <div style={filterRow}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, employee #…" style={{ ...css.input, flex: 1, minWidth: 140, padding: "7px 10px" }} />
              <select value={filterRole} onChange={e => setFilterRole(e.target.value as any)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="">All roles</option><option value="admin">Admin</option><option value="driver">Driver</option>
              </select>
              <select value={`${sortField}:${sortDir}`} onChange={e => { const [f, d] = e.target.value.split(":"); setSortField(f as SortField); setSortDir(d as SortDir); }} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                <option value="role:asc">Role A→Z</option><option value="division:asc">Division A→Z</option>
                <option value="region:asc">Region A→Z</option><option value="hire_date:asc">Hire Date ↑</option><option value="hire_date:desc">Hire Date ↓</option>
              </select>
            </div>
            {filteredMembers.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No members match your search.</div>}
            {filteredMembers.map(m => <MemberCard key={m.user_id} member={m} companyId={companyId!} onRefresh={loadAll} onEditProfile={(member, onSaved) => setProfileModal({ member, onSaved })} currentUserId={currentUserId} />)}
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
            <div style={filterRow}>
              <input value={truckSearch} onChange={e => setTruckSearch(e.target.value)} placeholder="Search unit, VIN, region, area, status, location…" style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
              <select value={truckFilter} onChange={e => setTruckFilter(e.target.value as ActiveFilter)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
              <select value={truckSort} onChange={e => setTruckSort(e.target.value)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                <option value="region:asc">Region A→Z</option><option value="status:asc">Status A→Z</option>
              </select>
            </div>
            {filteredTrucks.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trucks match your filter.</div>}
            {filteredTrucks.map(t => <TruckCard key={t.truck_id} truck={t} onEdit={() => setTruckModal(t)} />)}
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
            <div style={filterRow}>
              <input value={trailerSearch} onChange={e => setTrailerSearch(e.target.value)} placeholder="Search unit, VIN, region, area, status, location…" style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
              <select value={trailerFilter} onChange={e => setTrailerFilter(e.target.value as ActiveFilter)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
              <select value={trailerSort} onChange={e => setTrailerSort(e.target.value)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                <option value="region:asc">Region A→Z</option>
              </select>
            </div>
            {filteredTrailers.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trailers match your filter.</div>}
            {filteredTrailers.map(t => <TrailerCard key={t.trailer_id} trailer={t} onEdit={() => setTrailerModal(t)} />)}
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
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setCoupleModal(true); }}>+</button>
        </div>
        {combosOpen && (
          <>
            <div style={filterRow}>
              <input value={comboSearch} onChange={e => setComboSearch(e.target.value)} placeholder="Search truck, trailer, driver…" style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
            </div>
            {filteredCombos.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No active combos.</div>}
            {filteredCombos.map(c => <ComboCard key={c.combo_id} combo={c} onEdit={() => setComboModal(c)} />)}
          </>
        )}
      </section>

      {/* ── Modals ── */}
      {inviteModal  && <InviteModal companyId={companyId!} onClose={() => setInviteModal(false)} onDone={() => { setInviteModal(false); loadAll(); }} />}
      {profileModal && <DriverProfileModal member={profileModal.member} companyId={companyId!} onClose={() => setProfileModal(null)} onDone={(u) => { profileModal.onSaved(u); setProfileModal(null); }} onRemove={() => { setProfileModal(null); loadAll(); }} />}
      {truckModal   && <TruckModal truck={truckModal === "new" ? null : truckModal} companyId={companyId!} onClose={() => setTruckModal(null)} onDone={() => { setTruckModal(null); loadAll(); }} />}
      {trailerModal && <TrailerModal trailer={trailerModal === "new" ? null : trailerModal} companyId={companyId!} onClose={() => setTrailerModal(null)} onDone={() => { setTrailerModal(null); loadAll(); }} />}
      {comboModal && comboModal !== "new" && (
        <ComboModal combo={comboModal} companyId={companyId!} trucks={trucks} trailers={trailers}
          onClose={() => setComboModal(null)} onDone={() => { setComboModal(null); loadAll(); }}
          onDecouple={async () => {
          if (!confirm(`Decouple this combo?`)) return;
          await supabase.rpc("decouple_combo", { p_combo_id: (comboModal as Combo).combo_id });
          setComboModal(null);
          loadAll();
        }}
        />
      )}
      {coupleModal && <CoupleModal companyId={companyId!} trucks={trucks.filter(t => t.active)} trailers={trailers.filter(t => t.active)} onClose={() => setCoupleModal(false)} onDone={() => { setCoupleModal(false); loadAll(); }} />}
    </div>
  );
}
