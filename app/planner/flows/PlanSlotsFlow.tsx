"use client";
// app/planner/flows/PlanSlotsFlow.tsx
//
// The saved plans A-E: the quick pick (tap to load, tap an empty one to save, long-press for more) and the Load / Edit / Clear sheet. A container: reads the planner model with usePlanner() and hands the
// windows what they show. Mount it anywhere under PlannerProvider.

import PresetQuickPick from "../components/PresetQuickPick";
import PresetActionSheet from "../components/PresetActionSheet";
import { usePlanner } from "../PlannerContext";

export default function PlanSlotsFlow() {
  const {
    shell,
    planSlots,
    activeSlotLetter,
    presetQuickPickOpen,
    setPresetQuickPickOpen,
    summaryForSlot,
    nameForSlot,
    colorsForSlot,
    handlePresetLoad,
    handlePresetSaveEmpty,
    setPresetSheetSlot,
    handleRecallLastLoad,
    presetSheetSlot,
    presetSheetSummary,
    handlePresetSheetLoad,
    handlePresetSheetEdit,
    handlePresetSheetClear,
    closePresetSheet,
  } = usePlanner();

  return (
    <>
      <PresetQuickPick
        open={presetQuickPickOpen}
        onClose={() => setPresetQuickPickOpen(false)}
        slots={planSlots.PLAN_SLOTS}
        slotHas={planSlots.slotHas}
        activeSlot={activeSlotLetter}
        // Also gated on presetsReady -- until the initial server sync for
        // this equipment combo has actually completed, a slot that reads
        // "empty" might just be unsynced, not really empty, and tapping it
        // would treat it as an implicit save. Interacting during that
        // window silently overwrote real presets with whatever was
        // on-screen at the time -- see usePlanSlots.ts.
        disabled={!shell.location.selectedTerminalId || !planSlots.presetsReady}
        disabledReason={!shell.location.selectedTerminalId ? "Select a terminal first" : "Syncing presets…"}
        getSummary={summaryForSlot}
        getName={nameForSlot}
        getColors={colorsForSlot}
        onLoad={handlePresetLoad}
        onSaveEmpty={handlePresetSaveEmpty}
        onOpenActions={(n) => setPresetSheetSlot(n)}
        onRename={(n, name) => planSlots.renameSlot(n, name)}
        onRecallLastLoad={handleRecallLastLoad}
      />
      <PresetActionSheet
        open={presetSheetSlot != null}
        letter={presetSheetSlot != null ? String.fromCharCode(64 + presetSheetSlot) : ""}
        summary={presetSheetSummary}
        onLoad={handlePresetSheetLoad}
        onConfirmEdit={handlePresetSheetEdit}
        onConfirmClear={handlePresetSheetClear}
        onClose={closePresetSheet}
      />
    </>
  );
}
