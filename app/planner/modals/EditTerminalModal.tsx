"use client";
// app/planner/modals/EditTerminalModal.tsx
//
// Structural configuration for a terminal's racks -- separate from the STUD
// status action (RackProductStatusModal). Hidden entirely from drivers by
// the caller (canEditTerminal check before rendering the entry button);
// lead/dispatch/admin only. RLS itself is wide open (matches the terminals/
// terminal_products precedent -- see the migration's own comment), so this
// is a UI-only gate, same risk profile as equipment CRUD carried before its
// 2026-08-07 permission-split migration.
//
// Two internal views rather than two stacked modals -- simpler than
// juggling overlapping FullscreenModal instances for what's really just
// content-swapping within one sheet.
//
// Relocated here from the now-deleted app/planner/terminal/ page -- Edit
// Terminal (and STUD, its sibling) now open from MyTerminalsModal.tsx's
// expanded terminal-card view instead of a dedicated Terminal tab, per
// explicit direction. Content/behavior unchanged from the original.
//
// 2026-08-31: the Lane/Arm Layout view (bulk lane/arm relabeling, per-arm
// product assignment, LayoutView/LaneRow/LaneArmProductsView/
// ArmProductPickerModal) was removed entirely, per explicit direction --
// "way too involved and complicated for every terminal across the
// country." Racks themselves stay (rack-aware terminal selection, the
// rack-level product list below, and the Out of Product outage flag all
// still key off rack_id) -- only the visual per-arm grid + its manual
// status-update UI are gone. rack_arms/rack_lanes and their live data are
// left in the DB untouched, just no longer rendered -- cheap to bring
// back later if ever wanted, nothing destructive here.

import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { TERMINALS_CATALOG_QUERY_KEY } from "@/lib/queries/useTerminalsCatalog";
import type { TerminalRack, ProductLite } from "./rackProductTypes";

type View = "racks" | "products";

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

export default function EditTerminalModal({
  open,
  onClose,
  terminalId,
  terminalName,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  terminalId: string;
  terminalName?: string;
  onChanged: () => void;
}) {
  const [view, setView] = useState<View>("racks");
  const [racks, setRacks] = useState<TerminalRack[]>([]);
  const [selectedRackId, setSelectedRackId] = useState<string>("");
  const [newRackName, setNewRackName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Renewal period lives on `terminals` itself (not per-rack) -- it already
  // feeds useExpirations.ts/cardStateFor-style expiry math everywhere a
  // terminal card shows up (Planner, Fleet Cards, Dispatch tab, etc, all via
  // terminals.renewal_days, default 90). It was previously only editable in
  // the old /admin terminal editor; this is the same column, surfaced here
  // too since fleet staff manage terminals from here now.
  const [renewalDays, setRenewalDays] = useState<number | null>(null);
  const queryClient = useQueryClient();

  async function loadRacks() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("terminal_racks")
      .select("*")
      .eq("terminal_id", terminalId)
      .order("rack_name");
    if (err) setError(err.message);
    else setRacks((data ?? []) as TerminalRack[]);
    setLoading(false);
  }

  async function loadTerminalInfo() {
    const { data } = await supabase
      .from("terminals")
      .select("renewal_days")
      .eq("terminal_id", terminalId)
      .maybeSingle();
    setRenewalDays((data as { renewal_days: number | null } | null)?.renewal_days ?? 90);
  }

  async function saveRenewalDays(days: number) {
    setError(null);
    const { error: err } = await supabase.from("terminals").update({ renewal_days: days }).eq("terminal_id", terminalId);
    if (err) { setError(err.message); return; }
    setRenewalDays(days);
    // Real bug found live: this terminal's renewal_days also feeds the
    // shared, 10-minute-cached terminals catalog (useTerminalsCatalog.ts) --
    // useTerminalFilters.ts's terminalsFiltered (what MyTerminalsModal's own
    // card list actually reads) is built from THAT cache, not a fresh
    // per-terminal query. Without invalidating it here, a just-edited
    // renewal period kept showing its OLD value on the card face for up to
    // 10 minutes (or until an unrelated remount), while the Expiration
    // Report -- which prefers the live my_terminals_with_status row for any
    // terminal the driver has already carded -- picked up the new value
    // immediately. Same edit, two screens disagreeing.
    await queryClient.invalidateQueries({ queryKey: TERMINALS_CATALOG_QUERY_KEY });
    onChanged();
  }

  useEffect(() => {
    if (!open || !terminalId) return;
    setView("racks");
    loadRacks();
    loadTerminalInfo();
  }, [open, terminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRack = racks.find((r) => r.rack_id === selectedRackId) ?? null;

  async function addRack() {
    const name = newRackName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("terminal_racks").insert({ terminal_id: terminalId, rack_name: name });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setNewRackName("");
    await loadRacks();
    onChanged();
  }

  // Cascades manually -- rack_lanes/rack_arms/rack_product_status all
  // reference rack_id as a plain column, not a DB-level FK with ON DELETE
  // CASCADE, so an unassisted delete of the terminal_racks row would leave
  // orphaned rows behind. Found while testing -- there was no way to
  // delete a rack at all before this (only rename/reconfigure it), a real
  // gap once test racks started accumulating.
  async function deleteRack(rackId: string) {
    setSaving(true);
    setError(null);
    await supabase.from("rack_arms").delete().eq("rack_id", rackId);
    await supabase.from("rack_lanes").delete().eq("rack_id", rackId);
    await supabase.from("rack_product_status").delete().eq("rack_id", rackId);
    const { error: err } = await supabase.from("terminal_racks").delete().eq("rack_id", rackId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    await loadRacks();
    onChanged();
  }

  const title = ({ racks: "Edit Terminal", products: "Rack Product List" } as Record<string, string>)[view];

  return (
    <FullscreenModal
      open={open}
      title={title}
      onClose={() => {
        if (view === "racks") onClose();
        else setView("racks");
      }}
      footer={view === "racks" ? undefined : null}
    >
      {view === "racks" && (
        <RacksView
          terminalName={terminalName}
          racks={racks}
          loading={loading}
          error={error}
          newRackName={newRackName}
          setNewRackName={setNewRackName}
          onAddRack={addRack}
          saving={saving}
          onEditProducts={(id) => { setSelectedRackId(id); setView("products"); }}
          onRenamed={loadRacks}
          onDeleteRack={deleteRack}
          renewalDays={renewalDays}
          onSaveRenewalDays={saveRenewalDays}
        />
      )}

      {view === "products" && selectedRack && (
        <ProductsView
          rack={selectedRack}
          onChanged={onChanged}
        />
      )}
    </FullscreenModal>
  );
}

function RacksView({
  terminalName, racks, loading, error, newRackName, setNewRackName, onAddRack, saving,
  onEditProducts, onRenamed, onDeleteRack,
  renewalDays, onSaveRenewalDays,
}: {
  terminalName?: string;
  racks: TerminalRack[];
  loading: boolean;
  error: string | null;
  newRackName: string;
  setNewRackName: (v: string) => void;
  onAddRack: () => void;
  saving: boolean;
  onEditProducts: (rackId: string) => void;
  onRenamed: () => void;
  onDeleteRack: (rackId: string) => void;
  renewalDays: number | null;
  onSaveRenewalDays: (days: number) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renewalDraft, setRenewalDraft] = useState(String(renewalDays ?? 90));
  useEffect(() => { setRenewalDraft(String(renewalDays ?? 90)); }, [renewalDays]);

  async function saveRename(rackId: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    await supabase.from("terminal_racks").update({ rack_name: name }).eq("rack_id", rackId);
    setRenamingId(null);
    onRenamed();
  }

  function commitRenewalDays() {
    const n = parseInt(renewalDraft, 10);
    if (Number.isFinite(n) && n > 0) onSaveRenewalDays(n);
    else setRenewalDraft(String(renewalDays ?? 90));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Racks{terminalName ? <> at <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{terminalName}</span></> : ""}. Hidden from drivers — lead/dispatch/admin only.
      </div>

      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Access Renewal Period</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Days after a driver's last visit before their card here needs renewal — drives the expiration warnings for every driver's card at this terminal.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <input
            type="text" inputMode="numeric" value={renewalDraft}
            onChange={(e) => setRenewalDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitRenewalDays}
            style={{
              width: 52, padding: "6px 4px", borderRadius: 6, textAlign: "center" as const,
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff",
              fontSize: 14, fontWeight: 800, boxSizing: "border-box" as const,
            }}
          />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>days</span>
        </div>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && racks.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>No racks yet — add the first one below.</div>
      )}

      {racks.map((r) => (
        <div key={r.rack_id} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "grid", gap: 8 }}>
          {renamingId === r.rack_id ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
              />
              <button onClick={() => saveRename(r.rack_id)} style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>Save</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{r.rack_name}</span>
              <button
                type="button"
                onClick={() => { setRenamingId(r.rack_id); setRenameValue(r.rack_name); }}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}
              >
                Rename
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => onEditProducts(r.rack_id)}
            style={{ width: "100%", fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}
          >
            Edit Product List
          </button>

          {confirmDeleteId === r.rack_id ? (
            <div style={{ borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", padding: 10, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Delete <strong>{r.rack_name}</strong>? This removes its lanes, arms, and product list — cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button" onClick={() => { onDeleteRack(r.rack_id); setConfirmDeleteId(null); }}
                  style={{ flex: 1, fontSize: 12, fontWeight: 800, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.18)", color: "#f87171", cursor: "pointer" }}
                >
                  Yes, delete
                </button>
                <button
                  type="button" onClick={() => setConfirmDeleteId(null)}
                  style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(r.rack_id)}
              style={{ width: "100%", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: "none", background: "none", color: "rgba(239,68,68,0.6)", cursor: "pointer" }}
            >
              Delete Rack
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <input
          type="text" value={newRackName} onChange={(e) => setNewRackName(e.target.value)}
          placeholder="New rack name (e.g. North Rack)"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
        />
        <button
          type="button" onClick={onAddRack} disabled={saving || !newRackName.trim()}
          style={{ fontSize: 13, fontWeight: 700, padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", opacity: saving || !newRackName.trim() ? 0.5 : 1 }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function ProductsView({ rack, onChanged }: { rack: TerminalRack; onChanged: () => void }) {
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
        style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
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
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 6,
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
