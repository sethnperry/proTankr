"use client";
// app/planner/flows/PlanSlotsFlow.tsx
//
// The saved plans A-E: the quick pick (tap to load, tap an empty one to save, long-press for more) and the Load / Edit / Clear sheet. A container: reads the planner model with usePlanner() and hands the
// windows what they show. Mount it anywhere under PlannerProvider.

import PresetQuickPick from "../components/PresetQuickPick";
import PresetActionSheet from "../components/PresetActionSheet";
import { usePlanner } from "../PlannerContext";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

export default function PlanSlotsFlow() {
  const {
    shell,
    planSlots,
    activeSlotLetter,
    presetQuickPickOpen,
    setPresetQuickPickOpen,
    summaryForSlot,
    compsForSlot,
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
    switchPrompt,
    setSwitchPrompt,
  } = usePlanner();
  const btn = { width: "100%", padding: "14px 0", fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", borderRadius: 2, cursor: "pointer", marginTop: 10 };

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
        getComps={compsForSlot}
        onLoad={handlePresetLoad}
        onSaveEmpty={handlePresetSaveEmpty}
        onOpenActions={(n) => setPresetSheetSlot(n)}
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
      {/* A trip is waiting to load: changing the plan changes what it loads. */}
      <FullscreenModal open={!!switchPrompt} title="Switch the trip?" onClose={() => setSwitchPrompt(null)} footer={null}>
        {switchPrompt && (
          <>
            <div style={{ fontSize: 16, lineHeight: 1.4 }}>Are you sure you want to switch the trip in progress to <b>{switchPrompt.to}</b>?</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>Right now it is set up for {switchPrompt.from}. Switching changes what you load at the rack.</div>
            <button type="button" style={{ ...btn, background: "#fff", color: "#000", border: "none" }} onClick={() => { const r = switchPrompt.run; setSwitchPrompt(null); r(); }}>Yes, switch to {switchPrompt.to}</button>
            <button type="button" style={{ ...btn, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }} onClick={() => { const k = switchPrompt.keep; setSwitchPrompt(null); k?.(); }}>No, keep {switchPrompt.from}</button>
          </>
        )}
      </FullscreenModal>
    </>
  );
}
