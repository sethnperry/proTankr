"use client";
// app/planner/modals/scaleHistory/useScaleHistory.ts
//
// Part of ScaleHistoryModal.tsx: state, loading and actions.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { generateWeightTicketPng, shareOrDownloadTicket } from "@/lib/ui/generateWeightTicket";
import type { WeightRecordRaw, Props } from "./types";
import { fmtDate, buildShareText, shareViaClipboard, shareViaSMS } from "./helpers";
import { emailReportPdf } from "@/lib/reports/emailReport";
import { scaleHistoryDoc } from "@/lib/reports/docs";
import { lastDays, inRange, type DateRange } from "@/lib/reports/dateRange";

export function useScaleHistory({ open, onClose, companyId, comboId, onChanged, truckName, trailerName }: Props) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [copied, setCopied] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<WeightRecordRaw[]>([]);
  const [namesByUserId, setNamesByUserId] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteOverlay, setNoteOverlay] = useState<string | null>(null);

  const [editHeavy, setEditHeavy] = useState("");
  const [editLight, setEditLight] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [printBusy, setPrintBusy] = useState(false);

  const equipmentLabel = [truckName, trailerName].filter(Boolean).join(" / ");

  const allEquipment = range === null;

  function closeExpanded() {
    setExpandedId(null);
    setEditing(false);
    setConfirmingDelete(false);
  }

  // Equipment logs are shared fleet-wide -- created_by is already captured
  // on every insert, this just resolves it to a display name.
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

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const cols = "weight_record_id, combo_id, load_id, heavy_weight_lbs, light_weight_lbs, net_weight_lbs, planner_weight_lbs, prior_tare_lbs, tare_updated, notes, recorded_at, created_by";
      let data: WeightRecordRaw[];
      if (allEquipment) {
        const { data: d, error: e } = await supabase.from("weight_records").select(cols).eq("company_id", companyId);
        if (e) throw e;
        data = (d ?? []) as WeightRecordRaw[];
      } else {
        if (!comboId) { setRows([]); setLoading(false); return; }
        const { data: d, error: e } = await supabase.from("weight_records").select(cols).eq("combo_id", comboId);
        if (e) throw e;
        data = (d ?? []) as WeightRecordRaw[];
      }
      data.sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1));
      setRows(data);
      void resolveCreatedByNames(data.map((r) => r.created_by));
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
  }, [open, comboId, companyId, allEquipment]);

  useEffect(() => {
    if (!reportMenuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (reportRef.current && !reportRef.current.contains(e.target as Node)) setReportMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [reportMenuOpen]);

  const filtered = useMemo(() => {
    let list = rows;
    if (range) list = list.filter((r) => inRange(r.recorded_at, range));
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => (r.notes ?? "").toLowerCase().includes(q));
  }, [rows, range, search]);

  const byDate = useMemo(() => {
    const map = new Map<string, WeightRecordRaw[]>();
    for (const r of filtered) {
      const day = r.recorded_at.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(r);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const totalCount = filtered.length;
  const hasAny = totalCount > 0;

  function handleCopy() {
    shareViaClipboard(buildShareText(filtered, "Scale History"), () => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
    setReportMenuOpen(false);
  }
  function handleSMS() { shareViaSMS(buildShareText(filtered, "Scale History")); setReportMenuOpen(false); }
  function handleEmail() { void emailReportPdf(scaleHistoryDoc(filtered, { equipment: equipmentLabel, range })); setReportMenuOpen(false); }

  function openRow(id: string) {
    if (expandedId === id) { closeExpanded(); return; }
    setExpandedId(id);
    setEditing(false);
    setConfirmingDelete(false);
  }

  function startEdit(row: WeightRecordRaw) {
    setEditHeavy(String(row.heavy_weight_lbs));
    setEditLight(String(row.light_weight_lbs));
    setEditNotes(row.notes ?? "");
    setEditing(true);
  }

  async function saveEdit(row: WeightRecordRaw) {
    setBusy(true);
    setError(null);
    try {
      const heavy = Number(editHeavy);
      const light = Number(editLight);
      if (!Number.isFinite(heavy) || !Number.isFinite(light)) throw new Error("Enter valid weights.");
      const { error: e } = await supabase.from("weight_records").update({
        heavy_weight_lbs: heavy,
        light_weight_lbs: light,
        notes: editNotes || null,
      }).eq("weight_record_id", row.weight_record_id);
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

  async function printRecord(row: WeightRecordRaw) {
    setPrintBusy(true);
    setError(null);
    try {
      const blob = await generateWeightTicketPng({
        recordedAt: row.recorded_at,
        equipmentLabel,
        heavyLbs: row.heavy_weight_lbs,
        lightLbs: row.light_weight_lbs,
        netLbs: row.net_weight_lbs,
        plannerLbs: row.planner_weight_lbs,
        tareUpdated: row.tare_updated,
        priorTareLbs: row.prior_tare_lbs,
        notes: row.notes,
      });
      await shareOrDownloadTicket(blob, `weight-ticket-${fmtDate(row.recorded_at).replace(/\//g, "-")}.png`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate ticket image.");
    } finally {
      setPrintBusy(false);
    }
  }

  async function deleteRecord(id: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.from("weight_records").delete().eq("weight_record_id", id);
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

  const expandedRow = filtered.find((r) => r.weight_record_id === expandedId) ?? null;

  return {
    range, allEquipment, busy, byDate, closeExpanded, comboId, companyId, confirmingDelete, copied, deleteRecord, editHeavy, editLight, editNotes, editing, equipmentLabel, error, expandedId, filtered, handleCopy, handleEmail, handleSMS, hasAny, load, loading, namesByUserId, noteOverlay, onChanged, onClose, open, openRow, printBusy, printRecord, reportMenuOpen, reportRef, resolveCreatedByNames, rows, saveEdit, search, searchRef, setRange, setBusy, setConfirmingDelete, setCopied, setEditHeavy, setEditLight, setEditNotes, setEditing, setError, setExpandedId, setLoading, setNamesByUserId, setNoteOverlay, setPrintBusy, setReportMenuOpen, setRows, setSearch, startEdit, totalCount, trailerName, truckName,
    expandedRow,
  };
}

export type ScaleHistoryModel = ReturnType<typeof useScaleHistory>;
