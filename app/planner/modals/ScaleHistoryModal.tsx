"use client";
// modals/ScaleHistoryModal.tsx
//
// History of weight_records (Heavy/Light scale-ticket entries) for a combo
// -- opened by tapping the "Tare weight" / "Target gross weight" report
// lines on the main Equipment modal (the Scale action button itself still
// opens ScaleTicketModal directly, same split as Service/Wash's action
// button vs. their report-line history views).
//
// Combo-level (not per-unit truck/trailer like Service/Wash History), so
// rows are flat -- no grouping by unit, just by date.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import { generateWeightTicketPng, shareOrDownloadTicket } from "@/lib/ui/generateWeightTicket";

type WeightRecordRaw = {
  weight_record_id: string;
  combo_id: string;
  load_id: string | null;
  heavy_weight_lbs: number;
  light_weight_lbs: number;
  net_weight_lbs: number;
  planner_weight_lbs: number | null;
  prior_tare_lbs: number | null;
  tare_updated: boolean;
  notes: string | null;
  recorded_at: string;
  created_by: string | null;
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
function fmt(n: number | null | undefined): string {
  return n == null ? "—" : Math.round(n).toLocaleString();
}

function buildShareText(rows: WeightRecordRaw[], title: string): string {
  const divider = "─".repeat(40);
  const lines: string[] = [title.toUpperCase(), divider];
  let lastDate = "";
  for (const r of rows) {
    const day = r.recorded_at.slice(0, 10);
    if (day !== lastDate) { lines.push(fmtDate(r.recorded_at)); lastDate = day; }
    lines.push(`  Heavy ${fmt(r.heavy_weight_lbs)} · Light ${fmt(r.light_weight_lbs)} · Net ${fmt(r.net_weight_lbs)} lbs${r.tare_updated ? "  (tare updated)" : ""}`);
    if (r.notes) lines.push(`    ${r.notes}`);
  }
  return lines.join("\n");
}
function shareViaClipboard(text: string, onCopied: () => void) {
  navigator.clipboard.writeText(text).then(onCopied).catch(() => window.prompt("Copy this report:", text));
}
function shareViaSMS(text: string) { window.location.href = `sms:?&body=${encodeURIComponent(text)}`; }
function shareViaEmail(subject: string, text: string) { window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`; }

const editInputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 13, boxSizing: "border-box",
};
const editLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" };

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  comboId: string | null;
  onChanged?: () => void;
  truckName?: string | null;
  trailerName?: string | null;
};

export default function ScaleHistoryModal({ open, onClose, companyId, comboId, onChanged, truckName, trailerName }: Props) {
  const [search, setSearch] = useState("");
  const [activeDays, setActiveDays] = useState<number | null>(90);
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

  const allEquipment = activeDays === null;

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
    if (activeDays != null) {
      const cutoff = Date.now() - activeDays * 86400000;
      list = list.filter((r) => new Date(r.recorded_at).getTime() >= cutoff);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => (r.notes ?? "").toLowerCase().includes(q));
  }, [rows, activeDays, search]);

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
  function handleEmail() { shareViaEmail("Scale History", buildShareText(filtered, "Scale History")); setReportMenuOpen(false); }

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

  if (!open || typeof document === "undefined") return null;

  const expandedRow = filtered.find((r) => r.weight_record_id === expandedId) ?? null;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 10px", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 }}>Scale History</div>
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
              placeholder="Search notes…"
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

          {!loading && byDate.map(([day, dayRows]) => (
            <div key={day}>
              <div style={{ padding: "10px 18px 4px", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                {fmtDateHeader(dayRows[0].recorded_at)}
              </div>
              {dayRows.map((row) => {
                const isExpanded = expandedId === row.weight_record_id;
                const plannerDiff = row.planner_weight_lbs != null ? Math.round(row.net_weight_lbs - row.planner_weight_lbs) : null;
                return (
                  <div key={row.weight_record_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <div onClick={() => openRow(row.weight_record_id)} style={{ padding: "11px 18px 12px", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                          Heavy {fmt(row.heavy_weight_lbs)} · Light {fmt(row.light_weight_lbs)} · Net {fmt(row.net_weight_lbs)} lbs
                        </span>
                        {row.tare_updated && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 2, background: "rgba(251,146,60,0.15)", color: "#fb923c", flexShrink: 0 }}>
                            TARE UPDATED
                          </span>
                        )}
                      </div>

                      {isExpanded && !editing && (
                        <div style={{ marginTop: 8, paddingLeft: 2 }} onClick={(e) => e.stopPropagation()}>
                          {row.planner_weight_lbs != null && (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                              Planner weight {fmt(row.planner_weight_lbs)} lbs
                              {plannerDiff != null && plannerDiff !== 0 && ` (${plannerDiff > 0 ? "+" : ""}${plannerDiff})`}
                            </div>
                          )}
                          {row.tare_updated && row.prior_tare_lbs != null && (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                              Tare updated: {fmt(row.prior_tare_lbs)} → {fmt(row.light_weight_lbs)} lbs
                            </div>
                          )}
                          {row.notes && (
                            <div
                              onClick={() => setNoteOverlay(row.notes)}
                              style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, cursor: "pointer" }}
                            >
                              {row.notes}
                            </div>
                          )}
                          {row.created_by && (
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 4 }}>
                              Logged by {namesByUserId[row.created_by] ?? "…"}
                            </div>
                          )}
                        </div>
                      )}

                      {isExpanded && editing && (
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div>
                              <label style={editLabelStyle}>Heavy weight (lbs)</label>
                              <input type="number" value={editHeavy} onChange={(e) => setEditHeavy(e.target.value)} style={editInputStyle} />
                            </div>
                            <div>
                              <label style={editLabelStyle}>Light weight (lbs)</label>
                              <input type="number" value={editLight} onChange={(e) => setEditLight(e.target.value)} style={editInputStyle} />
                            </div>
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
          <div style={{ height: expandedRow ? 12 : 28 }} />
        </div>

        {expandedRow && (
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
                  <button aria-busy={!!(busy)} onClick={() => deleteRecord(expandedRow.weight_record_id)} disabled={busy}
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
                <button aria-busy={!!(busy)} onClick={() => saveEdit(expandedRow)} disabled={busy}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, cursor: "pointer" }}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button aria-busy={!!(printBusy)} onClick={() => printRecord(expandedRow)} disabled={printBusy}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700, cursor: printBusy ? "wait" : "pointer" }}>
                  {printBusy ? "Generating…" : "Print"}
                </button>
                <button onClick={() => startEdit(expandedRow)}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                  Edit
                </button>
                <button onClick={() => setConfirmingDelete(true)}
                  style={{ flex: 1, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(220,60,60,0.4)", background: "rgba(180,40,40,0.12)", color: "#fca5a5", fontWeight: 800, cursor: "pointer" }}>
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
