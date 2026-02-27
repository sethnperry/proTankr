// lib/ui/driver/AttachmentManager.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { T, css } from "./tokens";

export type AttachmentSlot = { label: string; key: string; };

type Attachment = {
  id:           string;
  label:        string;
  storage_path: string;
  file_name:    string;
  uploaded_by:  string;
  created_at:   string;
  url?:         string;
};

// ── Paperclip badge ───────────────────────────────────────────

export function PaperclipBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span title={`${count} attachment${count !== 1 ? "s" : ""}`}
      style={{ fontSize: 13, color: T.muted, flexShrink: 0, lineHeight: 1 }}>
      📎
    </span>
  );
}

// ── Main component ────────────────────────────────────────────

export function AttachmentManager({ entityType, entityId, companyId, slots, currentUserId }: {
  entityType:    string;
  entityId:      string;
  companyId:     string;
  slots:         AttachmentSlot[];
  currentUserId: string;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState<string | null>(null);
  const [viewer,      setViewer]      = useState<Attachment | null>(null);
  const [err,         setErr]         = useState<string | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const uploadingSlot = useRef<AttachmentSlot | null>(null);

  useEffect(() => { loadAttachments(); }, [entityType, entityId, companyId]);

  async function loadAttachments() {
    setLoading(true);
    const { data, error } = await supabase
      .from("attachments")
      .select("id, label, storage_path, file_name, uploaded_by, created_at")
      .eq("company_id", companyId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at");
    setLoading(false);
    if (!error) setAttachments((data ?? []) as Attachment[]);
  }

  async function openViewer(attachment: Attachment) {
    setErr(null);
    let a = attachment;
    if (!a.url) {
      const { data } = await supabase.storage.from("attachments").createSignedUrl(a.storage_path, 3600);
      if (!data?.signedUrl) { setErr("Could not load attachment."); return; }
      a = { ...a, url: data.signedUrl };
      setAttachments(prev => prev.map(x => x.id === a.id ? a : x));
    }
    setViewer(a);
  }

  function triggerUpload(slot: AttachmentSlot) {
    uploadingSlot.current = slot;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const slot = uploadingSlot.current;
    if (!file || !slot) return;
    e.target.value = "";
    setErr(null);
    setUploading(slot.key);
    try {
      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `${companyId}/${entityType}/${entityId}/${slot.key}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("attachments").upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const existing = attachments.find(a => a.label === slot.label);
      if (existing) {
        await supabase.storage.from("attachments").remove([existing.storage_path]);
        await supabase.from("attachments").delete().eq("id", existing.id);
      }
      const { error: dbErr } = await supabase.from("attachments").insert({
        company_id: companyId, entity_type: entityType, entity_id: entityId,
        label: slot.label, storage_path: path, file_name: file.name, uploaded_by: currentUserId,
      });
      if (dbErr) throw dbErr;
      await loadAttachments();
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed.");
    } finally {
      setUploading(null);
      uploadingSlot.current = null;
    }
  }

  async function deleteAttachment(attachment: Attachment) {
    if (!confirm(`Delete "${attachment.label}" attachment?`)) return;
    setErr(null);
    await supabase.storage.from("attachments").remove([attachment.storage_path]);
    await supabase.from("attachments").delete().eq("id", attachment.id);
    setAttachments(prev => prev.filter(a => a.id !== attachment.id));
  }

  if (loading) return <div style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>Loading…</div>;

  return (
    <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
      {err && (
        <div style={{ fontSize: 12, color: T.danger, marginBottom: 8, padding: "6px 10px", background: `${T.danger}15`, borderRadius: T.radiusSm }}>
          {err}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
        capture="environment" style={{ display: "none" }} onChange={handleFileChange} />

      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
        {slots.map(slot => {
          const existing    = attachments.find(a => a.label === slot.label);
          const isUploading = uploading === slot.key;
          return (
            <div key={slot.key} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, width: 80 }}>
              <div
                onClick={() => existing ? openViewer(existing) : triggerUpload(slot)}
                style={{
                  width: 80, height: 56, borderRadius: T.radiusSm,
                  border: `1.5px ${existing ? "solid" : "dashed"} ${existing ? T.accent : T.border}`,
                  background: existing ? T.surface3 : T.surface2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", overflow: "hidden", position: "relative" as const, flexShrink: 0,
                }}
              >
                {isUploading ? <span style={{ fontSize: 18 }}>⏳</span>
                  : existing  ? <AttachmentThumb attachment={existing} />
                  : <span style={{ fontSize: 22, color: T.muted }}>+</span>}
              </div>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, textAlign: "center" as const, letterSpacing: 0.3 }}>
                {slot.label}
              </div>
              {existing && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => triggerUpload(slot)}
                    style={{ ...css.btn("subtle"), fontSize: 9, padding: "2px 6px" }}>Replace</button>
                  <button onClick={() => deleteAttachment(existing)}
                    style={{ ...css.btn("ghost"), fontSize: 9, padding: "2px 6px", color: T.danger, borderColor: `${T.danger}33` }}>✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fullscreen viewer */}
      {viewer && (
        <div onClick={() => setViewer(null)}
          style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{viewer.label}</span>
            <button onClick={e => { e.stopPropagation(); setViewer(null); }}
              style={{ ...css.btn("ghost"), padding: "6px 12px", fontSize: 16 }}>✕</button>
          </div>
          {viewer.file_name?.toLowerCase().endsWith(".pdf") ? (
            <iframe src={viewer.url} style={{ width: "100%", maxWidth: 800, height: "80vh", border: "none", borderRadius: T.radius }} />
          ) : (
            <img src={viewer.url} alt={viewer.label} onClick={e => e.stopPropagation()}
              style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain", borderRadius: T.radiusSm }} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Thumbnail ─────────────────────────────────────────────────

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState(attachment.url ?? null);
  useEffect(() => {
    if (url) return;
    supabase.storage.from("attachments")
      .createSignedUrl(attachment.storage_path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  }, [attachment.storage_path]);

  if (attachment.file_name.toLowerCase().endsWith(".pdf")) return <span style={{ fontSize: 24 }}>📄</span>;
  if (!url) return <span style={{ fontSize: 18, color: T.muted }}>⏳</span>;
  return <img src={url} alt={attachment.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}

// ── Hook: attachment counts for paperclip badge ───────────────

export function useAttachmentCounts(
  companyId:  string,
  entityType: string,
  entityIds:  string[],
): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!entityIds.length) return;
    supabase.from("attachments").select("entity_id")
      .eq("company_id", companyId).eq("entity_type", entityType).in("entity_id", entityIds)
      .then(({ data }) => {
        const c: Record<string, number> = {};
        for (const row of (data ?? []) as { entity_id: string }[])
          c[row.entity_id] = (c[row.entity_id] ?? 0) + 1;
        setCounts(c);
      });
  }, [companyId, entityType, entityIds.join(",")]);
  return counts;
}
