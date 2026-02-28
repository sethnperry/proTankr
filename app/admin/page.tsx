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

type OtherPermit = { permit_id?: string; label: string; expiration_date: string; };
type SortField   = "name" | "role" | "division" | "region" | "hire_date";
type SortDir     = "asc" | "desc";
type ActiveFilter = "" | "active" | "inactive";

// ─────────────────────────────────────────────────────────────
// Shared style constants
// ─────────────────────────────────────────────────────────────

// Condensed input — used throughout modals
const sm: React.CSSProperties = { padding: "4px 8px", fontSize: 12, height: 26 };

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

// ─────────────────────────────────────────────────────────────
// PermitRow — read-only card view: label | date | 📎 ☑ ▼
// ─────────────────────────────────────────────────────────────

function PermitRow({ label, date, enforcement, extra }: {
  label: string; date: string | null; enforcement?: string | null; extra?: React.ReactNode;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [checked,   setChecked]   = useState(false);
  const [attached,  setAttached]  = useState(false);
  const days     = daysUntil(date);
  const color    = expiryColor(days);
  const enfDays  = enforcement != null ? daysUntil(enforcement) : null;
  const enfColor = expiryColor(enfDays);

  const iconBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer",
    padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center",
  };

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, paddingBottom: 4, marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 24 }}>
        <span style={{ fontSize: 11, color: T.muted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {date
            ? <span style={{ fontSize: 11, color, fontWeight: days != null && days < 30 ? 600 : 400, whiteSpace: "nowrap" as const }}>{fmtExpiryInline(date, days)}</span>
            : <span style={{ fontSize: 11, color: T.muted }}>—</span>
          }
          {enforcement != null && enforcement &&
            <span style={{ fontSize: 11, color: enfColor, whiteSpace: "nowrap" as const }}>/ {fmtExpiryInline(enforcement, enfDays)}</span>
          }
        </div>
        {/* 📎 paperclip / + add · ☑ checkbox · ▼ notes */}
        <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <button type="button" title={attached ? "Attached" : "Add attachment"} style={{ ...iconBtn, color: attached ? T.accent : T.muted, fontSize: 12 }}
            onClick={() => setAttached(v => !v)}>{attached ? "📎" : "＋"}</button>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 11, height: 11, accentColor: T.accent, cursor: "pointer", margin: "0 2px" }} />
          <button type="button" title="Notes" style={{ ...iconBtn, color: T.muted, fontSize: 8,
            transform: notesOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            onClick={() => setNotesOpen(v => !v)}>▼</button>
        </div>
      </div>
      {extra}
      {notesOpen && (
        <textarea placeholder="Notes…" rows={2}
          style={{ ...css.input, width: "100%", marginTop: 3, fontSize: 11, padding: "3px 6px", resize: "vertical" as const }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PermitEditRow — edit-modal view: label | exp input [| enf input] | 📎 ☑ ▼
// ─────────────────────────────────────────────────────────────

function PermitEditRow({ label, expVal, onExpChange, enfVal, onEnfChange, extra }: {
  label: string;
  expVal: string; onExpChange: (v: string) => void;
  enfVal?: string; onEnfChange?: (v: string) => void;
  extra?: React.ReactNode;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [checked,   setChecked]   = useState(false);
  const [attached,  setAttached]  = useState(false);

  const iconBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer",
    padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center",
  };

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: T.muted, width: 148, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</span>
        <input type="date" value={expVal} onChange={e => onExpChange(e.target.value)}
          style={{ ...css.input, ...sm, flex: 1, minWidth: 0 }} />
        {onEnfChange !== undefined && (
          <input type="date" value={enfVal ?? ""} onChange={e => onEnfChange(e.target.value)}
            style={{ ...css.input, ...sm, flex: 1, minWidth: 0 }} />
        )}
        {/* 📎 ☑ ▼ */}
        <div style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
          <button type="button" title={attached ? "Attached" : "Add attachment"} style={{ ...iconBtn, color: attached ? T.accent : T.muted, fontSize: 12 }}
            onClick={() => setAttached(v => !v)}>{attached ? "📎" : "＋"}</button>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 11, height: 11, accentColor: T.accent, cursor: "pointer", margin: "0 2px" }} />
          <button type="button" title="Notes" style={{ ...iconBtn, color: T.muted, fontSize: 8,
            transform: notesOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            onClick={() => setNotesOpen(v => !v)}>▼</button>
        </div>
      </div>
      {extra}
      {notesOpen && (
        <textarea placeholder="Notes…" rows={2}
          style={{ ...css.input, width: "100%", marginTop: 3, fontSize: 11, padding: "3px 6px", resize: "vertical" as const }} />
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.4 }}>COMPARTMENTS ({comps.length})</span>
        <button type="button" onClick={add} style={{ ...css.btn("subtle"), padding: "2px 10px", fontSize: 11 }}>+ Add</button>
      </div>
      {comps.length === 0 && <div style={{ fontSize: 11, color: T.muted, padding: "4px 0" }}>No compartments yet.</div>}
      {comps.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
          <div style={{ width: 18, fontSize: 11, color: T.muted, textAlign: "center" as const, fontWeight: 700 }}>{c.comp_number}</div>
          <input type="number" placeholder="Gal" value={c.max_gallons || ""} onChange={e => update(i, "max_gallons", e.target.value)} style={{ ...css.input, ...sm, width: 76 }} />
          <input type="number" placeholder="Pos" value={c.position || ""} onChange={e => update(i, "position", e.target.value)} style={{ ...css.input, ...sm, width: 66 }} />
          <button type="button" onClick={() => remove(i)} style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, fontSize: 13, padding: "0 4px", flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TruckCard — collapsed + expanded permit view
// ─────────────────────────────────────────────────────────────

function TruckCard({ truck, onEdit, otherPermits }: { truck: Truck; onEdit: () => void; otherPermits?: OtherPermit[] }) {
  const [open, setOpen] = useState(false);
  const statusColor = truck.status_code === "active" ? T.success : truck.status_code === "inactive" ? T.muted : T.warning;

  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", cursor: "pointer", userSelect: "none" as const }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{truck.truck_name}</span>
            {(truck.region || truck.local_area) && (
              <span style={{ fontSize: 11, color: T.muted }}>{[truck.region, truck.local_area].filter(Boolean).join(" · ")}</span>
            )}
          </div>
          {truck.vin_number && <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{truck.vin_number}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <button type="button" style={{ ...css.btn("subtle"), padding: "3px 10px", fontSize: 11 }} onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          <span style={{ fontSize: 11, color: truck.in_use_by_name ? T.accent : T.muted }}>
            {truck.in_use_by_name ? `In use · ${truck.in_use_by_name}` : "Not in use"}
          </span>
        </div>
      </div>
      <div style={{ padding: "3px 12px 7px", display: "flex", justifyContent: "flex-end" }}>
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>
          {[truck.status_code, truck.status_location].filter(Boolean).join(" · ") || "—"}
        </span>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 12px 4px" }} onClick={e => e.stopPropagation()}>
          {(truck.make || truck.model || truck.year) && (
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{[truck.year, truck.make, truck.model].filter(Boolean).join(" ")}</div>
          )}
          <SubSectionTitle>Permit Book</SubSectionTitle>
          <PermitRow label="Registration" date={truck.reg_expiration_date} enforcement={truck.reg_enforcement_date} />
          <PermitRow label="Annual Inspection" date={truck.inspection_expiration_date} extra={
            (truck.inspection_shop || truck.inspection_issue_date) ? (
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>
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
          {(otherPermits ?? []).map((p, i) => (
            <PermitRow key={i} label={p.label || "Other Permit"} date={p.expiration_date || null} />
          ))}
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
      <div style={{ padding: "3px 12px 7px", display: "flex", justifyContent: "flex-end" }}>
        <span style={{ fontSize: 11, color: statusColor, fontWeight: 500 }}>
          {[trailer.status_code, trailer.status_location].filter(Boolean).join(" · ") || "—"}
        </span>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 12px 4px" }} onClick={e => e.stopPropagation()}>
          {(trailer.make || trailer.model || trailer.year) && (
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 5 }}>{[trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ")}</div>
          )}
          {compSummary && <div style={{ fontSize: 11, color: T.muted, marginBottom: 5 }}>{compSummary}</div>}
          {trailer.last_load_config && <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>Residue Last Contained — {trailer.last_load_config}</div>}
          <SubSectionTitle>Permit Book</SubSectionTitle>
          <PermitRow label="Trailer Registration" date={trailer.trailer_reg_expiration_date} enforcement={trailer.trailer_reg_enforcement_date} />
          <PermitRow label="Annual Inspection" date={trailer.trailer_inspection_expiration_date} extra={
            (trailer.trailer_inspection_shop || trailer.trailer_inspection_issue_date) ? (
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>
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
// ComboCard
// ─────────────────────────────────────────────────────────────

function ComboCard({ combo, onEdit }: { combo: Combo; onEdit: () => void }) {
  const truckName   = Array.isArray(combo.truck)   ? combo.truck[0]?.truck_name   : combo.truck?.truck_name;
  const trailerName = Array.isArray(combo.trailer) ? combo.trailer[0]?.trailer_name : combo.trailer?.trailer_name;
  return (
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{truckName || "—"} / {trailerName || "—"}</div>
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
// Truck Modal
// ─────────────────────────────────────────────────────────────

function TruckModal({ truck, companyId, onClose, onDone }: {
  truck: Truck | null; companyId: string; onClose: () => void; onDone: () => void;
}) {
  const isNew = !truck;
  const [name,      setName]      = useState(truck?.truck_name ?? "");
  const [vin,       setVin]       = useState(truck?.vin_number ?? "");
  const [make,      setMake]      = useState(truck?.make ?? "");
  const [model,     setModel]     = useState(truck?.model ?? "");
  const [year,      setYear]      = useState(String(truck?.year ?? ""));
  const [region,    setRegion]    = useState(truck?.region ?? "");
  const [local,     setLocal]     = useState(truck?.local_area ?? "");
  const [status,    setStatus]    = useState(truck?.status_code ?? "");
  const [statusLoc, setStatusLoc] = useState(truck?.status_location ?? "");
  const [active,    setActive]    = useState(truck?.active ?? true);
  // Permit dates
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
  const [notes,     setNotes]     = useState(truck?.notes ?? "");
  // Multiple other permits
  const [otherPermits, setOtherPermits] = useState<OtherPermit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!truck?.truck_id) return;
    supabase.from("truck_other_permits")
      .select("permit_id, label, expiration_date")
      .eq("truck_id", truck.truck_id)
      .order("created_at")
      .then(({ data }) => {
        if (data) setOtherPermits(data.map((r: any) => ({ permit_id: r.permit_id, label: r.label, expiration_date: r.expiration_date ?? "" })));
      });
  }, [truck?.truck_id]);

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
      inner_bridge_expiration_date: ibExp || null, notes: notes || null,
    };
    let truckId = truck?.truck_id;
    if (isNew) {
      const { data, error } = await supabase.from("trucks").insert(payload).select("truck_id").single();
      if (error) { setErr(error.message); setSaving(false); return; }
      truckId = data.truck_id;
    } else {
      const { error } = await supabase.from("trucks").update(payload).eq("truck_id", truckId!);
      if (error) { setErr(error.message); setSaving(false); return; }
      await supabase.from("truck_other_permits").delete().eq("truck_id", truckId!);
    }
    const validOther = otherPermits.filter(p => p.label.trim());
    if (validOther.length > 0) {
      await supabase.from("truck_other_permits").insert(
        validOther.map(p => ({ truck_id: truckId, company_id: companyId, label: p.label.trim(), expiration_date: p.expiration_date || null }))
      );
    }
    onDone();
  }

  async function deleteTruck() {
    if (!confirm("Delete this truck?")) return; setSaving(true);
    await supabase.from("truck_other_permits").delete().eq("truck_id", truck!.truck_id);
    await supabase.from("trucks").delete().eq("truck_id", truck!.truck_id);
    onDone();
  }

  function addOtherPermit()    { setOtherPermits(p => [...p, { label: "", expiration_date: "" }]); }
  function removeOtherPermit(i: number) { setOtherPermits(p => p.filter((_, idx) => idx !== i)); }
  function updateOtherPermit(i: number, field: keyof OtherPermit, val: string) {
    setOtherPermits(p => p.map((x, idx) => idx === i ? { ...x, [field]: val } : x));
  }

  // Shared condensed text input helper
  const ti = (val: string, set: (v: string) => void, ph = "", type = "text") => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...css.input, ...sm }} />
  );

  return (
    <Modal title={isNew ? "Add Truck" : "Edit Truck"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}

      {/* ── Identification ── */}
      <SubSectionTitle>Identification</SubSectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 10 }}>
        <div><label style={{ ...css.label, fontSize: 10 }}>Unit #</label>{ti(name, setName, "e.g. T-101")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>VIN</label>{ti(vin, setVin, "VIN")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Make</label>{ti(make, setMake, "e.g. Kenworth")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Model</label>{ti(model, setModel, "e.g. T680")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Year</label>{ti(year, setYear, "2022", "number")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Region</label>{ti(region, setRegion, "Southeast")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Local Area</label>{ti(local, setLocal, "Tampa Bay")}</div>
        <div>
          <label style={{ ...css.label, fontSize: 10 }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...css.select, ...sm, width: "100%" }}>
            <option value="">— Select —</option>
            <option value="active">Active</option>
            <option value="parked">Parked</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Status Location</label>{ti(statusLoc, setStatusLoc, "e.g. Yard 1")}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input type="checkbox" id="truck-active" checked={active} onChange={e => setActive(e.target.checked)} />
        <label htmlFor="truck-active" style={{ fontSize: 12, cursor: "pointer" }}>Active</label>
      </div>

      <hr style={css.divider} />

      {/* ── Permit Book ── */}
      <SubSectionTitle>Permit Book</SubSectionTitle>
      {/* column headers */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, paddingBottom: 3, borderBottom: `1px solid ${T.border}33` }}>
        <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0 }}>PERMIT</span>
        <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>EXPIRATION</span>
        <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>ENFORCEMENT</span>
        <span style={{ width: 62, flexShrink: 0 }} />
      </div>
      <PermitEditRow label="Registration"              expVal={regExp}   onExpChange={setRegExp}   enfVal={regEnf}   onEnfChange={setRegEnf} />
      <PermitEditRow label="Annual Inspection"          expVal={insExp}   onExpChange={setInsExp} />
      <PermitEditRow label="IFTA Permits + Decals"     expVal={iftaExp}  onExpChange={setIftaExp}  enfVal={iftaEnf}  onEnfChange={setIftaEnf} />
      <PermitEditRow label="PHMSA HazMat Permit"       expVal={phmsaExp} onExpChange={setPhmsaExp} />
      <PermitEditRow label="Alliance HazMat Permit"    expVal={alliExp}  onExpChange={setAlliExp} />
      <PermitEditRow label="Fleet Insurance Cab Card"  expVal={fleetExp} onExpChange={setFleetExp} />
      <PermitEditRow label="HazMat Transportation Lic" expVal={hazLicExp} onExpChange={setHazLicExp} />
      <PermitEditRow label="Inner Bridge Permit"       expVal={ibExp}    onExpChange={setIbExp} />
      {/* Inspection shop sub-row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 0", borderBottom: `1px solid ${T.border}22` }}>
        <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0 }}>↳ Shop / Issue Date</span>
        <input value={insShop} onChange={e => setInsShop(e.target.value)} placeholder="Shop name"
          style={{ ...css.input, ...sm, flex: 1 }} />
        <input type="date" value={insIssue} onChange={e => setInsIssue(e.target.value)}
          style={{ ...css.input, ...sm, flex: 1 }} />
        <span style={{ width: 62, flexShrink: 0 }} />
      </div>

      <hr style={css.divider} />

      {/* ── Other Permits ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <SubSectionTitle>Other Permits</SubSectionTitle>
        <button type="button" onClick={addOtherPermit} style={{ ...css.btn("subtle"), fontSize: 11, padding: "2px 10px" }}>+ Add</button>
      </div>
      {otherPermits.length === 0 && (
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>None — click + Add for state permits, etc.</div>
      )}
      {otherPermits.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
          <input value={p.label} onChange={e => updateOtherPermit(i, "label", e.target.value)}
            placeholder="e.g. FL State Permit" style={{ ...css.input, ...sm, flex: 1 }} />
          <input type="date" value={p.expiration_date} onChange={e => updateOtherPermit(i, "expiration_date", e.target.value)}
            style={{ ...css.input, ...sm, width: 130, flexShrink: 0 }} />
          <button type="button" onClick={() => removeOtherPermit(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, fontSize: 13, padding: "0 4px" }}>✕</button>
        </div>
      ))}

      <hr style={css.divider} />

      <Field label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const }} />
      </Field>

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
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
// Trailer Modal — CG Max removed (always 1), condensed permits
// ─────────────────────────────────────────────────────────────

function TrailerModal({ trailer, companyId, onClose, onDone }: {
  trailer: Trailer | null; companyId: string; onClose: () => void; onDone: () => void;
}) {
  const isNew = !trailer;
  const [name,      setName]      = useState(trailer?.trailer_name ?? "");
  const [vin,       setVin]       = useState(trailer?.vin_number ?? "");
  const [make,      setMake]      = useState(trailer?.make ?? "");
  const [model,     setModel]     = useState(trailer?.model ?? "");
  const [year,      setYear]      = useState(String(trailer?.year ?? ""));
  const [region,    setRegion]    = useState(trailer?.region ?? "");
  const [local,     setLocal]     = useState(trailer?.local_area ?? "");
  const [status,    setStatus]    = useState(trailer?.status_code ?? "");
  const [statusLoc, setStatusLoc] = useState(trailer?.status_location ?? "");
  const [active,    setActive]    = useState(trailer?.active ?? true);
  const [comps,     setComps]     = useState<Compartment[]>(trailer?.compartments ?? []);
  // Permit dates
  const [trRegExp,   setTrRegExp]   = useState(trailer?.trailer_reg_expiration_date ?? "");
  const [trRegEnf,   setTrRegEnf]   = useState(trailer?.trailer_reg_enforcement_date ?? "");
  const [trInsShop,  setTrInsShop]  = useState(trailer?.trailer_inspection_shop ?? "");
  const [trInsIssue, setTrInsIssue] = useState(trailer?.trailer_inspection_issue_date ?? "");
  const [trInsExp,   setTrInsExp]   = useState(trailer?.trailer_inspection_expiration_date ?? "");
  // Tank inspections
  const [tankV,  setTankV]  = useState(trailer?.tank_v_expiration_date ?? "");
  const [tankK,  setTankK]  = useState(trailer?.tank_k_expiration_date ?? "");
  const [tankL,  setTankL]  = useState(trailer?.tank_l_expiration_date ?? "");
  const [tankT,  setTankT]  = useState(trailer?.tank_t_expiration_date ?? "");
  const [tankI,  setTankI]  = useState(trailer?.tank_i_expiration_date ?? "");
  const [tankP,  setTankP]  = useState(trailer?.tank_p_expiration_date ?? "");
  const [tankUC, setTankUC] = useState(trailer?.tank_uc_expiration_date ?? "");
  const [notes,  setNotes]  = useState(trailer?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Trailer name is required."); return; }
    if (comps.some(c => !c.max_gallons || c.max_gallons <= 0)) { setErr("All compartments need max gallons > 0."); return; }
    setSaving(true); setErr(null);
    const payload: any = {
      trailer_name: name.trim(), vin_number: vin || null, make: make || null, model: model || null,
      year: year ? parseInt(year) : null, region: region || null, local_area: local || null,
      cg_max: 1.0, // always 1 per spec
      status_code: status || null, status_location: statusLoc || null, active, company_id: companyId,
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
    await supabase.from("trailers").delete().eq("trailer_id", trailer!.trailer_id);
    onDone();
  }

  const ti = (val: string, set: (v: string) => void, ph = "", type = "text") => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ ...css.input, ...sm }} />
  );

  return (
    <Modal title={isNew ? "Add Trailer" : "Edit Trailer"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}

      {/* ── Identification ── */}
      <SubSectionTitle>Identification</SubSectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 10 }}>
        <div><label style={{ ...css.label, fontSize: 10 }}>Unit #</label>{ti(name, setName, "e.g. 3151")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>VIN</label>{ti(vin, setVin, "VIN")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Make</label>{ti(make, setMake, "e.g. Polar")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Model</label>{ti(model, setModel, "e.g. Tank")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Year</label>{ti(year, setYear, "2020", "number")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Region</label>{ti(region, setRegion, "Southeast")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Local Area</label>{ti(local, setLocal, "Tampa Bay")}</div>
        <div>
          <label style={{ ...css.label, fontSize: 10 }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...css.select, ...sm, width: "100%" }}>
            <option value="">— Select —</option>
            <option value="active">Active</option>
            <option value="parked">Parked</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Status Location</label>{ti(statusLoc, setStatusLoc, "e.g. Yard 1")}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input type="checkbox" id="trailer-active" checked={active} onChange={e => setActive(e.target.checked)} />
        <label htmlFor="trailer-active" style={{ fontSize: 12, cursor: "pointer" }}>Active</label>
      </div>

      <hr style={css.divider} />

      {/* ── Compartments ── */}
      <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
        <CompartmentEditor comps={comps} onChange={setComps} />
      </div>

      <hr style={css.divider} />

      {/* ── Permit Book ── */}
      <SubSectionTitle>Permit Book</SubSectionTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, paddingBottom: 3, borderBottom: `1px solid ${T.border}33` }}>
        <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0 }}>PERMIT</span>
        <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>EXPIRATION</span>
        <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>ENFORCEMENT</span>
        <span style={{ width: 62, flexShrink: 0 }} />
      </div>
      <PermitEditRow label="Trailer Registration" expVal={trRegExp} onExpChange={setTrRegExp} enfVal={trRegEnf} onEnfChange={setTrRegEnf} />
      <PermitEditRow label="Annual Inspection"    expVal={trInsExp} onExpChange={setTrInsExp} />
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 0", borderBottom: `1px solid ${T.border}22` }}>
        <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0 }}>↳ Shop / Issue Date</span>
        <input value={trInsShop} onChange={e => setTrInsShop(e.target.value)} placeholder="Shop name"
          style={{ ...css.input, ...sm, flex: 1 }} />
        <input type="date" value={trInsIssue} onChange={e => setTrInsIssue(e.target.value)}
          style={{ ...css.input, ...sm, flex: 1 }} />
        <span style={{ width: 62, flexShrink: 0 }} />
      </div>

      <hr style={css.divider} />

      {/* ── Tank Inspections ── */}
      <SubSectionTitle>Tank Inspections</SubSectionTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, paddingBottom: 3, borderBottom: `1px solid ${T.border}33` }}>
        <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0 }}>TEST</span>
        <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>EXPIRATION</span>
        <span style={{ width: 62, flexShrink: 0 }} />
      </div>
      <PermitEditRow label="V — External Visual"       expVal={tankV}  onExpChange={setTankV} />
      <PermitEditRow label="K — Leakage Test"          expVal={tankK}  onExpChange={setTankK} />
      <PermitEditRow label="L — Lining Inspection"     expVal={tankL}  onExpChange={setTankL} />
      <PermitEditRow label="T — Thickness Test (2yr)"  expVal={tankT}  onExpChange={setTankT} />
      <PermitEditRow label="I — Internal Visual (5yr)" expVal={tankI}  onExpChange={setTankI} />
      <PermitEditRow label="P — Pressure Test (5yr)"   expVal={tankP}  onExpChange={setTankP} />
      <PermitEditRow label="UC — Upper Coupler (5yr)"  expVal={tankUC} onExpChange={setTankUC} />

      <hr style={css.divider} />

      <Field label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const }} />
      </Field>

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
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
// Combo Modal — equal-width buttons, even spacing
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
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Tare Weight (lbs)</label>
          <input type="number" value={tareLbs} onChange={e => setTareLbs(e.target.value)} placeholder="e.g. 34000" style={css.input} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={css.label}>Target Gross (lbs)</label>
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 80000" style={css.input} />
        </div>
      </div>

      {/* Equal-width buttons, full-width row, evenly spaced */}
      <div style={{ display: "flex", gap: 8 }}>
        {!isNew && (
          <button style={{ ...css.btn("ghost"), flex: 1, color: T.danger, borderColor: `${T.danger}55`, justifyContent: "center" as const }}
            onClick={deleteCombo} disabled={saving}>Delete</button>
        )}
        {!isNew && onDecouple && (
          <button style={{ ...css.btn("ghost"), flex: 1, color: T.warning, borderColor: `${T.warning}55`, justifyContent: "center" as const }}
            onClick={onDecouple} disabled={saving}>Decouple</button>
        )}
        <button style={{ ...css.btn("ghost"), flex: 1, justifyContent: "center" as const }}
          onClick={onClose}>Cancel</button>
        <button style={{ ...css.btn("primary"), flex: 1, justifyContent: "center" as const }}
          onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Couple" : "Save"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// CoupleModal — search trucks + trailers to couple
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

  const filteredTrucks = trucks.filter(t =>
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

  const selStyle = (selected: boolean): React.CSSProperties => ({
    ...css.card, cursor: "pointer", marginBottom: 4, fontSize: 12,
    padding: "6px 10px",
    borderColor: selected ? T.accent : T.border,
    background: selected ? `${T.accent}18` : T.surface,
  });

  return (
    <Modal title="Couple Equipment" onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <SubSectionTitle>Truck</SubSectionTitle>
          <input value={truckSearch} onChange={e => setTruckSearch(e.target.value)} placeholder="Search…" style={{ ...css.input, marginBottom: 6, fontSize: 12 }} />
          <div style={{ maxHeight: 200, overflowY: "auto" as const }}>
            {filteredTrucks.map(t => (
              <div key={t.truck_id} style={selStyle(truckId === t.truck_id)} onClick={() => setTruckId(t.truck_id)}>
                <div style={{ fontWeight: 700 }}>{t.truck_name}</div>
                <div style={{ color: T.muted, fontSize: 11 }}>{[t.region, t.local_area, t.status_code, t.status_location].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SubSectionTitle>Trailer</SubSectionTitle>
          <input value={trailerSearch} onChange={e => setTrailerSearch(e.target.value)} placeholder="Search…" style={{ ...css.input, marginBottom: 6, fontSize: 12 }} />
          <div style={{ maxHeight: 200, overflowY: "auto" as const }}>
            {filteredTrailers.map(t => (
              <div key={t.trailer_id} style={selStyle(trailerId === t.trailer_id)} onClick={() => setTrailerId(t.trailer_id)}>
                <div style={{ fontWeight: 700 }}>{t.trailer_name}</div>
                <div style={{ color: T.muted, fontSize: 11 }}>{[t.region, t.local_area, t.status_code, t.status_location].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <div style={{ flex: 1 }}><label style={css.label}>Tare (lbs)</label><input type="number" value={tareLbs} onChange={e => setTareLbs(e.target.value)} placeholder="34000" style={css.input} /></div>
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
  // Other permits per truck — loaded once for card display
  const [truckOtherPermits, setTruckOtherPermits] = useState<Record<string, OtherPermit[]>>({});
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState<string | null>(null);

  const [usersOpen,    setUsersOpen]    = useState(false);
  const [trucksOpen,   setTrucksOpen]   = useState(false);
  const [trailersOpen, setTrailersOpen] = useState(false);
  const [combosOpen,   setCombosOpen]   = useState(false);

  const [search,     setSearch]     = useState("");
  const [sortField,  setSortField]  = useState<SortField>("name");
  const [sortDir,    setSortDir]    = useState<SortDir>("asc");
  const [filterRole, setFilterRole] = useState<"" | "admin" | "driver">("");

  const [truckFilter,   setTruckFilter]   = useState<ActiveFilter>("");
  const [truckSearch,   setTruckSearch]   = useState("");
  const [truckSort,     setTruckSort]     = useState("name:asc");
  const [trailerFilter, setTrailerFilter] = useState<ActiveFilter>("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [trailerSort,   setTrailerSort]   = useState("name:asc");
  const [comboSearch,   setComboSearch]   = useState("");

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
        display_name: profileMap[m.user_id]?.display_name ?? null,
        hire_date: profileMap[m.user_id]?.hire_date ?? null,
        division: profileMap[m.user_id]?.division ?? null,
        region: profileMap[m.user_id]?.region ?? null,
        local_area: profileMap[m.user_id]?.local_area ?? null,
        employee_number: profileMap[m.user_id]?.employee_number ?? null,
      })));

      // Trucks + trailers via roster RPC
      const { data: rosterData, error: rosterErr } = await supabase.rpc("get_equipment_roster", { p_company_id: cid });
      if (rosterErr) throw rosterErr;
      const roster = rosterData as { trucks: any[]; trailers: any[] };
      const truckRows   = roster?.trucks   ?? [];
      const trailerRows = roster?.trailers ?? [];

      // Compartments
      const tIds = trailerRows.map((t: any) => t.trailer_id);
      let compMap: Record<string, Compartment[]> = {};
      if (tIds.length > 0) {
        const { data: compRows } = await supabase.from("trailer_compartments")
          .select("trailer_id, comp_number, max_gallons, position").in("trailer_id", tIds).order("comp_number");
        for (const c of (compRows ?? []) as any[]) {
          if (!compMap[c.trailer_id]) compMap[c.trailer_id] = [];
          compMap[c.trailer_id].push({ comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position });
        }
      }

      // Other permits for truck cards
      const truckIds = truckRows.map((t: any) => t.truck_id);
      if (truckIds.length > 0) {
        const { data: opRows } = await supabase.from("truck_other_permits")
          .select("truck_id, permit_id, label, expiration_date").in("truck_id", truckIds).order("created_at");
        const opMap: Record<string, OtherPermit[]> = {};
        for (const r of (opRows ?? []) as any[]) {
          if (!opMap[r.truck_id]) opMap[r.truck_id] = [];
          opMap[r.truck_id].push({ permit_id: r.permit_id, label: r.label, expiration_date: r.expiration_date ?? "" });
        }
        setTruckOtherPermits(opMap);
      }

      // Active combos
      const { data: comboRows } = await supabase.from("equipment_combos")
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, claimed_by, truck:trucks(truck_name), trailer:trailers(trailer_name)")
        .eq("company_id", cid).eq("active", true).order("combo_name");

      const claimedIds = [...new Set((comboRows ?? []).map((c: any) => c.claimed_by).filter(Boolean))];
      let claimedNameMap: Record<string, string> = {};
      if (claimedIds.length > 0) {
        const { data: cn } = await supabase.from("profiles").select("user_id, display_name").in("user_id", claimedIds);
        claimedNameMap = Object.fromEntries((cn ?? []).map((r: any) => [r.user_id, r.display_name ?? ""]));
      }

      setTrucks(truckRows as Truck[]);
      setTrailers(trailerRows.map((t: any) => ({ ...t, compartments: compMap[t.trailer_id] ?? [] })) as Trailer[]);
      setCombos(((comboRows ?? []) as any[]).map(c => ({ ...c, in_use_by_name: c.claimed_by ? claimedNameMap[c.claimed_by] ?? null : null })) as unknown as Combo[]);
    } catch (e: any) { setErr(e?.message ?? "Load failed."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

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

  const filteredTrucks = useMemo(() => {
    let ts = [...trucks];
    if (truckFilter === "active")   ts = ts.filter(t => t.active);
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

  const filteredTrailers = useMemo(() => {
    let ts = [...trailers];
    if (trailerFilter === "active")   ts = ts.filter(t => t.active);
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

  const plusBtn: React.CSSProperties = {
    ...css.btn("primary"), width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: "1",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };
  const filterRow: React.CSSProperties = { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" };

  return (
    <div style={css.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, gap: 12 }}>
        <div><h1 style={css.heading}>{companyName}</h1><p style={css.subheading}>Company Admin</p></div>
        <NavMenu />
      </div>

      {/* ── USERS ── */}
      <section style={{ marginBottom: 32 }}>
        <div style={css.sectionHead}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", flex: 1 }} onClick={() => setUsersOpen(v => !v)}>
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
                <option value="region:asc">Region A→Z</option><option value="hire_date:asc">Hire ↑</option><option value="hire_date:desc">Hire ↓</option>
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
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setTrucksOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: trucksOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Trucks ({trucks.filter(t => t.active).length} active)
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTruckModal("new"); }}>+</button>
        </div>
        {trucksOpen && (
          <>
            <div style={filterRow}>
              <input value={truckSearch} onChange={e => setTruckSearch(e.target.value)} placeholder="Search unit, VIN, region, area, status…" style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
              <select value={truckFilter} onChange={e => setTruckFilter(e.target.value as ActiveFilter)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
              <select value={truckSort} onChange={e => setTruckSort(e.target.value)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                <option value="region:asc">Region A→Z</option><option value="status:asc">Status A→Z</option>
              </select>
            </div>
            {filteredTrucks.length === 0 && <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trucks match your filter.</div>}
            {filteredTrucks.map(t => <TruckCard key={t.truck_id} truck={t} onEdit={() => setTruckModal(t)} otherPermits={truckOtherPermits[t.truck_id]} />)}
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── TRAILERS ── */}
      <section style={{ marginBottom: 32, marginTop: 28 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setTrailersOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: trailersOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Trailers ({trailers.filter(t => t.active).length} active)
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTrailerModal("new"); }}>+</button>
        </div>
        {trailersOpen && (
          <>
            <div style={filterRow}>
              <input value={trailerSearch} onChange={e => setTrailerSearch(e.target.value)} placeholder="Search unit, VIN, region, area, status…" style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
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
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setCombosOpen(v => !v)}>
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
            if (!confirm("Decouple this combo?")) return;
            await supabase.rpc("decouple_combo", { p_combo_id: (comboModal as Combo).combo_id });
            setComboModal(null);
            loadAll();
          }}
        />
      )}
      {coupleModal && (() => {
        // Only offer equipment that is active AND not currently in an active combo
        const coupledTruckIds   = new Set(combos.filter(c => c.active).map(c => c.truck_id));
        const coupledTrailerIds = new Set(combos.filter(c => c.active).map(c => c.trailer_id));
        return (
          <CoupleModal
            companyId={companyId!}
            trucks={trucks.filter(t => t.active && !coupledTruckIds.has(t.truck_id))}
            trailers={trailers.filter(t => t.active && !coupledTrailerIds.has(t.trailer_id))}
            onClose={() => setCoupleModal(false)}
            onDone={() => { setCoupleModal(false); loadAll(); }}
          />
        );
      })()}
    </div>
  );
}
