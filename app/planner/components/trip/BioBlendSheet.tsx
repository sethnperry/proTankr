"use client";
// app/planner/components/trip/BioBlendSheet.tsx
//
// The Bio record: what the driver needs at the blender (the BOLs and each compartment's gallons) and a place to enter
// the bio gallons the blender printed, one per diesel compartment. The percent buttons only prefill that number; every
// field stays editable. Used from the drop site window (after Begin) and from the delivery's Details list.
import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { BIO_PERCENTS, bioFromPercent, bioPercentOf, parseBio } from "@/lib/trips/bio";
import { BolCard, type DropComp } from "./DropSiteSheet";

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.12)";

export type BioComp = DropComp & { id: string; code: string; diesel: boolean; bio: string };

export function BioBlendSheet({ open, comps, slots, onSave, onClose }: {
  open: boolean; comps: BioComp[]; slots: number[];
  /** Bio gallons by compartment_load_id; a compartment with none entered is left out. */
  onSave: (bio: Record<string, number>) => void; onClose: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => { if (open) setV(Object.fromEntries(comps.filter((c) => c.diesel).map((c) => [c.id, c.bio ?? ""]))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const diesel = comps.filter((c) => c.diesel).sort((a, b) => a.n - b.n);
  const chip = (on: boolean): React.CSSProperties => ({ flex: 1, padding: "11px 0", border: `1px solid ${on ? "#fff" : hair}`, background: on ? "rgba(255,255,255,0.12)" : "transparent", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" });
  const save = () => {
    const out: Record<string, number> = {};
    for (const c of diesel) { const n = parseBio(v[c.id]); if (n != null) out[c.id] = n; }
    onSave(out); onClose();
  };
  return (
    <FullscreenModal open={open} title="Bio blending" onClose={onClose} footer={
      <button type="button" className="dash-press" onClick={save}
        style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>Save</button>}>
      <div style={{ fontSize: 13, color: muted, marginBottom: 10 }}>Enter these in the blender, then type the bio gallons it prints for each compartment.</div>
      <BolCard slots={slots} comps={comps} />
      {diesel.length === 0 && <div style={{ color: muted, fontSize: 14 }}>No diesel aboard for this stop.</div>}
      {diesel.map((c) => {
        const bio = parseBio(v[c.id]);
        const pct = bio != null ? bioPercentOf(c.gallons, bio) : null;
        return (
          <div key={c.id} style={{ padding: "12px 14px", background: "#0f0f10", border: `1px solid ${hair}`, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
              <b style={{ fontSize: 15 }}>C{c.n}</b>
              <span style={{ color: c.color, fontWeight: 800 }}>{c.code}</span>
              <span className="dash-num" style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800 }}>{Math.round(c.gallons)} gal</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {BIO_PERCENTS.map((p) => (
                <button key={p} type="button" style={chip(false)} onClick={() => setV((m) => ({ ...m, [c.id]: String(bioFromPercent(c.gallons, p)) }))}>{p}%</button>
              ))}
              <button type="button" style={{ ...chip(false), color: muted }} onClick={() => setV((m) => ({ ...m, [c.id]: "" }))}>Clear</button>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
              <input value={v[c.id] ?? ""} onChange={(e) => setV((m) => ({ ...m, [c.id]: e.target.value.replace(/[^0-9.]/g, "") }))} inputMode="decimal" placeholder="Bio gallons"
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: `1px solid ${hair}`, color: c.color, fontSize: 24, fontWeight: 800, padding: "4px 0", outline: "none" }} />
              <span style={{ color: muted, fontSize: 13, whiteSpace: "nowrap" }}>{pct ? `bio · ${pct}% of diesel` : "bio gal"}</span>
            </div>
          </div>
        );
      })}
    </FullscreenModal>
  );
}
