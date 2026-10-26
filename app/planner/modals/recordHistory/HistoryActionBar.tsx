"use client";
// app/planner/modals/recordHistory/HistoryActionBar.tsx
//
// Edit / delete actions shown while a record is expanded.


import type { RecordHistoryModel } from "./useRecordHistory";

export function HistoryActionBar({ m }: { m: RecordHistoryModel }) {
  const { error, expandedId, editing, confirmingDelete, setConfirmingDelete, busy, closeExpanded, startEditService, startEditWash, saveServiceEdit, saveWashEdit, deleteRecord, expandedServiceRow, expandedWashRow, hasExpanded } = m;
  return (
    <>
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
                  <button aria-busy={!!(busy)} onClick={() => deleteRecord(expandedId!)} disabled={busy}
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
                <button aria-busy={!!(busy)}
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
    </>
  );
}
