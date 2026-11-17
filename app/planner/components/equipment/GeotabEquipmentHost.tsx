"use client";
// app/planner/components/equipment/GeotabEquipmentHost.tsx
//
// Runs the Geotab-to-ProTankr matching on the Driver Dashboard: reads what Geotab says about this driver, decides what
// (if anything) to offer (lib/equipment/geotabMatch.ts), shows the sheet, and does the linking when they confirm.
// Nothing changes without a tap, except that "Not now" hides the same offer for 30 minutes.

import React, { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { proposalFor, proposalKey, type Proposal } from "@/lib/equipment/geotabMatch";
import { useGeotabEquipment, useSecondSeat } from "../../hooks/useGeotabEquipment";
import { GeotabEquipmentSheet, type Answer } from "./GeotabEquipmentSheet";
import type { useEquipment } from "../../hooks/useEquipment";

const SNOOZE_MS = 30 * 60_000;

export function GeotabEquipmentHost({ userId, equipment }: { userId: string | null; equipment: ReturnType<typeof useEquipment> }) {
  const { geo, refresh } = useGeotabEquipment(userId);
  const second = useSecondSeat(userId);
  const [, bump] = useState(0);
  const snoozeKey = userId ? `proTankr:u:${userId}:geoSnooze` : "";
  const readSnooze = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(snoozeKey) ?? "{}"); } catch { return {}; } };
  const snooze = (p: Proposal) => { try { const m = readSnooze(); m[proposalKey(p)] = Date.now() + SNOOZE_MS; localStorage.setItem(snoozeKey, JSON.stringify(m)); } catch { /* storage blocked */ } bump((n) => n + 1); };

  const held = {
    truckId: equipment.selectedCombo?.truck_id ?? equipment.currentTruckId ?? null,
    trailerId: equipment.selectedCombo?.trailer_id ?? equipment.currentTrailerId ?? null,
    secondSeatTruckId: second.seat?.truckId ?? null,
  };
  const raw = proposalFor(geo, held);
  const proposal = raw && !(userId && (readSnooze()[proposalKey(raw)] ?? 0) > Date.now()) ? raw : null;

  const couple = useCallback(async (truckId: string, trailerId: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc("couple_combo", { p_truck_id: truckId, p_trailer_id: trailerId, p_tare_lbs: null, p_force: true });
    if (error) return /provide a tare weight/i.test(error.message ?? "") ? "This pairing is new, so it needs a tare weight. Open Equipment, pick the pair and enter it." : error.message;
    const id = String((data as { combo_id?: string } | null)?.combo_id ?? "");
    await Promise.all([equipment.fetchCombos(), equipment.loadCurrentEquipment()]);
    if (id) equipment.setSelectedComboId(id);
    return null;
  }, [equipment]);

  const apply = async (): Promise<string | null> => {
    if (!proposal) return null;
    try {
      let e: string | null = null;
      if (proposal.kind === "link") {
        if (proposal.trailer) e = await couple(proposal.truck.id, proposal.trailer.id);
        else { await equipment.setCurrentEquipment(proposal.truck.id, null); equipment.clearSelectedEquipment(); }
      } else if (proposal.kind === "couple") e = await couple(proposal.truck.id, proposal.trailer.id);
      else if (proposal.kind === "bobtail") { await equipment.setCurrentEquipment(proposal.truck.id, null); equipment.clearSelectedEquipment(); }
      else if (proposal.kind === "second_seat") {
        const { error } = await supabase.rpc("join_second_seat", { p_truck_id: proposal.truck.id, p_source: "geotab" });
        if (error) e = error.message; else await second.refresh();
      } else if (proposal.kind === "promote") {
        const { data, error } = await supabase.rpc("promote_second_seat", { p_truck_id: proposal.truck.id });
        if (error) e = error.message;
        else {
          await Promise.all([equipment.fetchCombos(), equipment.loadCurrentEquipment(), second.refresh()]);
          const id = String((data as { combo_id?: string } | null)?.combo_id ?? "");
          if (id) equipment.setSelectedComboId(id);
        }
      }
      if (!e) { snooze(proposal); void refresh(); }
      return e;
    } catch (err: any) { return err?.message ?? "Couldn't do that."; }
  };

  const answer = async (kind: "truck" | "trailer", unitId: string, a: Answer): Promise<string | null> => {
    const { error } = a === "repositioning"
      ? await supabase.rpc("begin_reposition", { p_kind: kind, p_unit_id: unitId })
      : await supabase.rpc("resolve_deadline", { p_kind: kind, p_unit_id: unitId, p_status: "in_use" });
    return error ? error.message : null;
  };

  return <GeotabEquipmentSheet proposal={proposal} onSnooze={() => proposal && snooze(proposal)} onApply={apply} onAnswer={answer} />;
}
