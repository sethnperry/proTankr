"use client";
// modals/RecordHistoryModal.tsx
//
// Service/Wash history view -- equipment-settings-spec.md §5. Tapping the
// "Service" or "Washed on" report line on the main Equipment modal opens
// this (a full chronological list), not the record-creation modal directly.
//
// Rows are flattened to one row per unit per record (not merged into a
// "Both" group) but still visually grouped under a date header. A record
// whose service type doesn't apply to its own unit (see applies_to on
// service_types -- e.g. a miles-interval type logged on a trailer, or a
// trailer-only type logged on a truck) only exists because it tagged along
// on a "Both" service with the other unit, so its collapsed line calls that
// out directly ("Wet (with Truck 25184)") instead of showing a bogus due-at
// calculation.
//
// Only one row is ever expanded at a time -- expanding reveals shop/
// location/notes plus the due/reading line, and a bottom action bar
// (Edit/Delete) appears for that one row. This is the solo tier, so the
// driver has full read/write/delete control here (RLS already allows it);
// gating this to admin-only is a fleet-tier follow-up, not implemented yet.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import { CustomSelect } from "@/lib/ui/CustomSelect";

export type RecordHistoryKind = "service" | "wash";

type ServiceRecordRaw = {
  service_record_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  service_type_id: string;
  date: string;
  shop_name: string | null;
  location: string | null;
  reading_value: number | null;
  notes: string | null;
  created_by: string | null;
};
type WashRecordRaw = {
  wash_record_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  location: string | null;
  washed_at: string;
  notes: string | null;
  created_by: string | null;
};
type ServiceTypeRaw = {
  service_type_id: string;
  name: string;
  interval_kind: "miles" | "hours" | "duration" | "none";
  interval_value: number | null;
  applies_to: "truck" | "trailer" | "both";
  is_active: boolean;
};

type UnitRef = { id: string; label: "Truck" | "Trailer"; name: string };

type ServiceRow = {
  id: string;
  date: string;
  unit: UnitRef;
  serviceTypeId: string;
  typeName: string;
  companion: UnitRef | null; // set when this record only exists because it tagged along with the other unit
  readingValue: number | null;
  shopName: string | null;
  location: string | null;
  notes: string | null;
  createdBy: string | null;
};

type WashRow = {
  id: string;
  date: string; // washed_at
  unit: UnitRef;
  location: string | null;
  notes: string | null;
  createdBy: string | null;
};

const DATE_RANGES: { label: string; days: number | null }[] = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: null },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const yr = String(d.getFullYear()).slice(2);
  return `${mo}/${dy}/${yr}`;
}
function fmtDateHeader(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// Detail line shown only when a row is expanded -- null when there's
// nothing meaningful to add beyond the collapsed line (companion rows, or
// a type with no interval at all).
function dueDetailLine(row: ServiceRow, type: ServiceTypeRaw | undefined): string | null {
  if (row.companion) return null;
  if (!type || type.interval_kind === "none" || type.interval_value == null) return null;
  if (type.interval_kind === "duration") {
    const due = new Date(row.date);
    due.setDate(due.getDate() + type.interval_value);
    return `Next due ${fmtDate(due.toISOString())}`;
  }
  if (row.readingValue == null) return "Reading not recorded";
  const unitWord = type.interval_kind === "miles" ? "mi" : "hrs";
  const next = row.readingValue + type.interval_value;
  return `${row.readingValue.toLocaleString()} ${unitWord} · next due ${next.toLocaleString()} ${unitWord}`;
}

function buildShareText(kind: RecordHistoryKind, serviceRows: ServiceRow[], washRows: WashRow[], title: string): string {
  const divider = "─".repeat(40);
  const lines: string[] = [title.toUpperCase(), divider];
  let lastDate = "";

  if (kind === "service") {
    for (const row of serviceRows) {
      if (row.date !== lastDate) { lines.push(fmtDate(row.date)); lastDate = row.date; }
      const typePart = row.companion ? `${row.typeName} (with ${row.companion.label} ${row.companion.name})` : row.typeName;
      lines.push(`  ${row.unit.label} ${row.unit.name} · ${typePart}`);
      const shopLoc = [row.shopName, row.location].filter(Boolean).join(" · ");
      if (shopLoc) lines.push(`    ${shopLoc}`);
      if (row.notes) lines.push(`    ${row.notes}`);
    }
  } else {
    for (const row of washRows) {
      if (row.date.slice(0, 10) !== lastDate) { lines.push(fmtDate(row.date)); lastDate = row.date.slice(0, 10); }
      lines.push(`  ${row.unit.label} ${row.unit.name}${row.location ? `  ·  ${row.location}` : ""}`);
      if (row.notes) lines.push(`    ${row.notes}`);
    }
  }
  return lines.join("\n");
}

function shareViaClipboard(text: string, onCopied: () => void) {
  navigator.clipboard.writeText(text).then(onCopied).catch(() => window.prompt("Copy this report:", text));
}
function shareViaSMS(text: string) {
  window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
}
function shareViaEmail(subject: string, text: string) {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

const editInputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 13, boxSizing: "border-box",
};
const editLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" };

type Props = {
  open: boolean;
  onClose: () => void;
  kind: RecordHistoryKind;
  title: string;
  companyId: string;
  truckId: string | null;
  trailerId: string | null;
  trucks: { truck_id: string; truck_name: string }[];
  trailers: { trailer_id: string; trailer_name: string }[];
  onChanged?: () => void; // fired after an edit/delete so the parent can refresh its report lines
};

export default function RecordHistoryModal({ open, onClose, kind, title, companyId, truckId, trailerId, trucks, trailers, onChanged }: Props) {
  const [search, setSearch] = useState("");
  const [activeDays, setActiveDays] = useState<number | null>(90);
  const [copied, setCopied] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([]);
  const [washRows, setWashRows] = useState<WashRow[]>([]);
  const [types, setTypes] = useState<ServiceTypeRaw[]>([]);
  const [namesByUserId, setNamesByUserId] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteOverlay, setNoteOverlay] = useState<string | null>(null);

  // service edit fields
  const [editTypeId, setEditTypeId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editReading, setEditReading] = useState("");
  const [editShop, setEditShop] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  // wash edit fields
  const [editWashedAt, setEditWashedAt] = useState("");
  const [editWashLocation, setEditWashLocation] = useState("");
  const [editWashNotes, setEditWashNotes] = useState("");

  const truckName = (id: string) => trucks.find((t) => t.truck_id === id)?.truck_name ?? "Truck";
  const trailerName = (id: string) => trailers.find((t) => t.trailer_id === id)?.trailer_name ?? "Trailer";

  // Equipment logs are shared fleet-wide (any company member can see who
  // logged what, not just their own entries) -- created_by is already
  // captured on every insert, this just resolves it to a display name.
  async function resolveCreatedByNames(userIds: (string | null)[]) {
    const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
    const missing = ids.filter((id) => !(id in namesByUserId));
    if (missing.length === 0) return;
    const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: missing });
    const next: Record<string, string> = {};
    for (const row of (data ?? []) as any[]) {
      if (row?.user_id) next[row.user_id] = row.display_name ?? "Unknown";
    }
    setNamesByUserId((prev) => ({ ...prev, ...next }));
  }

  // Selecting "All" (date range) also broadens scope to every truck/trailer
  // in the company, not just the currently selected pair.
  const allEquipment = activeDays === null;

  function closeExpanded() {
    setExpandedId(null);
    setEditing(false);
    setConfirmingDelete(false);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: typesData } = await supabase
        .from("service_types")
        .select("service_type_id, name, interval_kind, interval_value, applies_to, is_active")
        .eq("company_id", companyId);
      const allTypes = (typesData ?? []) as ServiceTypeRaw[];
      setTypes(allTypes);
      const typeById = new Map(allTypes.map((t) => [t.service_type_id, t]));

      if (kind === "service") {
        let records: ServiceRecordRaw[];
        const cols = "service_record_id, truck_id, trailer_id, service_type_id, date, shop_name, location, reading_value, notes, created_by";
        if (allEquipment) {
          const { data, error: e } = await supabase.from("service_records").select(cols).eq("company_id", companyId);
          if (e) throw e;
          records = (data ?? []) as ServiceRecordRaw[];
        } else {
          const [{ data: t, error: e1 }, { data: tr, error: e2 }] = await Promise.all([
            truckId ? supabase.from("service_records").select(cols).eq("truck_id", truckId) : Promise.resolve({ data: [] as ServiceRecordRaw[], error: null }),
            trailerId ? supabase.from("service_records").select(cols).eq("trailer_id", trailerId) : Promise.resolve({ data: [] as ServiceRecordRaw[], error: null }),
          ]);
          if (e1) throw e1;
          if (e2) throw e2;
          records = [...((t ?? []) as ServiceRecordRaw[]), ...((tr ?? []) as ServiceRecordRaw[])];
        }

        // Group by date+type first to find companion siblings, before
        // flattening -- a record's "done alongside" partner is whichever
        // other unit shares its date and service_type_id.
        const byDateType = new Map<string, ServiceRecordRaw[]>();
        for (const r of records) {
          const key = `${r.date}|${r.service_type_id}`;
          if (!byDateType.has(key)) byDateType.set(key, []);
          byDateType.get(key)!.push(r);
        }

        const rows: ServiceRow[] = records.map((r) => {
          const unit: UnitRef = r.truck_id
            ? { id: r.truck_id, label: "Truck", name: truckName(r.truck_id) }
            : { id: r.trailer_id!, label: "Trailer", name: trailerName(r.trailer_id!) };
          const type = typeById.get(r.service_type_id);
          const mismatched = !!type && type.applies_to !== "both" && type.applies_to !== unit.label.toLowerCase();
          let companion: UnitRef | null = null;
          if (mismatched) {
            const siblings = byDateType.get(`${r.date}|${r.service_type_id}`) ?? [];
            const other = siblings.find((s) => s.service_record_id !== r.service_record_id);
            if (other) {
              companion = other.truck_id
                ? { id: other.truck_id, label: "Truck", name: truckName(other.truck_id) }
                : { id: other.trailer_id!, label: "Trailer", name: trailerName(other.trailer_id!) };
            }
          }
          return {
            id: r.service_record_id, date: r.date, unit,
            serviceTypeId: r.service_type_id, typeName: type?.name ?? "Service", companion,
            readingValue: r.reading_value, shopName: r.shop_name, location: r.location, notes: r.notes,
            createdBy: r.created_by,
          };
        }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.unit.label === "Truck" ? -1 : 1)));

        setServiceRows(rows);
        void resolveCreatedByNames(rows.map((r) => r.createdBy));
      } else {
        let records: WashRecordRaw[];
        const cols = "wash_record_id, truck_id, trailer_id, location, washed_at, notes, created_by";
        if (allEquipment) {
          const { data, error: e } = await supabase.from("wash_records").select(cols).eq("company_id", companyId);
          if (e) throw e;
          records = (data ?? []) as WashRecordRaw[];
        } else {
          const [{ data: t, error: e1 }, { data: tr, error: e2 }] = await Promise.all([
            truckId ? supabase.from("wash_records").select(cols).eq("truck_id", truckId) : Promise.resolve({ data: [] as WashRecordRaw[], error: null }),
            trailerId ? supabase.from("wash_records").select(cols).eq("trailer_id", trailerId) : Promise.resolve({ data: [] as WashRecordRaw[], error: null }),
          ]);
          if (e1) throw e1;
          if (e2) throw e2;
          records = [...((t ?? []) as WashRecordRaw[]), ...((tr ?? []) as WashRecordRaw[])];
        }

        const rows: WashRow[] = records.map((r) => {
          const unit: UnitRef = r.truck_id
            ? { id: r.truck_id, label: "Truck", name: truckName(r.truck_id) }
            : { id: r.trailer_id!, label: "Trailer", name: trailerName(r.trailer_id!) };
          return { id: r.wash_record_id, date: r.washed_at, unit, location: r.location, notes: r.notes, createdBy: r.created_by };
        }).sort((a, b) => (a.date < b.date ? 1 : -1));

        setWashRows(rows);
        void resolveCreatedByNames(rows.map((r) => r.createdBy));
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setSearch("");
    closeExpanded();
    setTimeout(() => searchRef.current?.focus(), 180);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, truckId, trailerId, companyId, allEquipment]);

  useEffect(() => {
    if (!reportMenuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (reportRef.current && !reportRef.current.contains(e.target as Node)) setReportMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [reportMenuOpen]);

  const filteredService = useMemo(() => {
    let list = serviceRows;
    if (activeDays != null) {
      const cutoff = Date.now() - activeDays * 86400000;
      list = list.filter((r) => new Date(r.date).getTime() >= cutoff);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      r.typeName.toLowerCase().includes(q) ||
      r.unit.name.toLowerCase().includes(q) ||
      (r.shopName ?? "").toLowerCase().includes(q) ||
      (r.location ?? "").toLowerCase().includes(q)
    );
  }, [serviceRows, activeDays, search]);

  const filteredWash = useMemo(() => {
    let list = washRows;
    if (activeDays != null) {
      const cutoff = Date.now() - activeDays * 86400000;
      list = list.filter((r) => new Date(r.date).getTime() >= cutoff);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.unit.name.toLowerCase().includes(q) || (r.location ?? "").toLowerCase().includes(q));
  }, [washRows, activeDays, search]);

  const serviceByDate = useMemo(() => {
    const map = new Map<string, ServiceRow[]>();
    for (const r of filteredService) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    }
    return Array.from(map.entries());
  }, [filteredService]);

  const washByDate = useMemo(() => {
    const map = new Map<string, WashRow[]>();
    for (const r of filteredWash) {
      const day = r.date.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(r);
    }
    return Array.from(map.entries());
  }, [filteredWash]);

  const totalCount = kind === "service" ? filteredService.length : filteredWash.length;
  const hasAny = totalCount > 0;

  function handleCopy() {
    shareViaClipboard(buildShareText(kind, filteredService, filteredWash, title), () => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
    setReportMenuOpen(false);
  }
  function handleSMS() { shareViaSMS(buildShareText(kind, filteredService, filteredWash, title)); setReportMenuOpen(false); }
  function handleEmail() { shareViaEmail(title, buildShareText(kind, filteredService, filteredWash, title)); setReportMenuOpen(false); }

  function openRow(id: string) {
    if (expandedId === id) { closeExpanded(); return; }
    setExpandedId(id);
    setEditing(false);
    setConfirmingDelete(false);
  }

  function startEditService(row: ServiceRow) {
    setEditTypeId(row.serviceTypeId);
    setEditDate(row.date);
    setEditReading(row.readingValue != null ? String(row.readingValue) : "");
    setEditShop(row.shopName ?? "");
    setEditLocation(row.location ?? "");
    setEditNotes(row.notes ?? "");
    setEditing(true);
  }
  function startEditWash(row: WashRow) {
    setEditWashedAt(new Date(row.date).toISOString().slice(0, 16));
    setEditWashLocation(row.location ?? "");
    setEditWashNotes(row.notes ?? "");
    setEditing(true);
  }

  async function saveServiceEdit(row: ServiceRow) {
    setBusy(true);
    setError(null);
    try {
      const type = types.find((t) => t.service_type_id === editTypeId);
      const needsReading = type?.interval_kind === "miles" || type?.interval_kind === "hours";
      if (needsReading && !editReading.trim()) throw new Error("Enter the reading for this interval.");
      const { error: e } = await supabase.from("service_records").update({
        service_type_id: editTypeId,
        date: editDate,
        reading_value: needsReading ? Number(editReading) : null,
        shop_name: editShop || null,
        location: editLocation || null,
        notes: editNotes || null,
      }).eq("service_record_id", row.id);
      if (e) throw e;
      closeExpanded();
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWashEdit(row: WashRow) {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.from("wash_records").update({
        washed_at: new Date(editWashedAt).toISOString(),
        location: editWashLocation || null,
        notes: editWashNotes || null,
      }).eq("wash_record_id", row.id);
      if (e) throw e;
      closeExpanded();
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord(id: string) {
    setBusy(true);
    setError(null);
    try {
      const table = kind === "service" ? "service_records" : "wash_records";
      const col = kind === "service" ? "service_record_id" : "wash_record_id";
      const { error: e } = await supabase.from(table).delete().eq(col, id);
      if (e) throw e;
      closeExpanded();
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete record.");
    } finally {
      setBusy(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const expandedServiceRow = kind === "service" ? filteredService.find((r) => r.id === expandedId) ?? null : null;
  const expandedWashRow = kind === "wash" ? filteredWash.find((r) => r.id === expandedId) ?? null : null;
  const hasExpanded = !!(expandedServiceRow || expandedWashRow);

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 10px", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 }}>{title}</div>
            {!loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>{totalCount}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: "0 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, padding: "9px 14px" }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kind === "service" ? "Search type, shop, or location…" : "Search unit or location…"}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 500 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 17, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 18px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, overflowX: "auto" }}>
            {DATE_RANGES.map(({ label, days }) => {
              const active = activeDays === days;
              return (
                <button
                  key={label}
                  onClick={() => setActiveDays(days)}
                  title={days === null ? "All dates, all equipment" : undefined}
                  style={{
                    padding: "5px 10px", borderRadius: 2, border: "1px solid", fontSize: 11, fontWeight: 800,
                    cursor: "pointer", letterSpacing: 0.3, transition: "all 120ms ease", flexShrink: 0,
                    background: active ? "rgba(255,255,255,0.10)" : "transparent",
                    borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                    color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div ref={reportRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              disabled={!hasAny}
              onClick={() => setReportMenuOpen((o) => !o)}
              style={{
                padding: "7px 12px", borderRadius: 2, fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
                cursor: hasAny ? "pointer" : "default",
                border: hasAny ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.08)",
                background: hasAny ? "rgba(255,255,255,0.07)" : "transparent",
                color: hasAny ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.18)",
              }}
            >
              {copied ? "✓ Copied" : "Report ▾"}
            </button>
            {reportMenuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 60, minWidth: 140,
                background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 2,
                boxShadow: "0 8px 24px rgba(0,0,0,0.55)", padding: 4,
              }}>
                {[{ label: "Copy", fn: handleCopy }, { label: "Text", fn: handleSMS }, { label: "Email", fn: handleEmail }].map((o) => (
                  <div
                    key={o.label}
                    onClick={o.fn}
                    style={{ padding: "10px 14px", fontSize: 14, color: "#fff", cursor: "pointer", borderRadius: 2 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {o.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
          {loading && <div style={{ padding: "24px 18px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading…</div>}
          {!loading && error && <div style={{ padding: "24px 18px", textAlign: "center", color: "#ef4444", fontSize: 14 }}>{error}</div>}
          {!loading && !hasAny && (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
              {search ? "No records match your search" : activeDays ? `No records in the last ${activeDays} days` : "No records yet"}
            </div>
          )}

          {!loading && kind === "service" && serviceByDate.map(([date, rows]) => (
            <div key={date}>
              <div style={{ padding: "10px 18px 4px", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                {fmtDateHeader(date)}
              </div>
              {rows.map((row) => {
                const type = types.find((t) => t.service_type_id === row.serviceTypeId);
                const isExpanded = expandedId === row.id;
                const detail = dueDetailLine(row, type);
                const shopLoc = [row.shopName, row.location].filter(Boolean).join(" · ");
                const combinedDetail = [shopLoc, row.notes].filter(Boolean).join("  ·  ");
                return (
                  <div key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <div onClick={() => openRow(row.id)} style={{ padding: "11px 18px 12px", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 2, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                          {row.unit.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>{row.unit.name}</span>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {row.typeName}{row.companion ? ` (with ${row.companion.label} ${row.companion.name})` : ""}
                        </span>
                      </div>

                      {isExpanded && !editing && (
                        <div style={{ marginTop: 8, paddingLeft: 2 }} onClick={(e) => e.stopPropagation()}>
                          {combinedDetail && (
                            <div
                              onClick={() => setNoteOverlay(combinedDetail)}
                              style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, cursor: "pointer" }}
                            >
                              {combinedDetail}
                            </div>
                          )}
                          {detail && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{detail}</div>}
                          {row.createdBy && (
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>
                              Logged by {namesByUserId[row.createdBy] ?? "…"}
                            </div>
                          )}
                        </div>
                      )}

                      {isExpanded && editing && (
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                          <div>
                            <label style={editLabelStyle}>Type</label>
                            <CustomSelect
                              value={editTypeId}
                              onChange={setEditTypeId}
                              options={types.filter((t) => t.is_active || t.service_type_id === row.serviceTypeId).map((t) => ({ value: t.service_type_id, label: t.name }))}
                            />
                          </div>
                          <div>
                            <label style={editLabelStyle}>Date</label>
                            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={editInputStyle} />
                          </div>
                          {(() => {
                            const t = types.find((x) => x.service_type_id === editTypeId);
                            const needsReading = t?.interval_kind === "miles" || t?.interval_kind === "hours";
                            return needsReading ? (
                              <div>
                                <label style={editLabelStyle}>{t?.interval_kind === "miles" ? "Odometer (miles)" : "Engine hours"}</label>
                                <input type="number" value={editReading} onChange={(e) => setEditReading(e.target.value)} style={editInputStyle} />
                              </div>
                            ) : null;
                          })()}
                          <div>
                            <label style={editLabelStyle}>Shop name</label>
                            <input value={editShop} onChange={(e) => setEditShop(e.target.value)} style={editInputStyle} />
                          </div>
                          <div>
                            <label style={editLabelStyle}>Location</label>
                            <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} style={editInputStyle} />
                          </div>
                          <div>
                            <label style={editLabelStyle}>Notes</label>
                            <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} style={{ ...editInputStyle, minHeight: 60, fontFamily: "inherit", resize: "vertical" as const }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {!loading && kind === "wash" && washByDate.map(([day, rows]) => (
            <div key={day}>
              <div style={{ padding: "10px 18px 4px", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                {fmtDateHeader(rows[0].date)}
              </div>
              {rows.map((row) => {
                const isExpanded = expandedId === row.id;
                return (
                  <div key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <div onClick={() => openRow(row.id)} style={{ padding: "11px 18px 12px", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 2, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                          {row.unit.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>{row.unit.name}</span>
                        {row.location && (
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                            {row.location}
                          </span>
                        )}
                      </div>

                      {isExpanded && !editing && (row.notes || row.createdBy) && (
                        <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                          {row.notes && (
                            <div
                              onClick={() => setNoteOverlay(row.notes)}
                              style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, cursor: "pointer" }}
                            >
                              {row.notes}
                            </div>
                          )}
                          {row.createdBy && (
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>
                              Logged by {namesByUserId[row.createdBy] ?? "…"}
                            </div>
                          )}
                        </div>
                      )}

                      {isExpanded && editing && (
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                          <div>
                            <label style={editLabelStyle}>Date/time</label>
                            <input type="datetime-local" value={editWashedAt} onChange={(e) => setEditWashedAt(e.target.value)} style={editInputStyle} />
                          </div>
                          <div>
                            <label style={editLabelStyle}>Location</label>
                            <input value={editWashLocation} onChange={(e) => setEditWashLocation(e.target.value)} style={editInputStyle} />
                          </div>
                          <div>
                            <label style={editLabelStyle}>Notes</label>
                            <textarea value={editWashNotes} onChange={(e) => setEditWashNotes(e.target.value)} style={{ ...editInputStyle, minHeight: 60, fontFamily: "inherit", resize: "vertical" as const }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ height: hasExpanded ? 12 : 28 }} />
        </div>

        {/* ── Bottom action bar -- only while a row is expanded ── */}
        {hasExpanded && (
          <div style={{ padding: "10px 18px 18px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0d1013", flexShrink: 0 }}>
            {error && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
            {confirmingDelete ? (
              <>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 10 }}>
                  This permanently deletes this record. This can&apos;t be undone.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setConfirmingDelete(false)} disabled={busy}
                    style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={() => deleteRecord(expandedId!)} disabled={busy}
                    style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(220,60,60,0.5)", background: "rgba(180,40,40,0.25)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                    {busy ? "Deleting…" : "Delete permanently"}
                  </button>
                </div>
              </>
            ) : editing ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={closeExpanded} disabled={busy}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                  Cancel
                </button>
                <button
                  onClick={() => (expandedServiceRow ? saveServiceEdit(expandedServiceRow) : expandedWashRow ? saveWashEdit(expandedWashRow) : undefined)}
                  disabled={busy}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, cursor: "pointer" }}
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => (expandedServiceRow ? startEditService(expandedServiceRow) : expandedWashRow ? startEditWash(expandedWashRow) : undefined)}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmingDelete(true)}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(220,60,60,0.4)", background: "rgba(180,40,40,0.12)", color: "#fca5a5", fontWeight: 800, cursor: "pointer" }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {noteOverlay && (
        <div onClick={() => setNoteOverlay(null)} style={{ position: "fixed", inset: 0, zIndex: 10300, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#181c20", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 2, padding: 18, maxWidth: 320, maxHeight: "60vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>{noteOverlay}</div>
            <button onClick={() => setNoteOverlay(null)} style={{ marginTop: 14, width: "100%", padding: "10px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
