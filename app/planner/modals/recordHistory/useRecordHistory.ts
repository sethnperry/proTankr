"use client";
// app/planner/modals/recordHistory/useRecordHistory.ts
//
// Service / wash history: loading rows, filters, expanding and editing a record, share text.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { lastDays, inRange, type DateRange } from "@/lib/reports/dateRange";

import type { ServiceRecordRaw, WashRecordRaw, ServiceTypeRaw, UnitRef, ServiceRow, WashRow, Props } from "./types";
import { buildShareText, shareViaClipboard, shareViaSMS, shareViaEmail } from "./helpers";

export function useRecordHistory(props: Props) {
  const { open, onClose, kind, title, companyId, truckId, trailerId, trucks, trailers, onChanged } = props;

  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
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
  const allEquipment = range === null;

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
    if (range) list = list.filter((r) => inRange(r.date, range));
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      r.typeName.toLowerCase().includes(q) ||
      r.unit.name.toLowerCase().includes(q) ||
      (r.shopName ?? "").toLowerCase().includes(q) ||
      (r.location ?? "").toLowerCase().includes(q)
    );
  }, [serviceRows, range, search]);

  const filteredWash = useMemo(() => {
    let list = washRows;
    if (range) list = list.filter((r) => inRange(r.date, range));
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.unit.name.toLowerCase().includes(q) || (r.location ?? "").toLowerCase().includes(q));
  }, [washRows, range, search]);

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

  const expandedServiceRow = kind === "service" ? filteredService.find((r) => r.id === expandedId) ?? null : null;
  const expandedWashRow = kind === "wash" ? filteredWash.find((r) => r.id === expandedId) ?? null : null;
  const hasExpanded = !!(expandedServiceRow || expandedWashRow);

  return {
    onClose,
    kind,
    title,
    search,
    setSearch,
    range,
    companyId,
    setRange,
    copied,
    reportMenuOpen,
    setReportMenuOpen,
    loading,
    error,
    types,
    namesByUserId,
    searchRef,
    reportRef,
    expandedId,
    editing,
    confirmingDelete,
    setConfirmingDelete,
    busy,
    noteOverlay,
    setNoteOverlay,
    editTypeId,
    setEditTypeId,
    editDate,
    setEditDate,
    editReading,
    setEditReading,
    editShop,
    setEditShop,
    editLocation,
    setEditLocation,
    editNotes,
    setEditNotes,
    editWashedAt,
    setEditWashedAt,
    editWashLocation,
    setEditWashLocation,
    editWashNotes,
    setEditWashNotes,
    closeExpanded,
    serviceByDate,
    washByDate,
    totalCount,
    hasAny,
    handleCopy,
    handleSMS,
    handleEmail,
    openRow,
    startEditService,
    startEditWash,
    saveServiceEdit,
    saveWashEdit,
    deleteRecord,
    expandedServiceRow,
    expandedWashRow,
    hasExpanded,
  };
}

export type RecordHistoryModel = ReturnType<typeof useRecordHistory>;
