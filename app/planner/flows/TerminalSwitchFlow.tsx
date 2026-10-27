"use client";
// app/planner/flows/TerminalSwitchFlow.tsx
//
// The "what about your card?" window shown after changing terminal during a load. A container: reads the planner model with usePlanner() and hands the
// window what it shows. Mount it anywhere under PlannerProvider.

import TerminalSwitchDuringLoadSheet from "../components/TerminalSwitchDuringLoadSheet";
import { usePlanner } from "../PlannerContext";
import { reportRows } from "../utils/reportRows";

export default function TerminalSwitchFlow() {
  const {
    shell,
    loadWorkflow,
    effectivePlanRows,
    compPlan,
    terminalProducts,
    productNameById,
    terminalSwitchConfirm,
    handleUpdateCardAtPrevious,
    handleSwitchWithoutUpdating,
    handleSubmitOutageReportForPreviousTerminal,
    switchReportedIssueRef,
    switchReasonNoteRef,
    tripPickup,
    tripWaitingPickup,
  } = usePlanner();

  return (
    <TerminalSwitchDuringLoadSheet
      open={!!terminalSwitchConfirm}
      prevTerminalName={terminalSwitchConfirm?.prev.terminalName ?? ""}
      newTerminalName={terminalSwitchConfirm?.next.terminalName ?? ""}
      onUpdateCardAtPrevious={handleUpdateCardAtPrevious}
      onSwitchWithoutUpdating={handleSwitchWithoutUpdating}
      darkMode={shell.theme.darkMode}
      accentColor={shell.theme.accentColor}
      planRows={reportRows(effectivePlanRows as any[], compPlan as any, (terminalProducts ?? []) as any[]) as any[]}
      productNameById={productNameById}
      onSubmitOutageReport={handleSubmitOutageReportForPreviousTerminal}
      requireReason={!!((loadWorkflow.activeLoadId && tripPickup) || tripWaitingPickup?.arrived_at)}
      onReasonPicked={(code, note) => {
        if (!switchReportedIssueRef.current) switchReportedIssueRef.current = code;
        switchReasonNoteRef.current = note;
      }}
    />
  );
}
