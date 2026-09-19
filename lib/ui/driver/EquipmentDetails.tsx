"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { T, css, fmtDate, expiryColor, daysUntil } from "@/lib/ui/driver/tokens";
import { Modal, Field, FieldRow, Banner, SubSectionTitle } from "@/lib/ui/driver/primitives";
import {
  AttachmentIndicator, DocHubModal, DocPreviewModal,
  useAttachments, getCategoryLabel,
  TRUCK_CATEGORIES, TRAILER_CATEGORIES,
  type EquipmentType, type AttachmentGroup,
} from "@/lib/ui/driver/DocHub";
import { ServiceTypeListModal } from "@/app/planner/modals/ServiceTypeManager";
import { RequiredEquipmentFields } from "@/lib/ui/driver/RequiredEquipmentFields";

// Types
// ─────────────────────────────────────────────────────────────

type Truck = {
  truck_id: string; truck_name: string; active: boolean;
  vin_number: string | null; plate_number: string | null; make: string | null; model: string | null; year: number | null;
  region: string | null; local_area: string | null;
  status_code: string | null; status_location: string | null; in_use_by: string | null;
  in_use_by_name?: string | null;
  reg_expiration_date: string | null; reg_enforcement_date: string | null; reg_notes: string | null;
  inspection_shop: string | null; inspection_issue_date: string | null; inspection_expiration_date: string | null;
  inspection_enforcement_date: string | null; inspection_notes: string | null;
  ifta_expiration_date: string | null; ifta_enforcement_date: string | null; ifta_notes: string | null;
  phmsa_expiration_date: string | null; phmsa_enforcement_date: string | null; phmsa_notes: string | null;
  alliance_expiration_date: string | null; alliance_enforcement_date: string | null; alliance_notes: string | null;
  fleet_ins_expiration_date: string | null; fleet_ins_enforcement_date: string | null; fleet_ins_notes: string | null;
  hazmat_lic_expiration_date: string | null; hazmat_lic_enforcement_date: string | null; hazmat_lic_notes: string | null;
  inner_bridge_expiration_date: string | null; inner_bridge_enforcement_date: string | null; inner_bridge_notes: string | null;
  notes: string | null;
};

type Compartment = { comp_number: number; max_gallons: number; position: number; cap_gallons?: number | null; };

type Trailer = {
  trailer_id: string; trailer_name: string; active: boolean;
  vin_number: string | null; plate_number: string | null; make: string | null; model: string | null; year: number | null;
  cg_max: number; region: string | null; local_area: string | null;
  status_code: string | null; status_location: string | null; in_use_by: string | null;
  in_use_by_name?: string | null; last_load_config: string | null;
  compartments?: Compartment[];
  trailer_reg_expiration_date: string | null; trailer_reg_enforcement_date: string | null; trailer_reg_notes: string | null;
  trailer_inspection_shop: string | null; trailer_inspection_issue_date: string | null;
  trailer_inspection_expiration_date: string | null;
  trailer_inspection_enforcement_date: string | null; trailer_inspection_notes: string | null;
  tank_v_expiration_date: string | null; tank_k_expiration_date: string | null;
  tank_l_expiration_date: string | null; tank_t_expiration_date: string | null;
  tank_i_expiration_date: string | null; tank_p_expiration_date: string | null;
  tank_uc_expiration_date: string | null;
  tank_v_notes: string | null; tank_k_notes: string | null; tank_l_notes: string | null;
  tank_t_notes: string | null; tank_i_notes: string | null; tank_p_notes: string | null; tank_uc_notes: string | null;
  notes: string | null;
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

type Product = {
  product_id: string;
  product_name: string;
  button_code: string | null;
  hex_code: string | null;
  display_name: string | null;
  description: string | null;
  un_number: string | null;
  active: boolean;
  is_dyed: boolean;
};

type TerminalProduct = {
  product_id: string;
  button_code: string | null;
  product_name: string;
  hex_code: string | null;
  description: string | null;
  un_number: string | null;
  is_dyed: boolean;
  is_out_of_stock: boolean;
  active: boolean;
};

type Terminal = {
  terminal_id: string;
  terminal_name: string;
  city: string | null;
  state: string | null;
  city_id: string | null;
  timezone: string | null;
  active: boolean;
  renewal_days: number | null;
  lat: number | null;
  lon: number | null;
  products?: TerminalProduct[];
};

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
// PermitRow — read-only row with paperclip indicator
// ─────────────────────────────────────────────────────────────

function PermitRow({ label, date, enforcement, notes, extra, category, hasDoc, onDocOpen }: {
  label: string; date: string | null; enforcement?: string | null; notes?: string | null; extra?: React.ReactNode;
  category?: string; hasDoc?: boolean; onDocOpen?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const days    = daysUntil(date);
  const color   = expiryColor(days);
  const enfDays = enforcement ? daysUntil(enforcement) : null;
  const enfColor = expiryColor(enfDays);
  const hasExtra = !!(enforcement || notes || extra);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}12` }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 26,
          cursor: hasExtra ? "pointer" : "default", userSelect: "none" as const }}
        onClick={() => hasExtra && setExpanded(v => !v)}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: !date ? T.muted : color }} />
        <span style={{ fontSize: 12, color: T.muted, flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: days != null && days < 30 ? 700 : 400,
          color: date ? color : T.muted, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
          {date ? fmtExpiryInline(date, days) : "—"}
        </span>
        {category !== undefined && (
          <AttachmentIndicator hasDoc={hasDoc ?? false} onOpen={() => onDocOpen?.()} />
        )}
        {hasExtra && (
          <span style={{ color: T.muted, fontSize: 9, flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms", display: "inline-block" }}>▼</span>
        )}
      </div>
      {expanded && (
        <div style={{ paddingLeft: 14, paddingBottom: 8, display: "flex", flexDirection: "column" as const, gap: 4 }}>
          {enforcement && <div style={{ fontSize: 11, color: enfColor }}>Enforcement: {fmtExpiryInline(enforcement, enfDays)}</div>}
          {notes && <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic" as const }}>{notes}</div>}
          {extra}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PermitEditRow — edit-modal view: label | exp date input
// Tap label to reveal enforcement date + notes (if applicable)
// ─────────────────────────────────────────────────────────────

function PermitEditRow({ label, expVal, onExpChange, enfVal, onEnfChange, notesVal, onNotesChange, extra, editable = true }: {
  label: string;
  expVal: string; onExpChange: (v: string) => void;
  enfVal?: string; onEnfChange?: (v: string) => void;
  notesVal?: string; onNotesChange?: (v: string) => void;
  extra?: React.ReactNode;
  editable?: boolean;
}) {
  // Always expandable — every row can have notes
  const [open, setOpen] = useState(false);
  const lockedStyle = editable ? {} : { opacity: 0.55, cursor: "not-allowed" as const };

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32 }}>
        <span
          style={{ fontSize: 11, color: T.muted, width: 148, flexShrink: 0, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            cursor: "pointer", userSelect: "none" as const }}
          onClick={() => setOpen(v => !v)}
        >
          {label}
          <span style={{ marginLeft: 4, fontSize: 8, color: T.muted, display: "inline-block",
            transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>▼</span>
        </span>
        <input type="date" value={expVal} onChange={e => onExpChange(e.target.value)} disabled={!editable}
          style={{ ...css.input, ...sm, ...lockedStyle, flex: 1, minWidth: 0 }} />
      </div>
      {open && (
        <div style={{ paddingLeft: 4, paddingTop: 5, display: "flex", flexDirection: "column" as const, gap: 5, paddingBottom: 6 }}>
          {onEnfChange !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0 }}>Enforcement Date</span>
              <input type="date" value={enfVal ?? ""} onChange={e => onEnfChange(e.target.value)} disabled={!editable}
                style={{ ...css.input, ...sm, ...lockedStyle, flex: 1, minWidth: 0 }} />
            </div>
          )}
          {extra}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0, paddingTop: 6 }}>Notes</span>
            <textarea
              value={notesVal ?? ""} onChange={e => onNotesChange?.(e.target.value)} disabled={!editable}
              placeholder="Issuing agency, account #, notes…"
              rows={2}
              style={{ ...css.input, ...sm, ...lockedStyle, flex: 1, minWidth: 0, fontSize: 11,
                resize: "vertical" as const, lineHeight: 1.4 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compartment editor
// ─────────────────────────────────────────────────────────────

function CompartmentEditor({ comps, onChange, editable = true }: { comps: Compartment[]; onChange: (c: Compartment[]) => void; editable?: boolean }) {
  // Positions are always comp_number - 1 (0-indexed). Never exposed to user.
  function reIndex(arr: Compartment[]): Compartment[] {
    return arr.map((c, idx) => ({ ...c, comp_number: idx + 1, position: idx }));
  }
  function update(i: number, val: string) {
    onChange(reIndex(comps.map((c, idx) => idx === i ? { ...c, max_gallons: parseFloat(val) || 0 } : c)));
  }
  function updateCap(i: number, val: string) {
    const parsed = val.trim() === "" ? null : parseFloat(val);
    onChange(comps.map((c, idx) => idx === i ? { ...c, cap_gallons: parsed == null || Number.isNaN(parsed) ? null : parsed } : c));
  }
  function add() { onChange(reIndex([...comps, { comp_number: 0, max_gallons: 0, position: 0, cap_gallons: null }])); }
  function remove(i: number) { onChange(reIndex(comps.filter((_, idx) => idx !== i))); }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.4 }}>COMPARTMENTS ({comps.length})</span>
        {editable && <button type="button" onClick={add} style={{ ...css.btn("subtle"), padding: "2px 10px", fontSize: 11 }}>+ Add</button>}
      </div>
      {comps.length === 0 && <div style={{ fontSize: 11, color: T.muted, padding: "4px 0" }}>No compartments yet.</div>}
      {comps.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
          <div style={{ width: 18 }} />
          <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>Total Volume (gal)</span>
          <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>Cap — overflow prevention</span>
          {editable && <div style={{ width: 24 }} />}
        </div>
      )}
      {comps.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
          <div style={{ width: 18, fontSize: 11, color: T.muted, textAlign: "center" as const, fontWeight: 700, flexShrink: 0 }}>{c.comp_number}</div>
          {editable ? (
            <>
              <input type="number" placeholder="Gallons" value={c.max_gallons || ""} onChange={e => update(i, e.target.value)}
                style={{ ...css.input, ...sm, flex: 1 }} />
              <input type="number" placeholder={c.max_gallons ? String(c.max_gallons) : "Gallons"} value={c.cap_gallons ?? ""} onChange={e => updateCap(i, e.target.value)}
                style={{ ...css.input, ...sm, flex: 1 }} />
              <button type="button" onClick={() => remove(i)}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, fontSize: 13, padding: "0 4px", flexShrink: 0, minWidth: 24, minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </>
          ) : (
            <>
              <div style={{ ...css.input, ...sm, flex: 1, opacity: 0.6 }}>{c.max_gallons || "—"}</div>
              <div style={{ ...css.input, ...sm, flex: 1, opacity: 0.6 }}>{c.cap_gallons ?? c.max_gallons ?? "—"}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TruckCard — collapsed + expanded permit view
// ─────────────────────────────────────────────────────────────

function TruckCard({ truck, companyId, onEdit, otherPermits }: {
  truck: Truck; companyId: string; onEdit: () => void; otherPermits?: OtherPermit[]
}) {
  const [open, setOpen] = useState(false);
  const [hubOpen, setHubOpen]           = useState(false);
  const [previewGroup, setPreviewGroup] = useState<AttachmentGroup | null>(null);

  const { hasDoc, groups, reload } = useAttachments("truck", truck.truck_id, companyId);

  // Reload attachment state whenever card is expanded (catches uploads done while collapsed)
  const prevOpen = React.useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) reload();
    prevOpen.current = open;
  }, [open, reload]);

  const statusColor = truck.status_code === "deadline" ? T.danger
    : truck.status_code === "readyline" ? T.success
    : truck.status_code === "in_use" ? T.info : T.muted;

  const allDates = [
    truck.reg_expiration_date, truck.inspection_expiration_date,
    truck.ifta_expiration_date, truck.phmsa_expiration_date,
    truck.alliance_expiration_date, truck.fleet_ins_expiration_date,
    truck.hazmat_lic_expiration_date, truck.inner_bridge_expiration_date,
    ...(otherPermits ?? []).map(p => p.expiration_date || null),
  ].filter(Boolean) as string[];
  const soonestDays = allDates.reduce<number | null>((min, d) => {
    const n = daysUntil(d); if (n == null) return min;
    return min == null ? n : Math.min(min, n);
  }, null);
  const warnBadge  = soonestDays != null && soonestDays <= 30;
  const badgeColor = expiryColor(soonestDays);

  function openDocForCategory(cat: string) {
    const g = groups.find(g => g.category === cat);
    if (g) setPreviewGroup(g);
  }

  return (
    <>
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>

      {/* ── Collapsed header ── */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{ padding: "12px 12px 10px", cursor: "pointer", userSelect: "none" as const }}
      >
        {/* Row 1: unit name + status badge LEFT, Docs+Edit RIGHT */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{truck.truck_name}</span>
            {truck.status_code && (
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: statusColor === T.danger ? "rgba(220,60,40,0.18)"
                  : statusColor === T.success ? "rgba(40,180,80,0.13)"
                  : statusColor === T.info ? "rgba(91,168,245,0.15)" : "rgba(255,255,255,0.07)",
                color: statusColor, letterSpacing: 0.5 }}>{truck.status_code.replace("_", " ").toUpperCase()}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 10px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); setHubOpen(true); }}>📎 Docs</button>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 12px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          </div>
        </div>
        {/* Row 2: expiry badge */}
        {warnBadge && (
          <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 900,
            padding: "2px 6px", borderRadius: 4, background: "rgba(220,60,40,0.15)",
            color: badgeColor, letterSpacing: 0.3 }}>
            ⚠ {soonestDays! < 0 ? "EXPIRED" : soonestDays === 0 ? "EXP TODAY" : `EXP ${soonestDays}d`}
          </span>
        )}
        {/* Row 3: region · local area */}
        {(truck.region || truck.local_area) && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
            {[truck.region, truck.local_area].filter(Boolean).join(" · ")}
          </div>
        )}
        {/* Row 4: status location — hidden when in_use (managed via combo) */}
        {truck.status_location && truck.status_code !== "in_use" && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1,
            whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
            📍 {truck.status_location}
          </div>
        )}
      </div>

      {/* ── Expanded section ── */}
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 12px" }}
          onClick={e => e.stopPropagation()}>

          {/* Identification */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 1, marginBottom: 8 }}>
            {(truck.year || truck.make || truck.model) ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Vehicle</span>
              <span style={{ fontSize: 11, color: T.text }}>{[truck.year, truck.make, truck.model].filter(Boolean).join(" ")}</span>
            </> : null}
            {truck.vin_number ? <>
              <span style={{ fontSize: 11, color: T.muted }}>VIN</span>
              <span style={{ fontSize: 11, color: T.text, wordBreak: "break-all" as const }}>{truck.vin_number}</span>
            </> : null}
            {truck.plate_number ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Plate</span>
              <span style={{ fontSize: 11, color: T.text }}>{truck.plate_number}</span>
            </> : null}
          </div>

          {truck.notes && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", background: "rgba(255,255,255,0.04)",
              borderRadius: 8, padding: "8px 10px", marginBottom: 8, lineHeight: 1.5,
              borderLeft: `3px solid ${T.accent}40` }}>
              {truck.notes}
            </div>
          )}
          <div style={{ borderTop: `1px solid ${T.border}22`, marginBottom: 4, marginTop: 2 }} />
          <PermitRow label="Registration"               date={truck.reg_expiration_date}         enforcement={truck.reg_enforcement_date}         notes={(truck as any).reg_notes}
            category="registration"      hasDoc={hasDoc("registration")}      onDocOpen={() => openDocForCategory("registration")} />
          <PermitRow label="Annual Inspection"           date={truck.inspection_expiration_date}
            category="annual_inspection" hasDoc={hasDoc("annual_inspection")} onDocOpen={() => openDocForCategory("annual_inspection")}
            extra={(truck.inspection_shop || truck.inspection_issue_date) ? (
              <div style={{ fontSize: 11, color: T.muted }}>
                {[truck.inspection_shop, truck.inspection_issue_date && `Issued ${fmtDate(truck.inspection_issue_date)}`].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          />
          <PermitRow label="IFTA Permit + Decals"       date={truck.ifta_expiration_date}        enforcement={truck.ifta_enforcement_date}        notes={(truck as any).ifta_notes}
            category="ifta"              hasDoc={hasDoc("ifta")}              onDocOpen={() => openDocForCategory("ifta")} />
          <PermitRow label="PHMSA HazMat Permit"        date={truck.phmsa_expiration_date}
            category="phmsa_hazmat"      hasDoc={hasDoc("phmsa_hazmat")}      onDocOpen={() => openDocForCategory("phmsa_hazmat")} />
          <PermitRow label="Alliance HazMat Permit"     date={truck.alliance_expiration_date}
            category="alliance_hazmat"   hasDoc={hasDoc("alliance_hazmat")}   onDocOpen={() => openDocForCategory("alliance_hazmat")} />
          <PermitRow label="Fleet Insurance Cab Card"   date={truck.fleet_ins_expiration_date}
            category="fleet_insurance"   hasDoc={hasDoc("fleet_insurance")}   onDocOpen={() => openDocForCategory("fleet_insurance")} />
          <PermitRow label="HazMat Transportation Lic"  date={truck.hazmat_lic_expiration_date}
            category="hazmat_lic"        hasDoc={hasDoc("hazmat_lic")}        onDocOpen={() => openDocForCategory("hazmat_lic")} />
          <PermitRow label="Inner Bridge Permit"        date={truck.inner_bridge_expiration_date}
            category="inner_bridge"      hasDoc={hasDoc("inner_bridge")}      onDocOpen={() => openDocForCategory("inner_bridge")} />
          {(otherPermits ?? []).map((p, i) => (
            <PermitRow key={i} label={p.label || "Other Permit"} date={p.expiration_date || null}
              category="other" hasDoc={hasDoc("other")} onDocOpen={() => openDocForCategory("other")} />
          ))}
        </div>
      )}
    </div>

    {hubOpen && (
      <DocHubModal
        equipmentType="truck" equipmentId={truck.truck_id}
        equipmentName={truck.truck_name} companyId={companyId}
        onClose={() => { setHubOpen(false); reload(); }}
      />
    )}
    {previewGroup && <DocPreviewModal group={previewGroup} onClose={() => setPreviewGroup(null)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// TrailerCard — collapsed + expanded
// ─────────────────────────────────────────────────────────────

function TrailerCard({ trailer, companyId, onEdit }: { trailer: Trailer; companyId: string; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const [hubOpen, setHubOpen]           = useState(false);
  const [previewGroup, setPreviewGroup] = useState<AttachmentGroup | null>(null);

  const { hasDoc, groups, reload } = useAttachments("trailer", trailer.trailer_id, companyId);

  // Reload attachment state whenever card is expanded
  const prevOpen = React.useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) reload();
    prevOpen.current = open;
  }, [open, reload]);

  function openDocForCategory(cat: string) {
    const g = groups.find(g => g.category === cat);
    if (g) setPreviewGroup(g);
  }

  const comps = trailer.compartments ?? [];
  const totalGal = comps.reduce((s, c) => s + c.max_gallons, 0);
  const compSummary = comps.length > 0
    ? `${comps.length} comps · ${comps.map(c => c.max_gallons.toLocaleString()).join(" / ")} = ${totalGal.toLocaleString()} gal max`
    : null;

  const statusColor = trailer.status_code === "deadline" ? T.danger
    : trailer.status_code === "readyline" ? T.success
    : trailer.status_code === "in_use" ? T.info : T.muted;

  const tankDates = [
    trailer.tank_v_expiration_date, trailer.tank_k_expiration_date,
    trailer.tank_l_expiration_date, trailer.tank_t_expiration_date,
    trailer.tank_i_expiration_date, trailer.tank_p_expiration_date,
    trailer.tank_uc_expiration_date,
  ].filter(Boolean) as string[];
  const allDates = [
    trailer.trailer_reg_expiration_date,
    trailer.trailer_inspection_expiration_date,
    ...tankDates,
  ].filter(Boolean) as string[];
  const soonestDays = allDates.reduce<number | null>((min, d) => {
    const n = daysUntil(d); if (n == null) return min;
    return min == null ? n : Math.min(min, n);
  }, null);
  const warnBadge  = soonestDays != null && soonestDays <= 30;
  const badgeColor = expiryColor(soonestDays);

  return (
    <>
    <div style={{ ...css.card, padding: 0, marginBottom: 8, overflow: "hidden" }}>

      {/* ── Collapsed header ── */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{ padding: "12px 12px 10px", cursor: "pointer", userSelect: "none" as const }}
      >
        {/* Row 1: unit name + status badge LEFT, Docs+Edit RIGHT */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{trailer.trailer_name}</span>
            {trailer.status_code && (
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 6px", borderRadius: 4,
                background: statusColor === T.danger ? "rgba(220,60,40,0.18)"
                  : statusColor === T.success ? "rgba(40,180,80,0.13)"
                  : statusColor === T.info ? "rgba(91,168,245,0.15)" : "rgba(255,255,255,0.07)",
                color: statusColor, letterSpacing: 0.5 }}>{trailer.status_code.replace("_", " ").toUpperCase()}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 10px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); setHubOpen(true); }}>📎 Docs</button>
            <button type="button" style={{ ...css.btn("subtle"), padding: "4px 12px", fontSize: 11 }}
              onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          </div>
        </div>
        {/* Row 2: expiry badge */}
        {warnBadge && (
          <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 900,
            padding: "2px 6px", borderRadius: 4, background: "rgba(220,60,40,0.15)",
            color: badgeColor, letterSpacing: 0.3 }}>
            ⚠ {soonestDays! < 0 ? "EXPIRED" : soonestDays === 0 ? "EXP TODAY" : `EXP ${soonestDays}d`}
          </span>
        )}
        {/* Row 3: region · local area */}
        {(trailer.region || trailer.local_area) && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
            {[trailer.region, trailer.local_area].filter(Boolean).join(" · ")}
          </div>
        )}
        {/* Row 4: status location — hidden when in_use (managed via combo) */}
        {trailer.status_location && trailer.status_code !== "in_use" && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1,
            whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
            📍 {trailer.status_location}
          </div>
        )}
      </div>

      {/* ── Expanded section ── */}
      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 12px" }}
          onClick={e => e.stopPropagation()}>

          {/* Identification */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 1, marginBottom: 8 }}>
            {(trailer.year || trailer.make || trailer.model) ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Vehicle</span>
              <span style={{ fontSize: 11, color: T.text }}>{[trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ")}</span>
            </> : null}
            {trailer.vin_number ? <>
              <span style={{ fontSize: 11, color: T.muted }}>VIN</span>
              <span style={{ fontSize: 11, color: T.text, wordBreak: "break-all" as const }}>{trailer.vin_number}</span>
            </> : null}
            {trailer.plate_number ? <>
              <span style={{ fontSize: 11, color: T.muted }}>Plate</span>
              <span style={{ fontSize: 11, color: T.text }}>{trailer.plate_number}</span>
            </> : null}
          </div>

          {compSummary && (
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{compSummary}</div>
          )}
          {trailer.last_load_config && (
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
              Last loaded: {trailer.last_load_config}
            </div>
          )}

          {trailer.notes && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", background: "rgba(255,255,255,0.04)",
              borderRadius: 8, padding: "8px 10px", marginBottom: 8, lineHeight: 1.5,
              borderLeft: `3px solid ${T.accent}40` }}>
              {trailer.notes}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${T.border}22`, marginBottom: 6, marginTop: 2 }} />
          <PermitRow label="Trailer Registration"  date={trailer.trailer_reg_expiration_date} enforcement={trailer.trailer_reg_enforcement_date}
            category="trailer_registration" hasDoc={hasDoc("trailer_registration")} onDocOpen={() => openDocForCategory("trailer_registration")} />
          <PermitRow label="Annual Inspection"      date={trailer.trailer_inspection_expiration_date}
            category="annual_inspection"    hasDoc={hasDoc("annual_inspection")}    onDocOpen={() => openDocForCategory("annual_inspection")}
            extra={(trailer.trailer_inspection_shop || trailer.trailer_inspection_issue_date) ? (
              <div style={{ fontSize: 11, color: T.muted }}>
                {[trailer.trailer_inspection_shop, trailer.trailer_inspection_issue_date && `Issued ${fmtDate(trailer.trailer_inspection_issue_date)}`].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          />

          {tankDates.length > 0 && <div style={{ borderTop: `1px solid ${T.border}22`, marginBottom: 4, marginTop: 4 }} />}
          {[
            { label: "V — External Visual",   date: trailer.tank_v_expiration_date,  cat: "tank_v"  },
            { label: "K — Leakage Test",      date: trailer.tank_k_expiration_date,  cat: "tank_k"  },
            { label: "L — Lining Inspection", date: trailer.tank_l_expiration_date,  cat: "tank_l"  },
            { label: "T — Thickness Test",    date: trailer.tank_t_expiration_date,  cat: "tank_t"  },
            { label: "I — Internal Visual",   date: trailer.tank_i_expiration_date,  cat: "tank_i"  },
            { label: "P — Pressure Test",     date: trailer.tank_p_expiration_date,  cat: "tank_p"  },
            { label: "UC — Upper Coupler",    date: trailer.tank_uc_expiration_date, cat: "tank_uc" },
          ].filter(r => !!r.date).map(r => (
            <PermitRow key={r.cat} label={r.label} date={r.date}
              category={r.cat} hasDoc={hasDoc(r.cat)} onDocOpen={() => openDocForCategory(r.cat)} />
          ))}
        </div>
      )}
    </div>

    {hubOpen && (
      <DocHubModal
        equipmentType="trailer" equipmentId={trailer.trailer_id}
        equipmentName={trailer.trailer_name} companyId={companyId}
        onClose={() => { setHubOpen(false); reload(); }}
      />
    )}
    {previewGroup && <DocPreviewModal group={previewGroup} onClose={() => setPreviewGroup(null)} />}
    </>
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
      <Field label="Role"><select value={role} onChange={e => setRole(e.target.value)} style={{ ...css.select, width: "100%" }}><option value="driver">Driver</option><option value="lead">Lead</option><option value="dispatch">Dispatch</option><option value="admin">Admin</option></select></Field>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>If the user already has an account they'll be added immediately. New users receive a magic link.</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={css.btn("primary")} onClick={send} disabled={loading || !email.trim()}>{loading ? "Sending…" : "Send Invite"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Sensitive Info (admin-only; purchase price, lease terms, insurance
// claims -- deliberately its own table/RLS, separate from the shared
// equipment log per the Fleet Tier spec's "admin-only field" requirement)
// ─────────────────────────────────────────────────────────────

type SensitiveData = {
  id?: string;
  purchase_price: string;
  purchase_date: string;
  lease_terms: string;
  insurance_claims: string;
};

const emptySensitive: SensitiveData = { purchase_price: "", purchase_date: "", lease_terms: "", insurance_claims: "" };

function SensitiveInfoSection({ unitKind, unitId, companyId }: { unitKind: "truck" | "trailer"; unitId: string; companyId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SensitiveData>(emptySensitive);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    const col = unitKind === "truck" ? "truck_id" : "trailer_id";
    supabase.from("equipment_sensitive_data").select("id, purchase_price, purchase_date, lease_terms, insurance_claims").eq(col, unitId).maybeSingle()
      .then(({ data: row }) => {
        if (row) {
          setData({
            id: row.id,
            purchase_price: row.purchase_price != null ? String(row.purchase_price) : "",
            purchase_date: row.purchase_date ?? "",
            lease_terms: row.lease_terms ?? "",
            insurance_claims: row.insurance_claims ?? "",
          });
        }
        setLoaded(true);
      });
  }, [open, loaded, unitKind, unitId]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        company_id: companyId,
        truck_id: unitKind === "truck" ? unitId : null,
        trailer_id: unitKind === "trailer" ? unitId : null,
        purchase_price: data.purchase_price ? Number(data.purchase_price) : null,
        purchase_date: data.purchase_date || null,
        lease_terms: data.lease_terms || null,
        insurance_claims: data.insurance_claims || null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (data.id) {
        const { error } = await supabase.from("equipment_sensitive_data").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from("equipment_sensitive_data").insert(payload).select("id").single();
        if (error) throw error;
        setData((d) => ({ ...d, id: inserted.id }));
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ ...css.btn("subtle"), fontSize: 11, width: "100%", textAlign: "left" as const }}>
        {open ? "▾" : "▸"} Sensitive Info (admin only)
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 6, border: `1px solid ${T.border}` }}>
          {err && <Banner msg={err} type="error" />}
          <FieldRow>
            <Field label="Purchase Price"><input type="number" value={data.purchase_price} onChange={(e) => setData((d) => ({ ...d, purchase_price: e.target.value }))} style={css.input} /></Field>
            <Field label="Purchase Date"><input type="date" value={data.purchase_date} onChange={(e) => setData((d) => ({ ...d, purchase_date: e.target.value }))} style={css.input} /></Field>
          </FieldRow>
          <Field label="Lease Terms"><textarea value={data.lease_terms} onChange={(e) => setData((d) => ({ ...d, lease_terms: e.target.value }))} rows={2} style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const }} /></Field>
          <Field label="Insurance Claims"><textarea value={data.insurance_claims} onChange={(e) => setData((d) => ({ ...d, insurance_claims: e.target.value }))} rows={2} style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const }} /></Field>
          <button type="button" onClick={save} disabled={saving} style={{ ...css.btn("primary"), fontSize: 11, width: "100%" }}>{saving ? "Saving…" : "Save Sensitive Info"}</button>
        </div>
      )}
    </div>
  );
}

// A duplicate unit name/number is scoped per-company (trucks_company_
// truck_name_key / trailers_company_trailer_name_key -- see
// 20260925000000_scope_unit_names_per_company.sql), so a Postgres 23505
// here always means "this name is already used elsewhere in YOUR
// company," never a collision with an unrelated company -- name that
// plainly instead of surfacing the raw constraint-violation message.
function friendlyUnitSaveError(error: { code?: string; message?: string } | null, kind: "truck" | "trailer"): string {
  if (error?.code === "23505") {
    return `That ${kind} number is already in use in this company. Enter a different one.`;
  }
  return error?.message ?? `Couldn't save the ${kind}.`;
}

// ─────────────────────────────────────────────────────────────
// Truck Modal
// ─────────────────────────────────────────────────────────────

function TruckModal({ truck, companyId, onClose, onDone, myRole }: {
  truck: Truck | null; companyId: string; onClose: () => void; onDone: () => void; myRole?: string;
}) {
  const isNew = !truck;
  // Unit # is spec-gated to admin/dispatch/lead once a truck exists -- a new
  // truck still needs a name to be created at all, so creation stays open
  // to whoever's RLS already lets INSERT trucks (unchanged, out of scope).
  const canEditRestricted = isNew || myRole === "admin" || myRole === "dispatch" || myRole === "lead";
  const [name,      setName]      = useState(truck?.truck_name ?? "");
  const [vin,       setVin]       = useState(truck?.vin_number ?? "");
  const [plate,     setPlate]     = useState(truck?.plate_number ?? "");
  const [make,      setMake]      = useState(truck?.make ?? "");
  const [model,     setModel]     = useState(truck?.model ?? "");
  const [year,      setYear]      = useState(String(truck?.year ?? ""));
  const [region,    setRegion]    = useState(truck?.region ?? "");
  const [localArea, setLocalArea] = useState(truck?.local_area ?? "");
  const [active,    setActive]    = useState(truck?.active ?? true);
  // 2026-08-29 rework: front page (required fields) vs. Details (everything
  // else, unchanged) -- one form/save either way, this only controls what's
  // currently visible. "Service Schedule" (serviceOpen) always opens
  // ServiceTypeListModal -- setting up TYPES and their intervals, never
  // logging an actual service -- per explicit clarification: "the is
  // where we determine service types and the intervals... we record the
  // service from the main modal service button." Recording a real
  // service stays where it already was, the main equipment picker's own
  // "Service" button (SimpleServiceModal), untouched by this modal.
  const [screen,      setScreen]      = useState<"front" | "details">("front");
  const [serviceOpen, setServiceOpen] = useState(false);
  // Permit dates
  const [regExp,    setRegExp]    = useState(truck?.reg_expiration_date ?? "");
  const [regEnf,    setRegEnf]    = useState(truck?.reg_enforcement_date ?? "");
  const [insShop,   setInsShop]   = useState(truck?.inspection_shop ?? "");
  const [insIssue,  setInsIssue]  = useState(truck?.inspection_issue_date ?? "");
  const [insExp,    setInsExp]    = useState(truck?.inspection_expiration_date ?? "");
  const [insEnf,    setInsEnf]    = useState(truck?.inspection_enforcement_date ?? "");
  const [insNotes,  setInsNotes]  = useState(truck?.inspection_notes ?? "");
  const [iftaExp,   setIftaExp]   = useState(truck?.ifta_expiration_date ?? "");
  const [iftaEnf,   setIftaEnf]   = useState(truck?.ifta_enforcement_date ?? "");
  const [iftaNotes, setIftaNotes] = useState((truck as any)?.ifta_notes ?? "");
  const [phmsaExp,  setPhmsaExp]  = useState(truck?.phmsa_expiration_date ?? "");
  const [phmsaEnf,  setPhmsaEnf]  = useState(truck?.phmsa_enforcement_date ?? "");
  const [phmsaNotes,setPhmsaNotes]= useState(truck?.phmsa_notes ?? "");
  const [alliExp,   setAlliExp]   = useState(truck?.alliance_expiration_date ?? "");
  const [alliEnf,   setAlliEnf]   = useState(truck?.alliance_enforcement_date ?? "");
  const [alliNotes, setAlliNotes] = useState(truck?.alliance_notes ?? "");
  const [fleetExp,  setFleetExp]  = useState(truck?.fleet_ins_expiration_date ?? "");
  const [fleetEnf,  setFleetEnf]  = useState(truck?.fleet_ins_enforcement_date ?? "");
  const [fleetNotes,setFleetNotes]= useState(truck?.fleet_ins_notes ?? "");
  const [hazLicExp, setHazLicExp] = useState(truck?.hazmat_lic_expiration_date ?? "");
  const [hazLicEnf, setHazLicEnf] = useState(truck?.hazmat_lic_enforcement_date ?? "");
  const [hazLicNotes,setHazLicNotes]= useState(truck?.hazmat_lic_notes ?? "");
  const [ibExp,     setIbExp]     = useState(truck?.inner_bridge_expiration_date ?? "");
  const [ibEnf,     setIbEnf]     = useState(truck?.inner_bridge_enforcement_date ?? "");
  const [ibNotes,   setIbNotes]   = useState(truck?.inner_bridge_notes ?? "");
  const [regNotes,  setRegNotes]  = useState((truck as any)?.reg_notes ?? "");
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
    if (!region.trim()) { setErr("Region is required."); return; }
    if (!localArea.trim()) { setErr("Local area is required."); return; }
    if (!companyId || !String(companyId).trim()) {
      setErr("Missing company id (cannot save). Close and reopen Equipment Details, or ask your admin to assign you to a company.");
      return;
    }
    setSaving(true); setErr(null);
    const payload: any = {
      truck_name: name.trim(), vin_number: vin || null, plate_number: plate || null, make: make || null, model: model || null,
      year: year ? parseInt(year) : null, region: region || null, local_area: localArea || null,
      active, company_id: companyId,
      reg_expiration_date: regExp || null, reg_enforcement_date: regEnf || null,
      inspection_shop: insShop || null, inspection_issue_date: insIssue || null, inspection_expiration_date: insExp || null,
      inspection_enforcement_date: insEnf || null, inspection_notes: insNotes || null,
      ifta_expiration_date: iftaExp || null, ifta_enforcement_date: iftaEnf || null, ifta_notes: iftaNotes || null,
      phmsa_expiration_date: phmsaExp || null, phmsa_enforcement_date: phmsaEnf || null, phmsa_notes: phmsaNotes || null,
      alliance_expiration_date: alliExp || null, alliance_enforcement_date: alliEnf || null, alliance_notes: alliNotes || null,
      fleet_ins_expiration_date: fleetExp || null, fleet_ins_enforcement_date: fleetEnf || null, fleet_ins_notes: fleetNotes || null,
      hazmat_lic_expiration_date: hazLicExp || null, hazmat_lic_enforcement_date: hazLicEnf || null, hazmat_lic_notes: hazLicNotes || null,
      inner_bridge_expiration_date: ibExp || null, inner_bridge_enforcement_date: ibEnf || null, inner_bridge_notes: ibNotes || null,
      reg_notes: regNotes || null, notes: notes || null,
    };
    let truckId = truck?.truck_id;
    if (isNew) {
      const { data, error } = await supabase.from("trucks").insert(payload).select("truck_id").single();
      if (error) { setErr(friendlyUnitSaveError(error, "truck")); setSaving(false); return; }
      truckId = data.truck_id;
    } else {
      const { error } = await supabase.from("trucks").update(payload).eq("truck_id", truckId!);
      if (error) { setErr(friendlyUnitSaveError(error, "truck")); setSaving(false); return; }
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
    if (!confirm("Permanently delete this truck? This cannot be undone.")) return;
    setSaving(true); setErr(null);
    try {
      const { error } = await supabase.rpc("delete_truck", {
        p_truck_id: truck!.truck_id,
        p_company_id: companyId,
      });
      if (error) throw error;
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed.");
      console.error("deleteTruck error:", e);
      setSaving(false);
    }
  }

  function addOtherPermit()    { setOtherPermits(p => [...p, { label: "", expiration_date: "" }]); }
  function removeOtherPermit(i: number) { setOtherPermits(p => p.filter((_, idx) => idx !== i)); }
  function updateOtherPermit(i: number, field: keyof OtherPermit, val: string) {
    setOtherPermits(p => p.map((x, idx) => idx === i ? { ...x, [field]: val } : x));
  }

  // Only an admin can delete (matches delete_truck's own role check exactly);
  // canEditRestricted (admin/dispatch/lead) covers everything else restricted.
  const canDelete = myRole === "admin";

  // Shared condensed text input helper
  const ti = (val: string, set: (v: string) => void, ph = "", type = "text", locked = false) => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} disabled={locked}
      style={{ ...css.input, ...sm, ...(locked ? { opacity: 0.55, cursor: "not-allowed" as const } : {}) }} />
  );

  const saveCloseBtn = canEditRestricted && (
    <button style={{ ...css.btn("primary"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={save} disabled={saving}>
      {saving ? "Saving…" : "Save & Close"}
    </button>
  );

  return (
    <Modal title={isNew ? "Add Truck" : "Edit Truck"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}

      {screen === "front" ? (
        <>
          {/* ── Front page: only what's needed to get this truck on file ── */}
          <RequiredEquipmentFields
            kind="truck" companyId={companyId} editable={canEditRestricted}
            name={name} onNameChange={setName}
            year={year} onYearChange={setYear}
            make={make} onMakeChange={setMake}
            model={model} onModelChange={setModel}
            region={region} onRegionChange={setRegion}
            localArea={localArea} onLocalAreaChange={setLocalArea}
          />

          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setServiceOpen(true)} style={{ ...css.btn("ghost"), width: "100%", textAlign: "left" as const }}>
              Service Schedule
            </button>
            <button type="button" onClick={() => setScreen("details")} style={{ ...css.btn("ghost"), width: "100%", textAlign: "left" as const }}>
              Details →
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" as const }}>
            <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={onClose}>Cancel</button>
            {saveCloseBtn}
          </div>
        </>
      ) : (
        <>
          {/* ── Details: everything else -- vin, plate, permits, notes, we already had this built ── */}
          <button type="button" onClick={() => setScreen("front")} style={{ ...css.btn("subtle"), fontSize: 11, marginBottom: 12 }}>
            ← Back
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 10px", marginBottom: 6 }}>
            <div><label style={{ ...css.label, fontSize: 10 }}>VIN</label>{ti(vin, setVin, "VIN", "text", !canEditRestricted)}</div>
            <div><label style={{ ...css.label, fontSize: 10 }}>Plate</label>{ti(plate, setPlate, "e.g. ABC1234", "text", !canEditRestricted)}</div>
          </div>

          <hr style={css.divider} />

          {/* ── Permit Book ── */}
          <PermitEditRow editable={canEditRestricted} label="Registration"              expVal={regExp}   onExpChange={setRegExp}   enfVal={regEnf}   onEnfChange={setRegEnf}   notesVal={regNotes}  onNotesChange={setRegNotes} />
          <PermitEditRow editable={canEditRestricted} label="Annual Inspection"          expVal={insExp}   onExpChange={setInsExp}   enfVal={insEnf}     onEnfChange={setInsEnf}     notesVal={insNotes}     onNotesChange={setInsNotes}
            extra={
              <div style={{ display: "flex", gap: 6 }}>
                <input value={insShop} onChange={e => setInsShop(e.target.value)} placeholder="Inspection shop" disabled={!canEditRestricted}
                  style={{ ...css.input, ...sm, flex: 1, ...(canEditRestricted ? {} : { opacity: 0.55, cursor: "not-allowed" as const }) }} />
                <input type="date" value={insIssue} onChange={e => setInsIssue(e.target.value)} disabled={!canEditRestricted}
                  style={{ ...css.input, ...sm, width: 130, flexShrink: 0, ...(canEditRestricted ? {} : { opacity: 0.55, cursor: "not-allowed" as const }) }} />
              </div>
            }
          />
          <PermitEditRow editable={canEditRestricted} label="IFTA Permits + Decals"     expVal={iftaExp}  onExpChange={setIftaExp}  enfVal={iftaEnf}     onEnfChange={setIftaEnf}     notesVal={iftaNotes}     onNotesChange={setIftaNotes} />
          <PermitEditRow editable={canEditRestricted} label="PHMSA HazMat Permit"       expVal={phmsaExp} onExpChange={setPhmsaExp} enfVal={phmsaEnf}    onEnfChange={setPhmsaEnf}    notesVal={phmsaNotes}    onNotesChange={setPhmsaNotes} />
          <PermitEditRow editable={canEditRestricted} label="Alliance HazMat Permit"    expVal={alliExp}  onExpChange={setAlliExp}  enfVal={alliEnf}     onEnfChange={setAlliEnf}     notesVal={alliNotes}     onNotesChange={setAlliNotes} />
          <PermitEditRow editable={canEditRestricted} label="Fleet Insurance Cab Card"  expVal={fleetExp} onExpChange={setFleetExp} enfVal={fleetEnf}    onEnfChange={setFleetEnf}    notesVal={fleetNotes}    onNotesChange={setFleetNotes} />
          <PermitEditRow editable={canEditRestricted} label="HazMat Transportation Lic" expVal={hazLicExp} onExpChange={setHazLicExp} enfVal={hazLicEnf} onEnfChange={setHazLicEnf}   notesVal={hazLicNotes}   onNotesChange={setHazLicNotes} />
          <PermitEditRow editable={canEditRestricted} label="Inner Bridge Permit"       expVal={ibExp}    onExpChange={setIbExp}    enfVal={ibEnf}      onEnfChange={setIbEnf}       notesVal={ibNotes}       onNotesChange={setIbNotes} />

          <hr style={css.divider} />

          {/* ── Other Permits ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.4 }}>OTHER PERMITS</span>
            {canEditRestricted && (
              <button type="button" onClick={addOtherPermit} style={{ ...css.btn("subtle"), fontSize: 11, padding: "2px 10px" }}>+ Add</button>
            )}
          </div>
          {otherPermits.length === 0 && (
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>None — click + Add for state permits, etc.</div>
          )}
          {otherPermits.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
              <input value={p.label} onChange={e => updateOtherPermit(i, "label", e.target.value)} disabled={!canEditRestricted}
                placeholder="e.g. FL State Permit" style={{ ...css.input, ...sm, flex: 1, ...(canEditRestricted ? {} : { opacity: 0.55, cursor: "not-allowed" as const }) }} />
              <input type="date" value={p.expiration_date} onChange={e => updateOtherPermit(i, "expiration_date", e.target.value)} disabled={!canEditRestricted}
                style={{ ...css.input, ...sm, width: 130, flexShrink: 0, ...(canEditRestricted ? {} : { opacity: 0.55, cursor: "not-allowed" as const }) }} />
              {canEditRestricted && (
                <button type="button" onClick={() => removeOtherPermit(i)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, fontSize: 13, padding: "0 4px" }}>✕</button>
              )}
            </div>
          ))}

          <hr style={css.divider} />

          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={!canEditRestricted}
              style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const, ...(canEditRestricted ? {} : { opacity: 0.55, cursor: "not-allowed" as const }) }} />
          </Field>

          {!isNew && myRole === "admin" && (
            <SensitiveInfoSection unitKind="truck" unitId={truck!.truck_id} companyId={companyId} />
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" as const }}>
            {!isNew && canDelete && (
              <button style={{ ...css.btn("danger"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={deleteTruck} disabled={saving}>Delete</button>
            )}
            {!isNew && canEditRestricted && (
              <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const,
                color: active ? T.warning : T.success, borderColor: active ? T.warning : T.success }}
                onClick={() => setActive(v => !v)} disabled={saving}>
                {active ? "Deactivate" : "Reactivate"}
              </button>
            )}
            <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={onClose}>Cancel</button>
            {saveCloseBtn}
          </div>
        </>
      )}

      <ServiceTypeListModal open={serviceOpen} onClose={() => setServiceOpen(false)} companyId={companyId} unit="truck" />
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Trailer Modal — CG Max removed (always 1), condensed permits
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// TankEditRow — tank inspection row: − label | date input
// ─────────────────────────────────────────────────────────────

function TankEditRow({ label, dateVal, onDateChange, notesVal, onNotesChange, onRemove, editable = true }: {
  label: string; dateVal: string; onDateChange: (v: string) => void;
  notesVal?: string; onNotesChange?: (v: string) => void;
  onRemove: () => void;
  editable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lockedStyle = editable ? {} : { opacity: 0.55, cursor: "not-allowed" as const };
  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32 }}>
        {editable && (
          <button type="button" onClick={onRemove}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.danger,
              fontSize: 16, padding: "0 2px", flexShrink: 0, lineHeight: 1,
              minWidth: 20, minHeight: 20, display: "flex", alignItems: "center", justifyContent: "center",
              WebkitTapHighlightColor: "transparent" }}>−</button>
        )}
        <span onClick={() => setExpanded(v => !v)}
          style={{ fontSize: 11, color: T.muted, flex: 1, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" as const, cursor: "pointer" }}>
          {label} <span style={{ fontSize: 9 }}>▼</span>
        </span>
        <input type="date" value={dateVal} onChange={e => onDateChange(e.target.value)} disabled={!editable}
          style={{ ...css.input, ...sm, ...lockedStyle, width: 130, flexShrink: 0 }} />
      </div>
      {expanded && (
        <div style={{ paddingLeft: 26, paddingBottom: 8 }}>
          <textarea value={notesVal ?? ""} onChange={e => onNotesChange?.(e.target.value)} disabled={!editable}
            placeholder="Shop, cert #, notes…" rows={2}
            style={{ ...css.input, ...lockedStyle, width: "100%", boxSizing: "border-box" as const, fontSize: 11, resize: "vertical" as const }} />
        </div>
      )}
    </div>
  );
}

function TrailerModal({ trailer, companyId, onClose, onDone, myRole }: {
  trailer: Trailer | null; companyId: string; onClose: () => void; onDone: () => void; myRole?: string;
}) {
  const isNew = !trailer;
  // Unit #, total volume/comp, and cap/comp are spec-gated to admin/dispatch/
  // lead once a trailer exists -- a new trailer still needs these to be
  // created at all, so creation stays open (RLS INSERT is unchanged/out of
  // scope here).
  const canEditRestricted = isNew || myRole === "admin" || myRole === "dispatch" || myRole === "lead";
  const [name,      setName]      = useState(trailer?.trailer_name ?? "");
  const [vin,       setVin]       = useState(trailer?.vin_number ?? "");
  const [plate,     setPlate]     = useState(trailer?.plate_number ?? "");
  const [make,      setMake]      = useState(trailer?.make ?? "");
  const [model,     setModel]     = useState(trailer?.model ?? "");
  const [year,      setYear]      = useState(String(trailer?.year ?? ""));
  const [region,    setRegion]    = useState(trailer?.region ?? "");
  const [localArea, setLocalArea] = useState(trailer?.local_area ?? "");
  const [active,    setActive]    = useState(trailer?.active ?? true);
  const [comps,     setComps]     = useState<Compartment[]>(trailer?.compartments ?? []);
  // 2026-08-29 rework -- see TruckModal's identical comment above.
  const [screen,      setScreen]      = useState<"front" | "details">("front");
  const [serviceOpen, setServiceOpen] = useState(false);
  // Permit dates
  const [trRegExp,   setTrRegExp]   = useState(trailer?.trailer_reg_expiration_date ?? "");
  const [trRegEnf,   setTrRegEnf]   = useState(trailer?.trailer_reg_enforcement_date ?? "");
  const [trInsShop,  setTrInsShop]  = useState(trailer?.trailer_inspection_shop ?? "");
  const [trInsIssue, setTrInsIssue] = useState(trailer?.trailer_inspection_issue_date ?? "");
  const [trInsExp,   setTrInsExp]   = useState(trailer?.trailer_inspection_expiration_date ?? "");
  const [trInsEnf,   setTrInsEnf]   = useState(trailer?.trailer_inspection_enforcement_date ?? "");
  const [trInsNotes, setTrInsNotes] = useState(trailer?.trailer_inspection_notes ?? "");
  const [trRegNotes, setTrRegNotes] = useState((trailer as any)?.trailer_reg_notes ?? "");
  // Tank inspections — dynamic list seeded from saved dates
  type TankKey = "v" | "k" | "l" | "t" | "i" | "p" | "uc";
  const TANK_DEFS: { key: TankKey; label: string }[] = [
    { key: "v",  label: "V — External Visual (Annual)" },
    { key: "k",  label: "K — Leakage Test (Annual)" },
    { key: "l",  label: "L — Lining Inspection (Annual)" },
    { key: "t",  label: "T — Thickness Test (2yr)" },
    { key: "i",  label: "I — Internal Visual (5yr)" },
    { key: "p",  label: "P — Pressure Test (5yr)" },
    { key: "uc", label: "UC — Upper Coupler (5yr)" },
  ];
  const [tanks, setTanks] = useState<{ key: TankKey; date: string; notes: string }[]>(() =>
    TANK_DEFS.filter(d => !!(trailer as any)?.[`tank_${d.key}_expiration_date`])
      .map(d => ({ key: d.key, date: (trailer as any)[`tank_${d.key}_expiration_date`] ?? "", notes: (trailer as any)[`tank_${d.key}_notes`] ?? "" }))
  );
  const [tankAddOpen, setTankAddOpen] = useState(false);
  const [notes,  setNotes]  = useState(trailer?.notes ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { setErr("Trailer name is required."); return; }
    if (!region.trim()) { setErr("Region is required."); return; }
    if (!localArea.trim()) { setErr("Local area is required."); return; }
    if (!companyId || !String(companyId).trim()) {
      setErr("Missing company id (cannot save). Close and reopen Equipment Details, or ask your admin to assign you to a company.");
      return;
    }
    // A trailer with no compartments can't carry anything -- per explicit
    // spec, at least one compartment is required, same as the 6 identity
    // fields above.
    if (comps.length === 0) { setErr("At least one compartment is required."); return; }
    if (comps.some(c => !c.max_gallons || c.max_gallons <= 0)) { setErr("All compartments need max gallons > 0."); return; }
    if (comps.some(c => c.cap_gallons != null && (c.cap_gallons <= 0 || c.cap_gallons > c.max_gallons))) {
      setErr("Cap can't exceed a compartment's total volume.");
      return;
    }
    setSaving(true); setErr(null);
    const payload: any = {
      trailer_name: name.trim(), vin_number: vin || null, plate_number: plate || null, make: make || null, model: model || null,
      year: year ? parseInt(year) : null, region: region || null, local_area: localArea || null,
      cg_max: 1.0, // always 1 per spec
      active, company_id: companyId,
      trailer_reg_expiration_date: trRegExp || null, trailer_reg_enforcement_date: trRegEnf || null,
      trailer_inspection_shop: trInsShop || null, trailer_inspection_issue_date: trInsIssue || null,
      trailer_inspection_expiration_date: trInsExp || null,
      trailer_inspection_enforcement_date: trInsEnf || null, trailer_inspection_notes: trInsNotes || null,
      trailer_reg_notes: trRegNotes || null,
      tank_v_expiration_date:  tanks.find(t => t.key === "v")?.date  || null,
      tank_v_notes:  tanks.find(t => t.key === "v")?.notes  || null,
      tank_k_expiration_date:  tanks.find(t => t.key === "k")?.date  || null,
      tank_k_notes:  tanks.find(t => t.key === "k")?.notes  || null,
      tank_l_expiration_date:  tanks.find(t => t.key === "l")?.date  || null,
      tank_l_notes:  tanks.find(t => t.key === "l")?.notes  || null,
      tank_t_expiration_date:  tanks.find(t => t.key === "t")?.date  || null,
      tank_t_notes:  tanks.find(t => t.key === "t")?.notes  || null,
      tank_i_expiration_date:  tanks.find(t => t.key === "i")?.date  || null,
      tank_i_notes:  tanks.find(t => t.key === "i")?.notes  || null,
      tank_p_expiration_date:  tanks.find(t => t.key === "p")?.date  || null,
      tank_p_notes:  tanks.find(t => t.key === "p")?.notes  || null,
      tank_uc_expiration_date: tanks.find(t => t.key === "uc")?.date || null,
      tank_uc_notes: tanks.find(t => t.key === "uc")?.notes || null,
      notes: notes || null,
    };
    let trailerId = trailer?.trailer_id;
    if (isNew) {
      const { data, error } = await supabase.from("trailers").insert(payload).select("trailer_id").single();
      if (error) { setErr(friendlyUnitSaveError(error, "trailer")); setSaving(false); return; }
      trailerId = data.trailer_id;
    } else {
      const { error } = await supabase.from("trailers").update(payload).eq("trailer_id", trailerId!);
      if (error) { setErr(friendlyUnitSaveError(error, "trailer")); setSaving(false); return; }
      await supabase.from("trailer_compartments").delete().eq("trailer_id", trailerId!);
    }
    if (comps.length > 0) {
      // cap_gallons must round-trip here -- this delete+reinsert previously
      // dropped it silently on every save (only comp_number/max_gallons/
      // position were ever written back), wiping any configured cap.
      const { error: compErr } = await supabase.from("trailer_compartments").insert(
        comps.map(c => ({ trailer_id: trailerId, comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position, cap_gallons: c.cap_gallons ?? null }))
      );
      if (compErr) { setErr(compErr.message); setSaving(false); return; }
    }
    onDone();
  }

  async function deleteTrailer() {
    if (!confirm("Permanently delete this trailer? This cannot be undone.")) return;
    setSaving(true); setErr(null);
    try {
      const { error } = await supabase.rpc("delete_trailer", {
        p_trailer_id: trailer!.trailer_id,
        p_company_id: companyId,
      });
      if (error) throw error;
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed.");
      console.error("deleteTrailer error:", e);
      setSaving(false);
    }
  }

  // Only an admin can delete (matches delete_trailer's own role check exactly);
  // canEditRestricted (admin/dispatch/lead) covers everything else restricted.
  const canDelete = myRole === "admin";

  const ti = (val: string, set: (v: string) => void, ph = "", type = "text", locked = false) => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} disabled={locked}
      style={{ ...css.input, ...sm, ...(locked ? { opacity: 0.55, cursor: "not-allowed" as const } : {}) }} />
  );

  // Gated by canEditRestricted now (was previously unconditional -- a real,
  // pre-existing inconsistency found while unifying with TruckModal's own
  // already-gated Save button; fixed here since it's the same button now).
  const saveCloseBtn = canEditRestricted && (
    <button style={{ ...css.btn("primary"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={save} disabled={saving}>
      {saving ? "Saving…" : "Save & Close"}
    </button>
  );

  return (
    <Modal title={isNew ? "Add Trailer" : "Edit Trailer"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}

      {screen === "front" ? (
        <>
          {/* ── Front page: required fields + compartments (also required) ── */}
          <RequiredEquipmentFields
            kind="trailer" companyId={companyId} editable={canEditRestricted}
            name={name} onNameChange={setName}
            year={year} onYearChange={setYear}
            make={make} onMakeChange={setMake}
            model={model} onModelChange={setModel}
            region={region} onRegionChange={setRegion}
            localArea={localArea} onLocalAreaChange={setLocalArea}
          />

          <div style={{ marginTop: 14 }}>
            <div style={{ ...css.label, fontSize: 10, marginBottom: 6 }}>Compartments (at least 1 required)</div>
            <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px" }}>
              <CompartmentEditor comps={comps} onChange={setComps} editable={canEditRestricted} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setServiceOpen(true)} style={{ ...css.btn("ghost"), width: "100%", textAlign: "left" as const }}>
              Service Schedule
            </button>
            <button type="button" onClick={() => setScreen("details")} style={{ ...css.btn("ghost"), width: "100%", textAlign: "left" as const }}>
              Details →
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" as const }}>
            <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={onClose}>Cancel</button>
            {saveCloseBtn}
          </div>
        </>
      ) : (
        <>
          {/* ── Details: everything else -- vin, plate, permits, notes, we already had this built ── */}
          <button type="button" onClick={() => setScreen("front")} style={{ ...css.btn("subtle"), fontSize: 11, marginBottom: 12 }}>
            ← Back
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 10px", marginBottom: 6 }}>
            <div><label style={{ ...css.label, fontSize: 10 }}>VIN</label>{ti(vin, setVin, "VIN", "text", !canEditRestricted)}</div>
            <div><label style={{ ...css.label, fontSize: 10 }}>Plate</label>{ti(plate, setPlate, "e.g. ABC1234", "text", !canEditRestricted)}</div>
          </div>

          <hr style={css.divider} />

          {/* ── Permit Book ── */}
          <PermitEditRow editable={canEditRestricted} label="Trailer Registration" expVal={trRegExp} onExpChange={setTrRegExp} enfVal={trRegEnf} onEnfChange={setTrRegEnf} notesVal={trRegNotes} onNotesChange={setTrRegNotes} />
          <PermitEditRow editable={canEditRestricted} label="Annual Inspection"    expVal={trInsExp} onExpChange={setTrInsExp} enfVal={trInsEnf} onEnfChange={setTrInsEnf} notesVal={trInsNotes} onNotesChange={setTrInsNotes}
            extra={
              <div style={{ display: "flex", gap: 6 }}>
                <input value={trInsShop} onChange={e => setTrInsShop(e.target.value)} placeholder="Inspection shop" disabled={!canEditRestricted}
                  style={{ ...css.input, ...sm, flex: 1, ...(canEditRestricted ? {} : { opacity: 0.55, cursor: "not-allowed" as const }) }} />
                <input type="date" value={trInsIssue} onChange={e => setTrInsIssue(e.target.value)} disabled={!canEditRestricted}
                  style={{ ...css.input, ...sm, width: 130, flexShrink: 0, ...(canEditRestricted ? {} : { opacity: 0.55, cursor: "not-allowed" as const }) }} />
              </div>
            }
          />

          <hr style={css.divider} />

          {/* ── Tank Inspections — dynamic ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.4 }}>TANK INSPECTIONS</span>
            {canEditRestricted && (
            <div style={{ position: "relative" as const }}>
              <button type="button" onClick={() => setTankAddOpen(v => !v)}
                style={{ ...css.btn("subtle"), fontSize: 11, padding: "2px 10px" }}>+ Add</button>
              {tankAddOpen && (() => {
                const addedKeys = new Set(tanks.map(t => t.key));
                const available = TANK_DEFS.filter(d => !addedKeys.has(d.key));
                return available.length === 0 ? null : (
                  <div style={{ position: "absolute" as const, right: 0, top: "110%", zIndex: 50,
                    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                    minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", overflow: "hidden" }}>
                    {available.map(d => (
                      <div key={d.key}
                        onClick={() => { setTanks(prev => [...prev, { key: d.key, date: "", notes: "" }]); setTankAddOpen(false); }}
                        style={{ padding: "8px 14px", fontSize: 12, cursor: "pointer", color: T.text,
                          borderBottom: `1px solid ${T.border}22` }}
                        onMouseEnter={e => (e.currentTarget.style.background = T.surface3)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        {d.label}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            )}
          </div>
          {tanks.length === 0 && <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>No tank inspections added yet.</div>}
          {tanks.map((tank) => {
            const def = TANK_DEFS.find(d => d.key === tank.key)!;
            return (
              <TankEditRow
                key={tank.key}
                editable={canEditRestricted}
                label={def.label}
                dateVal={tank.date}
                onDateChange={v => setTanks(prev => prev.map(t => t.key === tank.key ? { ...t, date: v } : t))}
                notesVal={tank.notes}
                onNotesChange={v => setTanks(prev => prev.map(t => t.key === tank.key ? { ...t, notes: v } : t))}
                onRemove={() => setTanks(prev => prev.filter(t => t.key !== tank.key))}
              />
            );
          })}

          <hr style={css.divider} />

          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={!canEditRestricted}
              style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const, ...(canEditRestricted ? {} : { opacity: 0.55, cursor: "not-allowed" as const }) }} />
          </Field>

          {!isNew && myRole === "admin" && (
            <SensitiveInfoSection unitKind="trailer" unitId={trailer!.trailer_id} companyId={companyId} />
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" as const }}>
            {!isNew && canDelete && (
              <button style={{ ...css.btn("danger"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={deleteTrailer} disabled={saving}>Delete</button>
            )}
            {!isNew && canEditRestricted && (
              <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const,
                color: active ? T.warning : T.success, borderColor: active ? T.warning : T.success }}
                onClick={() => setActive(v => !v)} disabled={saving}>
                {active ? "Deactivate" : "Reactivate"}
              </button>
            )}
            <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={onClose}>Cancel</button>
            {saveCloseBtn}
          </div>
        </>
      )}

      <ServiceTypeListModal open={serviceOpen} onClose={() => setServiceOpen(false)} companyId={companyId} unit="trailer" />
    </Modal>
  );
}

export type { Truck, Trailer, OtherPermit, Compartment };
export { TruckCard, TrailerCard, TruckModal, TrailerModal };

