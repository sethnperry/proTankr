"use client";
// app/planner/components/trip/SplashPlanSheet.tsx
//
// Set up a splash blend on the trip's plan: which E0 compartments, the additive (ethanol) and its share of each
// finished compartment. The base product of each compartment is the plan's. Saving then asks for the terminal that
// sells the ethanol; the trip card shows it as a second pickup (with arrows to swap which one loads first).
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

export function SplashPlanSheet({ open, comps, catalog, initial, hasPickup, onSave, onClose }: {
  open: boolean;
  /** The plan's splashable compartments: number, gallons, planned (base) product. */
  comps: { n: number; size: number; baseProductId: string }[];
  catalog: AddPickupProduct[];
  initial: TripSplash;
  /** The ethanol terminal is already on the trip. */
  hasPickup: boolean;
  onSave: (s: TripSplash) => void;
  onClose: () => void;
}) {
  const [pcts, setPcts] = useState<Record<number, number>>({});
  const [additive, setAdditive] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!open) return;
    const first = Object.values(initial)[0];
    setPcts(Object.fromEntries(Object.entries(initial).map(([n, v]) => [Number(n), v.pct])));
    setAdditive(first?.additiveProductId ?? null);
    setShowAll(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(catalog.map((p) => [p.product_id, p])), [catalog]);
  const likely = useMemo(() => catalog.filter((p) => /eth|e85|e-85|alcohol/i.test(`${p.name} ${p.code}`)), [catalog]);
  const choices = (showAll || !likely.length ? catalog : likely).slice().sort((a, b) => a.name.localeCompare(b.name));
  // The only likely product is the obvious pick.
  useEffect(() => { if (open && !additive && likely.length === 1) setAdditive(likely[0].product_id); }, [open, likely, additive]);
  const sorted = [...comps].sort((a, b) => a.n - b.n);
  const picked = sorted.filter((c) => pcts[c.n] != null).map((c) => c.n);
  const toggle = (n: number) => setPcts((p) => { const q = { ...p }; if (q[n] != null) delete q[n]; else q[n] = Object.values(p)[0] ?? 10; return q; });
  const setPct = (n: number, v: number) => setPcts((p) => ({ ...p, [n]: v }));
  const ready = picked.length > 0 && !!additive && picked.every((n) => validPct(pcts[n]));
  const save = () => {
    if (!ready || !additive) return;
    onSave(Object.fromEntries(picked.map((n) => [n, { additiveProductId: additive, pct: pcts[n] }])));
  };
  const addCode = additive ? byId.get(additive)?.code ?? "additive" : "additive";

  return (
    <FullscreenModal open={open} title="Splash Blend" onClose={onClose} footer={null}>
      <div style={sectionCard}>
        <div style={sectionTitle}>Compartments</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {sorted.map((c) => (
            <button key={c.n} type="button" style={chip(pcts[c.n] != null)} onClick={() => toggle(c.n)}>
              C{c.n} · {byId.get(c.baseProductId)?.code ?? "Product"} · {fmt(c.size)}
            </button>
          ))}
          {sorted.length === 0 && <div style={{ fontSize: 14, color: muted }}>No E0 or RBOB compartments in this plan.</div>}
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

      {picked.length > 0 && (
        <div style={sectionCard}>
          <div style={sectionTitle}>Share of each compartment</div>
          {picked.map((n) => {
            const c = sorted.find((x) => x.n === n)!;
            const pct = pcts[n];
            const st = validPct(pct) ? stageGallons({ volume: c.size, pct }) : null;
            return (
              <div key={n} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 34, fontWeight: 800 }}>C{n}</span>
                  {BLEND_CHOICES.map((p) => <button key={p} type="button" style={chip(pct === p)} onClick={() => setPct(n, p)}>{p}%</button>)}
                  <input inputMode="decimal" value={BLEND_CHOICES.some((p) => p === pct) ? "" : String(pct || "")} placeholder="Other %"
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => { const v = parseFloat(e.target.value.replace(/[^0-9.]/g, "")); setPct(n, Number.isFinite(v) ? v : 0); }}
                    style={{ width: 80, padding: "9px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2, color: "#fff", fontSize: 15, fontWeight: 700 }} />
                </div>
                {st && <div style={{ fontSize: 13, color: muted, marginTop: 4, paddingLeft: 42 }}>{blendLabel(pct)} · about {fmt(st.additive)} gal {addCode}, {fmt(st.base)} gal {byId.get(c.baseProductId)?.code ?? "base"}</div>}
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: muted }}>
            The stop that loads first gets its planned volume. The second is adjusted to what actually went in, within room and weight.
          </div>
        </div>
      )}

      <button type="button" disabled={!ready} onClick={save} style={{ ...primaryBtn, opacity: ready ? 1 : 0.5 }}>
        {hasPickup ? "Save Splash Blend" : "Next: pick the ethanol terminal"}
      </button>
      {Object.keys(initial).length > 0 && (
        <button type="button" onClick={() => onSave({})} style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", color: "#f87171", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Remove splash blend
        </button>
      )}
    </FullscreenModal>
  );
}
