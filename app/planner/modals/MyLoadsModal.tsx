"use client";
// modals/MyLoadsModal.tsx




// ─── Helpers ──────────────────────────────────────────────────────────────────

/** h:mm ago if < 24h, Xd ago if >= 24h */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Props } from "./myLoads/types";
import { shareViaClipboard, shareViaSMS, shareViaEmail } from "./myLoads/helpers";
import { PeriodPicker } from "@/lib/ui/PeriodPicker";
import { lastDays, type DateRange } from "@/lib/reports/dateRange";
import { LoadRow } from "./myLoads/LoadRow";


export default function MyLoadsModal({
  open, onClose, authUserId, companyId,
  rows, loading, error,
  linesCache, linesLoading,
  onFetchLines, onFetchRange,
  terminalCatalog, combos,
  headerOverride,
  onDeleteLoad, onRestoreLoad,
  initialExpandLoadId,
}: Props) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  // Bumped to remount the picker (back to its own default) when a deep link forces All time.
  const [pickerKey, setPickerKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"delete" | "restore" | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // While set, the list shows ONLY this one load -- not just auto-expanded
  // within the full history -- per explicit follow-up ("can the link
  // filter to the specific load in my loads?"). Separate from
  // initialExpandLoadId (the prop, fixed for the life of this deep-link
  // open) so the driver can still escape back to their full history by
  // typing in search, without page.tsx needing to know or care.
  const [focusedLoadId, setFocusedLoadId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const autoExpandedRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setConfirmMode(null);
      if (initialExpandLoadId) {
        // The target load could be arbitrarily old -- the normal default
        // 7-day range would silently exclude it. expandedId/selectedId are
        // set once its row actually resolves, see the effect below.
        autoExpandedRef.current = null;
        setFocusedLoadId(initialExpandLoadId);
        setRange(null);
        setPickerKey((k) => k + 1);
        onFetchRange(null);
      } else {
        setExpandedId(null);
        setSelectedId(null);
        setFocusedLoadId(null);
        onFetchRange(range);
      }
      setTimeout(() => searchRef.current?.focus(), 180);
    }
  }, [open]);

  // Fires once `rows` actually contains the deep-linked load (after the
  // forced all-time fetch above resolves) -- deferred to here, rather than
  // firing blind on open, so it can pass the row's own planned_snapshot/
  // product_temp_f into onFetchLines, same enrichment a normal manual tap
  // gets (see handleToggle below).
  useEffect(() => {
    if (!open || !initialExpandLoadId) return;
    if (autoExpandedRef.current === initialExpandLoadId) return;
    const row = rows.find((r) => r.load_id === initialExpandLoadId);
    if (!row) return;
    autoExpandedRef.current = initialExpandLoadId;
    setExpandedId(initialExpandLoadId);
    setSelectedId(initialExpandLoadId);
    onFetchLines(initialExpandLoadId, row.planned_snapshot, row.product_temp_f);
  }, [open, initialExpandLoadId, rows, onFetchLines]);

  function handleRangeChange(r: DateRange) {
    setRange(r);
    onFetchRange(r);
  }

  function handleToggle(loadId: string, plannedSnapshot?: any, productTempF?: number | null) {
    const isExpanded = expandedId === loadId;
    setExpandedId(isExpanded ? null : loadId);
    setSelectedId(loadId);
    if (!isExpanded) onFetchLines(loadId, plannedSnapshot, productTempF);
  }

  const selectedRow = selectedId ? rows.find(r => r.load_id === selectedId) ?? null : null;
  const selectedLines = selectedId ? linesCache[selectedId] : undefined;

  function handleCopy() {
    if (!selectedRow) return;
    shareViaClipboard(selectedRow, selectedLines, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  function handleSMS() {
    if (!selectedRow) return;
    shareViaSMS(selectedRow, selectedLines);
  }
  function handleEmail() {
    if (!selectedRow) return;
    shareViaEmail(selectedRow, selectedLines);
  }

  async function confirmDelete() {
    if (!selectedRow || !onDeleteLoad) return;
    setDeleteBusy(true);
    try {
      await onDeleteLoad(selectedRow.load_id);
      setConfirmMode(null);
      setExpandedId(null);
      setSelectedId(null);
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete load.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function confirmRestore() {
    if (!selectedRow || !onRestoreLoad) return;
    onRestoreLoad(selectedRow);
    setConfirmMode(null);
    onClose();
  }

  const filtered = useMemo(() => {
    if (focusedLoadId) return rows.filter((r) => r.load_id === focusedLoadId);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.terminal_name ?? "").toLowerCase().includes(q) ||
      (r.combo_label ?? "").toLowerCase().includes(q) ||
      (r.city_name ?? "").toLowerCase().includes(q) ||
      (r.state_code ?? "").toLowerCase().includes(q) ||
      (r.status ?? "").toLowerCase().includes(q)
    );
  }, [rows, search, focusedLoadId]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10100, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 10px", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 }}>{headerOverride ?? "My Loads"}</div>
            {!loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>{filtered.length}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        {/* Focused-on-one-load banner -- deep-link mode (see focusedLoadId's
            own comment). Explicit one-tap escape back to the full history,
            in addition to the implicit "just start typing to search"
            escape wired into the search input below. */}
        {focusedLoadId && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 18px 10px" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Showing this load only</span>
            <button
              onClick={() => setFocusedLoadId(null)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}
            >
              Show All Loads
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: "0 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, padding: "9px 14px" }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (focusedLoadId) setFocusedLoadId(null); }}
              placeholder="Search terminal, location, or equipment…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 500 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 17, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>
        </div>

        {/* Date filter chips + share controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 18px 12px", flexWrap: "nowrap", overflowX: "auto" }}>
          <PeriodPicker key={pickerKey} companyId={companyId} userId={authUserId} allowAll defaultAll={pickerKey > 0} onChange={handleRangeChange} style={{ flexShrink: 0 }} />

          {/* Share + row-management controls — enabled only when a load is selected */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center" }}>
            {(["copy", "text", "email"] as const).map((type) => {
              const enabled = !!selectedId;
              const label = type === "copy" ? (copied ? "✓" : "COPY") : type === "text" ? "TEXT" : "EMAIL";
              return (
                <button
                  key={type}
                  disabled={!enabled}
                  onClick={type === "copy" ? handleCopy : type === "text" ? handleSMS : handleEmail}
                  style={{
                    padding: "5px 9px", borderRadius: 2, fontSize: 11, fontWeight: 800, letterSpacing: 0.3, flexShrink: 0,
                    cursor: enabled ? "pointer" : "default", transition: "all 150ms ease",
                    border: enabled ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.08)",
                    background: enabled ? "rgba(255,255,255,0.07)" : "transparent",
                    color: enabled ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.18)",
                  }}
                >
                  {label}
                </button>
              );
            })}
            {onRestoreLoad && (
              <button
                disabled={!selectedId}
                onClick={() => setConfirmMode("restore")}
                style={{
                  padding: "5px 9px", borderRadius: 2, fontSize: 11, fontWeight: 800, letterSpacing: 0.3, flexShrink: 0,
                  cursor: selectedId ? "pointer" : "default", transition: "all 150ms ease",
                  border: selectedId ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.08)",
                  background: selectedId ? "rgba(255,255,255,0.07)" : "transparent",
                  color: selectedId ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.18)",
                }}
              >
                RESTORE
              </button>
            )}
            {onDeleteLoad && (
              <button
                disabled={!selectedId}
                onClick={() => setConfirmMode("delete")}
                style={{
                  padding: "5px 9px", borderRadius: 2, fontSize: 11, fontWeight: 800, letterSpacing: 0.3, flexShrink: 0,
                  cursor: selectedId ? "pointer" : "default", transition: "all 150ms ease",
                  border: selectedId ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(255,255,255,0.08)",
                  background: selectedId ? "rgba(239,68,68,0.10)" : "transparent",
                  color: selectedId ? "#ef4444" : "rgba(255,255,255,0.18)",
                }}
              >
                DELETE
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
          {loading && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ padding: "13px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[78, 30].map((w, j) => (
                    <div key={j} style={{
                      height: j === 0 ? 13 : 13, width: `${w}%`, borderRadius: 2,
                      background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)",
                      backgroundSize: "600px 100%", animation: "_ptShimmer 1.4s ease-in-out infinite",
                      animationDelay: `${j * 0.07}s`,
                    }} />
                  ))}
                </div>
              ))}
            </div>
          )}
          {!loading && error && (
            <div style={{ padding: "24px 18px", textAlign: "center", color: "#ef4444", fontSize: 14 }}>{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
              {search ? "No loads match your search" : range ? "No loads in this period" : "No loads yet"}
            </div>
          )}
          {!loading && !error && filtered.map((row) => (
            <LoadRow
              key={row.load_id}
              row={row}
              expanded={expandedId === row.load_id}
              selected={selectedId === row.load_id}
              onToggle={() => handleToggle(row.load_id, row.planned_snapshot, row.product_temp_f)}
              lines={linesCache[row.load_id]}
              linesLoading={!!linesLoading[row.load_id]}
              terminalCatalog={terminalCatalog}
              combos={combos}
            />
          ))}
          <div style={{ height: 28 }} />
        </div>
      </div>

      {/* Restore/Delete confirm overlay */}
      {confirmMode && selectedRow && (
        <div
          onClick={(e) => { e.stopPropagation(); setConfirmMode(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 320, background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>
              {confirmMode === "delete" ? "Delete this load?" : "Restore this load?"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
              {confirmMode === "delete"
                ? "This permanently removes it from My Loads. This can't be undone."
                : "This replaces your current plan in the Planner with this load's equipment, terminal, and compartment selections."}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => setConfirmMode(null)} disabled={deleteBusy}
                style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button aria-busy={!!(deleteBusy)} type="button" onClick={confirmMode === "delete" ? confirmDelete : confirmRestore} disabled={deleteBusy}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 2, border: "none",
                  background: confirmMode === "delete" ? "#ef4444" : "#fff",
                  color: confirmMode === "delete" ? "#fff" : "#000",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}>
                {confirmMode === "delete" ? (deleteBusy ? "Deleting…" : "Delete") : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
