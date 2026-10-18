"use client";
// app/planner/modals/SourcingModal.tsx
// Full-screen modal showing terminal sourcing numbers (account + loading number).
// Shared within company. Only leads/admins can add/edit/delete.
// Drivers can read.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type SourcingRow = {
  id: string;
  account: string;
  number: string;
  isDraft?: boolean; // true = not yet saved to DB
};

type Props = {
  open: boolean;
  onClose: () => void;
  terminalId: string;
  terminalName: string;
  authUserId: string;
};

export default function SourcingModal({ open, onClose, terminalId, terminalName, authUserId }: Props) {
  const [rows, setRows] = useState<SourcingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // ── Load company + role + rows ────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!authUserId || !terminalId) return;
    setLoading(true);
    setError(null);

    // Get active company + role
    const { data: settings } = await supabase
      .from("user_settings")
      .select("active_company_id")
      .eq("user_id", authUserId)
      .maybeSingle();
    const cid = (settings as any)?.active_company_id as string | null;
    if (!cid) { setError("No active company."); setLoading(false); return; }
    setCompanyId(cid);

    const { data: membership } = await supabase
      .from("user_companies")
      .select("role")
      .eq("user_id", authUserId)
      .eq("company_id", cid)
      .maybeSingle();
    const role = (membership as any)?.role ?? "";
    setCanEdit(role === "admin" || role === "lead");

    // Load sourcing rows
    const { data, error: fetchErr } = await supabase
      .from("terminal_sourcing_numbers")
      .select("id, account, number")
      .eq("terminal_id", terminalId)
      .eq("company_id", cid)
      .order("updated_at", { ascending: true });

    if (fetchErr) { setError(fetchErr.message); setLoading(false); return; }
    setRows((data ?? []) as SourcingRow[]);
    setLoading(false);
  }, [authUserId, terminalId]);

  useEffect(() => {
    if (open && !hasFetched.current) {
      hasFetched.current = true;
      loadAll();
    }
    if (!open) hasFetched.current = false;
  }, [open, loadAll]);

  // ── Blank draft row ───────────────────────────────────────────────────────

  const draftKey = "__draft__";

  const hasDraft = rows.some(r => r.isDraft);

  const addDraftRow = () => {
    if (hasDraft) return;
    setRows(prev => [...prev, { id: draftKey + Date.now(), account: "", number: "", isDraft: true }]);
  };

  // ── Save a row ────────────────────────────────────────────────────────────

  const saveRow = async (row: SourcingRow) => {
    if (!companyId) return;
    if (!row.account.trim() && !row.number.trim()) return;
    setSavingId(row.id);
    try {
      if (row.isDraft) {
        // Insert
        const { data, error: insErr } = await supabase
          .from("terminal_sourcing_numbers")
          .insert({
            company_id: companyId,
            terminal_id: terminalId,
            account: row.account.trim(),
            number: row.number.trim(),
            created_by: authUserId,
            updated_at: new Date().toISOString(),
          })
          .select("id, account, number")
          .single();
        if (insErr) throw insErr;
        setRows(prev => prev.map(r => r.id === row.id ? { ...(data as SourcingRow) } : r));
        setExpandedId(null);
        // Add new blank row automatically
        setTimeout(() => addDraftRow(), 50);
      } else {
        // Update
        const { error: updErr } = await supabase
          .from("terminal_sourcing_numbers")
          .update({
            account: row.account.trim(),
            number: row.number.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updErr) throw updErr;
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, account: row.account.trim(), number: row.number.trim() } : r));
        setExpandedId(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Save failed.");
    } finally {
      setSavingId(null);
    }
  };

  // ── Delete a row ──────────────────────────────────────────────────────────

  const deleteRow = async (id: string, isDraft?: boolean) => {
    if (isDraft) {
      setRows(prev => prev.filter(r => r.id !== id));
      setConfirmDeleteId(null);
      return;
    }
    setSavingId(id);
    try {
      const { error: delErr } = await supabase
        .from("terminal_sourcing_numbers")
        .delete()
        .eq("id", id);
      if (delErr) throw delErr;
      setRows(prev => prev.filter(r => r.id !== id));
      setConfirmDeleteId(null);
    } catch (e: any) {
      setError(e?.message ?? "Delete failed.");
    } finally {
      setSavingId(null);
    }
  };

  // ── Update local row field ────────────────────────────────────────────────

  const updateField = (id: string, field: "account" | "number", value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isBusy = (id: string) => savingId === id;

  return (
    <FullscreenModal open={open} onClose={onClose} title="Sourcing" footer={null}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#000" }}>

        {/* Header info */}
        <div style={{ padding: "0 16px 10px", flexShrink: 0 }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
            {terminalName}
          </div>
          {error && (
            <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 2, background: "rgba(180,40,40,0.18)", border: "1px solid rgba(180,40,40,0.32)", color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}
        </div>

        {/* Column headers */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px 6px", gap: 8, flexShrink: 0 }}>
          <div style={{ flex: "0 0 33%", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.28)", letterSpacing: 0.6, textTransform: "uppercase" as const }}>Account</div>
          <div style={{ flex: "1 1 0", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.28)", letterSpacing: 0.6, textTransform: "uppercase" as const }}>Number</div>
          <div style={{ width: 36, flexShrink: 0 }} />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          {loading ? (
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, padding: "20px 0" }}>Loading…</div>
          ) : rows.length === 0 && !canEdit ? (
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, padding: "20px 0" }}>No sourcing numbers on file.</div>
          ) : (
            <>
              {rows.map((row) => {
                const isExpanded = expandedId === row.id;
                const isSaved = !row.isDraft;
                const busy = isBusy(row.id);
                const isConfirmingDelete = confirmDeleteId === row.id;

                return (
                  <div key={row.id} style={{ marginBottom: 6 }}>
                    {/* Single-height collapsed row */}
                    {!isExpanded ? (
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "10px 12px", borderRadius: 2,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.04)",
                          cursor: canEdit ? "pointer" : "default",
                          minHeight: 44,
                        }}
                        onClick={() => canEdit && setExpandedId(row.id)}
                      >
                        <div style={{
                          flex: "0 0 33%", fontSize: 14, fontWeight: 700,
                          color: row.account ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.20)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                        }}>
                          {row.account || (canEdit ? "Account…" : "—")}
                        </div>
                        <div style={{
                          flex: "1 1 0", fontSize: 14, fontWeight: 700,
                          color: row.number ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.20)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                        }}>
                          {row.number || (canEdit ? "Number…" : "—")}
                        </div>
                        {canEdit && (
                          <div style={{ width: 36, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                            <span style={{ fontSize: 16, color: "rgba(255,255,255,0.22)" }}>›</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Expanded edit row */
                      <div style={{
                        padding: "12px", borderRadius: 2,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10, minWidth: 0, overflow: "hidden" }}>
                          <input
                            type="text"
                            value={row.account}
                            onChange={(e) => updateField(row.id, "account", e.target.value)}
                            placeholder="Account"
                            autoFocus
                            style={{
                              flex: "0 0 33%", minWidth: 0, boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2,
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: "rgba(0,0,0,0.40)", color: "rgba(255,255,255,0.92)",
                              fontSize: 15, fontWeight: 700, outline: "none",
                            }}
                          />
                          <input
                            type="text"
                            value={row.number}
                            onChange={(e) => updateField(row.id, "number", e.target.value)}
                            placeholder="Number"
                            style={{
                              flex: "1 1 0", minWidth: 0, boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2,
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: "rgba(0,0,0,0.40)", color: "rgba(255,255,255,0.92)",
                              fontSize: 15, fontWeight: 700, outline: "none",
                            }}
                          />
                        </div>

                        {/* Confirm delete warning */}
                        {isConfirmingDelete && (
                          <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 2, background: "rgba(180,40,40,0.15)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 13, color: "rgba(255,255,255,0.80)", fontWeight: 600 }}>
                            Delete this row? This cannot be undone.
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {/* Cancel / collapse */}
                          <button type="button"
                            onClick={() => { setExpandedId(null); setConfirmDeleteId(null); if (row.isDraft) setRows(prev => prev.filter(r => r.id !== row.id)); }}
                            style={{ padding: "8px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                            Cancel
                          </button>

                          <div style={{ flex: 1 }} />

                          {/* Delete button — only for saved rows */}
                          {isSaved && !isConfirmingDelete && (
                            <button type="button"
                              onClick={() => setConfirmDeleteId(row.id)}
                              disabled={busy}
                              style={{ padding: "8px 14px", borderRadius: 2, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "rgba(239,68,68,0.80)", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
                              Delete
                            </button>
                          )}

                          {/* Confirm delete */}
                          {isConfirmingDelete && (
                            <>
                              <button type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                style={{ padding: "8px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                Keep
                              </button>
                              <button type="button"
                                onClick={() => deleteRow(row.id, row.isDraft)}
                                disabled={busy}
                                style={{ padding: "8px 14px", borderRadius: 2, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.95)", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
                                {busy ? "…" : "Yes, delete"}
                              </button>
                            </>
                          )}

                          {/* Save button */}
                          {!isConfirmingDelete && (
                            <button type="button"
                              onClick={() => saveRow(row)}
                              disabled={busy || (!row.account.trim() && !row.number.trim())}
                              style={{
                                padding: "8px 20px", borderRadius: 2,
                                border: "1px solid rgba(74,222,128,0.35)",
                                background: "rgba(74,222,128,0.12)",
                                color: "rgba(74,222,128,0.95)",
                                fontSize: 13, fontWeight: 800, cursor: "pointer",
                                opacity: (busy || (!row.account.trim() && !row.number.trim())) ? 0.4 : 1,
                              }}>
                              {busy ? "…" : "Save"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add row button — only for leads/admins, only if no draft exists */}
              {canEdit && !hasDraft && (
                <button type="button"
                  onClick={addDraftRow}
                  style={{
                    width: "100%", marginTop: 6, padding: "12px 0",
                    borderRadius: 2, border: "1px dashed rgba(255,255,255,0.14)",
                    background: "transparent", color: "rgba(255,255,255,0.35)",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2,
                  }}>
                  + Add row
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer close button */}
        <div style={{ padding: "12px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "#000", flexShrink: 0 }}>
          <button type="button" onClick={onClose}
            style={{ width: "100%", borderRadius: 2, padding: "15px 18px", fontWeight: 900, fontSize: 17, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.92)", cursor: "pointer" }}>
            Done
          </button>
        </div>
      </div>
    </FullscreenModal>
  );
}
