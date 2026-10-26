"use client";
// app/planner/modals/editTerminal/ProductsView.tsx
//
// Part of EditTerminalModal.tsx.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import type { TerminalRack, ProductLite } from "../rackProductTypes";

import { GROUPS, groupFor } from "./helpers";

export function ProductsView({ rack, onChanged }: { rack: TerminalRack; onChanged: () => void }) {
  // Sourced from the shared cached catalog (lib/queries/useProductsCatalog.ts)
  // instead of this view's own supabase.from("products") fetch on every
  // rack selected -- CatalogProduct is a structural superset of this
  // file's ProductLite. rack_product_status stays its own per-rack fetch
  // below (real, mutable data).
  const { data: allProducts = [], isLoading: productsLoading, error: productsError } = useProductsCatalog();
  const [activeMap, setActiveMap] = useState<Record<string, boolean | undefined>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: rp, error: rpErr } = await supabase
        .from("rack_product_status").select("product_id, active").eq("rack_id", rack.rack_id);
      if (cancelled) return;
      if (rpErr) {
        setError(rpErr.message ?? "Failed to load products.");
        setLoading(false);
        return;
      }
      const map: Record<string, boolean | undefined> = {};
      for (const row of (rp ?? []) as any[]) map[row.product_id] = row.active !== false;
      setActiveMap(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [rack.rack_id]);

  async function toggle(productId: string) {
    const isActive = activeMap[productId] === true;
    const nextActive = !isActive;
    setSavingId(productId);
    const rowExists = activeMap[productId] !== undefined;
    const { error: err } = rowExists
      ? await supabase.from("rack_product_status").update({ active: nextActive }).eq("rack_id", rack.rack_id).eq("product_id", productId)
      : await supabase.from("rack_product_status").insert({ rack_id: rack.rack_id, product_id: productId, active: nextActive, is_out: false });
    setSavingId(null);
    if (err) { setError(err.message); return; }
    setActiveMap((prev) => ({ ...prev, [productId]: nextActive }));
    onChanged();
  }

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allProducts.filter((p) => [p.product_name, p.display_name, p.button_code].some((v) => (v ?? "").toLowerCase().includes(q)))
      : allProducts;
    const byGroup: Record<string, ProductLite[]> = {};
    for (const p of filtered) {
      const g = groupFor(p.product_name ?? "");
      (byGroup[g] ??= []).push(p);
    }
    const order = [...GROUPS.map((g) => g.label), "Other / Off-Spec"];
    return order.filter((g) => byGroup[g]?.length).map((g) => ({ label: g, products: byGroup[g] }));
  }, [allProducts, search]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Products carried at <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{rack.rack_name}</span>. Tap to add or remove.
      </div>

      <input
        type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products…"
        style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
      />

      {(error || productsError) && (
        <div style={{ color: "#f87171", fontSize: 12 }}>{error ?? (productsError as any)?.message ?? "Failed to load products."}</div>
      )}
      {(loading || productsLoading) && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && !productsLoading && grouped.map(({ label, products }) => (
        <div key={label} style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 0.6, marginTop: 4 }}>{label}</div>
          {products.map((p) => {
            const isActive = activeMap[p.product_id] === true;
            const btnCode = ((p.button_code ?? "").trim() || "PRD").toUpperCase();
            const btnColor = (p.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
            const name = (p.product_name ?? p.display_name ?? "").trim() || "Product";
            const saving = savingId === p.product_id;
            return (
              <button
                key={p.product_id} type="button" disabled={saving} onClick={() => toggle(p.product_id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 2,
                  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)",
                  cursor: "pointer", width: "100%", boxSizing: "border-box" as const, opacity: saving ? 0.5 : 1,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: btnColor, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: "left" as const, fontWeight: 700, fontSize: 14, color: "white" }}>{name} <span style={{ fontSize: 11, color: btnColor }}>{btnCode}</span></span>
                <span style={{ fontSize: 12, fontWeight: 800, color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.30)" }}>
                  {isActive ? "✓ Active" : "+ Add"}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
