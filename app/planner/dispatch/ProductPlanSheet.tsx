"use client";
// app/planner/dispatch/ProductPlanSheet.tsx
//
// The dispatcher's product plan for one trip: what goes in each compartment of
// the trailer, highest compartment first like the driver's card. Compartment
// count comes from the trailer, else a count the dispatcher sets. Recent plans
// are one tap. The result rides on the dispatched trip as the pickup's plan.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useDashLook } from "../home/dashLook";

export type PlanComps = (string | null)[]; // highest compartment first

const RECENT_KEY = "proTankr:dispatchRecentPlans";
export const readRecentPlans = (): PlanComps[] => {
  try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(r) ? r.filter(Array.isArray) : []; } catch { return []; }
};
export const rememberPlan = (c: PlanComps) => {
  try {
    const key = JSON.stringify(c);
    const next = [c, ...readRecentPlans().filter((x) => JSON.stringify(x) !== key)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode: not remembered */ }
};

export function ProductPlanSheet(p: {
  open: boolean; trailerId: string | null; value: PlanComps | null;
  onApply: (c: PlanComps | null) => void; onClose: () => void;
}) {
  const L = useDashLook();
  const products = useProductsCatalog().data.filter((x) => x.active !== false);
  const code = (id: string | null) => { const x = id ? products.find((y) => y.product_id === id) : null; return x ? String(x.button_code ?? x.display_name ?? x.product_name).toUpperCase() : "–"; };
  const [sizes, setSizes] = useState<number[] | null>(null); // gallons per compartment, comp 1 first
  const [n, setN] = useState(5);
  const [comps, setComps] = useState<PlanComps>([]);
  useEffect(() => {
    if (!p.open) return;
    let off = false;
    setComps(p.value ?? []);
    if (!p.trailerId) { setSizes(null); return; }
    void supabase.from("trailer_compartments").select("comp_number, max_gallons").eq("trailer_id", p.trailerId).order("comp_number")
      .then(({ data }) => {
        if (off) return;
        const rows = (data ?? []) as { comp_number: number; max_gallons: number | null }[];
        if (rows.length) { setSizes(rows.map((r) => Number(r.max_gallons ?? 0))); setN(rows.length); } else setSizes(null);
      });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.trailerId]);

  const count = sizes ? sizes.length : n;
  const at = (i: number) => comps[i] ?? null;
  const setAt = (i: number, id: string | null) => setComps((c) => { const x = Array.from({ length: count }, (_, j) => c[j] ?? null); x[i] = id; return x; });
  const filled = Array.from({ length: count }, (_, i) => at(i));
  const recent = readRecentPlans();
  const sel = { background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "10px 12px", borderRadius: 2, flex: 1, minWidth: 0 } as const;
  return (
    <FullscreenModal open={p.open} title="Product plan" onClose={p.onClose}
      footer={(
        <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
          {p.value && <button type="button" onClick={() => { p.onApply(null); p.onClose(); }} style={{ ...L.secondary, color: "#fff", padding: "14px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Clear</button>}
          <button type="button" disabled={filled.every((x) => !x)} onClick={() => { rememberPlan(filled); p.onApply(filled); p.onClose(); }}
            style={{ flex: 1, border: "none", background: "#fff", color: "#000", padding: "14px 0", fontSize: 16, fontWeight: 800, cursor: "pointer", opacity: filled.every((x) => !x) ? 0.5 : 1 }}>
            Use this plan
          </button>
        </div>
      )}>
      {recent.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: L.muted, marginBottom: 6 }}>Recent</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {recent.map((r, i) => (
              <button key={i} type="button" onClick={() => { setN(r.length); if (!sizes || sizes.length === r.length) setComps(r); }}
                style={{ ...L.secondary, color: "#fff", padding: "8px 12px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                {r.map(code).join("/")}
              </button>
            ))}
          </div>
        </>
      )}
      {!sizes && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 13, color: L.muted }}>
          <span style={{ flex: 1 }}>{p.trailerId ? "No compartment sizes on this trailer." : "No trailer picked."} Compartments:</span>
          <button type="button" onClick={() => setN((x) => Math.max(1, x - 1))} style={{ ...L.secondary, color: "#fff", width: 34, height: 34, cursor: "pointer" }}>−</button>
          <span className="dash-num" style={{ color: "#fff", width: 16, textAlign: "center" }}>{n}</span>
          <button type="button" onClick={() => setN((x) => Math.min(9, x + 1))} style={{ ...L.secondary, color: "#fff", width: 34, height: 34, cursor: "pointer" }}>+</button>
        </div>
      )}
      {/* Highest compartment first, like the driver's card (C1 on the right). */}
      {Array.from({ length: count }, (_, i) => {
        const compNo = count - i;
        const gal = sizes ? sizes[compNo - 1] : null;
        return (
          <div key={compNo} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span className="dash-num" style={{ width: 70, fontSize: 13, color: L.muted }}>C{compNo}{gal ? ` · ${Math.round(gal).toLocaleString("en-US")}` : ""}</span>
            <select value={at(i) ?? ""} onChange={(e) => setAt(i, e.target.value || null)} style={sel}>
              <option value="">Empty</option>
              {products.map((x) => <option key={x.product_id} value={x.product_id}>{String(x.button_code ?? "").toUpperCase()} · {x.display_name ?? x.product_name}</option>)}
            </select>
          </div>
        );
      })}
    </FullscreenModal>
  );
}
