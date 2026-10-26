"use client";
// app/planner/modals/recordHistory/HistoryList.tsx
//
// The record rows, with the expanded record and its edit form.

import { CustomSelect } from "@/lib/ui/CustomSelect";

import { fmtDateHeader, dueDetailLine, editInputStyle, editLabelStyle } from "./helpers";
import type { RecordHistoryModel } from "./useRecordHistory";

export function HistoryList({ m }: { m: RecordHistoryModel }) {
  const { kind, search, activeDays, loading, error, types, namesByUserId, expandedId, editing, setNoteOverlay, editTypeId, setEditTypeId, editDate, setEditDate, editReading, setEditReading, editShop, setEditShop, editLocation, setEditLocation, editNotes, setEditNotes, editWashedAt, setEditWashedAt, editWashLocation, setEditWashLocation, editWashNotes, setEditWashNotes, serviceByDate, washByDate, hasAny, openRow, hasExpanded } = m;
  return (
    <>
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

    </>
  );
}
