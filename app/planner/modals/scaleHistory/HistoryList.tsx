"use client";
// app/planner/modals/scaleHistory/HistoryList.tsx
//
// Part of ScaleHistoryModal.tsx: the dated list of records.

import type { ScaleHistoryModel } from "./useScaleHistory";
import { fmtDateHeader, fmt, editInputStyle, editLabelStyle } from "./helpers";

export function HistoryList({ m }: { m: ScaleHistoryModel }) {
  const { range, byDate, editHeavy, editLight, editNotes, editing, error, expandedId, hasAny, loading, namesByUserId, openRow, search, setEditHeavy, setEditLight, setEditNotes, setNoteOverlay, expandedRow } = m;
  return (
    <>
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
          {loading && <div style={{ padding: "24px 18px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading…</div>}
          {!loading && error && <div style={{ padding: "24px 18px", textAlign: "center", color: "#ef4444", fontSize: 14 }}>{error}</div>}
          {!loading && !hasAny && (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14 }}>
              {search ? "No records match your search" : range ? "No records in this period" : "No records yet"}
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
    </>
  );
}
