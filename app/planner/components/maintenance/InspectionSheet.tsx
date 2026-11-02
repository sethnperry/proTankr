"use client";
// app/planner/components/maintenance/InspectionSheet.tsx
//
// Inspect a truck or trailer: pick the unit, rate each item Good / Fair / Needs replacement soon (anything not
// Good says what's wrong), add photos, submit. If a management campaign is open for the unit it is shown and the
// inspection counts for it. Presentational: the caller writes the inspection.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CaptureSheet } from "../capture/CaptureSheet";
import { CONDITIONS, INSPECTION_ITEMS, inspectionProblem, type InspectionCondition, type Ratings, type UnitKind } from "@/lib/maintenance/inspection";
import type { Campaign } from "@/lib/maintenance/board";

export type InspectUnit = { kind: UnitKind; id: string; name: string };
const COLOR: Record<InspectionCondition, string> = { good: "#4ade80", fair: "#fbbf24", replace_soon: "#f87171" };

export function InspectionSheet({ open, onClose, units, campaignsFor, companyId, userId, onSubmit }: {
  open: boolean;
  onClose: () => void;
  units: InspectUnit[];
  campaignsFor: (u: InspectUnit) => Campaign[];
  companyId: string | null;
  userId: string | null;
  /** Resolves with the message to show, or throws. */
  onSubmit: (o: { unit: InspectUnit; ratings: Ratings; campaignId: string | null; notes: string; captureId: string | null }) => Promise<string>;
}) {
  const [unitKey, setUnitKey] = useState("");
  const [ratings, setRatings] = useState<Ratings>({});
  const [notes, setNotes] = useState("");
  const [capture, setCapture] = useState<{ id: string; count: number } | null>(null);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { if (open) { setUnitKey(units[0] ? `${units[0].kind}:${units[0].id}` : ""); setRatings({}); setNotes(""); setCapture(null); setErr(null); setDone(null); setBusy(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const unit = units.find((u) => `${u.kind}:${u.id}` === unitKey) ?? null;
  const campaigns = unit ? campaignsFor(unit) : [];
  const chip = (on: boolean, color?: string): React.CSSProperties => ({ flex: 1, padding: "9px 4px", fontSize: 12, fontWeight: 800, cursor: "pointer", border: `1px solid ${on ? color ?? "#fff" : "rgba(255,255,255,0.16)"}`, background: on ? color ?? "#fff" : "#0a0a0b", color: on ? "#000" : "rgba(255,255,255,0.8)" });

  const submit = async () => {
    if (!unit) { setErr("Pick the unit."); return; }
    const p = inspectionProblem(unit.kind, ratings);
    if (p) { setErr(p); return; }
    setBusy(true); setErr(null);
    try { setDone(await onSubmit({ unit, ratings, campaignId: campaigns[0]?.campaign_id ?? null, notes, captureId: capture?.id ?? null })); } catch (e: any) { setErr(e?.message ?? "Couldn't save. Try again."); }
    setBusy(false);
  };

  return (
    <>
      <FullscreenModal open={open && !photosOpen} title="Inspect a unit" onClose={onClose} footer={null}>
        {done ? (
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Submitted</div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{done}</div>
            <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 20, padding: "16px 0", fontSize: 16, fontWeight: 900, textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>Done</button>
          </div>
        ) : (
          <>
            {units.length === 0 && <div style={{ color: "#fbbf24", fontSize: 14 }}>Pick your truck or trailer on the Equipment tool first.</div>}
            {units.length > 1 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {units.map((u) => <button key={`${u.kind}:${u.id}`} type="button" style={chip(unitKey === `${u.kind}:${u.id}`)} onClick={() => { setUnitKey(`${u.kind}:${u.id}`); setRatings({}); }}>{u.kind === "truck" ? "Truck" : "Trailer"} {u.name}</button>)}
              </div>
            )}
            {unit && units.length === 1 && <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{unit.kind === "truck" ? "Truck" : "Trailer"} {unit.name}</div>}
            {campaigns[0] && (
              <div style={{ border: "1px solid rgba(255,255,255,0.35)", padding: "10px 12px", marginBottom: 12, fontSize: 14 }}>
                <b>{campaigns[0].name}</b> is open for this unit{campaigns[0].due_on ? ` (due ${campaigns[0].due_on})` : ""}. This inspection counts for it.
              </div>
            )}
            {unit && INSPECTION_ITEMS[unit.kind].map((it) => {
              const r = ratings[it.key] ?? { condition: null, note: "" };
              return (
                <div key={it.key} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "12px 0" }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{it.label}</div>
                  {it.hint && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>{it.hint}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {CONDITIONS.map((c) => (
                      <button key={c.value} type="button" style={chip(r.condition === c.value, COLOR[c.value])} onClick={() => setRatings((m) => ({ ...m, [it.key]: { ...r, condition: c.value } }))}>{c.value === "replace_soon" ? "Replace soon" : c.label}</button>
                    ))}
                  </div>
                  {r.condition && r.condition !== "good" && (
                    <input value={r.note} onChange={(e) => setRatings((m) => ({ ...m, [it.key]: { ...r, note: e.target.value } }))} placeholder="What's wrong?"
                      style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: 10, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0 }} />
                  )}
                </div>
              );
            })}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else? (optional)"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 60, marginTop: 8, padding: 10, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0, fontFamily: "inherit" }} />
            <button type="button" onClick={() => setPhotosOpen(true)}
              style={{ width: "100%", marginTop: 10, padding: "13px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff" }}>
              {capture ? `✓ ${capture.count} photo${capture.count === 1 ? "" : "s"} · tap to change` : "📷 Add photos"}
            </button>
            {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
            <button type="button" disabled={busy} aria-busy={busy} onClick={() => void submit()}
              style={{ width: "100%", marginTop: 14, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Submit inspection"}
            </button>
          </>
        )}
      </FullscreenModal>
      <CaptureSheet open={open && photosOpen} purpose="inspection" title="Inspection photos" companyId={companyId} userId={userId} refType="unit_inspection"
        onDone={(r) => { setCapture({ id: r.captureId, count: r.paths.length }); setPhotosOpen(false); }} onClose={() => setPhotosOpen(false)} />
    </>
  );
}
