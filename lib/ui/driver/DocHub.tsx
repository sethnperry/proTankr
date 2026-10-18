"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { T, css } from "@/lib/ui/driver/tokens";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type EquipmentType = "truck" | "trailer";

export type AttachmentRecord = {
  id: string;
  category: string;
  category_label: string;
  file_path: string;
  original_name: string;
  mime_type: string;
  page_order: number;
  uploaded_at: string;
  uploaded_by: string | null;
};

// Grouped by category slug
export type AttachmentGroup = {
  category: string;
  label: string;
  pages: AttachmentRecord[];
};

// ─────────────────────────────────────────────────────────────
// Category definitions
// ─────────────────────────────────────────────────────────────

export const TRUCK_CATEGORIES = [
  { slug: "registration",       label: "Registration" },
  { slug: "annual_inspection",  label: "Annual Inspection" },
  { slug: "ifta",               label: "IFTA Permit + Decals" },
  { slug: "phmsa_hazmat",       label: "PHMSA HazMat Permit" },
  { slug: "alliance_hazmat",    label: "Alliance HazMat Permit" },
  { slug: "fleet_insurance",    label: "Fleet Insurance Cab Card" },
  { slug: "hazmat_lic",         label: "HazMat Transportation Lic" },
  { slug: "inner_bridge",       label: "Inner Bridge Permit" },
  { slug: "other",              label: "Other" },
];

export const TRAILER_CATEGORIES = [
  { slug: "trailer_registration",   label: "Trailer Registration" },
  { slug: "annual_inspection",      label: "Annual Inspection" },
  { slug: "tank_v",                 label: "Tank V — External Visual" },
  { slug: "tank_k",                 label: "Tank K — Leakage Test" },
  { slug: "tank_l",                 label: "Tank L — Lining Inspection" },
  { slug: "tank_t",                 label: "Tank T — Thickness Test" },
  { slug: "tank_i",                 label: "Tank I — Internal Visual" },
  { slug: "tank_p",                 label: "Tank P — Pressure Test" },
  { slug: "tank_uc",                label: "Tank UC — Upper Coupler" },
  { slug: "other",                  label: "Other" },
];

export function getCategoryLabel(equipmentType: EquipmentType, slug: string): string {
  const cats = equipmentType === "truck" ? TRUCK_CATEGORIES : TRAILER_CATEGORIES;
  return cats.find(c => c.slug === slug)?.label ?? slug;
}

// ─────────────────────────────────────────────────────────────
// useAttachments hook
// ─────────────────────────────────────────────────────────────

export function useAttachments(
  equipmentType: EquipmentType | null,
  equipmentId: string | null,
  companyId: string | null,
) {
  const [groups, setGroups]   = useState<AttachmentGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded]   = useState(false);

  const load = useCallback(async () => {
    if (!equipmentType || !equipmentId || !companyId) { setGroups([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("equipment_attachments")
      .select("id, category, category_label, file_path, original_name, mime_type, page_order, uploaded_at, uploaded_by")
      .eq("company_id", companyId)
      .eq("equipment_type", equipmentType)
      .eq("equipment_id", equipmentId)
      .order("category")
      .order("page_order");
    setLoading(false);
    if (!data) return;

    const map = new Map<string, AttachmentGroup>();
    for (const row of data as AttachmentRecord[]) {
      if (!map.has(row.category)) {
        map.set(row.category, { category: row.category, label: row.category_label, pages: [] });
      }
      map.get(row.category)!.pages.push(row);
    }
    setGroups(Array.from(map.values()));
    setLoaded(true);
  }, [equipmentType, equipmentId, companyId]);

  useEffect(() => { load(); }, [load]);

  const hasDoc = useCallback((category: string) => groups.some(g => g.category === category), [groups]);

  return { groups, loading, loaded, reload: load, hasDoc };
}

// ─────────────────────────────────────────────────────────────
// usePermitAttachments — same table, grouped by the new dynamic
// permit_type_id column instead of the old fixed `category` string.
// Used by the Binder redesign (permit_types/equipment_permits); the
// category-based useAttachments above is untouched and still backs the
// old fleet-tier admin screens.
// ─────────────────────────────────────────────────────────────

export function usePermitAttachments(
  equipmentType: EquipmentType | null,
  equipmentId: string | null,
  companyId: string | null,
) {
  const [groups, setGroups]   = useState<Map<string, AttachmentRecord[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!equipmentType || !equipmentId || !companyId) { setGroups(new Map()); return; }
    setLoading(true);
    const { data } = await supabase
      .from("equipment_attachments")
      .select("id, category, category_label, file_path, original_name, mime_type, page_order, uploaded_at, uploaded_by, permit_type_id")
      .eq("company_id", companyId)
      .eq("equipment_type", equipmentType)
      .eq("equipment_id", equipmentId)
      .not("permit_type_id", "is", null)
      .order("page_order");
    setLoading(false);
    if (!data) return;

    const map = new Map<string, AttachmentRecord[]>();
    for (const row of data as (AttachmentRecord & { permit_type_id: string })[]) {
      if (!map.has(row.permit_type_id)) map.set(row.permit_type_id, []);
      map.get(row.permit_type_id)!.push(row);
    }
    setGroups(map);
  }, [equipmentType, equipmentId, companyId]);

  useEffect(() => { load(); }, [load]);

  const pagesFor = useCallback((permitTypeId: string) => groups.get(permitTypeId) ?? [], [groups]);
  const hasDoc = useCallback((permitTypeId: string) => (groups.get(permitTypeId)?.length ?? 0) > 0, [groups]);

  return { loading, reload: load, pagesFor, hasDoc };
}

// ─────────────────────────────────────────────────────────────
// AttachmentIndicator — paperclip shown next to permit rows
// ─────────────────────────────────────────────────────────────

export function AttachmentIndicator({
  hasDoc,
  onOpen,
}: {
  hasDoc: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      title={hasDoc ? "View attached document" : "No document attached"}
      onClick={e => { e.stopPropagation(); if (hasDoc) onOpen(); }}
      style={{
        background: "none", border: "none", cursor: hasDoc ? "pointer" : "default",
        padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0,
        color: hasDoc ? T.info : `${T.muted}55`,
        fontSize: 13, minWidth: 22, minHeight: 22,
        WebkitTapHighlightColor: "transparent",
        transition: "color 150ms",
      }}
    >
      {/* SVG paperclip — responds to CSS color unlike emoji */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// DocPreviewModal — full-screen viewer with action bar
// ─────────────────────────────────────────────────────────────

export function DocPreviewModal({
  group,
  onClose,
}: {
  group: AttachmentGroup;
  onClose: () => void;
}) {
  const [pageIdx, setPageIdx] = useState(0);
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const pages = group.pages;
  const current = pages[pageIdx];

  // Generate signed URLs for all pages
  useEffect(() => {
    let cancelled = false;
    async function loadUrls() {
      const results = await Promise.all(
        pages.map(p =>
          supabase.storage.from("equipment-docs").createSignedUrl(p.file_path, 3600)
            .then(({ data }) => data?.signedUrl ?? null)
        )
      );
      if (!cancelled) setUrls(results);
    }
    loadUrls();
    return () => { cancelled = true; };
  }, [pages]);

  const currentUrl = urls[pageIdx] ?? null;
  const isImage = current?.mime_type?.startsWith("image/") ?? false;
  const isPdf   = current?.mime_type === "application/pdf";

  async function handleDownload() {
    if (!currentUrl) return;
    const a = document.createElement("a");
    a.href = currentUrl;
    a.download = current.original_name;
    a.click();
  }

  async function handleShare() {
    if (!currentUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${group.label} — ${current.original_name}`, url: currentUrl });
        return;
      } catch { /* fallthrough to copy */ }
    }
    // Fallback: copy URL
    await navigator.clipboard.writeText(currentUrl);
    alert("Link copied to clipboard.");
  }

  function handlePrint() {
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.print();
    } else if (currentUrl) {
      const w = window.open(currentUrl);
      w?.addEventListener("load", () => w.print());
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.95)",
        display: "flex", flexDirection: "column" as const }}
      onClick={onClose}
    >
      {/* Header */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: T.surface, flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{group.label}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
            {current?.original_name}
            {pages.length > 1 && ` — Page ${pageIdx + 1} of ${pages.length}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "none", border: "none", color: T.muted, fontSize: 20,
            cursor: "pointer", padding: "4px 8px", lineHeight: 1, flexShrink: 0 }}
        >✕</button>
      </div>

      {/* Document area */}
      <div
        style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center",
          justifyContent: "center", position: "relative" as const }}
        onClick={e => e.stopPropagation()}
      >
        {!currentUrl && (
          <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>
        )}
        {currentUrl && isImage && (
          <img
            src={currentUrl}
            alt={current.original_name}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        )}
        {currentUrl && isPdf && (
          <iframe
            ref={iframeRef}
            src={currentUrl}
            style={{ width: "100%", height: "100%", border: "none" }}
            title={current.original_name}
          />
        )}
        {currentUrl && !isImage && !isPdf && (
          <div style={{ textAlign: "center" as const, color: T.muted, padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>{current.original_name}</div>
            <button type="button" style={{ ...css.btn("primary") }} onClick={handleDownload}>
              Download to View
            </button>
          </div>
        )}

        {/* Prev / Next arrows for multi-page */}
        {pages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setPageIdx(i => Math.max(0, i - 1))}
              disabled={pageIdx === 0}
              style={{ position: "absolute" as const, left: 8, top: "50%", transform: "translateY(-50%)",
                background: "rgba(0,0,0,0.6)", border: "none", color: pageIdx === 0 ? T.muted : T.text,
                fontSize: 22, borderRadius: 2, cursor: pageIdx === 0 ? "default" : "pointer",
                padding: "8px 12px", lineHeight: 1 }}
            >‹</button>
            <button
              type="button"
              onClick={() => setPageIdx(i => Math.min(pages.length - 1, i + 1))}
              disabled={pageIdx === pages.length - 1}
              style={{ position: "absolute" as const, right: 8, top: "50%", transform: "translateY(-50%)",
                background: "rgba(0,0,0,0.6)", border: "none",
                color: pageIdx === pages.length - 1 ? T.muted : T.text,
                fontSize: 22, borderRadius: 2, cursor: pageIdx === pages.length - 1 ? "default" : "pointer",
                padding: "8px 12px", lineHeight: 1 }}
            >›</button>
          </>
        )}
      </div>

      {/* Page dots for multi-page */}
      {pages.length > 1 && (
        <div
          style={{ display: "flex", justifyContent: "center", gap: 6, padding: "8px 0", flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          {pages.map((_, i) => (
            <div
              key={i}
              onClick={() => setPageIdx(i)}
              style={{ width: 7, height: 7, borderRadius: "50%", cursor: "pointer",
                background: i === pageIdx ? T.accent : `${T.muted}55` }}
            />
          ))}
        </div>
      )}

      {/* Action bar */}
      <div
        style={{ display: "flex", gap: 8, padding: "12px 16px",
          background: T.surface, borderTop: `1px solid ${T.border}`, flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <ActionBtn icon="⬇" label="Save" onClick={handleDownload} disabled={!currentUrl} />
        <ActionBtn icon="↑" label="Share" onClick={handleShare} disabled={!currentUrl} />
        <ActionBtn icon="🖨" label="Print" onClick={handlePrint} disabled={!currentUrl} />
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, disabled }: {
  icon: string; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center",
        justifyContent: "center", gap: 3, background: disabled ? "rgba(255,255,255,0.04)" : T.surface2,
        border: `1px solid ${T.border}`, borderRadius: 2, padding: "10px 6px", cursor: disabled ? "default" : "pointer",
        color: disabled ? T.muted : T.text, fontSize: 18, lineHeight: 1 }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 10, color: T.muted, letterSpacing: 0.3 }}>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// DocHubModal — central upload + manage modal
// ─────────────────────────────────────────────────────────────

export function DocHubModal({
  equipmentType,
  equipmentId,
  equipmentName,
  companyId,
  onClose,
}: {
  equipmentType: EquipmentType;
  equipmentId: string;
  equipmentName: string;
  companyId: string;
  onClose: () => void;
}) {
  const { groups, loading, reload } = useAttachments(equipmentType, equipmentId, companyId);
  const categories = equipmentType === "truck" ? TRUCK_CATEGORIES : TRAILER_CATEGORIES;

  // Upload state
  const [uploading, setUploading]         = useState(false);
  const [uploadErr, setUploadErr]         = useState<string | null>(null);
  const [pendingFile, setPendingFile]     = useState<File | null>(null);
  const [pendingCat, setPendingCat]       = useState("");
  const [pendingLabel, setPendingLabel]   = useState("");
  const [showConflict, setShowConflict]   = useState(false);
  const [conflictGroup, setConflictGroup] = useState<AttachmentGroup | null>(null);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewGroup, setPreviewGroup] = useState<AttachmentGroup | null>(null);

  // Deleting
  const [deleting, setDeleting] = useState<string | null>(null);

  function pickFile() {
    setPendingFile(null);
    setPendingCat("");
    setUploadErr(null);
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingFile(f);
    e.target.value = "";
  }

  function onCategoryChange(slug: string) {
    setPendingCat(slug);
    const cat = categories.find(c => c.slug === slug);
    setPendingLabel(cat?.label ?? "");
  }

  function attemptUpload() {
    if (!pendingFile || !pendingCat) { setUploadErr("Please select a file and category."); return; }
    const existing = groups.find(g => g.category === pendingCat);
    if (existing) {
      setConflictGroup(existing);
      setShowConflict(true);
    } else {
      doUpload("add");
    }
  }

  async function doUpload(mode: "replace" | "add") {
    if (!pendingFile || !pendingCat) return;
    setShowConflict(false);
    setUploading(true);
    setUploadErr(null);

    try {
      // If replacing, delete existing pages
      if (mode === "replace" && conflictGroup) {
        for (const page of conflictGroup.pages) {
          await supabase.storage.from("equipment-docs").remove([page.file_path]);
          await supabase.from("equipment_attachments").delete().eq("id", page.id);
        }
      }

      // Determine page order
      const existingPages = mode === "add"
        ? (groups.find(g => g.category === pendingCat)?.pages ?? [])
        : [];
      const pageOrder = existingPages.length;

      // Build storage path
      const ext = pendingFile.name.split(".").pop() ?? "bin";
      const newId = crypto.randomUUID();
      const filePath = `${companyId}/${equipmentType}/${equipmentId}/${pendingCat}/${newId}.${ext}`;

      // Upload to storage
      const { error: storageErr } = await supabase.storage
        .from("equipment-docs")
        .upload(filePath, pendingFile, { contentType: pendingFile.type, upsert: false });
      if (storageErr) throw storageErr;

      const { data: { user } } = await supabase.auth.getUser();

      // Insert DB row
      const { error: dbErr } = await supabase.from("equipment_attachments").insert({
        id: newId,
        company_id: companyId,
        equipment_type: equipmentType,
        equipment_id: equipmentId,
        category: pendingCat,
        category_label: pendingLabel,
        file_path: filePath,
        original_name: pendingFile.name,
        mime_type: pendingFile.type || "application/octet-stream",
        page_order: pageOrder,
        uploaded_by: user?.id ?? null,
      });
      if (dbErr) {
        // Rollback storage upload
        await supabase.storage.from("equipment-docs").remove([filePath]);
        throw dbErr;
      }

      // Reset upload form
      setPendingFile(null);
      setPendingCat("");
      setPendingLabel("");
      setConflictGroup(null);
      await reload();
    } catch (e: any) {
      setUploadErr(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function deletePage(page: AttachmentRecord) {
    if (!confirm(`Remove "${page.original_name}"? This cannot be undone.`)) return;
    setDeleting(page.id);
    try {
      await supabase.storage.from("equipment-docs").remove([page.file_path]);
      await supabase.from("equipment_attachments").delete().eq("id", page.id);
      await reload();
    } catch (e: any) {
      alert("Delete failed: " + (e?.message ?? "unknown error"));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      {/* Main modal */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        onClick={onClose}
      >
        <div
          style={{ background: T.bg, borderRadius: "2px 2px 0 0", width: "100%", maxWidth: 560,
            maxHeight: "90vh", display: "flex", flexDirection: "column" as const,
            border: `1px solid ${T.border}`, borderBottom: "none" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 16px 12px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: T.text }}>Documents</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{equipmentName}</div>
            </div>
            <button type="button" onClick={onClose}
              style={{ background: "none", border: "none", color: T.muted, fontSize: 20,
                cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>✕</button>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: "auto" as const, padding: "12px 16px" }}>

            {/* ── Upload Section ── */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 2, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>
                Add Document
              </div>

              {/* File picker */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                style={{ display: "none" }}
                onChange={onFileChosen}
              />
              <button
                type="button"
                onClick={pickFile}
                style={{ ...css.btn("subtle"), width: "100%", marginBottom: 8,
                  borderStyle: "dashed", fontSize: 12, padding: "10px",
                  color: pendingFile ? T.accent : T.muted }}
              >
                {pendingFile ? `📎 ${pendingFile.name}` : "📎 Choose File…"}
              </button>

              {/* Category dropdown */}
              <select
                value={pendingCat}
                onChange={e => onCategoryChange(e.target.value)}
                style={{ ...css.select, width: "100%", marginBottom: 8, fontSize: 12 }}
              >
                <option value="">— Select Category —</option>
                {categories.map(c => (
                  <option key={c.slug} value={c.slug}>{c.label}</option>
                ))}
              </select>

              {uploadErr && (
                <div style={{ fontSize: 11, color: T.danger, marginBottom: 6 }}>{uploadErr}</div>
              )}

              <button
                type="button"
                onClick={attemptUpload}
                disabled={uploading || !pendingFile || !pendingCat}
                style={{ ...css.btn("primary"), width: "100%", fontSize: 13,
                  opacity: (!pendingFile || !pendingCat) ? 0.4 : 1 }}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>

            {/* ── Existing Docs ── */}
            {loading && <div style={{ fontSize: 12, color: T.muted, padding: "8px 0" }}>Loading…</div>}

            {!loading && groups.length === 0 && (
              <div style={{ fontSize: 12, color: T.muted, textAlign: "center" as const, padding: "24px 0" }}>
                No documents attached yet.
              </div>
            )}

            {groups.map(group => (
              <div key={group.category} style={{ marginBottom: 10 }}>
                {/* Category header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{group.label}</span>
                  <span style={{ fontSize: 10, color: T.muted,
                    background: T.surface2, padding: "1px 7px", borderRadius: 2 }}>
                    {group.pages.length} {group.pages.length === 1 ? "page" : "pages"}
                  </span>
                </div>

                {/* Pages */}
                {group.pages.map((page, pi) => (
                  <div key={page.id}
                    style={{ display: "flex", alignItems: "center", gap: 8,
                      background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: 2, padding: "8px 10px", marginBottom: 4 }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>
                      {page.mime_type?.startsWith("image/") ? "🖼" : "📄"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: T.text, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {group.pages.length > 1 ? `Page ${pi + 1} — ` : ""}{page.original_name}
                      </div>
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>
                        {new Date(page.uploaded_at).toLocaleDateString()}
                      </div>
                    </div>
                    {/* View */}
                    <button type="button"
                      onClick={() => setPreviewGroup(group)}
                      style={{ background: "none", border: "none", cursor: "pointer",
                        color: T.accent, fontSize: 11, padding: "4px 8px", flexShrink: 0,
                        borderRadius: 2, fontWeight: 600 }}>
                      View
                    </button>
                    {/* Delete */}
                    <button type="button"
                      onClick={() => deletePage(page)}
                      disabled={deleting === page.id}
                      style={{ background: "none", border: "none", cursor: "pointer",
                        color: T.danger, fontSize: 14, padding: "4px 6px", flexShrink: 0,
                        opacity: deleting === page.id ? 0.4 : 1 }}>
                      {deleting === page.id ? "…" : "✕"}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Conflict resolution sheet */}
      {showConflict && conflictGroup && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 2100, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setShowConflict(false)}
        >
          <div
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 2,
              padding: 20, maxWidth: 340, width: "100%" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 6 }}>
              "{conflictGroup.label}" already has {conflictGroup.pages.length} {conflictGroup.pages.length === 1 ? "file" : "files"}
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Do you want to replace the existing file(s) or add this as an additional page?
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              <button type="button"
                style={{ ...css.btn("primary"), textAlign: "center" as const }}
                onClick={() => doUpload("add")}>
                + Add as additional page
              </button>
              <button type="button"
                style={{ ...css.btn("ghost"), textAlign: "center" as const,
                  color: T.warning, borderColor: T.warning }}
                onClick={() => doUpload("replace")}>
                Replace existing file(s)
              </button>
              <button type="button"
                style={{ ...css.btn("subtle"), textAlign: "center" as const }}
                onClick={() => setShowConflict(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen preview */}
      {previewGroup && (
        <DocPreviewModal group={previewGroup} onClose={() => setPreviewGroup(null)} />
      )}
    </>
  );
}
