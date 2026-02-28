"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

type Product = {
  product_id: string;
  product_name: string;
  button_code: string | null;
  hex_code: string | null;
  display_name: string | null;
  description: string | null;
  un_number: string | null;
  active: boolean;
};

type TerminalProduct = {
  terminal_product_id?: string;
  product_id: string;
  button_code: string | null;
  product_name: string;
  hex_code: string | null;
  description: string | null;
  un_number: string | null;
  red_dye: boolean;
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
// AttachmentBtn — tap to attach, preview, replace/remove
// Works on mobile (camera sheet) and desktop (file picker)
// ─────────────────────────────────────────────────────────────

function AttachmentBtn() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null); // PDF/doc — no image preview
    }
  }

  function openPicker() {
    if (file) { setShowPreview(true); return; }
    inputRef.current?.click();
  }

  function remove(e: React.MouseEvent) {
    e.stopPropagation();
    setFile(null); setPreview(null); setShowPreview(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const hasFile = !!file;

  return (
    <>
      {/* Hidden file input — accept=* so iOS shows camera+files sheet */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
        capture={undefined}  // Don't force camera — let browser/OS show the full share sheet
        style={{ display: "none" }}
        onChange={e => handleFile(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        title={hasFile ? `Attached: ${file!.name}` : "Attach file"}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center",
          color: hasFile ? T.accent : T.muted, fontSize: 13,
          WebkitTapHighlightColor: "transparent",
          minWidth: 22, minHeight: 22, justifyContent: "center",
        }}
        onClick={openPicker}
      >
        📎
      </button>

      {/* Preview overlay */}
      {showPreview && file && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setShowPreview(false)}
        >
          <div
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
              padding: 16, maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: T.text, marginBottom: 8,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {file.name}
            </div>
            {preview
              ? <img src={preview} alt="attachment" style={{ width: "100%", borderRadius: 8, marginBottom: 12 }} />
              : <div style={{ color: T.muted, fontSize: 12, marginBottom: 12, padding: "20px 0", textAlign: "center" as const }}>
                  📄 {file.name}
                </div>
            }
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={{ ...css.btn("subtle"), flex: 1, textAlign: "center" as const }}
                onClick={() => { setShowPreview(false); inputRef.current?.click(); }}
              >Replace</button>
              <button
                type="button"
                style={{ ...css.btn("danger"), flex: 1, textAlign: "center" as const }}
                onClick={remove}
              >Remove</button>
              <button
                type="button"
                style={{ ...css.btn("ghost"), flex: 1, textAlign: "center" as const }}
                onClick={() => setShowPreview(false)}
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



function PermitRow({ label, date, enforcement, extra }: {
  label: string; date: string | null; enforcement?: string | null; extra?: React.ReactNode;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [checked,   setChecked]   = useState(false);
  const days     = daysUntil(date);
  const color    = expiryColor(days);
  const enfDays  = enforcement != null ? daysUntil(enforcement) : null;
  const enfColor = expiryColor(enfDays);

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, paddingBottom: 4, marginBottom: 4 }}>
      {/* Entire main row tappable → fat-finger friendly */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 34, cursor: "pointer", userSelect: "none" as const }}
        onClick={() => setNotesOpen(v => !v)}
      >
        <span style={{ fontSize: 11, color: T.muted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {date
            ? <span style={{ fontSize: 11, color, fontWeight: days != null && days < 30 ? 600 : 400, whiteSpace: "nowrap" as const }}>{fmtExpiryInline(date, days)}</span>
            : <span style={{ fontSize: 11, color: T.muted }}>—</span>
          }
        </div>
        {/* Right controls — stop propagation so they don't double-fire expand */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <AttachmentBtn />
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 13, height: 13, accentColor: T.accent, cursor: "pointer", margin: "0 2px" }} />
          <button type="button" title="Details"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 8,
              minWidth: 20, minHeight: 20, WebkitTapHighlightColor: "transparent",
              transform: notesOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            onClick={e => { e.stopPropagation(); setNotesOpen(v => !v); }}>▼</button>
        </div>
      </div>
      {notesOpen && (
        <div style={{ paddingLeft: 4, paddingTop: 4 }}>
          {enforcement != null && enforcement && (
            <div style={{ fontSize: 11, color: enfColor, marginBottom: 3 }}>
              Enforcement: {fmtExpiryInline(enforcement, enfDays)}
            </div>
          )}
          {extra}
          <textarea placeholder="Notes…" rows={2}
            style={{ ...css.input, width: "100%", marginTop: 3, fontSize: 11, padding: "3px 6px", resize: "vertical" as const }} />
        </div>
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
  const [dropOpen, setDropOpen] = useState(false);
  const [checked,  setChecked]  = useState(false);
  const [noteText, setNoteText] = useState("");

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, padding: "3px 0" }}>
      {/* Main row — label side is tappable to expand; date input and icon cluster stop propagation */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32 }}>
        <span
          style={{ fontSize: 11, color: T.muted, width: 148, flexShrink: 0, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" as const, cursor: "pointer", userSelect: "none" as const }}
          onClick={() => setDropOpen(v => !v)}
        >{label}</span>
        <input type="date" value={expVal} onChange={e => onExpChange(e.target.value)}
          style={{ ...css.input, ...sm, flex: 1, minWidth: 0 }} />
        {/* 📎 · ☑ · ▼ */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <AttachmentBtn />
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 13, height: 13, accentColor: T.accent, cursor: "pointer", margin: "0 2px" }} />
          <button type="button" title="Details"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 8,
              minWidth: 20, minHeight: 20, WebkitTapHighlightColor: "transparent",
              transform: dropOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            onClick={() => setDropOpen(v => !v)}>▼</button>
        </div>
      </div>
      {dropOpen && (
        <div style={{ paddingLeft: 4, paddingTop: 5, display: "flex", flexDirection: "column" as const, gap: 5 }}>
          {onEnfChange !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: T.muted, width: 148, flexShrink: 0 }}>Enforcement Date</span>
              <input type="date" value={enfVal ?? ""} onChange={e => onEnfChange(e.target.value)}
                style={{ ...css.input, ...sm, flex: 1, minWidth: 0 }} />
              <span style={{ width: 62, flexShrink: 0 }} />
            </div>
          )}
          {extra}
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Notes…" rows={2}
            style={{ ...css.input, width: "100%", fontSize: 11, padding: "3px 6px", resize: "vertical" as const }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compartment editor
// ─────────────────────────────────────────────────────────────

function CompartmentEditor({ comps, onChange }: { comps: Compartment[]; onChange: (c: Compartment[]) => void }) {
  // Positions are always comp_number - 1 (0-indexed). Never exposed to user.
  function reIndex(arr: Compartment[]): Compartment[] {
    return arr.map((c, idx) => ({ ...c, comp_number: idx + 1, position: idx }));
  }
  function update(i: number, val: string) {
    onChange(reIndex(comps.map((c, idx) => idx === i ? { ...c, max_gallons: parseFloat(val) || 0 } : c)));
  }
  function add() { onChange(reIndex([...comps, { comp_number: 0, max_gallons: 0, position: 0 }])); }
  function remove(i: number) { onChange(reIndex(comps.filter((_, idx) => idx !== i))); }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 0.4 }}>COMPARTMENTS ({comps.length})</span>
        <button type="button" onClick={add} style={{ ...css.btn("subtle"), padding: "2px 10px", fontSize: 11 }}>+ Add</button>
      </div>
      {comps.length === 0 && <div style={{ fontSize: 11, color: T.muted, padding: "4px 0" }}>No compartments yet.</div>}
      {comps.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
          <div style={{ width: 18 }} />
          <span style={{ fontSize: 10, color: T.muted, flex: 1 }}>Max Capacity (gal)</span>
          <div style={{ width: 24 }} />
        </div>
      )}
      {comps.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
          <div style={{ width: 18, fontSize: 11, color: T.muted, textAlign: "center" as const, fontWeight: 700, flexShrink: 0 }}>{c.comp_number}</div>
          <input type="number" placeholder="Gallons" value={c.max_gallons || ""} onChange={e => update(i, e.target.value)}
            style={{ ...css.input, ...sm, flex: 1 }} />
          <button type="button" onClick={() => remove(i)}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, fontSize: 13, padding: "0 4px", flexShrink: 0, minWidth: 24, minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
  const statusColor = truck.status_code === "OOS" || truck.status_code === "MAINT" ? T.danger
    : truck.status_code === "AVAIL" ? T.success : T.muted;

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
  const statusColor = trailer.status_code === "OOS" || trailer.status_code === "MAINT" ? T.danger
    : trailer.status_code === "AVAIL" ? T.success : T.muted;

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
          {[
            { label: "V — Annual External Visual",  date: trailer.tank_v_expiration_date },
            { label: "K — Annual Leakage Test",     date: trailer.tank_k_expiration_date },
            { label: "L — Annual Lining Inspection",date: trailer.tank_l_expiration_date },
            { label: "T — 2 Year Thickness Test",   date: trailer.tank_t_expiration_date },
            { label: "I — 5 Year Internal Visual",  date: trailer.tank_i_expiration_date },
            { label: "P — 5 Year Pressure Test",    date: trailer.tank_p_expiration_date },
            { label: "UC — 5 Year Upper Coupler",   date: trailer.tank_uc_expiration_date },
          ].filter(r => !!r.date).map(r => (
            <PermitRow key={r.label} label={r.label} date={r.date} />
          ))}
          {![trailer.tank_v_expiration_date, trailer.tank_k_expiration_date, trailer.tank_l_expiration_date,
             trailer.tank_t_expiration_date, trailer.tank_i_expiration_date, trailer.tank_p_expiration_date,
             trailer.tank_uc_expiration_date].some(Boolean) && (
            <div style={{ fontSize: 11, color: T.muted, padding: "2px 0 6px" }}>No tank inspections on file.</div>
          )}
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
            <option value="AVAIL">AVAIL — Available</option>
            <option value="PARK">PARK — Parked</option>
            <option value="BOBTAIL">BOBTAIL — Bobtailing</option>
            <option value="MAINT">MAINT — Maintenance ⚠</option>
            <option value="INSP">INSP — Inspection</option>
            <option value="OOS">OOS — Out of Service ⚠</option>
          </select>
        </div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Status Location</label>{ti(statusLoc, setStatusLoc, "e.g. Yard 1")}</div>
      </div>
      {/* Active note — inline with label, no checkbox in identification grid */}
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        <strong style={{ color: T.text }}>Active</strong> = unit appears in fleet lists and can be coupled.{" "}
        <strong style={{ color: T.text }}>Status</strong> = physical/operational state. A unit can be Active but Parked.
        The <em>Deactivate</em> button below hides this unit from the fleet without deleting it.
      </div>

      <hr style={css.divider} />

      {/* ── Permit Book ── */}
      <SubSectionTitle>Permit Book</SubSectionTitle>
      <PermitEditRow label="Registration"              expVal={regExp}   onExpChange={setRegExp}   enfVal={regEnf}   onEnfChange={setRegEnf} />
      <PermitEditRow label="Annual Inspection"          expVal={insExp}   onExpChange={setInsExp}
        extra={
          <div style={{ display: "flex", gap: 6 }}>
            <input value={insShop} onChange={e => setInsShop(e.target.value)} placeholder="Inspection shop"
              style={{ ...css.input, ...sm, flex: 1 }} />
            <input type="date" value={insIssue} onChange={e => setInsIssue(e.target.value)}
              style={{ ...css.input, ...sm, width: 130, flexShrink: 0 }} />
          </div>
        }
      />
      <PermitEditRow label="IFTA Permits + Decals"     expVal={iftaExp}  onExpChange={setIftaExp}  enfVal={iftaEnf}  onEnfChange={setIftaEnf} />
      <PermitEditRow label="PHMSA HazMat Permit"       expVal={phmsaExp} onExpChange={setPhmsaExp} />
      <PermitEditRow label="Alliance HazMat Permit"    expVal={alliExp}  onExpChange={setAlliExp} />
      <PermitEditRow label="Fleet Insurance Cab Card"  expVal={fleetExp} onExpChange={setFleetExp} />
      <PermitEditRow label="HazMat Transportation Lic" expVal={hazLicExp} onExpChange={setHazLicExp} />
      <PermitEditRow label="Inner Bridge Permit"       expVal={ibExp}    onExpChange={setIbExp} />

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

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" as const }}>
        {!isNew && (
          <button style={{ ...css.btn("danger"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={deleteTruck} disabled={saving}>Delete</button>
        )}
        {!isNew && (
          <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const,
            color: active ? T.warning : T.success, borderColor: active ? T.warning : T.success }}
            onClick={() => setActive(v => !v)} disabled={saving}>
            {active ? "Deactivate" : "Reactivate"}
          </button>
        )}
        <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={onClose}>Cancel</button>
        <button style={{ ...css.btn("primary"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Truck" : "Save"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Trailer Modal — CG Max removed (always 1), condensed permits
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// TankEditRow — tank inspection row with − on left, 📎 ☑ ▼ on right
// ─────────────────────────────────────────────────────────────

function TankEditRow({ label, dateVal, onDateChange, onRemove }: {
  label: string; dateVal: string; onDateChange: (v: string) => void; onRemove: () => void;
}) {
  const [dropOpen, setDropOpen] = useState(false);
  const [checked,  setChecked]  = useState(false);
  const [noteText, setNoteText] = useState("");

  return (
    <div style={{ borderBottom: `1px solid ${T.border}22`, padding: "3px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32 }}>
        {/* − delete button on LEFT */}
        <button type="button" onClick={onRemove}
          style={{ background: "none", border: "none", cursor: "pointer", color: T.danger,
            fontSize: 16, padding: "0 2px", flexShrink: 0, lineHeight: 1,
            minWidth: 20, minHeight: 20, display: "flex", alignItems: "center", justifyContent: "center",
            WebkitTapHighlightColor: "transparent" }}>−</button>
        {/* Label — tappable to expand notes */}
        <span
          style={{ fontSize: 11, color: T.muted, flex: 1, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" as const, cursor: "pointer", userSelect: "none" as const }}
          onClick={() => setDropOpen(v => !v)}
        >{label}</span>
        <input type="date" value={dateVal} onChange={e => onDateChange(e.target.value)}
          style={{ ...css.input, ...sm, width: 130, flexShrink: 0 }} />
        {/* 📎 · ☑ · ▼ on RIGHT */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <AttachmentBtn />
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 13, height: 13, accentColor: T.accent, cursor: "pointer", margin: "0 2px" }} />
          <button type="button"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 8,
              minWidth: 20, minHeight: 20, WebkitTapHighlightColor: "transparent",
              transform: dropOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            onClick={() => setDropOpen(v => !v)}>▼</button>
        </div>
      </div>
      {dropOpen && (
        <div style={{ paddingLeft: 26, paddingTop: 4 }}>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Notes…" rows={2}
            style={{ ...css.input, width: "100%", fontSize: 11, padding: "3px 6px", resize: "vertical" as const }} />
        </div>
      )}
    </div>
  );
}

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
  const [tanks, setTanks] = useState<{ key: TankKey; date: string }[]>(() =>
    TANK_DEFS.filter(d => !!(trailer as any)?.[`tank_${d.key}_expiration_date`])
      .map(d => ({ key: d.key, date: (trailer as any)[`tank_${d.key}_expiration_date`] ?? "" }))
  );
  const [tankAddOpen, setTankAddOpen] = useState(false);
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
      tank_v_expiration_date:  tanks.find(t => t.key === "v")?.date  || null,
      tank_k_expiration_date:  tanks.find(t => t.key === "k")?.date  || null,
      tank_l_expiration_date:  tanks.find(t => t.key === "l")?.date  || null,
      tank_t_expiration_date:  tanks.find(t => t.key === "t")?.date  || null,
      tank_i_expiration_date:  tanks.find(t => t.key === "i")?.date  || null,
      tank_p_expiration_date:  tanks.find(t => t.key === "p")?.date  || null,
      tank_uc_expiration_date: tanks.find(t => t.key === "uc")?.date || null,
      notes: notes || null,
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
            <option value="AVAIL">AVAIL — Available</option>
            <option value="PARK">PARK — Parked / Stored</option>
            <option value="LOAD">LOAD — Loaded / Staged</option>
            <option value="CLEAN">CLEAN — Cleaning / Purge</option>
            <option value="MAINT">MAINT — Maintenance ⚠</option>
            <option value="INSP">INSP — Inspection</option>
            <option value="OOS">OOS — Out of Service ⚠</option>
          </select>
        </div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Status Location</label>{ti(statusLoc, setStatusLoc, "e.g. Yard 1")}</div>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        <strong style={{ color: T.text }}>Active</strong> = unit appears in fleet lists and can be coupled.{" "}
        <strong style={{ color: T.text }}>Status</strong> = physical/operational state. A unit can be Active but Parked.
        The <em>Deactivate</em> button below hides this unit from the fleet without deleting it.
      </div>

      <hr style={css.divider} />

      {/* ── Compartments ── */}
      <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
        <CompartmentEditor comps={comps} onChange={setComps} />
      </div>

      <hr style={css.divider} />

      {/* ── Permit Book ── */}
      <SubSectionTitle>Permit Book</SubSectionTitle>
      <PermitEditRow label="Trailer Registration" expVal={trRegExp} onExpChange={setTrRegExp} enfVal={trRegEnf} onEnfChange={setTrRegEnf} />
      <PermitEditRow label="Annual Inspection"    expVal={trInsExp} onExpChange={setTrInsExp}
        extra={
          <div style={{ display: "flex", gap: 6 }}>
            <input value={trInsShop} onChange={e => setTrInsShop(e.target.value)} placeholder="Inspection shop"
              style={{ ...css.input, ...sm, flex: 1 }} />
            <input type="date" value={trInsIssue} onChange={e => setTrInsIssue(e.target.value)}
              style={{ ...css.input, ...sm, width: 130, flexShrink: 0 }} />
          </div>
        }
      />

      <hr style={css.divider} />

      {/* ── Tank Inspections — dynamic ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <SubSectionTitle>Tank Inspections</SubSectionTitle>
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
                    onClick={() => { setTanks(prev => [...prev, { key: d.key, date: "" }]); setTankAddOpen(false); }}
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
      </div>
      {tanks.length === 0 && <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>No tank inspections added yet.</div>}
      {tanks.map((tank) => {
        const def = TANK_DEFS.find(d => d.key === tank.key)!;
        return (
          <TankEditRow
            key={tank.key}
            label={def.label}
            dateVal={tank.date}
            onDateChange={v => setTanks(prev => prev.map(t => t.key === tank.key ? { ...t, date: v } : t))}
            onRemove={() => setTanks(prev => prev.filter(t => t.key !== tank.key))}
          />
        );
      })}

      <hr style={css.divider} />

      <Field label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          style={{ ...css.input, width: "100%", fontSize: 12, resize: "vertical" as const }} />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" as const }}>
        {!isNew && (
          <button style={{ ...css.btn("danger"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={deleteTrailer} disabled={saving}>Delete</button>
        )}
        {!isNew && (
          <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const,
            color: active ? T.warning : T.success, borderColor: active ? T.warning : T.success }}
            onClick={() => setActive(v => !v)} disabled={saving}>
            {active ? "Deactivate" : "Reactivate"}
          </button>
        )}
        <button style={{ ...css.btn("ghost"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={onClose}>Cancel</button>
        <button style={{ ...css.btn("primary"), flex: "1 1 0", minWidth: 80, textAlign: "center" as const }} onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Trailer" : "Save"}</button>
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
      await supabase.from("trucks").update({ status_location: statusLoc, status_code: "AVAIL" }).eq("truck_id", truckId);
      await supabase.from("trailers").update({ status_location: statusLoc, status_code: "AVAIL" }).eq("trailer_id", trailerId);
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
// ProductSwatch — inline colored button code badge
// ─────────────────────────────────────────────────────────────

function ProductSwatch({ buttonCode, hexCode, redDye, size = "sm" }: {
  buttonCode: string | null; hexCode: string | null; redDye?: boolean; size?: "sm" | "md";
}) {
  const color = hexCode ? `#${hexCode.replace("#", "")}` : "rgba(255,255,255,0.4)";
  const dim   = size === "md" ? 40 : 28;
  const fs    = size === "md" ? 13 : 10;
  return (
    <div style={{
      width: dim, height: dim, borderRadius: 8, flexShrink: 0,
      background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: redDye ? "2px solid #ef4444" : `2px solid ${color}`,
      boxShadow: redDye ? "0 0 0 1px rgba(239,68,68,0.3)" : "none",
    }}>
      <span style={{ fontSize: fs, fontWeight: 900, color,
        letterSpacing: 0.3, lineHeight: 1 }}>
        {buttonCode ?? "?"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TerminalCard — matches user profile collapsed view
// Groups are rendered by the parent; this is the per-terminal row
// ─────────────────────────────────────────────────────────────

function TerminalRow({ terminal, onEdit }: { terminal: Terminal; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const products = terminal.products ?? [];

  return (
    <div style={{ borderLeft: `2px solid ${T.border}`, marginLeft: 8, marginBottom: 2 }}>
      <div onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 10px", cursor: "pointer", userSelect: "none" as const, borderRadius: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12, color: T.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {terminal.terminal_name}
          </span>
          {!terminal.active && (
            <span style={{ fontSize: 9, color: T.muted, fontWeight: 700,
              background: "rgba(255,255,255,0.06)", borderRadius: 3, padding: "1px 4px" }}>INACTIVE</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {terminal.renewal_days != null && (
            <span style={{ fontSize: 11, color: T.muted }}>{terminal.renewal_days}d</span>
          )}
          <span style={{ fontSize: 11, color: T.muted }}>
            {products.length} product{products.length !== 1 ? "s" : ""}
          </span>
          <button type="button" style={{ background: "none", border: "none", cursor: "pointer",
            color: T.muted, fontSize: 11, padding: "1px 6px", borderRadius: 4 }}
            onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          <span style={{ fontSize: 10, color: T.muted, transform: open ? "rotate(90deg)" : "none",
            transition: "transform 150ms", display: "inline-block" }}>›</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "4px 10px 8px 14px" }}>
          {products.length === 0
            ? <div style={{ fontSize: 11, color: T.muted }}>No products assigned.</div>
            : products.map((p, i) => (
              <div key={`${p.product_id}-${i}`}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0",
                  borderBottom: i < products.length - 1 ? `1px solid ${T.border}22` : "none" }}>
                <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} redDye={p.red_dye} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
                    {p.product_name}
                    {p.red_dye && <span style={{ color: "#ef4444", fontSize: 10, marginLeft: 5 }}>RED DYE</span>}
                    {p.is_out_of_stock && <span style={{ color: T.warning, fontSize: 10, marginLeft: 5 }}>OUT OF STOCK</span>}
                  </div>
                  {p.un_number && <div style={{ fontSize: 10, color: T.muted }}>UN {p.un_number}</div>}
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

function TerminalGroup({ cityState, terminals, onEdit }: {
  cityState: string; terminals: Terminal[]; onEdit: (t: Terminal) => void;
}) {
  const [open, setOpen] = useState(true);
  const activeCount = terminals.filter(t => t.active).length;

  return (
    <div style={{ marginBottom: 12 }}>
      <div onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", userSelect: "none" as const, padding: "4px 2px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: T.muted, transform: open ? "rotate(90deg)" : "none",
            transition: "transform 150ms", display: "inline-block" }}>›</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{cityState}</span>
        </div>
        <span style={{ fontSize: 11, color: T.muted }}>{activeCount} active</span>
      </div>
      {open && terminals.map(t => (
        <TerminalRow key={t.terminal_id} terminal={t} onEdit={() => onEdit(t)} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TerminalModal — add/edit terminal with product assignment
// ─────────────────────────────────────────────────────────────

function TerminalModal({ terminal, companyId, allProducts, onClose, onDone }: {
  terminal: Terminal | null; companyId: string; allProducts: Product[];
  onClose: () => void; onDone: () => void;
}) {
  const isNew = !terminal;

  const [name,        setName]        = useState(terminal?.terminal_name ?? "");
  const [city,        setCity]        = useState(terminal?.city ?? "");
  const [state,       setState]       = useState(terminal?.state ?? "");
  const [timezone,    setTimezone]    = useState(terminal?.timezone ?? "");
  const [renewalDays, setRenewalDays] = useState(String(terminal?.renewal_days ?? ""));
  const [active,      setActive]      = useState(terminal?.active ?? true);

  // Products assigned to this terminal — list of { product_id, red_dye, is_out_of_stock }
  const [assigned, setAssigned] = useState<{ product_id: string; red_dye: boolean; is_out_of_stock: boolean }[]>(
    (terminal?.products ?? []).map(p => ({ product_id: p.product_id, red_dye: p.red_dye, is_out_of_stock: p.is_out_of_stock }))
  );

  const [catalogOpen,  setCatalogOpen]  = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState<string | null>(null);

  function addFromCatalog(productId: string) {
    // Always add — same product can appear twice (clear + dyed)
    setAssigned(prev => [...prev, { product_id: productId, red_dye: false, is_out_of_stock: false }]);
  }

  function removeAssigned(idx: number) {
    setAssigned(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleRedDye(idx: number) {
    setAssigned(prev => prev.map((a, i) => i === idx ? { ...a, red_dye: !a.red_dye } : a));
  }

  const filteredCatalog = allProducts.filter(p => {
    if (!catalogSearch.trim()) return true;
    const q = catalogSearch.toLowerCase();
    return [p.product_name, p.button_code, p.description, p.un_number].some(v => v?.toLowerCase().includes(q));
  });

  async function save() {
    if (!name.trim()) { setErr("Terminal name is required."); return; }
    setSaving(true); setErr(null);
    try {
      let tid = terminal?.terminal_id;
      if (isNew) {
        const { data: newT, error: tErr } = await supabase.from("terminals").insert({
          terminal_name: name.trim(), city: city.trim() || null, state: state.trim() || null,
          timezone: timezone.trim() || null,
          renewal_days: renewalDays ? parseInt(renewalDays) : null, active,
        }).select("terminal_id").single();
        if (tErr) throw tErr;
        tid = newT.terminal_id;
      } else {
        const { error: tErr } = await supabase.from("terminals").update({
          terminal_name: name.trim(), city: city.trim() || null, state: state.trim() || null,
          timezone: timezone.trim() || null,
          renewal_days: renewalDays ? parseInt(renewalDays) : null, active,
        }).eq("terminal_id", tid!);
        if (tErr) throw tErr;
      }

      // Sync terminal_products — delete all then re-insert
      await supabase.from("terminal_products").delete().eq("terminal_id", tid!);
      if (assigned.length > 0) {
        const { error: pErr } = await supabase.from("terminal_products").insert(
          assigned.map(a => ({
            terminal_id: tid!, product_id: a.product_id,
            active: true, is_out_of_stock: a.is_out_of_stock,
            red_dye: a.red_dye,
          }))
        );
        if (pErr) throw pErr;
      }
      onDone();
    } catch (e: any) { setErr(e?.message ?? "Save failed."); }
    finally { setSaving(false); }
  }

  async function deleteTerminal() {
    if (!confirm("Deactivate this terminal? It will be hidden from drivers but products will be preserved.")) return;
    setSaving(true);
    await supabase.from("terminals").update({ active: false }).eq("terminal_id", terminal!.terminal_id);
    onDone();
  }

  const ti = (val: string, set: (v: string) => void, ph = "", type = "text") => (
    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
      style={{ ...css.input, ...sm }} />
  );

  return (
    <Modal title={isNew ? "Add Terminal" : "Edit Terminal"} onClose={onClose} wide>
      {err && <Banner msg={err} type="error" />}

      <SubSectionTitle>Location</SubSectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px 10px", marginBottom: 10 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ ...css.label, fontSize: 10 }}>Terminal Name</label>
          {ti(name, setName, "e.g. Port Tampa Bay Terminal")}
        </div>
        <div><label style={{ ...css.label, fontSize: 10 }}>City</label>{ti(city, setCity, "Tampa")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>State</label>{ti(state, setState, "FL")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Timezone</label>{ti(timezone, setTimezone, "America/New_York")}</div>
        <div><label style={{ ...css.label, fontSize: 10 }}>Renewal Days</label>{ti(renewalDays, setRenewalDays, "90", "number")}</div>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        <strong style={{ color: T.text }}>Active</strong> = terminal appears in the planner.
        The <em>Deactivate</em> button below hides it without revoking access.
      </div>

      <hr style={css.divider} />

      {/* ── Products ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <SubSectionTitle>Products at This Terminal</SubSectionTitle>
        <button type="button" style={{ ...css.btn("subtle"), fontSize: 11, padding: "2px 10px" }}
          onClick={() => { setCatalogOpen(v => !v); setCatalogSearch(""); }}>
          {catalogOpen ? "Close Catalog" : "+ Add from Catalog"}
        </button>
      </div>

      {/* Catalog picker */}
      {catalogOpen && (
        <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10,
          padding: "8px 10px", marginBottom: 10 }}>
          <input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
            placeholder="Search products…" style={{ ...css.input, width: "100%", marginBottom: 8, fontSize: 12, padding: "5px 8px" }} />
          <div style={{ maxHeight: 260, overflowY: "auto" as const }}>
            {filteredCatalog.length === 0 && <div style={{ fontSize: 11, color: T.muted }}>No products found.</div>}
            {filteredCatalog.map(p => {
              const countIn = assigned.filter(a => a.product_id === p.product_id).length;
              return (
                <div key={p.product_id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px",
                    borderBottom: `1px solid ${T.border}22`, cursor: "pointer" }}
                  onClick={() => addFromCatalog(p.product_id)}>
                  <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.product_name}</div>
                    {p.description && <div style={{ fontSize: 10, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.description}</div>}
                    {p.un_number && <div style={{ fontSize: 10, color: T.muted }}>UN {p.un_number}</div>}
                  </div>
                  <div style={{ fontSize: 10, color: countIn > 0 ? T.accent : T.muted, fontWeight: 700, flexShrink: 0 }}>
                    {countIn > 0 ? `✓ ×${countIn}` : "+ Add"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assigned products */}
      {assigned.length === 0
        ? <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>No products assigned yet.</div>
        : assigned.map((a, i) => {
          const p = allProducts.find(x => x.product_id === a.product_id);
          if (!p) return null;
          return (
            <div key={`${a.product_id}-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                borderBottom: `1px solid ${T.border}22` }}>
              <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} redDye={a.red_dye} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.product_name}</div>
                {p.un_number && <div style={{ fontSize: 10, color: T.muted }}>UN {p.un_number}</div>}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11,
                color: a.red_dye ? "#ef4444" : T.muted, flexShrink: 0 }}>
                <input type="checkbox" checked={a.red_dye} onChange={() => toggleRedDye(i)}
                  style={{ accentColor: "#ef4444", width: 12, height: 12 }} />
                Red dye
              </label>
              <button type="button" onClick={() => removeAssigned(i)}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.danger,
                  fontSize: 14, padding: "0 4px", flexShrink: 0, minWidth: 22, minHeight: 22,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          );
        })
      }

      <hr style={css.divider} />

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8, marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {!isNew && (
            <button style={{ ...css.btn("danger"), flex: "1 1 0", textAlign: "center" as const }}
              onClick={deleteTerminal} disabled={saving}>Remove</button>
          )}
          {!isNew && (
            <button style={{ ...css.btn("ghost"), flex: "1 1 0", textAlign: "center" as const,
              color: active ? T.warning : T.success, borderColor: active ? T.warning : T.success }}
              onClick={() => setActive(v => !v)} disabled={saving}>
              {active ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <button style={{ ...css.btn("ghost"), flex: "1 1 0", textAlign: "center" as const }}
            onClick={onClose}>Cancel</button>
        </div>
        <button style={{ ...css.btn("primary"), width: "100%", textAlign: "center" as const }}
          onClick={save} disabled={saving}>{saving ? "Saving…" : isNew ? "Add Terminal" : "Save"}</button>
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
  const [terminals,     setTerminals]     = useState<Terminal[]>([]);
  const [allProducts,   setAllProducts]   = useState<Product[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState<string | null>(null);

  const [usersOpen,      setUsersOpen]      = useState(false);
  const [trucksOpen,     setTrucksOpen]     = useState(false);
  const [trailersOpen,   setTrailersOpen]   = useState(false);
  const [combosOpen,     setCombosOpen]     = useState(false);
  const [terminalsOpen,  setTerminalsOpen]  = useState(false);

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
  const [terminalModal, setTerminalModal] = useState<Terminal | null | "new">(null);
  const [terminalSearch, setTerminalSearch] = useState("");

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

      // Always load the full product catalog (needed for TerminalModal picker)
      const { data: prodRows } = await supabase
        .from("products")
        .select("product_id, product_name, button_code, hex_code, display_name, description, un_number, active")
        .eq("active", true)
        .order("product_name");
      setAllProducts((prodRows ?? []) as Product[]);
      const prodMap: Record<string, Product> = Object.fromEntries(
        (prodRows ?? []).map((p: any) => [p.product_id, p as Product])
      );

      // Terminals — no company gating, all active terminals are available
      // Load all terminals with their products
      const { data: termRows } = await supabase
        .from("terminals")
        .select("terminal_id, terminal_name, city, state, city_id, timezone, active, renewal_days, lat, lon")
        .order("state").order("city").order("terminal_name");

      const termIds = (termRows ?? []).map((t: any) => t.terminal_id);

      const { data: tpRows } = termIds.length > 0
        ? await supabase
            .from("terminal_products")
            .select("terminal_id, product_id, active, is_out_of_stock, red_dye")
            .in("terminal_id", termIds)
            .eq("active", true)
        : { data: [] };

      const tpMap: Record<string, TerminalProduct[]> = {};
      for (const tp of (tpRows ?? []) as any[]) {
        const p = prodMap[tp.product_id];
        if (!p) continue;
        if (!tpMap[tp.terminal_id]) tpMap[tp.terminal_id] = [];
        tpMap[tp.terminal_id].push({
          product_id: tp.product_id, button_code: p.button_code,
          product_name: p.product_name, hex_code: p.hex_code,
          description: p.description, un_number: p.un_number,
          red_dye: tp.red_dye ?? false, is_out_of_stock: tp.is_out_of_stock ?? false,
          active: tp.active ?? true,
        });
      }

      setTerminals((termRows ?? []).map((t: any) => ({
        ...t,
        products: tpMap[t.terminal_id] ?? [],
      })) as Terminal[]);
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

      <hr style={css.divider} />

      {/* ── TERMINALS ── */}
      <section style={{ marginTop: 28, marginBottom: 32 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setTerminalsOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: terminalsOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Terminals ({terminals.length}{terminals.filter(t => t.active).length < terminals.length ? `, ${terminals.filter(t=>t.active).length} active` : " active"})
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTerminalModal("new"); }}>+</button>
        </div>
        {terminalsOpen && (
          <>
            <div style={filterRow}>
              <input value={terminalSearch} onChange={e => setTerminalSearch(e.target.value)}
                placeholder="Search terminal name, city, state…"
                style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} />
            </div>
            {(() => {
              const filtered = terminals.filter(t => {
                if (!terminalSearch.trim()) return true;
                const q = terminalSearch.toLowerCase();
                return [t.terminal_name, t.city, t.state].some(v => v?.toLowerCase().includes(q));
              });
              // Group by state + city
              const groups: Record<string, Terminal[]> = {};
              for (const t of filtered) {
                const key = [t.state, t.city].filter(Boolean).join(", ") || "Unknown";
                if (!groups[key]) groups[key] = [];
                groups[key].push(t);
              }
              if (filtered.length === 0) return <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No terminals match your search.</div>;
              return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([group, ts]) => (
                <TerminalGroup key={group} cityState={group} terminals={ts} onEdit={t => setTerminalModal(t)} />
              ));
            })()}
          </>
        )}
      </section>

      {/* ── Modals ── */}
      {inviteModal  && <InviteModal companyId={companyId!} onClose={() => setInviteModal(false)} onDone={() => { setInviteModal(false); loadAll(); }} />}
      {profileModal && <DriverProfileModal member={profileModal.member} companyId={companyId!} onClose={() => setProfileModal(null)} onDone={(u) => { profileModal.onSaved(u); setProfileModal(null); }} onRemove={() => { setProfileModal(null); loadAll(); }} />}
      {truckModal   && <TruckModal truck={truckModal === "new" ? null : truckModal} companyId={companyId!} onClose={() => setTruckModal(null)} onDone={() => { setTruckModal(null); loadAll(); }} />}
      {trailerModal && <TrailerModal trailer={trailerModal === "new" ? null : trailerModal} companyId={companyId!} onClose={() => setTrailerModal(null)} onDone={() => { setTrailerModal(null); loadAll(); }} />}
      {terminalModal && (
        <TerminalModal
          terminal={terminalModal === "new" ? null : terminalModal}
          companyId={companyId!}
          allProducts={allProducts}
          onClose={() => setTerminalModal(null)}
          onDone={() => { setTerminalModal(null); loadAll(); }}
        />
      )}
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
