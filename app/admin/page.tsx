"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { startSetupSession } from "@/lib/setupSession";
import { supabase } from "@/lib/supabase/client";
import { fetchProductsCatalogCached } from "@/lib/queries/useProductsCatalog";
import { fetchTerminalsCatalogCached } from "@/lib/queries/useTerminalsCatalog";
import ComboEditModal from "@/lib/ui/driver/ComboEditModal";
import { TruckCard, TrailerCard, TruckModal, TrailerModal } from "@/lib/ui/driver/EquipmentDetails";
import type { Truck, Trailer, OtherPermit, Compartment } from "@/lib/ui/driver/EquipmentDetails";
import DecoupleModal from "@/app/planner/modals/DecoupleModal";
import NavMenu from "@/lib/ui/NavMenu";

import { T, css, fmtDate, expiryColor, daysUntil } from "@/lib/ui/driver/tokens";
import { Modal, Field, FieldRow, Banner, SubSectionTitle } from "@/lib/ui/driver/primitives";
import { MemberCard } from "@/lib/ui/driver/MemberCard";
import { DriverProfileModal } from "@/lib/ui/driver/DriverProfileModal";
import type { Member } from "@/lib/ui/driver/types";
import type { Role } from "@/lib/ui/driver/role";
import AdminLoadsModal from "./AdminLoadsModal";
import FleetCardsModal from "./FleetCardsModal";
import PayrollReportModal from "./PayrollReportModal";
import FleetUtilizationModal from "./FleetUtilizationModal";
import { useCompanySubscription, computeSeatCapacity, wouldExceedCapacity, type SeatCapacity } from "@/lib/billing/useCompanySubscription";

// Paginated fetch -- PostgREST/Supabase caps every response at a
// server-side "max rows" setting (confirmed live: 1000, unaffected by
// `.range()` on the client -- a request for rows 0-4999 still comes back
// with only 1000 rows and a 206 Partial Content). Several tables here
// (terminals: 1,238 rows as of this write, terminal_racks, rack_product_status)
// are past that cap, so a single unpaginated fetch silently truncates --
// this loops `.range()` in page-sized chunks until a page comes back
// short, which works regardless of whatever the server's actual cap is.
const FETCH_PAGE_SIZE = 1000;
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return all;
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

// Truck, Trailer, OtherPermit, Compartment — imported from EquipmentDetails

type Combo = {
  combo_id: string; combo_name: string; truck_id: string; trailer_id: string;
  tare_lbs: number; target_weight: number | null; active: boolean;
  claimed_by?: string | null;
  truck?: { truck_name: string } | { truck_name: string }[] | null;
  trailer?: { trailer_name: string } | { trailer_name: string }[] | null;
  in_use_by_name?: string | null;
};

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

function InviteModal({ companyId, seats, onClose, onDone }: { companyId: string; seats: SeatCapacity; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("driver");
  const [region, setRegion] = useState("");
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [status, setStatus] = useState<{ type: "error" | "success"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  // Region catalog for the datalist — the admin can pick an existing region or
  // type a new one. Setting it here stamps the invitee's profiles.region so the
  // equipment modal's Region filter defaults to it, no separate profile edit
  // needed after inviting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("equipment_regions")
        .select("name").eq("company_id", companyId).eq("is_active", true).order("name");
      if (!cancelled) setRegionOptions((data ?? []).map((r: any) => String(r.name)).filter(Boolean));
    })();
    return () => { cancelled = true; };
  }, [companyId]);
  // Informational only -- there's no live billing integration yet, so this
  // never actually blocks the invite, it just previews what a real one
  // would need to warn about (see lib/billing/useCompanySubscription.ts).
  const overCapacity = wouldExceedCapacity(seats, role);
  async function send() {
    if (!email.trim()) return; setLoading(true); setStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/invite", { method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), companyId, role, region: region.trim() || undefined }) });
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
      <Field label="Region">
        <input list="invite-region-options" value={region} onChange={e => setRegion(e.target.value)} style={css.input} placeholder="e.g. Southeast" />
        <datalist id="invite-region-options">{regionOptions.map(r => <option key={r} value={r} />)}</datalist>
      </Field>
      {overCapacity && (
        <div style={{
          fontSize: 12, fontWeight: 500, lineHeight: 1.6, color: "#fdba74",
          background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.22)",
          borderLeft: "3px solid #fb923c", borderRadius: "0 8px 8px 0", padding: "10px 12px", marginBottom: 16,
        }}>
          <strong style={{ color: "#fb923c" }}>⚠ Over your paid seat limit.</strong>{" "}
          {role === "admin"
            ? `You're using ${seats.usedAdminSeats} of ${seats.paidAdminSeats} admin seats.`
            : `You're using ${seats.usedOtherSeats} of ${seats.paidOtherSeats} team seats.`}{" "}
          This invite will need an additional seat added to your plan.
        </div>
      )}
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>If the user already has an account they'll be added immediately. New users receive a magic link.</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={css.btn("ghost")} onClick={onClose}>Cancel</button>
        <button style={css.btn("primary")} onClick={send} disabled={loading || !email.trim()}>{loading ? "Sending…" : overCapacity ? "Add Seat & Invite" : "Send Invite"}</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Truck Modal

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

function ProductSwatch({ buttonCode, hexCode, isDyed, size = "sm" }: {
  buttonCode: string | null; hexCode: string | null; isDyed?: boolean; size?: "sm" | "md";
}) {
  const color = hexCode ? `#${hexCode.replace("#", "")}` : "rgba(255,255,255,0.4)";
  const dim   = size === "md" ? 40 : 28;
  const fs    = size === "md" ? 13 : 10;
  return (
    <div style={{
      width: dim, height: dim, borderRadius: 8, flexShrink: 0,
      background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: isDyed ? "2px solid #ef4444" : `2px solid ${color}`,
      boxShadow: isDyed ? "0 0 0 1px rgba(239,68,68,0.3)" : "none",
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
                <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} isDyed={p.is_dyed} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
                    {p.product_name}
                    {p.is_dyed && <span style={{ color: "#ef4444", fontSize: 10, marginLeft: 5 }}>DYED</span>}
                    {p.is_out_of_stock && <span style={{ color: T.warning, fontSize: 10, marginLeft: 5 }}>OUT OF STOCK</span>}
                  </div>
                  {p.description && <div style={{ fontSize: 10, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.description}</div>}
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
// US state → default IANA timezone
// ─────────────────────────────────────────────────────────────
const STATE_TIMEZONES: Record<string, string> = {
  AL:"America/Chicago",AK:"America/Anchorage",AZ:"America/Phoenix",AR:"America/Chicago",
  CA:"America/Los_Angeles",CO:"America/Denver",CT:"America/New_York",DE:"America/New_York",
  FL:"America/New_York",GA:"America/New_York",HI:"Pacific/Honolulu",ID:"America/Denver",
  IL:"America/Chicago",IN:"America/Indiana/Indianapolis",IA:"America/Chicago",KS:"America/Chicago",
  KY:"America/New_York",LA:"America/Chicago",ME:"America/New_York",MD:"America/New_York",
  MA:"America/New_York",MI:"America/Detroit",MN:"America/Chicago",MS:"America/Chicago",
  MO:"America/Chicago",MT:"America/Denver",NE:"America/Chicago",NV:"America/Los_Angeles",
  NH:"America/New_York",NJ:"America/New_York",NM:"America/Denver",NY:"America/New_York",
  NC:"America/New_York",ND:"America/Chicago",OH:"America/New_York",OK:"America/Chicago",
  OR:"America/Los_Angeles",PA:"America/New_York",RI:"America/New_York",SC:"America/New_York",
  SD:"America/Chicago",TN:"America/Chicago",TX:"America/Chicago",UT:"America/Denver",
  VT:"America/New_York",VA:"America/New_York",WA:"America/Los_Angeles",WV:"America/New_York",
  WI:"America/Chicago",WY:"America/Denver",DC:"America/New_York",
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

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
  const [renewalDays, setRenewalDays] = useState(String(terminal?.renewal_days ?? "90"));
  const [active,      setActive]      = useState(terminal?.active ?? true);

  // City list for selected state, loaded from Supabase cities table
  const [citiesForState, setCitiesForState] = useState<{ city_id: string; city_name: string }[]>([]);
  const [cityId, setCityId] = useState<string | null>(terminal?.city_id ?? null);

  // Load cities when state changes
  useEffect(() => {
    if (!state) { setCitiesForState([]); return; }
    supabase.from("cities")
      .select("city_id, city_name")
      .eq("state_code", state)
      .eq("active", true)
      .order("city_name")
      .then(({ data }) => setCitiesForState(data ?? []));
  }, [state]);

  // Auto-set timezone when state changes (only if user hasn't manually overridden)
  const handleStateChange = (newState: string) => {
    setState(newState);
    const tz = STATE_TIMEZONES[newState];
    if (tz) setTimezone(tz);
    // Reset city when state changes
    setCity("");
    setCityId(null);
  };

  // When city selection changes, find the city_id
  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    const found = citiesForState.find(c => c.city_name === newCity);
    setCityId(found?.city_id ?? null);
  };

  // Products assigned — just an ordered list of product_ids (duplicates
  // allowed). Curation now lives on rack_product_status per rack, not a
  // terminal-wide table (see CLAUDE.md "rack-aware loading, unified") --
  // this legacy screen has no rack-picker UI at all, so it can only safely
  // edit a terminal that resolves to exactly one rack (targetRackId below).
  // Starts empty; seeded async once that rack is known (isNew has no rack
  // yet -- one gets created on save).
  const [assigned, setAssigned] = useState<string[]>([]);
  const [targetRackId, setTargetRackId] = useState<string | null>(null);
  const [terminalRackCount, setTerminalRackCount] = useState<number | null>(isNew ? 0 : null);

  useEffect(() => {
    if (isNew || !terminal) return;
    let cancelled = false;
    (async () => {
      const { data: racks } = await supabase
        .from("terminal_racks")
        .select("rack_id, created_at")
        .eq("terminal_id", terminal.terminal_id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = racks ?? [];
      setTerminalRackCount(rows.length);
      if (rows.length === 1) {
        const rackId = (rows[0] as any).rack_id as string;
        setTargetRackId(rackId);
        const { data: rps } = await supabase
          .from("rack_product_status")
          .select("product_id")
          .eq("rack_id", rackId)
          .eq("active", true);
        if (!cancelled) setAssigned((rps ?? []).map((r: any) => r.product_id));
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, terminal]);

  const [catalogOpen,   setCatalogOpen]   = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState<string | null>(null);

  function addFromCatalog(productId: string) {
    setAssigned(prev => [...prev, productId]);
  }

  function removeAssigned(idx: number) {
    setAssigned(prev => prev.filter((_, i) => i !== idx));
  }

  const filteredCatalog = allProducts.filter(p => {
    if (!catalogSearch.trim()) return true;
    const q = catalogSearch.toLowerCase();
    return [p.product_name, p.button_code, p.description, p.un_number].some(v => v?.toLowerCase().includes(q));
  });

  async function save() {
    if (!name.trim()) { setErr("Terminal name is required."); return; }
    if (!cityId && city.trim()) {
      // city typed manually but not in list — still allow, city_id will be null
    }
    setSaving(true); setErr(null);
    try {
      let tid = terminal?.terminal_id;
      const payload = {
        terminal_name: name.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        city_id: cityId ?? null,
        timezone: timezone.trim() || null,
        renewal_days: renewalDays ? parseInt(renewalDays) : null,
        active,
      };
      if (isNew) {
        const { data: newT, error: tErr } = await supabase.from("terminals").insert(payload).select("terminal_id").single();
        if (tErr) throw tErr;
        tid = newT.terminal_id;

        // Every terminal needs at least one rack now (see CLAUDE.md
        // "rack-aware loading, unified") -- this screen has no rack-picker
        // UI, so a brand-new terminal always gets one, generically named
        // the same way the backfill migration named every pre-existing
        // rackless terminal's default rack.
        const { data: newRack, error: rackErr } = await supabase
          .from("terminal_racks")
          .insert({ terminal_id: tid, rack_name: "Main Rack" })
          .select("rack_id")
          .single();
        if (rackErr) throw rackErr;

        if (assigned.length > 0) {
          const { error: pErr } = await supabase.from("rack_product_status").insert(
            assigned.map(productId => ({ rack_id: newRack.rack_id, product_id: productId, active: true }))
          );
          if (pErr) throw pErr;
        }
      } else {
        const { error: tErr } = await supabase.from("terminals").update(payload).eq("terminal_id", tid!);
        if (tErr) throw tErr;

        // Only sync product curation when this terminal resolves to exactly
        // one rack -- a genuinely multi-rack terminal's racks are curated
        // independently via the Terminal tab's Edit Terminal screen, and
        // this legacy form has no way to know which one the admin means
        // (the Products section below is hidden/disabled for that case, so
        // `assigned` should never have been touched, but guard here too).
        // Delete-then-reinsert, same as this screen's terminal_products
        // behavior before it -- note this does wipe last_api/last_temp_f
        // for this rack's products on every save, not just product-list
        // edits; that's pre-existing behavior carried over, not new.
        if (targetRackId) {
          await supabase.from("rack_product_status").delete().eq("rack_id", targetRackId);
          if (assigned.length > 0) {
            const { error: pErr } = await supabase.from("rack_product_status").insert(
              assigned.map(productId => ({ rack_id: targetRackId, product_id: productId, active: true }))
            );
            if (pErr) throw pErr;
          }
        }
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

  const sel = (val: string, onChange: (v: string) => void, opts: string[], ph = "") => (
    <select value={val} onChange={e => onChange(e.target.value)}
      style={{ ...css.input, ...sm }}>
      <option value="">{ph}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

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
        <div style={{ gridColumn: "1 / 3" }}>
          <label style={{ ...css.label, fontSize: 10 }}>State</label>
          {sel(state, handleStateChange, US_STATES, "Select state…")}
        </div>
        <div>
          <label style={{ ...css.label, fontSize: 10 }}>Renewal Days</label>
          {ti(renewalDays, setRenewalDays, "90", "number")}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ ...css.label, fontSize: 10 }}>City</label>
          {citiesForState.length > 0
            ? sel(city, handleCityChange, citiesForState.map(c => c.city_name), "Select city…")
            : ti(city, (v) => { setCity(v); setCityId(null); }, "City name")}
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ ...css.label, fontSize: 10 }}>Timezone (auto-set from state)</label>
          {ti(timezone, setTimezone, "America/New_York")}
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        <strong style={{ color: T.text }}>Active</strong> = terminal appears in the planner.
        The <em>Deactivate</em> button below hides it without revoking access.
      </div>

      <hr style={css.divider} />

      {/* ── Products ── */}
      {terminalRackCount != null && terminalRackCount > 1 ? (
        <div style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>
          This terminal has {terminalRackCount} racks, each with its own product list —
          manage them individually from the Terminal tab's Edit Terminal screen, not here.
        </div>
      ) : (
      <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <SubSectionTitle>Products at This Terminal</SubSectionTitle>
        <button type="button"
          style={{ ...css.btn("subtle"), fontSize: 12, padding: "8px 16px", minHeight: 36 }}
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
              const countIn = assigned.filter(id => id === p.product_id).length;
              return (
                <div key={p.product_id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px",
                    borderBottom: `1px solid ${T.border}22`, cursor: "pointer" }}
                  onClick={() => addFromCatalog(p.product_id)}>
                  <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} isDyed={p.is_dyed} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.product_name}</div>
                    {p.description && <div style={{ fontSize: 10, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.description}</div>}
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
        : assigned.map((productId, i) => {
          const p = allProducts.find(x => x.product_id === productId);
          if (!p) return null;
          return (
            <div key={`${productId}-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
                borderBottom: `1px solid ${T.border}22` }}>
              <ProductSwatch buttonCode={p.button_code} hexCode={p.hex_code} isDyed={p.is_dyed} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.product_name}</div>
                {p.description && <div style={{ fontSize: 10, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.description}</div>}
              </div>
              <button type="button" onClick={() => removeAssigned(i)}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.danger,
                  fontSize: 14, padding: "0 4px", flexShrink: 0, minWidth: 22, minHeight: 22,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          );
        })
      }
      </>
      )}

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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [myRole,        setMyRole]        = useState<string>("");
  const [companyName,   setCompanyName]   = useState<string>("");
  const [isSolo,        setIsSolo]        = useState<boolean>(false);
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
  const [equipOpen,      setEquipOpen]      = useState(false);
  const [equipTab,       setEquipTab]       = useState<"trucks"|"trailers"|"combos">("trucks");
  const [terminalsOpen,  setTerminalsOpen]  = useState(false);
  // keep for compat
  const trucksOpen   = equipOpen && equipTab === "trucks";
  const trailersOpen = equipOpen && equipTab === "trailers";
  const combosOpen   = equipOpen && equipTab === "combos";

  const [search,     setSearch]     = useState("");
  const [sortField,  setSortField]  = useState<SortField>("name");
  const [sortDir,    setSortDir]    = useState<SortDir>("asc");
  const [filterRole, setFilterRole] = useState<"" | "none" | Role>("none");

  const [truckFilter,   setTruckFilter]   = useState<ActiveFilter>("");
  const [truckSearch,   setTruckSearch]   = useState("");
  const [truckSort,     setTruckSort]     = useState("name:asc");
  const [trailerFilter, setTrailerFilter] = useState<ActiveFilter>("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [trailerSort,   setTrailerSort]   = useState("name:asc");
  const [comboSearch,   setComboSearch]   = useState("");

  const [inviteModal,  setInviteModal]  = useState(false);
  const [profileModal, setProfileModal] = useState<{ member: Member; onSaved: (u: Partial<Member>) => void } | null>(null);
  const [loadsModal, setLoadsModal] = useState<{ userId: string; displayName: string } | null>(null);
  const [fleetCardsOpen, setFleetCardsOpen] = useState(false);
  const [payrollReportOpen, setPayrollReportOpen] = useState(false);
  const [fleetUtilOpen, setFleetUtilOpen] = useState(false);
  const [truckModal,   setTruckModal]   = useState<Truck | null | "new">(null);
  const [trailerModal, setTrailerModal] = useState<Trailer | null | "new">(null);
  const [comboModal,   setComboModal]   = useState<Combo | null | "new">(null);
  const [comboEditModal, setComboEditModal] = useState<Combo | null>(null);
  const [decoupleOpen,    setDecoupleOpen]    = useState(false);
  const [decouplePending, setDecouplePending] = useState<{
    comboId: string; truckId: string; trailerId: string; truckName: string; trailerName: string;
  } | null>(null);
  const [coupleModal,  setCoupleModal]  = useState(false);
  const [terminalModal, setTerminalModal] = useState<Terminal | null | "new">(null);
  const [terminalSearch, setTerminalSearch] = useState("");

  // Seat usage -- see lib/billing/useCompanySubscription.ts. hasSubscription
  // is false for every company today (no billing integration live yet), so
  // this is invisible/no-op until a real subscription row exists.
  const { subscription } = useCompanySubscription(companyId);
  const seats = useMemo(
    () => computeSeatCapacity(members.map((m) => m.role), subscription),
    [members, subscription]
  );

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
      const { data: memRow } = await supabase.from("user_companies").select("role, company:companies(company_name, is_solo)").eq("user_id", uid).eq("company_id", cid).maybeSingle();
      setCompanyName((memRow?.company as any)?.company_name ?? "");
      setIsSolo(Boolean((memRow?.company as any)?.is_solo));
      const role = memRow?.role ?? "";
      setMyRole(role);
      if (role !== "admin" && role !== "lead" && role !== "dispatch") { setErr("Admin access required."); return; }

      // Members
      const { data: memberRows } = await supabase.from("user_companies").select("user_id, role").eq("company_id", cid);
      const memberIds = (memberRows ?? []).map((m: any) => m.user_id).filter(Boolean);
      const { data: profileRows } = memberIds.length > 0
        ? await supabase.rpc("get_display_names_full", { p_user_ids: memberIds })
        : { data: [] };
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
          .select("trailer_id, comp_number, max_gallons, position, cap_gallons").in("trailer_id", tIds).order("comp_number");
        for (const c of (compRows ?? []) as any[]) {
          if (!compMap[c.trailer_id]) compMap[c.trailer_id] = [];
          compMap[c.trailer_id].push({ comp_number: c.comp_number, max_gallons: c.max_gallons, position: c.position, cap_gallons: c.cap_gallons ?? null });
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
        const { data: cn } = await supabase.rpc("get_display_names", { p_user_ids: claimedIds });
        claimedNameMap = Object.fromEntries((cn ?? []).map((r: any) => [r.user_id, r.display_name ?? ""]));
      }

      setTrucks(truckRows as Truck[]);
      setTrailers(trailerRows.map((t: any) => ({ ...t, compartments: compMap[t.trailer_id] ?? [] })) as Trailer[]);
      setCombos(((comboRows ?? []) as any[]).map(c => ({ ...c, in_use_by_name: c.claimed_by ? claimedNameMap[c.claimed_by] ?? null : null })) as unknown as Combo[]);

      // Always load the full product catalog (needed for TerminalModal picker)
      // -- via the shared React Query cache (lib/queries/useProductsCatalog.ts)
      // instead of its own supabase.from("products") call. loadAll() is a
      // plain async function (not a component render path), so this goes
      // through fetchQuery rather than the useProductsCatalog() hook --
      // returns the cached catalog immediately if still fresh (loadAll()
      // reruns after every truck/trailer/terminal save via onDone callbacks,
      // so this now skips a full products refetch on most of those), or
      // fetches once and caches it otherwise. Active-only filter applied
      // client-side to preserve this file's exact prior behavior.
      const allCatalogProducts = await fetchProductsCatalogCached(queryClient);
      const prodRows = allCatalogProducts.filter((p) => p.active);
      setAllProducts(prodRows as Product[]);
      const prodMap: Record<string, Product> = Object.fromEntries(
        prodRows.map((p) => [p.product_id, p as unknown as Product])
      );

      // Terminals — no company gating, all active terminals are available.
      // Load all terminals with their products, via the shared cached
      // catalog (lib/queries/useTerminalsCatalog.ts) instead of this
      // file's own paginated fetch -- that shared fetcher already
      // preserves the same pagination fix this comment used to document
      // locally (the live catalog is 1,238+ terminals, well past
      // PostgREST's 1000-row cap).
      const termRows = await fetchTerminalsCatalogCached(queryClient);

      // Product curation now lives on rack_product_status per rack, not a
      // terminal-wide table (see CLAUDE.md "rack-aware loading, unified") --
      // this admin overview aggregates the DISTINCT active products across
      // ALL of a terminal's racks (union), a reasonable "what's offered here
      // overall" summary for a cross-rack list view. Fetched in full (not
      // `.in(bigIdList)`) -- an id-list filter over ~1,240 racks blows well
      // past PostgREST's URL length limit and 400s (confirmed live) --
      // these are small reference tables, cheap to fetch whole (paginated,
      // same reason as terminals above) and join client-side like
      // everything else in this file already does.
      const rackRows = await fetchAllRows<any>((from, to) =>
        supabase.from("terminal_racks").select("rack_id, terminal_id").range(from, to)
      );
      const terminalIdByRackId: Record<string, string> = {};
      for (const r of rackRows) terminalIdByRackId[r.rack_id] = r.terminal_id;

      const rpsRows = await fetchAllRows<any>((from, to) =>
        supabase
          .from("rack_product_status")
          .select("rack_id, product_id, active, is_out")
          .eq("active", true)
          .range(from, to)
      );

      const tpMap: Record<string, TerminalProduct[]> = {};
      const seenByTerminal: Record<string, Set<string>> = {};
      for (const rps of rpsRows) {
        const terminalId = terminalIdByRackId[rps.rack_id];
        if (!terminalId) continue;
        const p = prodMap[rps.product_id];
        if (!p) continue;
        const seen = (seenByTerminal[terminalId] ??= new Set());
        if (seen.has(rps.product_id)) continue; // already counted from another rack at this terminal
        seen.add(rps.product_id);
        (tpMap[terminalId] ??= []).push({
          product_id: rps.product_id, button_code: p.button_code,
          product_name: p.product_name, hex_code: p.hex_code,
          description: p.description, un_number: p.un_number,
          is_dyed: p.is_dyed ?? false,
          is_out_of_stock: rps.is_out ?? false,
          active: rps.active ?? true,
        });
      }

      setTerminals(termRows.map((t: any) => ({
        ...t,
        products: tpMap[t.terminal_id] ?? [],
      })) as Terminal[]);
    } catch (e: any) { setErr(e?.message ?? "Load failed."); }
    finally { setLoading(false); }
  }, [queryClient]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredMembers = useMemo(() => {
    let ms = [...members];
    if (filterRole && filterRole !== "none") ms = ms.filter(m => m.role === filterRole);
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

  function setupForUser(member: Member) {
    startSetupSession({
      targetUserId: member.user_id,
      targetDisplayName: member.display_name ?? member.email ?? member.user_id,
      adminUserId: currentUserId,
    });
    router.push("/planner");
  }

  if (loading) return <div style={{ ...css.page, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6 }}>Loading…</div>;
  if (err)     return <div style={css.page}><Banner msg={err} type="error" /></div>;

  const plusBtn: React.CSSProperties = {
    width: 36, height: 36, padding: 0, fontSize: 22, lineHeight: "1",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    background: "none", border: "none", cursor: "pointer",
    color: "rgba(255,255,255,0.45)",
    borderRadius: 10,
  };
  const filterRow: React.CSSProperties = { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" };

  return (
    <div style={css.page} className="admin-page-root">
      <div className="admin-header-row" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <NavMenu anchor="left" />
        <div><h1 style={css.heading}>{companyName}</h1><p style={css.subheading}>Company Admin</p></div>
      </div>

      {/* Square, large-tap-target tiles in a fixed 3-column grid -- replaces
          the old pill row, which ran off the right edge on mobile with no
          way to reach the later buttons or the hamburger (previously
          patched with a horizontal-scroll strip; this replaces that fix
          entirely rather than layering on top of it). Deliberately
          universal (not a mobile-only breakpoint) -- "no more than three
          wide" is a fixed layout choice regardless of viewport, not a
          responsive fallback, and it already scales cleanly to more
          buttons than the 4 here today (extra ones just start a new row). */}
      <div className="admin-header-btns" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 28 }}>
        {(myRole === "admin" || myRole === "dispatch") && (
          <button type="button" className="admin-header-tile" onClick={() => setFleetCardsOpen(true)}>
            Fleet Cards
          </button>
        )}
        {myRole === "admin" && (
          <button type="button" className="admin-header-tile" onClick={() => setPayrollReportOpen(true)}>
            Period Report
          </button>
        )}
        {(myRole === "admin" || myRole === "lead" || myRole === "dispatch") && (
          <button type="button" className="admin-header-tile" onClick={() => setFleetUtilOpen(true)}>
            Utilization
          </button>
        )}
      </div>

      {/* Every input/select/textarea on this page bumped to 16px on mobile:
          several inline styles set them as small as 11-12px, and iOS
          Safari auto-zooms the whole page on focusing any input under
          16px -- that's the "tapping things make the page do some kind of
          zoom thing." !important is deliberate here: it has to beat the
          inline style attribute, and only applies below the breakpoint
          where this Safari behavior is actually in play, so desktop's
          existing density is untouched. */}
      <style jsx global>{`
        .admin-header-tile {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 12px;
          font-size: 13px;
          font-weight: 800;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(135deg, #2a2a2c 0%, #1c1c1e 100%);
          box-shadow: 0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          cursor: pointer;
        }
        .admin-header-tile:hover { border-color: rgba(255,255,255,0.20); }
        @media (max-width: 768px) {
          .admin-page-root input,
          .admin-page-root select,
          .admin-page-root textarea {
            font-size: 16px !important;
          }
        }
      `}</style>

      {/* ── USERS (admin sees + manages; dispatch sees roster + Loads only, no invite/reassign/remove) ── */}
      {(myRole === "admin" || myRole === "dispatch") && (
        <>
          <section style={{ marginBottom: 32 }}>
            <div style={css.sectionHead}>
              <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", flex: 1 }} onClick={() => setUsersOpen(v => !v)}>
                <span style={{ transition: "transform 150ms", transform: usersOpen ? "rotate(90deg)" : "none", display: "inline-block", fontSize: 14 }}>›</span>
                Users ({members.length})
              </h2>
              {seats.hasSubscription && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 9px",
                    borderRadius: 999,
                    marginRight: 8,
                    color: seats.otherSeatsFull || seats.adminSeatsFull ? "#fb923c" : T.muted,
                    background: seats.otherSeatsFull || seats.adminSeatsFull ? "rgba(251,146,60,0.10)" : "rgba(255,255,255,0.05)",
                    whiteSpace: "nowrap" as const,
                  }}
                  title={`${seats.usedAdminSeats} of ${seats.paidAdminSeats} admin seats · ${seats.usedOtherSeats} of ${seats.paidOtherSeats} team seats`}
                >
                  {seats.usedAdminSeats + seats.usedOtherSeats} of {seats.paidAdminSeats + seats.paidOtherSeats} seats
                </span>
              )}
              {myRole === "admin" && !isSolo && <button style={plusBtn} onClick={() => setInviteModal(true)}>+</button>}
            </div>
            {myRole === "admin" && isSolo && (
              <p style={{ ...css.subheading, marginTop: 6 }}>Adding drivers needs a Fleet plan &mdash; contact us.</p>
            )}
            {usersOpen && (
              <>
                <div style={filterRow}>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, employee #…" style={{ ...css.input, flex: 1, minWidth: 140, padding: "7px 10px" }} />
                  <select value={filterRole} onChange={e => setFilterRole(e.target.value as "" | "none" | Role)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                    <option value="none">— Role —</option>
                    <option value="">All roles</option>
                    <option value="admin">Admin</option>
                    <option value="lead">Lead</option>
                    <option value="dispatch">Dispatch</option>
                    <option value="driver">Driver</option>
                  </select>
                  <select value={`${sortField}:${sortDir}`} onChange={e => { const [f, d] = e.target.value.split(":"); setSortField(f as SortField); setSortDir(d as SortDir); }} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                    <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                    <option value="role:asc">Role A→Z</option><option value="division:asc">Division A→Z</option>
                    <option value="region:asc">Region A→Z</option><option value="hire_date:asc">Hire ↑</option><option value="hire_date:desc">Hire ↓</option>
                  </select>
                </div>
                {filterRole === "none" && !search.trim() ? (
                  <div style={{ ...css.card, color: T.muted, fontSize: 13, textAlign: "center" as const }}>Search or select a role to find users.</div>
                ) : filteredMembers.length === 0 ? (
                  <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No members match your search.</div>
                ) : (
                  filteredMembers.map(m => (
                    <div key={m.user_id} style={{ position: "relative" }}>
                      <MemberCard
                        member={m} companyId={companyId!} onRefresh={loadAll}
                        onEditProfile={(member, onSaved) => setProfileModal({ member, onSaved })}
                        currentUserId={currentUserId}
                        hideRoleDropdown={myRole !== "admin"}
                        hideRemove={myRole !== "admin"}
                      />
                      {(myRole === "admin" || myRole === "dispatch") && m.user_id !== currentUserId && (
                        <div style={{ position: "absolute", bottom: 10, right: 12, display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setLoadsModal({ userId: m.user_id, displayName: m.display_name ?? m.email ?? m.user_id })}
                            style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", cursor: "pointer", whiteSpace: "nowrap" as const }}
                          >
                            {(() => {
                              // No last load info at this level — just show "Loads"
                              return "Loads";
                            })()}
                          </button>
                          {myRole === "admin" && (
                            <button
                              type="button"
                              onClick={() => setupForUser(m)}
                              style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.60)", cursor: "pointer", whiteSpace: "nowrap" as const }}
                            >
                              Set up planner →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </section>
          <hr style={css.divider} />
        </>
      )}

      {/* ── EQUIPMENT + TERMINALS (admin/lead only -- dispatch gets Users/Loads
           above but no equipment or terminal-catalog view/edit, per the
           permission matrix) ── */}
      {(myRole === "admin" || myRole === "lead") && (
      <>
      {/* ── EQUIPMENT (Trucks, Trailers, Combos) ── */}
      <section style={{ marginBottom: 32, marginTop: 28 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setEquipOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: equipOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Equipment
            <span style={{ fontWeight: 400, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              {trucks.filter(t=>t.active).length}T · {trailers.filter(t=>t.active).length}TL · {combos.filter(c=>c.active).length} Combos
            </span>
          </h2>
        </div>

        {equipOpen && (
          <>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 0, marginBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {([["trucks","Trucks",trucks.filter(t=>t.active).length],["trailers","Trailers",trailers.filter(t=>t.active).length],["combos","Combos",combos.filter(c=>c.active).length]] as const).map(([tab, label, count]) => (
                <button key={tab} type="button"
                  onClick={() => setEquipTab(tab)}
                  style={{ flex: 1, background: "none", border: "none", borderBottom: equipTab === tab ? "2px solid rgba(255,255,255,0.70)" : "2px solid transparent", cursor: "pointer", padding: "8px 4px", fontSize: 13, fontWeight: equipTab === tab ? 800 : 500, color: equipTab === tab ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.35)", transition: "all 150ms" }}>
                  {label} <span style={{ fontSize: 11, opacity: 0.6 }}>({count})</span>
                </button>
              ))}
            </div>

            {/* Trucks tab */}
            {equipTab === "trucks" && (
              <>
                <div style={{ ...filterRow, alignItems: "center" }}>
                  <input value={truckSearch} onChange={e => setTruckSearch(e.target.value)} placeholder="Search unit, VIN, region…" style={{ ...css.input, flex: 1, minWidth: 140, padding: "7px 10px" }} />
                  <select value={truckFilter} onChange={e => setTruckFilter(e.target.value as ActiveFilter)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                    <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                  <select value={truckSort} onChange={e => setTruckSort(e.target.value)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                    <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                    <option value="region:asc">Region A→Z</option><option value="status:asc">Status A→Z</option>
                  </select>
                  <button style={plusBtn} onClick={() => setTruckModal("new")} title="Add truck">+</button>
                </div>
                {!truckSearch && truckFilter === "" ? (
                  <div style={{ ...css.card, color: T.muted, fontSize: 13, textAlign: "center" as const }}>Search or filter to find trucks.</div>
                ) : filteredTrucks.length === 0 ? (
                  <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trucks match your filter.</div>
                ) : (
                  filteredTrucks.map(t => <TruckCard key={t.truck_id} truck={t} companyId={companyId!} onEdit={() => setTruckModal(t)} otherPermits={truckOtherPermits[t.truck_id]} />)
                )}
              </>
            )}

            {/* Trailers tab */}
            {equipTab === "trailers" && (
              <>
                <div style={{ ...filterRow, alignItems: "center" }}>
                  <input value={trailerSearch} onChange={e => setTrailerSearch(e.target.value)} placeholder="Search unit, VIN, region…" style={{ ...css.input, flex: 1, minWidth: 140, padding: "7px 10px" }} />
                  <select value={trailerFilter} onChange={e => setTrailerFilter(e.target.value as ActiveFilter)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                    <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                  <select value={trailerSort} onChange={e => setTrailerSort(e.target.value)} style={{ ...css.select, fontSize: 12, padding: "7px 8px" }}>
                    <option value="name:asc">Name A→Z</option><option value="name:desc">Name Z→A</option>
                    <option value="region:asc">Region A→Z</option>
                  </select>
                  <button style={plusBtn} onClick={() => setTrailerModal("new")} title="Add trailer">+</button>
                </div>
                {!trailerSearch && trailerFilter === "" ? (
                  <div style={{ ...css.card, color: T.muted, fontSize: 13, textAlign: "center" as const }}>Search or filter to find trailers.</div>
                ) : filteredTrailers.length === 0 ? (
                  <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No trailers match your filter.</div>
                ) : (
                  filteredTrailers.map(t => <TrailerCard key={t.trailer_id} trailer={t} companyId={companyId!} onEdit={() => setTrailerModal(t)} />)
                )}
              </>
            )}

            {/* Combos tab */}
            {equipTab === "combos" && (
              <>
                <div style={{ ...filterRow, alignItems: "center" }}>
                  <input value={comboSearch} onChange={e => setComboSearch(e.target.value)} placeholder="Search truck, trailer, driver…" style={{ ...css.input, flex: 1, minWidth: 140, padding: "7px 10px" }} />
                  <button style={plusBtn} onClick={() => setCoupleModal(true)} title="New combo">+</button>
                </div>
                {!comboSearch ? (
                  <div style={{ ...css.card, color: T.muted, fontSize: 13, textAlign: "center" as const }}>Search to find combos, or tap + to create one.</div>
                ) : filteredCombos.length === 0 ? (
                  <div style={{ ...css.card, color: T.muted, fontSize: 13 }}>No combos match your search.</div>
                ) : (
                  filteredCombos.map(c => <ComboCard key={c.combo_id} combo={c} onEdit={() => setComboEditModal(c)} />)
                )}
              </>
            )}
          </>
        )}
      </section>

      <hr style={css.divider} />

      {/* ── TERMINALS ── */}
      <section style={{ marginTop: 28, marginBottom: 32 }}>
        <div style={{ ...css.sectionHead, cursor: "pointer", userSelect: "none" }} onClick={() => setTerminalsOpen(v => !v)}>
          <h2 style={{ ...css.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ transition: "transform 150ms", transform: terminalsOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>›</span>
            Terminals
            <span style={{ fontWeight: 400, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              {terminals.filter(t=>t.active).length} active
            </span>
          </h2>
          <button style={plusBtn} onClick={e => { e.stopPropagation(); setTerminalModal("new"); }} title="Add terminal">+</button>
        </div>
        {terminalsOpen && (
          <>
            <div style={filterRow}>
              <input value={terminalSearch} onChange={e => setTerminalSearch(e.target.value)}
                placeholder="Search terminal name, city, state…"
                style={{ ...css.input, flex: 1, minWidth: 160, padding: "7px 10px" }} autoFocus />
            </div>
            {!terminalSearch.trim() ? (
              <div style={{ ...css.card, color: T.muted, fontSize: 13, textAlign: "center" as const }}>Type to search terminals.</div>
            ) : (() => {
              const filtered = terminals.filter(t => {
                const q = terminalSearch.toLowerCase();
                return [t.terminal_name, t.city, t.state].some(v => v?.toLowerCase().includes(q));
              });
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
      </>
      )}

      {/* ── Modals ── */}
      {inviteModal && myRole === "admin" && !isSolo && <InviteModal companyId={companyId!} seats={seats} onClose={() => setInviteModal(false)} onDone={() => { setInviteModal(false); loadAll(); }} />}
      {profileModal && <DriverProfileModal member={profileModal.member} companyId={companyId!} onClose={() => setProfileModal(null)} onDone={(u) => { profileModal.onSaved(u); setProfileModal(null); }} onRemove={() => { setProfileModal(null); loadAll(); }} />}
      {truckModal   && <TruckModal truck={truckModal === "new" ? null : truckModal} companyId={companyId!} onClose={() => setTruckModal(null)} onDone={() => { setTruckModal(null); loadAll(); }} myRole={myRole} />}
      {trailerModal && <TrailerModal trailer={trailerModal === "new" ? null : trailerModal} companyId={companyId!} onClose={() => setTrailerModal(null)} onDone={() => { setTrailerModal(null); loadAll(); }} myRole={myRole} />}
      {terminalModal && (
        <TerminalModal
          terminal={terminalModal === "new" ? null : terminalModal}
          companyId={companyId!}
          allProducts={allProducts}
          onClose={() => setTerminalModal(null)}
          onDone={() => { setTerminalModal(null); loadAll(); }}
        />
      )}
      {comboEditModal && (() => {
        const c = comboEditModal;
        const truckName   = Array.isArray(c.truck)   ? c.truck[0]?.truck_name   : c.truck?.truck_name;
        const trailerName = Array.isArray(c.trailer) ? c.trailer[0]?.trailer_name : c.trailer?.trailer_name;
        return (
          <ComboEditModal
            open={true}
            onClose={() => setComboEditModal(null)}
            combo={{ combo_id: c.combo_id, tare_lbs: c.tare_lbs, target_weight: c.target_weight ?? null, claimed_by: c.claimed_by }}
            truckName={truckName}
            trailerName={trailerName}
            claimedByName={c.in_use_by_name ?? null}
            onDecouple={() => {
              const truckName2   = Array.isArray(c.truck)   ? c.truck[0]?.truck_name   : c.truck?.truck_name;
              const trailerName2 = Array.isArray(c.trailer) ? c.trailer[0]?.trailer_name : c.trailer?.trailer_name;
              setDecouplePending({
                comboId:     c.combo_id,
                truckId:     c.truck_id,
                trailerId:   c.trailer_id,
                truckName:   truckName2   ?? c.truck_id,
                trailerName: trailerName2 ?? c.trailer_id,
              });
              setDecoupleOpen(true);
              setComboEditModal(null);
            }}
            onSaved={() => { loadAll(); }}
          />
        );
      })()}
      {decouplePending && (
        <DecoupleModal
          open={decoupleOpen}
          onClose={() => { setDecoupleOpen(false); setDecouplePending(null); }}
          comboId={decouplePending.comboId}
          truckId={decouplePending.truckId}
          trailerId={decouplePending.trailerId}
          truckName={decouplePending.truckName}
          trailerName={decouplePending.trailerName}
          companyId={companyId ?? ""}
          uncoupledTrucks={trucks.filter(t => t.active && t.truck_id !== decouplePending.truckId).map(t => ({ id: t.truck_id, name: t.truck_name }))}
          uncoupledTrailers={trailers.filter(t => t.active && t.trailer_id !== decouplePending.trailerId).map(t => ({ id: t.trailer_id, name: t.trailer_name }))}
          onDecoupled={() => { setDecoupleOpen(false); setDecouplePending(null); loadAll(); }}
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

      {loadsModal && (
        <AdminLoadsModal
          open={!!loadsModal}
          onClose={() => setLoadsModal(null)}
          targetUserId={loadsModal.userId}
          targetDisplayName={loadsModal.displayName}
        />
      )}
      <FleetCardsModal open={fleetCardsOpen} onClose={() => setFleetCardsOpen(false)} companyId={companyId!} />
      <PayrollReportModal open={payrollReportOpen} onClose={() => setPayrollReportOpen(false)} companyId={companyId!} />
      <FleetUtilizationModal open={fleetUtilOpen} onClose={() => setFleetUtilOpen(false)} companyId={companyId!} />
    </div>
  );
}
