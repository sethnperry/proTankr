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

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { TERMINALS_CATALOG_QUERY_KEY } from "@/lib/queries/useTerminalsCatalog";
import type { TerminalRack } from "./rackProductTypes";

import type { View } from "./editTerminal/types";
import { RacksView } from "./editTerminal/RacksView";
import { ProductsView } from "./editTerminal/ProductsView";


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
  const [gauging, setGauging] = useState<{ cutoff: string | null; minutes: number | null }>({ cutoff: null, minutes: null });
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
      .select("renewal_days, gauging_cutoff, gauging_minutes")
      .eq("terminal_id", terminalId)
      .maybeSingle();
    const row = data as { renewal_days: number | null; gauging_cutoff: string | null; gauging_minutes: number | null } | null;
    setRenewalDays(row?.renewal_days ?? 90);
    setGauging({ cutoff: row?.gauging_cutoff ?? null, minutes: row?.gauging_minutes ?? null });
  }

  async function saveGauging(next: { cutoff: string | null; minutes: number | null }) {
    setError(null);
    const { error: err } = await supabase.from("terminals")
      .update({ gauging_cutoff: next.cutoff, gauging_minutes: next.minutes }).eq("terminal_id", terminalId);
    if (err) { setError(err.message); return; }
    setGauging(next);
    await queryClient.invalidateQueries({ queryKey: TERMINALS_CATALOG_QUERY_KEY });
    onChanged();
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
          gauging={gauging}
          onSaveGauging={saveGauging}
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
