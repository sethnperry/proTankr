"use client";
// app/planner/dispatch/CompartmentPlanCard.tsx
//
// The dispatcher's compartment plan for one load: pick the trailer (the
// driver's by default), set a product per compartment (or start from one of
// the trailer's plan slots), then give each product group its order number and
// supplier. The same trailer plan slots show up in an empty preset slot on the
// Planner of anyone who drives that trailer.

import React, { useMemo, useState } from "react";
import { SideView, segsFor } from "../components/TrailerViews";
import { useDashLook } from "../home/dashLook";
import { SECONDARY_BTN } from "@/lib/ui/look";
import { CompartmentStrip } from "../components/trip/CompartmentStrip";
import { fieldInput } from "../components/trip/tripUi";
import { productColorFor } from "../utils/productColor";
import type { CompPlan, PlanGroup } from "@/lib/dispatch/compPlan";
import type { TrailerComp, TrailerSlot } from "@/lib/dispatch/useTrailerPlan";
import { planFromSlotPayload } from "@/lib/dispatch/compPlan";

export type PlanProduct = { product_id: string; name: string; code: string; hex: string | null };
const LETTERS = ["A", "B", "C", "D", "E"];

const chip = (on: boolean): React.CSSProperties => ({
  padding: "8px 11px", borderRadius: 2, fontSize: 13, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.85)",
});

// Plan slots: the active one is a thick white outline with a faint tint and bright text, so the
// product dots inside stay readable (a solid white fill swallowed them).
const slotChip = (on: boolean): React.CSSProperties => ({
  padding: on ? "7px 10px" : "8px 11px", borderRadius: 2, fontSize: 13, fontWeight: on ? 800 : 700, cursor: "pointer",
  border: on ? "2px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "rgba(255,255,255,0.1)" : "transparent", color: on ? "#fff" : "rgba(255,255,255,0.75)",
});

// Product choices: the chosen one gets a thick border and a tint in its own color, so the
// product color stays visible (a solid white fill hid it).
const productChip = (on: boolean, color: string): React.CSSProperties => ({
  padding: "8px 11px", borderRadius: 2, fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#fff",
  border: on ? `2px solid ${color}` : "1px solid rgba(255,255,255,0.18)",
  background: on ? `color-mix(in srgb, ${color} 22%, transparent)` : "transparent",
} as React.CSSProperties);

export function CompartmentPlanCard(p: {
  trailerName: string;
  trailerOptions: { id: string; name: string }[];
  onTrailer: (id: string | null) => void;
  usingDriversTrailer: boolean;
  comps: TrailerComp[];
  catalog: PlanProduct[];
  terminalProductIds: string[] | null;
  plan: CompPlan;
  onPlan: (next: CompPlan) => void;
  slots: Record<number, TrailerSlot>;
  activeSlot: number | null;
  onActiveSlot: (s: number | null) => void;
  onSaveSlot: (slot: number, name: string | null) => Promise<string | null>;
  onClearSlot: (slot: number) => Promise<string | null>;
  groups: PlanGroup[];
  supplierName: (id: string | null) => string | null;
  onGroupOrder: (productId: string, v: string) => void;
  onPickSupplier: (productId: string) => void;
  defaultOrder: string;
  slotError: string | null;
}) {
  const L = useDashLook();
  const [open, setOpen] = useState(true);
  const [pickComp, setPickComp] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [trailerPick, setTrailerPick] = useState(false);
  const [slotName, setSlotName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const byId = useMemo(() => new Map(p.catalog.map((x) => [x.product_id, x])), [p.catalog]);
  const colorOf = (id: string | null | undefined) => { const x = id ? byId.get(id) : null; return x ? x.hex ?? productColorFor(x.name) : null; };
  const choices = useMemo(() => {
    const list = !showAll && p.terminalProductIds ? p.catalog.filter((x) => p.terminalProductIds!.includes(x.product_id)) : p.catalog;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [p.catalog, p.terminalProductIds, showAll]);

  const filled = Object.keys(p.plan).length;
  const slots = p.comps.map((c) => ({
    comp: c.n, size: c.size, color: colorOf(p.plan[c.n]), crossed: !p.plan[c.n], selected: pickComp === c.n,
    title: `C${c.n}${p.plan[c.n] ? ` · ${byId.get(p.plan[c.n])?.name ?? ""}` : " · empty"}`,
    onClick: () => setPickComp(pickComp === c.n ? null : c.n),
  }));
  const setComp = (n: number, pid: string | null) => {
    const next = { ...p.plan };
    if (pid) next[n] = pid; else delete next[n];
    p.onPlan(next);
  };
  const slotSegs = (payload: any) => {
    const pl = planFromSlotPayload(payload);
    const loaded: Record<number, string | null> = {};
    for (const c of p.comps) loaded[c.n] = colorOf(pl[c.n]) ?? null;
    return segsFor(p.comps.map((c) => ({ comp: c.n, size: c.size ?? null })), loaded);
  };
  const loadSlot = (s: number) => {
    const t = p.slots[s];
    if (!t) { p.onActiveSlot(s); setSlotName(""); return; }
    p.onActiveSlot(s); setSlotName(t.name ?? ""); p.onPlan(planFromSlotPayload(t.payload)); setPickComp(null);
  };
  const run = async (fn: () => Promise<string | null>, ok: string) => { const e = await fn(); setMsg(e ?? ok); };

  return (
    <div style={{ ...L.secondary, padding: "12px 12px 14px", marginBottom: 10 }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", width: "100%", alignItems: "baseline", gap: 8, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, textAlign: "left" }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>Compartments</span>
        <span style={{ flex: 1, fontSize: 13, color: filled ? "#fff" : L.muted }}>
          {filled ? `${p.groups.length} product${p.groups.length === 1 ? "" : "s"} planned` : "Optional · pick the products"}
        </span>
        <span style={{ color: L.muted }}>{open ? "–" : "+"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{p.trailerName ? `Trailer ${p.trailerName}` : "No trailer"}</span>
            <span style={{ fontSize: 11, color: L.faint, flex: 1 }}>{p.usingDriversTrailer ? "the driver's trailer" : "picked by you"}</span>
            <button type="button" onClick={() => setTrailerPick((v) => !v)} style={{ background: "none", border: "none", color: "#93c5fd", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Change</button>
          </div>
          {trailerPick && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              <button type="button" style={chip(p.usingDriversTrailer)} onClick={() => { p.onTrailer(null); setTrailerPick(false); }}>Driver's</button>
              {p.trailerOptions.map((t) => (
                <button key={t.id} type="button" style={chip(false)} onClick={() => { p.onTrailer(t.id); setTrailerPick(false); }}>{t.name}</button>
              ))}
            </div>
          )}

          {p.comps.length === 0 ? (
            <div style={{ fontSize: 12, color: L.muted }}>{p.trailerName ? "This trailer has no compartments on file." : "The driver isn't holding a trailer. Change it to pick one."}</div>
          ) : (
            <>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Plan slots</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {LETTERS.map((ltr, i) => {
                  const s = i + 1, t = p.slots[s];
                  return (
                    <button key={s} type="button" onClick={() => loadSlot(s)} style={{ ...slotChip(p.activeSlot === s), display: "flex", alignItems: "center", gap: 6 }}>
                      {ltr}
                      {t && <span style={{ display: "inline-block", width: 60 }}><SideView segs={slotSegs(t.payload)} height={9} gap={2} /></span>}
                    </button>
                  );
                })}
              </div>

              <CompartmentStrip slots={slots} height={26} gap={5} />
              <div style={{ fontSize: 11, color: L.faint, margin: "6px 0 8px" }}>Tap a compartment to set its product.</div>
              {pickComp != null && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>C{pickComp}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {choices.map((x) => (
                      <button key={x.product_id} type="button" style={{ ...productChip(p.plan[pickComp] === x.product_id, x.hex ?? productColorFor(x.name)), display: "flex", alignItems: "center", gap: 6, padding: p.plan[pickComp] === x.product_id ? "7px 10px" : "8px 11px" }}
                        onClick={() => { setComp(pickComp, x.product_id); setPickComp(null); }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: x.hex ?? productColorFor(x.name) }} />{x.code}
                      </button>
                    ))}
                    <button type="button" style={{ ...productChip(!p.plan[pickComp], "rgba(255,255,255,0.6)") }} onClick={() => { setComp(pickComp, null); setPickComp(null); }}>Empty</button>
                  </div>
                  {p.terminalProductIds && (
                    <button type="button" onClick={() => setShowAll((v) => !v)} style={{ background: "none", border: "none", color: L.muted, fontSize: 12, cursor: "pointer", padding: "6px 0 0" }}>
                      {showAll ? "Only this terminal's products" : "Show all products"}
                    </button>
                  )}
                </div>
              )}

              {p.groups.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Supplier · the first sets it for the rest</div>
                  {p.groups.map((g) => {
                    const prod = byId.get(g.productId);
                    return (
                      <div key={g.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${L.hairline}` }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: colorOf(g.productId) ?? "#888", flexShrink: 0 }} />
                        <span style={{ width: 52, fontSize: 12, fontWeight: 700 }}>{prod?.code ?? "?"} <span style={{ color: L.faint, fontWeight: 500 }}>C{g.comps.join(",")}</span></span>
                        <span style={{ flex: 1 }} />
                        <button type="button" onClick={() => p.onPickSupplier(g.productId)}
                          style={{ ...chip(false), maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.supplierName(g.supplierId) ?? "Supplier"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {p.activeSlot != null && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${L.hairline}` }}>
                  <div style={{ fontSize: 11, color: L.faint, marginBottom: 6 }}>
                    Slot {LETTERS[p.activeSlot - 1]} is shared: drivers of this trailer get it in an empty preset slot.
                  </div>
                  <input value={slotName} onChange={(e) => setSlotName(e.target.value)} placeholder="Name (optional)" style={{ ...fieldInput, marginBottom: 6 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="dash-press" style={{ ...SECONDARY_BTN, flex: 2, padding: "9px 0", fontSize: 12 }}
                      onClick={() => run(() => p.onSaveSlot(p.activeSlot!, slotName), `Saved to slot ${LETTERS[p.activeSlot! - 1]}.`)}>
                      Save to slot {LETTERS[p.activeSlot - 1]}
                    </button>
                    {p.slots[p.activeSlot] && (
                      <button type="button" className="dash-press" style={{ ...SECONDARY_BTN, flex: 1, padding: "9px 0", fontSize: 12 }}
                        onClick={() => run(async () => { const e = await p.onClearSlot(p.activeSlot!); if (!e) { p.onActiveSlot(null); p.onPlan({}); } return e; }, "Slot cleared.")}>
                        Clear
                      </button>
                    )}
                  </div>
                  {(msg || p.slotError) && <div style={{ fontSize: 12, marginTop: 6, color: p.slotError ? "#f87171" : "#4ade80" }}>{p.slotError ?? msg}</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
