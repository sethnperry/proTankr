"use client";
// app/planner/components/trip/SplashPlanSheet.tsx
//
// Set up a splash blend on the trip's plan: which compartments, which additive (ethanol), and its share of the
// finished compartment. Asks only for what the plan doesn't already say; the base product of each compartment is
// the plan's. Which product loads first is decided at the first rack, from what that rack sells.
import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { productColorFor } from "@/app/planner/utils/productColor";
import { BLEND_CHOICES, blendLabel, stageGallons, validPct } from "@/lib/trips/splash";
import type { TripSplash } from "@/lib/trips/tripSplash";
import type { AddPickupProduct } from "./AddPickupSheet";
import { muted, primaryBtn, sectionCard, sectionTitle } from "./tripUi";

const chip = (on: boolean): React.CSSProperties => ({
  padding: "9px 12px", borderRadius: 2, fontSize: 14, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.85)",
});
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function SplashPlanSheet({ open, comps, catalog, initial, onSave, onClose }: {
  open: boolean;
  /** The compartments the plan fills: number, gallons, planned (base) product. */
  comps: { n: number; size: number; baseProductId: string }[];
  catalog: AddPickupProduct[];
  initial: TripSplash;
  onSave: (s: TripSplash) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [additive, setAdditive] = useState<string | null>(null);
  const [pct, setPct] = useState(10);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!open) return;
    const first = Object.values(initial)[0];
    setPicked(Object.keys(initial).map(Number).sort((a, b) => a - b));
    setAdditive(first?.additiveProductId ?? null);
    setPct(first?.pct ?? 10);
    setShowAll(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(catalog.map((p) => [p.product_id, p])), [catalog]);
  const likely = useMemo(() => catalog.filter((p) => /eth|e85|e-85|alcohol/i.test(`${p.name} ${p.code}`)), [catalog]);
  const choices = (showAll || !likely.length ? catalog : likely).slice().sort((a, b) => a.name.localeCompare(b.name));
  const toggle = (n: number) => setPicked((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n].sort((a, b) => a - b)));
  const sorted = [...comps].sort((a, b) => a.n - b.n);
  const ready = picked.length > 0 && !!additive && validPct(pct);
  const save = () => {
    if (!ready || !additive) return;
    onSave(Object.fromEntries(picked.map((n) => [n, { additiveProductId: additive, pct }])));
  };
  const addName = additive ? byId.get(additive)?.code ?? "additive" : "additive";

  return (
    <FullscreenModal open={open} title="Splash Blend" onClose={onClose} footer={null}>
      <div style={sectionCard}>
        <div style={sectionTitle}>Compartments</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {sorted.map((c) => (
            <button key={c.n} type="button" style={chip(picked.includes(c.n))} onClick={() => toggle(c.n)}>
              C{c.n} · {byId.get(c.baseProductId)?.code ?? "Product"} · {fmt(c.size)}
            </button>
          ))}
          {sorted.length === 0 && <div style={{ fontSize: 14, color: muted }}>No plan on this trip yet.</div>}
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionTitle}>Blend in</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {choices.map((p) => (
            <button key={p.product_id} type="button" style={{ ...chip(additive === p.product_id), display: "flex", alignItems: "center", gap: 6 }} onClick={() => setAdditive(p.product_id)}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.hex ?? productColorFor(p.name) }} />
              {p.code}
            </button>
          ))}
        </div>
        {likely.length > 0 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} style={{ background: "none", border: "none", color: muted, fontSize: 13, cursor: "pointer", padding: "10px 0 0" }}>
            {showAll ? "Likely products only" : "Show all products"}
          </button>
        )}
      </div>

      <div style={sectionCard}>
        <div style={sectionTitle}>Share of the finished compartment</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {BLEND_CHOICES.map((c) => <button key={c} type="button" style={chip(pct === c)} onClick={() => setPct(c)}>{c}%</button>)}
          <input inputMode="decimal" value={BLEND_CHOICES.some((c) => c === pct) ? "" : String(pct || "")} placeholder="Other %"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => { const v = parseFloat(e.target.value.replace(/[^0-9.]/g, "")); setPct(Number.isFinite(v) ? v : 0); }}
            style={{ width: 90, padding: "9px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2, color: "#fff", fontSize: 15, fontWeight: 700 }} />
        </div>
        {ready && (
          <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
            <b>{blendLabel(pct)}</b> on {picked.map((n) => `C${n}`).join(", ")}
            {picked.slice(0, 3).map((n) => {
              const c = sorted.find((x) => x.n === n);
              if (!c) return null;
              const st = stageGallons({ volume: c.size, pct });
              return <div key={n} style={{ color: muted }}>C{n}: {fmt(st.additive)} gal {addName}, {fmt(st.base)} gal {byId.get(c.baseProductId)?.code ?? "base"}</div>;
            })}
            <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>
              Whichever loads first is worked out at the first rack from what it sells. The second is adjusted to what actually went in, within the weight.
            </div>
          </div>
        )}
      </div>

      <button type="button" disabled={!ready} onClick={save} style={{ ...primaryBtn, opacity: ready ? 1 : 0.5 }}>Save Splash Blend</button>
      {Object.keys(initial).length > 0 && (
        <button type="button" onClick={() => onSave({})} style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", color: "#f87171", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Remove splash blend
        </button>
      )}
    </FullscreenModal>
  );
}
