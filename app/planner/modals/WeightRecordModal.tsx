"use client";
// modals/WeightRecordModal.tsx
//
// "Record Weight" -- a real two-weigh scale-ticket entry, opened from
// ScaleTicketModal. Distinct from the tare_lbs/target_weight *settings* on
// equipment_combos: this logs an actual Heavy Weight (loaded, at scale) and
// Light Weight (empty, at scale) reading.
//
// Net (Heavy - Light) is the actual measured product weight, compared
// against the most recently completed load's calculated weight to check
// the temp/API density math. Light Weight alone is the actual measured
// tare, compared against the combo's stored tare_lbs to catch drift.
//
// Deliberately does NOT touch load_log/load_lines (the load's own record
// stays exactly as it was at completion time) and does NOT auto-correct
// tare_lbs -- that's an explicit opt-in toggle the driver has to turn on
// before saving (confirmed with user: correcting tare from a discrepancy
// should never happen silently).

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type LoadLine = {
  comp_number: number;
  actual_gallons: number | null;
  actual_lbs: number | null;
  actual_temp_f: number | null;
  actual_api: number | null;
  products: { button_code: string | null; display_name: string | null } | null;
};
type LoadSummary = {
  load_id: string;
  completed_at: string | null;
  actual_total_gal: number | null;
  actual_total_lbs: number | null;
  gross_limit_lbs: number | null;
  terminalLabel: string;
  lines: LoadLine[];
};

const S = {
  label: { fontSize: 13, fontWeight: 700 as const, color: "rgba(255,255,255,0.55)", marginBottom: 6, display: "block" },
  input: {
    width: "100%", borderRadius: 2, padding: "12px 14px",
    border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.28)",
    color: "rgba(255,255,255,0.92)", fontSize: 18, fontWeight: 700 as const,
    outline: "none", boxSizing: "border-box" as const,
  } as React.CSSProperties,
  err: {
    borderRadius: 2, padding: 14, background: "rgba(180,40,40,0.18)", border: "1px solid rgba(180,40,40,0.32)",
    color: "rgba(255,255,255,0.92)", fontWeight: 700, marginBottom: 16, fontSize: 13, lineHeight: 1.5,
  } as React.CSSProperties,
  notice: {
    borderRadius: 2, padding: "12px 14px", marginBottom: 16,
    background: "rgba(180,50,20,0.12)", border: "1px solid rgba(220,80,40,0.30)",
  } as React.CSSProperties,
  noticeLabel: { fontSize: 11, fontWeight: 900, color: "#fb923c", letterSpacing: 0.8, marginBottom: 4 },
  noticeBody: { fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 },
};

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : Math.round(n).toLocaleString();
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" });
}

export default function WeightRecordModal({
  open, onClose, companyId, comboId, authUserId, currentTareLbs, truckName, trailerName, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  comboId: string;
  authUserId: string | null;
  currentTareLbs: number | null;
  truckName?: string | null;
  trailerName?: string | null;
  onSaved: (newTareLbs?: number) => void;
}) {
  const [load, setLoad] = useState<LoadSummary | null>(null);
  const [loadingLoad, setLoadingLoad] = useState(true);
  const [heavy, setHeavy] = useState("");
  const [light, setLight] = useState("");
  const [updateTare, setUpdateTare] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeavy("");
    setLight("");
    setUpdateTare(false);
    setNotes("");
    setErr(null);
    setLoadingLoad(true);
    (async () => {
      const { data: loadRow } = await supabase
        .from("load_log")
        .select("load_id, completed_at, terminal_id, actual_total_gal, actual_total_lbs, gross_limit_lbs")
        .eq("combo_id", comboId)
        .eq("status", "loaded")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!loadRow) { setLoad(null); setLoadingLoad(false); return; }

      const [{ data: lines }, { data: terminal }] = await Promise.all([
        supabase.from("load_lines")
          .select("comp_number, actual_gallons, actual_lbs, actual_temp_f, actual_api, products(button_code, display_name)")
          .eq("load_id", loadRow.load_id)
          .order("comp_number"),
        loadRow.terminal_id
          ? supabase.from("terminals").select("terminal_name, city, state").eq("terminal_id", loadRow.terminal_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const terminalLabel = terminal
        ? [terminal.terminal_name, [terminal.city, terminal.state].filter(Boolean).join(", ")].filter(Boolean).join(" - ")
        : "";

      setLoad({
        load_id: loadRow.load_id,
        completed_at: loadRow.completed_at,
        actual_total_gal: loadRow.actual_total_gal,
        actual_total_lbs: loadRow.actual_total_lbs,
        gross_limit_lbs: loadRow.gross_limit_lbs,
        terminalLabel,
        lines: (lines ?? []) as unknown as LoadLine[],
      });
      setLoadingLoad(false);
    })();
  }, [open, comboId]);

  const heavyNum = heavy.trim() ? Number(heavy) : null;
  const lightNum = light.trim() ? Number(light) : null;
  const netWeight = heavyNum != null && lightNum != null ? heavyNum - lightNum : null;
  const plannerDiff = netWeight != null && load?.actual_total_lbs != null ? Math.round(netWeight - load.actual_total_lbs) : null;
  const tareDiff = lightNum != null && currentTareLbs != null ? Math.round(lightNum - currentTareLbs) : null;

  const computedGross = load?.actual_total_lbs != null && currentTareLbs != null ? currentTareLbs + load.actual_total_lbs : null;
  const grossDiff = computedGross != null && load?.gross_limit_lbs != null ? Math.round(computedGross - load.gross_limit_lbs) : null;

  async function save() {
    if (heavyNum == null || lightNum == null) { setErr("Enter both Heavy and Light weight."); return; }
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from("weight_records").insert({
        company_id: companyId,
        combo_id: comboId,
        load_id: load?.load_id ?? null,
        heavy_weight_lbs: heavyNum,
        light_weight_lbs: lightNum,
        planner_weight_lbs: load?.actual_total_lbs ?? null,
        prior_tare_lbs: currentTareLbs,
        tare_updated: updateTare && tareDiff !== 0,
        notes: notes.trim() || null,
        created_by: authUserId,
      });
      if (error) throw error;

      if (updateTare && tareDiff !== 0) {
        const { error: tareErr } = await supabase.from("equipment_combos").update({ tare_lbs: lightNum }).eq("combo_id", comboId);
        if (tareErr) throw tareErr;
      }

      onSaved(updateTare && tareDiff !== 0 ? lightNum : undefined);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save weight record.");
    } finally {
      setBusy(false);
    }
  }

  const label = [truckName, trailerName].filter(Boolean).join(" / ") || "Unknown";

  return (
    <FullscreenModal open={open} onClose={onClose} title="Weight Record" footer={null}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#000" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 8px" }}>

          <div style={{
            borderRadius: 2, border: "1px dashed rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.03)", padding: "12px 14px",
            marginTop: 6, marginBottom: 18, fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7,
          }}>
            {loadingLoad ? (
              "Loading most recent load…"
            ) : !load ? (
              `No completed load found yet for ${label}.`
            ) : (
              <>
                <div>{fmtDateTime(load.completed_at)}{load.terminalLabel ? ` - ${load.terminalLabel}` : ""}</div>
                {load.lines.map((l) => (
                  <div key={l.comp_number}>
                    C{l.comp_number} - {l.products?.button_code ?? "?"} - {fmt(l.actual_gallons)} gal - {fmt(l.actual_lbs)} lbs - {l.actual_temp_f != null ? `${Math.round(l.actual_temp_f)}f` : "—"} - {l.actual_api != null ? l.actual_api.toFixed(1) : "—"} API
                  </div>
                ))}
                <div style={{ color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>
                  {fmt(load.lines.length ? load.lines.reduce((sum, l) => sum + (l.actual_gallons ?? 0), 0) : null)} gal - {fmt(load.actual_total_lbs)} lbs
                  {computedGross != null && ` - (${fmt(computedGross)})`}
                  {grossDiff != null && (
                    <span style={{ color: grossDiff > 0 ? "#ef4444" : "rgba(255,255,255,0.4)" }}> {grossDiff > 0 ? "+" : ""}{grossDiff}</span>
                  )}
                </div>
              </>
            )}
          </div>

          {err && <div style={S.err}>{err}</div>}

          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Heavy weight (lbs)</label>
            <input type="number" inputMode="numeric" placeholder="e.g. 79840" value={heavy} onChange={(e) => setHeavy(e.target.value)} style={S.input} />
          </div>

          <div style={{ marginBottom: 8, fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
            Drop and reweigh to correct the record and planner.
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Light weight (lbs)</label>
            <input type="number" inputMode="numeric" placeholder="e.g. 25265" value={light} onChange={(e) => setLight(e.target.value)} style={S.input} />
          </div>

          {netWeight != null && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
              {fmt(heavyNum)} − {fmt(lightNum)} = {fmt(netWeight)} lbs
            </div>
          )}

          {netWeight != null && (tareDiff !== null || plannerDiff !== null) && (
            <div style={S.notice}>
              <div style={S.noticeLabel}>NOTICE</div>
              <div style={S.noticeBody}>
                {plannerDiff === 0 && "Zero discrepancy with the planner. "}
                {plannerDiff != null && plannerDiff !== 0 && `Net weight is ${Math.abs(plannerDiff)} lbs ${plannerDiff > 0 ? "over" : "under"} the calculated load weight -- could be API variance or a density shift. `}
                {tareDiff != null && tareDiff !== 0 && `Measured tare is ${Math.abs(tareDiff)} lbs ${tareDiff > 0 ? "over" : "under"} the stored tare weight (${fmt(currentTareLbs)} lbs).`}
              </div>
              {tareDiff != null && tareDiff !== 0 && (
                <div
                  onClick={() => setUpdateTare((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 2, flexShrink: 0,
                    border: "1px solid rgba(255,255,255,0.3)",
                    background: updateTare ? "#fb923c" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {updateTare && <span style={{ fontSize: 13, fontWeight: 900, color: "#000" }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>
                    Update stored tare to {fmt(lightNum)} lbs
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...S.input, minHeight: 70, fontFamily: "inherit", fontWeight: 500, resize: "vertical" as const }} />
          </div>
        </div>

        <div style={{ padding: "12px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "#000", flexShrink: 0 }}>
          <button aria-busy={!!(busy)}
            type="button"
            onClick={save}
            disabled={busy}
            style={{
              width: "100%", borderRadius: 2, padding: "15px 18px", fontWeight: 900, fontSize: 17,
              border: "none", background: "#fff",
              color: "#000", cursor: "pointer",
            }}
          >
            {busy ? "Saving…" : "Record & Close"}
          </button>
        </div>
      </div>
    </FullscreenModal>
  );
}
