"use client";
// app/planner/flows/ReportIssueFlow.tsx
//
// Report Terminal Issue (out of product, long line and so on), opened from Plan Review. A container: reads the planner model with usePlanner() and hands the
// window what it shows. Mount it anywhere under PlannerProvider.

import CancelLoadSheet from "../components/CancelLoadSheet";
import { usePlanner } from "../PlannerContext";
import { reportRows } from "../utils/reportRows";

export default function ReportIssueFlow() {
  const {
    shell,
    loadWorkflow,
    effectivePlanRows,
    compPlan,
    terminalProducts,
    productNameById,
    cancelLoadConfirmOpen,
    setCancelLoadConfirmOpen,
    handleBackToPlannerNoUpdate,
    handleSubmitOutageReport,
  } = usePlanner();

  return (
    <CancelLoadSheet
      open={cancelLoadConfirmOpen}
      initialMode="reportType"
      onDismiss={() => setCancelLoadConfirmOpen(false)}
      onBackToPlanner={() => {
        setCancelLoadConfirmOpen(false);
        handleBackToPlannerNoUpdate();
      }}
      onLogTheLoad={() => {
        setCancelLoadConfirmOpen(false);
        loadWorkflow.onLoadedFromLoadingModal({});
      }}
      onUpdateCardOnly={() => {
        setCancelLoadConfirmOpen(false);
        loadWorkflow.cancelActiveLoad();
      }}
      darkMode={shell.theme.darkMode}
      accentColor={shell.theme.accentColor}
      planRows={reportRows(effectivePlanRows as any[], compPlan as any, (terminalProducts ?? []) as any[]) as any[]}
      productNameById={productNameById}
      onSubmitOutageReport={handleSubmitOutageReport}
    />
  );
}
