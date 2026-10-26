"use client";
// app/planner/modals/binder/PermitRow.tsx
//
// Part of the Binder (equipment file) dialog.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { DocPreviewModal, type AttachmentRecord, type AttachmentGroup } from "@/lib/ui/driver/DocHub";

import type { UnitKind, Row } from "./types";
import { statusColor, statusText } from "./helpers";
import { inputStyle, labelStyle, saveBtnStyle, cancelBtnStyle, dangerBtnStyle } from "./styles";
import { DocThumb } from "./DocThumb";

export function PermitRow({
  row,
  unitKind,
  unitId,
  companyId,
  isExpanded,
  onToggleExpand,
  onEditType,
  hasDoc,
  pages,
  onDocsChanged,
  onSaved,
}: {
  row: Row;
  unitKind: UnitKind;
  unitId: string;
  companyId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditType: () => void;
  hasDoc: boolean;
  pages: AttachmentRecord[];
  onDocsChanged: () => void;
  onSaved: () => void;
}) {
  const [expDate, setExpDate] = useState("");
  const [enfDate, setEnfDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [previewGroup, setPreviewGroup] = useState<AttachmentGroup | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;
    setExpDate(row.record?.expiration_date ?? "");
    setEnfDate(row.record?.enforcement_date ?? "");
    setErr(null);
    setConfirmingDelete(false);
  }, [isExpanded, row.record]);

  // Attribution tooltip ("Uploaded by X") -- same resolve-on-demand pattern
  // as RecordHistoryModal.tsx's Logged-by names.
  const [namesByUserId, setNamesByUserId] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = Array.from(new Set(pages.map((p) => p.uploaded_by).filter((x): x is string => !!x)));
    const missing = ids.filter((id) => !(id in namesByUserId));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: missing });
      const next: Record<string, string> = {};
      for (const nameRow of (data ?? []) as any[]) {
        if (nameRow?.user_id) next[nameRow.user_id] = nameRow.display_name ?? "Unknown";
      }
      setNamesByUserId((prev) => ({ ...prev, ...next }));
    })();
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const patch: any = {
        company_id: companyId,
        expiration_date: expDate || null,
        enforcement_date: enfDate || null,
        permit_type_id: row.type.permit_type_id,
        truck_id: unitKind === "truck" ? unitId : null,
        trailer_id: unitKind === "trailer" ? unitId : null,
      };
      if (row.record) {
        const { error } = await supabase.from("equipment_permits").update(patch).eq("equipment_permit_id", row.record.equipment_permit_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("equipment_permits").insert(patch);
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord() {
    if (!row.record) return;
    setBusy(true);
    setErr(null);
    try {
      for (const p of pages) {
        await supabase.storage.from("equipment-docs").remove([p.file_path]);
        await supabase.from("equipment_attachments").delete().eq("id", p.id);
      }
      const { error } = await supabase.from("equipment_permits").delete().eq("equipment_permit_id", row.record.equipment_permit_id);
      if (error) throw error;
      onDocsChanged();
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File, replace: boolean) {
    setUploading(true);
    setErr(null);
    try {
      if (replace) {
        for (const p of pages) {
          await supabase.storage.from("equipment-docs").remove([p.file_path]);
          await supabase.from("equipment_attachments").delete().eq("id", p.id);
        }
      }
      const pageOrder = replace ? 0 : pages.length;
      const ext = file.name.split(".").pop() ?? "bin";
      const newId = crypto.randomUUID();
      const filePath = `${companyId}/${unitKind}/${unitId}/permit_${row.type.permit_type_id}/${newId}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from("equipment-docs")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (storageErr) throw storageErr;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: dbErr } = await supabase.from("equipment_attachments").insert({
        id: newId,
        company_id: companyId,
        equipment_type: unitKind,
        equipment_id: unitId,
        category: row.type.permit_type_id,
        category_label: row.type.name,
        permit_type_id: row.type.permit_type_id,
        file_path: filePath,
        original_name: file.name,
        mime_type: file.type || "application/octet-stream",
        page_order: pageOrder,
        uploaded_by: user?.id ?? null,
      });
      if (dbErr) {
        await supabase.storage.from("equipment-docs").remove([filePath]);
        throw dbErr;
      }
      onDocsChanged();
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function deletePage(page: AttachmentRecord) {
    setBusy(true);
    try {
      await supabase.storage.from("equipment-docs").remove([page.file_path]);
      await supabase.from("equipment_attachments").delete().eq("id", page.id);
      onDocsChanged();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to remove document.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", marginBottom: 8, padding: "0 10px" }}>
      <div onClick={onToggleExpand} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer" }}>
        <DocThumb pages={pages} onOpen={() => setPreviewGroup({ category: row.type.permit_type_id, label: row.type.name, pages })} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: "rgba(255,255,255,0.9)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
            }}
          >
            {row.type.name}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: statusColor(row), marginTop: 3 }}>{statusText(row)}</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditType();
          }}
          title={`Edit "${row.type.name}"`}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.3)",
            fontSize: 14,
            cursor: "pointer",
            padding: "0 2px",
            flexShrink: 0,
          }}
        >
          ✎
        </button>
      </div>

      {isExpanded && (
        <div style={{ padding: "4px 2px 14px" }} onClick={(e) => e.stopPropagation()}>
          {err && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{err}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Expiration date</label>
              <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Enforcement date (optional)</label>
              <input type="date" value={enfDate} onChange={(e) => setEnfDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Document{pages.length > 1 ? "s" : ""}</label>
            {pages.map((p) => (
              <div
                key={p.id}
                title={p.uploaded_by ? `Uploaded by ${namesByUserId[p.uploaded_by] ?? "…"}` : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 2,
                  padding: "6px 10px",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 14 }}>{p.mime_type?.startsWith("image/") ? "🖼" : "📄"}</span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.8)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {p.original_name}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewGroup({ category: row.type.permit_type_id, label: row.type.name, pages })}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.75)",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => deletePage(p)}
                  disabled={busy}
                  style={{ background: "none", border: "none", color: "#fca5a5", fontSize: 13, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            ))}
            <label
              style={{
                display: "block",
                textAlign: "center" as const,
                padding: "8px",
                borderRadius: 2,
                border: "1px dashed rgba(255,255,255,0.18)",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.4)",
                cursor: "pointer",
              }}
            >
              {uploading ? "Uploading…" : pages.length ? "+ Add another page" : "+ Add document"}
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f, false);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {confirmingDelete ? (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 10 }}>
                This clears the date and removes any attached document for {row.type.name}. This can&apos;t be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} style={cancelBtnStyle}>
                  Cancel
                </button>
                <button aria-busy={!!busy} type="button" onClick={deleteRecord} disabled={busy} style={{ ...dangerBtnStyle, flex: 1 }}>
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              {row.record && (
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} style={dangerBtnStyle}>
                  Delete
                </button>
              )}
              <button aria-busy={!!busy} type="button" onClick={save} disabled={busy} style={saveBtnStyle}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      )}

      {previewGroup && <DocPreviewModal group={previewGroup} onClose={() => setPreviewGroup(null)} />}
    </div>
  );
}

// ─── Main Binder modal ───────────────────────────────────────────────────────
