"use client";
// app/planner/modals/ManageTerminalProductsModal.tsx
//
// Lets a driver add/remove products from the current RACK's active product
// list (see CLAUDE.md "rack-aware loading, unified") -- different racks at
// the same terminal genuinely carry different products, so this curates
// rack_product_status for the specific rack currently selected, not a
// terminal-wide list. Reachable from any compartment's CompartmentModal;
// changes are written by toggling `active` (never deleting the row --
// preserves last_api/last_temp_f history the same way the canonical-
// grouping insert-if-missing path does) and then propagate to every
// compartment's picker via the shared `terminalProducts` refetch passed in
// as `onChanged`.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";

type CatalogProduct = {
  product_id: string;
  product_name: string | null;
  display_name: string | null;
  description: string | null;
  button_code: string | null;
  hex_code: string | null;
  is_dyed: boolean | null;
};

// No `category` column exists on `products` -- this is a client-side
// heuristic grouping (name-pattern based) purely for readable organization
// in this picker. Order here is the section display order.
const GROUPS: { label: string; test: (name: string) => boolean }[] = [
  { label: "Diesel", test: (n) => /diesel|heating oil|marine gas oil|hvo|\bkerosene\b/i.test(n) },
  { label: "Biodiesel Blends", test: (n) => /biodiesel/i.test(n) },
  { label: "Gasoline", test: (n) => /unleaded|recreation fuel/i.test(n) },
  { label: "Ethanol & Flex Fuel", test: (n) => /ethanol|flex fuel|e\d{2}\b/i.test(n) },
  { label: "Aviation & Jet", test: (n) => /aviation|jet fuel|jp-\d/i.test(n) },
  { label: "Blendstocks & Components", test: (n) => /blendstock|alkylate|reformate|isomerate|naphtha|natural gasoline|butane|additive/i.test(n) },
];
function groupFor(name: string): string {
  for (const g of GROUPS) if (g.test(name)) return g.label;
  return "Other / Off-Spec";
}

export default function ManageTerminalProductsModal({
  open,
  onClose,
  rackId,
  rackName,
  terminalName,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  // Always a real rack: the only call site (CompartmentModal) renders this
  // inside a `{selectedRackId && ...}` guard, so this is required rather
  // than optional-with-a-non-null-assertion. A second "pick" mode existed
  // here for IncentiveSettingsModal's benchmark entry; both were removed in
  // the 2026-09-06 legacy-incentive teardown.
  rackId: string;
  rackName?: string;
  terminalName?: string;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sourced from the shared cached catalog (lib/queries/useProductsCatalog.ts)
  // instead of this modal's own supabase.from("products") fetch on every
  // open -- that shared CatalogProduct type is a structural superset of
  // this file's own (narrower) CatalogProduct export below, so no mapping
  // is needed. rack_product_status is still fetched per-open below (real,
  // rack-specific, mutable data -- not catalog-static).
  const { data: allProducts = [], isLoading: productsLoading, error: productsError } = useProductsCatalog();
  // undefined = no rack_product_status row yet; true/false = row exists with that active flag
  const [activeMap, setActiveMap] = useState<Record<string, boolean | undefined>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !rackId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: rps, error: rpsErr } = await supabase
        .from("rack_product_status").select("product_id, active").eq("rack_id", rackId);
      if (cancelled) return;
      if (rpsErr) {
        setError(rpsErr.message ?? "Failed to load products.");
        setLoading(false);
        return;
      }
      const map: Record<string, boolean | undefined> = {};
      for (const row of (rps ?? []) as any[]) map[row.product_id] = row.active !== false;
      setActiveMap(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, rackId]);

  async function toggle(productId: string) {
    const isActive = activeMap[productId] === true;
    const nextActive = !isActive;
    setSavingId(productId);
    // We only know a row "exists" if we've already seen it in activeMap with
    // a defined value -- undefined means insert, defined means update. Never
    // delete: matches the insert-if-missing / never-touch-on-conflict pattern
    // used everywhere else this session so last_api/last_temp_f history for
    // a product this rack previously curated is never lost by a re-toggle.
    const rowExists = activeMap[productId] !== undefined;
    const { error: err } = rowExists
      ? await supabase.from("rack_product_status")
          .update({ active: nextActive })
          .eq("rack_id", rackId).eq("product_id", productId)
      : await supabase.from("rack_product_status")
          .insert({ rack_id: rackId, product_id: productId, active: nextActive });
    setSavingId(null);
    if (err) { setError(err.message); return; }
    setActiveMap((prev) => ({ ...prev, [productId]: nextActive }));
    onChanged?.();
  }

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? allProducts.filter((p) =>
          [p.product_name, p.display_name, p.button_code, p.description].some((v) => (v ?? "").toLowerCase().includes(q)))
      : allProducts;
    const byGroup: Record<string, CatalogProduct[]> = {};
    for (const p of filtered) {
      const g = groupFor(p.product_name ?? "");
      (byGroup[g] ??= []).push(p);
    }
    const order = [...GROUPS.map((g) => g.label), "Other / Off-Spec"];
    return order.filter((g) => byGroup[g]?.length).map((g) => ({ label: g, products: byGroup[g] }));
  }, [allProducts, search]);

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 12,
    padding: "10px 12px", borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
    cursor: "pointer", width: "100%", boxSizing: "border-box" as const,
  };

  // "Main Rack" is the invisible default name auto-created for every
  // terminal that's never touched the Terminal tab (see CLAUDE.md
  // "rack-aware loading, unified") -- naming it in this copy would read as
  // a confusing reference to a rack the driver never picked. Only surface
  // the rack name for a terminal where it actually means something (a real,
  // named, multi-rack facility).
  const showRackName = rackName && rackName !== "Main Rack";

  return (
    <FullscreenModal open={open} title="Terminal Products" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
          {terminalName ? (
            <>
              Active products at <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{terminalName}</span>
              {showRackName && <> — <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{rackName}</span></>}.
              {" "}Tap to add or remove — changes apply to every compartment's picker immediately.
            </>
          ) : "Active products at this terminal. Tap to add or remove — changes apply to every compartment's picker immediately."}
        </div>

        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          style={{
            width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2,
            border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)",
            color: "white", fontSize: 13,
          }}
        />

        {(error || productsError) && (
          <div style={{ color: "#f87171", fontSize: 12 }}>{error ?? (productsError as any)?.message ?? "Failed to load products."}</div>
        )}
        {(loading || productsLoading) && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

        {!loading && !productsLoading && grouped.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>No products found.</div>
        )}

        {!loading && !productsLoading && grouped.map(({ label, products }) => (
          <div key={label} style={{ display: "grid", gap: 6 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase" as const, letterSpacing: 0.6, marginTop: 4,
            }}>
              {label}
            </div>
            {products.map((p) => {
              const isActive = activeMap[p.product_id] === true;
              const btnCode = ((p.button_code ?? "").trim() || "PRD").toUpperCase();
              const btnColor = (p.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
              const name = (p.product_name ?? p.display_name ?? "").trim() || "Product";
              const saving = savingId === p.product_id;
              return (
                <button
                  key={p.product_id}
                  type="button"
                  disabled={saving}
                  style={{ ...rowStyle, opacity: saving ? 0.5 : 1 }}
                  onClick={() => toggle(p.product_id)}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: btnColor, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1, overflow: "hidden", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: btnColor, opacity: 0.85, flexShrink: 0, letterSpacing: 0.3 }}>{btnCode}</span>
                      {p.is_dyed && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)",
                          borderRadius: 2, padding: "1px 4px", letterSpacing: 0.4, flexShrink: 0,
                        }}>
                          DYED
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                    color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.30)",
                  }}>
                    {isActive ? "✓ Active" : "+ Add"}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </FullscreenModal>
  );
}
