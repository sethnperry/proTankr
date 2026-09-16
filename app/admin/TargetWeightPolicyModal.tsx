"use client";
// app/admin/TargetWeightPolicyModal.tsx
//
// Fleet-tier target weight policy — company-wide default (reuses the
// existing incentive_settings.target_gross_lbs) plus optional per-region and
// per-local-area overrides (equipment_regions/equipment_local_areas'
// target_weight_override columns, migration 20260917000000). Resolved
// automatically by couple_combo for any newly-created combo — see that
// migration's own header comment. This modal is purely the admin-facing
// editor for the policy; it never touches equipment_combos directly.
//
// Structural template: PayrollReportModal.tsx's own folded-in settings
// section (state/load/save shape) — same modal shell, same
// .upsert(..., {onConflict:"company_id"}) pattern for the company row.
// Writes to the region/area override columns go through the new
// set_equipment_region_target/set_equipment_local_area_target RPCs
// (admin-gated server-side, not a bare .update() — this number feeds
// payload-utilization/payroll math), not a plain client-side .update().

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
};

type CatalogTargetRow = {
  id: string;
  name: string;
  target_weight_override: number | null;
};

const INPUT: React.CSSProperties = {
  borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 13, padding: "8px 10px", boxSizing: "border-box" as const,
};
const LABEL = "rgba(255,255,255,0.4)";
const MUTED = "rgba(255,255,255,0.45)";

function fmt(n: number | null): string {
  return n == null ? "" : String(Math.round(n));
}

export default function TargetWeightPolicyModal({ open, onClose, companyId }: Props) {
  const [error, setError] = useState<string | null>(null);

  const [companyTarget, setCompanyTarget] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  const [regions, setRegions] = useState<CatalogTargetRow[]>([]);
  const [localAreas, setLocalAreas] = useState<CatalogTargetRow[]>([]);
  // Local edit buffer per row, keyed by id -- lets a row's input diverge
  // from the saved value while typing, without touching the others.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [{ data: settings }, { data: regionRows }, { data: areaRows }] = await Promise.all([
      supabase.from("incentive_settings").select("target_gross_lbs").eq("company_id", companyId).maybeSingle(),
      supabase.from("equipment_regions").select("region_id, name, target_weight_override")
        .eq("company_id", companyId).eq("is_active", true).order("name"),
      supabase.from("equipment_local_areas").select("local_area_id, name, target_weight_override")
        .eq("company_id", companyId).eq("is_active", true).order("name"),
    ]);
    setCompanyTarget(fmt((settings as any)?.target_gross_lbs ?? 79500));
    const rRows = ((regionRows ?? []) as any[]).map((r) => ({ id: String(r.region_id), name: r.name as string, target_weight_override: r.target_weight_override }));
    const aRows = ((areaRows ?? []) as any[]).map((r) => ({ id: String(r.local_area_id), name: r.name as string, target_weight_override: r.target_weight_override }));
    setRegions(rRows);
    setLocalAreas(aRows);
    setDraft(Object.fromEntries([...rRows, ...aRows].map((r) => [r.id, fmt(r.target_weight_override)])));
  }, [companyId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  async function saveCompanyTarget() {
    const n = parseFloat(companyTarget);
    if (!Number.isFinite(n) || n <= 0) { setError("Enter a valid company target."); return; }
    setSavingCompany(true); setError(null);
    try {
      const { error: err } = await supabase.from("incentive_settings").upsert(
        { company_id: companyId, target_gross_lbs: n },
        { onConflict: "company_id" }
      );
      if (err) throw err;
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSavingCompany(false);
    }
  }

  async function saveOverride(kind: "region" | "localArea", row: CatalogTargetRow, value: number | null) {
    setSavingId(row.id); setError(null);
    try {
      const rpc = kind === "region" ? "set_equipment_region_target" : "set_equipment_local_area_target";
      const param = kind === "region" ? { p_region_id: row.id, p_target: value } : { p_local_area_id: row.id, p_target: value };
      const { error: err } = await supabase.rpc(rpc, param as any);
      if (err) throw err;
      await load();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSavingId(null);
    }
  }

  if (!open) return null;

  function renderRow(kind: "region" | "localArea", row: CatalogTargetRow) {
    const draftVal = draft[row.id] ?? "";
    const parsed = parseFloat(draftVal);
    const hasOverride = row.target_weight_override != null;
    const dirty = fmt(row.target_weight_override) !== draftVal;
    return (
      <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {row.name}
        </div>
        <input
          type="text" inputMode="numeric"
          value={draftVal}
          placeholder="Company policy"
          onChange={(e) => setDraft((d) => ({ ...d, [row.id]: e.target.value.replace(/[^0-9]/g, "") }))}
          style={{ ...INPUT, width: 110, textAlign: "right" as const }}
        />
        <button
          type="button"
          disabled={savingId === row.id || !dirty || !(Number.isFinite(parsed) && parsed > 0)}
          onClick={() => void saveOverride(kind, row, parsed)}
          style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.1)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, opacity: dirty ? 1 : 0.4 }}
        >
          {savingId === row.id ? "…" : "Save"}
        </button>
        <button
          type="button"
          disabled={savingId === row.id || !hasOverride}
          onClick={() => { setDraft((d) => ({ ...d, [row.id]: "" })); void saveOverride(kind, row, null); }}
          title="Reset to company policy"
          style={{ padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, opacity: hasOverride ? 1 : 0.35 }}
        >
          Reset
        </button>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Target Weight</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 }}>
            Company Default
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input
              type="text" inputMode="numeric" value={companyTarget}
              onChange={(e) => setCompanyTarget(e.target.value.replace(/[^0-9]/g, ""))}
              style={{ ...INPUT, flex: 1 }}
            />
            <button type="button" onClick={saveCompanyTarget} disabled={savingCompany}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.1)", color: "#4ade80", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}>
              {savingCompany ? "Saving…" : "Save"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginBottom: 20 }}>
            Applied automatically to a driver's target the moment they couple new equipment —
            no manual entry needed unless a region or local area below overrides it.
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>
            Region Overrides
          </div>
          {regions.length === 0 ? (
            <div style={{ fontSize: 12, color: MUTED, padding: "8px 0" }}>No regions on file yet.</div>
          ) : (
            <div>{regions.map((r) => renderRow("region", r))}</div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: LABEL, textTransform: "uppercase" as const, letterSpacing: 0.5, margin: "20px 0 4px" }}>
            Local Area Overrides
          </div>
          {localAreas.length === 0 ? (
            <div style={{ fontSize: 12, color: MUTED, padding: "8px 0" }}>No local areas on file yet.</div>
          ) : (
            <div>{localAreas.map((r) => renderRow("localArea", r))}</div>
          )}
          <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginTop: 12 }}>
            A local area override wins over a region override, which wins over the company default.
            Leave blank (or tap Reset) to follow whatever's above it.
          </div>

          {error && <div style={{ marginTop: 14, fontSize: 12, color: "#ef4444" }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
