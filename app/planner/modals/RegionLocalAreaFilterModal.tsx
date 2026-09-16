"use client";
// app/planner/modals/RegionLocalAreaFilterModal.tsx
//
// The Filter button's destination, per the 2026-08-29 equipment-modal-
// rework note: "gives a window with two big options: Region, Local Area...
// filters all the equipment down to only show what is local... need an
// All regions and an All areas options." Reused by both
// SoloEquipmentModal.tsx (solo tier) and EquipmentModal.tsx (fleet tier,
// a later phase) so the two never drift.
//
// `canManage` (admin/dispatch/lead, or solo's always-admin role) gates
// add/rename/soft-delete of the underlying equipment_regions/
// equipment_local_areas catalogs (migration 20260829010000) -- everyone
// else gets select-only, per explicit user direction. This is the ONE
// place those catalogs are managed; RequiredEquipmentFields.tsx's own
// pickers can create a brand-new entry inline (so a fresh company isn't
// blocked adding its first truck) but deliberately can't rename/remove --
// that stays here, so there's only one editor per catalog, not two that
// could disagree.

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

export type EquipmentFilter = { region: string | null; localArea: string | null; awayOnly?: boolean };

type CatalogRow = { id: string; name: string };
type Kind = "region" | "localArea";

const TABLE: Record<Kind, "equipment_regions" | "equipment_local_areas"> = {
  region: "equipment_regions",
  localArea: "equipment_local_areas",
};
const ID_COL: Record<Kind, "region_id" | "local_area_id"> = {
  region: "region_id",
  localArea: "local_area_id",
};
const LABEL: Record<Kind, string> = { region: "Region", localArea: "Local Area" };

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  padding: "13px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)", cursor: "pointer", marginBottom: 8,
};
const bigOptionStyle: React.CSSProperties = {
  width: "100%", padding: "18px 18px", borderRadius: 8, marginBottom: 10,
  border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)",
  color: "#fff", cursor: "pointer", textAlign: "left" as const,
  display: "flex", alignItems: "center", justifyContent: "space-between",
};

// ─── One kind's list: pick a value, or (if canManage) add/rename/remove ────

function CatalogList({
  kind, companyId, canManage, current, onPick, onClose,
}: {
  kind: Kind;
  companyId: string;
  canManage: boolean;
  current: string | null;
  onPick: (name: string | null) => void;
  onClose: () => void;
}) {
  const table = TABLE[kind];
  const idCol = ID_COL[kind];
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<CatalogRow | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<CatalogRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from(table).select(`${idCol}, name`).eq("company_id", companyId).eq("is_active", true).order("name");
    setRows(((data ?? []) as any[]).map((r) => ({ id: String(r[idCol]), name: r.name as string })));
  }, [table, idCol, companyId]);
  useEffect(() => { void load(); }, [load]);

  async function addNew() {
    if (!newName.trim()) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.from(table).insert({ company_id: companyId, name: newName.trim() });
      if (error) throw error;
      setNewName(""); setAdding(false);
      void load();
    } catch (e: any) { setErr(e?.message ?? "Failed to add."); } finally { setBusy(false); }
  }

  async function saveRename() {
    if (!renaming || !renameVal.trim()) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.from(table).update({ name: renameVal.trim() }).eq(idCol, renaming.id);
      if (error) throw error;
      setRenaming(null);
      void load();
    } catch (e: any) { setErr(e?.message ?? "Failed to rename."); } finally { setBusy(false); }
  }

  async function doRemove() {
    if (!confirmRemove) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.from(table).update({ is_active: false }).eq(idCol, confirmRemove.id);
      if (error) throw error;
      if (current === confirmRemove.name) onPick(null);
      setConfirmRemove(null);
      void load();
    } catch (e: any) { setErr(e?.message ?? "Failed to remove."); } finally { setBusy(false); }
  }

  return (
    <FullscreenModal open title={LABEL[kind]} onClose={onClose} footer={null}>
      <div style={{ display: "grid", gap: 8 }}>
        {err && <div style={{ color: "#fca5a5", fontSize: 12 }}>{err}</div>}

        <div onClick={() => onPick(null)} style={{ ...rowStyle, background: current == null ? "rgba(255,255,255,0.10)" : rowStyle.background }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>All {LABEL[kind] === "Region" ? "Regions" : "Areas"}</span>
        </div>

        {rows.map((r) => (
          <div key={r.id} style={{ ...rowStyle, background: current === r.name ? "rgba(255,255,255,0.10)" : rowStyle.background }}>
            <span onClick={() => onPick(r.name)} style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
              {r.name}
            </span>
            {canManage && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => { setRenaming(r); setRenameVal(r.name); }}
                  title={`Rename "${r.name}"`}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer" }}>✎</button>
                <button type="button" onClick={() => setConfirmRemove(r)}
                  title={`Remove "${r.name}"`}
                  style={{ background: "none", border: "none", color: "#fca5a5", fontSize: 14, cursor: "pointer" }}>✕</button>
              </div>
            )}
          </div>
        ))}

        {canManage && (
          !adding ? (
            <button type="button" onClick={() => setAdding(true)}
              style={{ textAlign: "left" as const, padding: "12px 14px", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.18)", background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              + Add {LABEL[kind]}
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addNew(); }}
                placeholder={`New ${LABEL[kind].toLowerCase()} name`}
                style={{ flex: 1, borderRadius: 6, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 14, boxSizing: "border-box" as const }} />
              <button type="button" onClick={addNew} disabled={busy || !newName.trim()}
                style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 700, fontSize: 13, padding: "0 16px", cursor: "pointer" }}>
                {busy ? "…" : "Add"}
              </button>
            </div>
          )
        )}
      </div>

      {/* ── Rename prompt ── */}
      {renaming && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 20, maxWidth: 360, width: "100%" }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Rename &quot;{renaming.name}&quot;</div>
            <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); }}
              style={{ width: "100%", borderRadius: 6, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.28)", color: "#fff", fontSize: 16, boxSizing: "border-box" as const, marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setRenaming(null)} disabled={busy}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={saveRename} disabled={busy || !renameVal.trim()}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove confirmation ── */}
      {confirmRemove && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 20, maxWidth: 360, width: "100%" }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Remove &quot;{confirmRemove.name}&quot;?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 16 }}>
              This only affects future selections -- equipment already using it keeps that value on file.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setConfirmRemove(null)} disabled={busy}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={doRemove} disabled={busy}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(220,60,60,0.5)", background: "rgba(180,40,40,0.25)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                {busy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FullscreenModal>
  );
}

// ─── Main: two big options ───────────────────────────────────────────────

export default function RegionLocalAreaFilterModal({
  open, onClose, companyId, canManage, filter, onChange,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  canManage: boolean;
  filter: EquipmentFilter;
  onChange: (f: EquipmentFilter) => void;
}) {
  const [sub, setSub] = useState<Kind | null>(null);

  if (!open) return null;

  return (
    <>
      <FullscreenModal open={open} title="Filter Equipment" onClose={onClose} footer={null}>
        <div style={{ display: "grid", gap: 4 }}>
          <button type="button" onClick={() => setSub("region")} style={bigOptionStyle}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Region</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{filter.region ?? "All Regions"}</span>
          </button>
          <button type="button" onClick={() => setSub("localArea")} style={bigOptionStyle}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Local Area</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{filter.localArea ?? "All Areas"}</span>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...filter, awayOnly: !filter.awayOnly })}
            style={{ ...bigOptionStyle, border: filter.awayOnly ? "1px solid rgba(251,146,60,0.5)" : bigOptionStyle.border }}
          >
            <span style={{ fontSize: 17, fontWeight: 800 }}>Borrowed / Away</span>
            <span style={{ fontSize: 13, color: filter.awayOnly ? "#fb923c" : "rgba(255,255,255,0.5)" }}>
              {filter.awayOnly ? "On" : "Off"}
            </span>
          </button>
        </div>
      </FullscreenModal>

      {sub && (
        <CatalogList
          kind={sub}
          companyId={companyId}
          canManage={canManage}
          current={sub === "region" ? filter.region : filter.localArea}
          onPick={(name) => {
            onChange(sub === "region" ? { ...filter, region: name } : { ...filter, localArea: name });
            setSub(null);
          }}
          onClose={() => setSub(null)}
        />
      )}
    </>
  );
}
