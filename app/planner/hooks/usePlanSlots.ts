"use client";
// hooks/usePlanSlots.ts
// Owns: plan snapshot save/load, localStorage hot cache, Supabase cross-device sync.
// Composed from four layers in hooks/planSlots/ (core, sync, restore, actions).

import { PLAN_SLOTS } from "../utils/planSlotStorage";
import { usePlanSlotsCore } from "./planSlots/usePlanSlotsCore";
import { usePlanSlotsSync } from "./planSlots/usePlanSlotsSync";
import { usePlanSlotsRestore } from "./planSlots/usePlanSlotsRestore";
import { usePlanSlotsActions } from "./planSlots/usePlanSlotsActions";
import type { Props } from "./planSlots/types";

export function usePlanSlots(props: Props) {
  const k = usePlanSlotsCore(props);
  usePlanSlotsSync(props, k);
  usePlanSlotsRestore(props, k);
  const a = usePlanSlotsActions(props, k);
  const all = { ...k, ...a };
  return {
    PLAN_SLOTS,
    slotHas: all.slotHas,
    presetsReady: all.presetsReady,
    lastLoadLines: all.lastLoadLines,
    lastLoadReport: all.lastLoadReport,
    fetchLastProductPerComp: all.fetchLastProductPerComp,
    saveToSlot: all.saveToSlot,
    saveSnapshotToSlot: all.saveSnapshotToSlot,
    clearSlot: all.clearSlot,
    loadFromSlot: all.loadFromSlot,
    peekSlot: all.peekSlot,
    renameSlot: all.renameSlot,
    refreshLastLoad: all.refreshLastLoad,
    recallLastLoad: all.recallLastLoad,
    findLastLoadAtTerminalDifferentEquipment: all.findLastLoadAtTerminalDifferentEquipment,
  };
}
