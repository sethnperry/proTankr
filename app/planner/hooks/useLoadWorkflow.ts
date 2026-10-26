"use client";
// hooks/useLoadWorkflow.ts
// Owns: begin_load, complete_load RPCs, load state machine, load report.
// Composed from layers in hooks/loadWorkflow/ (state, start, cancel, complete, report view).

import { useLoadWorkflowState } from "./loadWorkflow/useLoadWorkflowState";
import { useLoadStart } from "./loadWorkflow/useLoadStart";
import { useLoadCancel } from "./loadWorkflow/useLoadCancel";
import { useLoadComplete } from "./loadWorkflow/useLoadComplete";
import { useLoadReportView } from "./loadWorkflow/useLoadReportView";
import type { Props } from "./loadWorkflow/types";

export type { ReportLine } from "./loadWorkflow/types";
export type { LoadUtilizationResult } from "../utils/loadSideEffects";

export function useLoadWorkflow(props: Props) {
  const k = useLoadWorkflowState(props);
  const b = useLoadStart(props, k);
  const c = useLoadCancel(props, k, b);
  const m = useLoadComplete(props, k, b, c);
  const v = useLoadReportView(props, k, b, c, m);
  const all = { ...k, ...b, ...c, ...m, ...v };
  return {
    activeLoadId: all.activeLoadId,
    beginLoadBusy: all.beginLoadBusy,
    loadingOpen: all.loadingOpen,
    setLoadingOpen: all.setLoadingOpen,
    loadingModalError: all.loadingModalError,
    completeOpen: all.completeOpen,
    setCompleteOpen: all.setCompleteOpen,
    completeBusy: all.completeBusy,
    completeError: all.completeError,
    actualByComp: all.actualByComp,
    loadReport: all.loadReport,
    setLoadReport: all.setLoadReport,
    loadUtilization: all.loadUtilization,
    setLoadUtilization: all.setLoadUtilization,
    reportLines: all.reportLines,
    reportLoadId: all.reportLoadId,
    reportBusy: all.reportBusy,
    reportError: all.reportError,
    beginLoadToSupabase: all.beginLoadToSupabase,
    onLoadedFromLoadingModal: all.onLoadedFromLoadingModal,
    openLoadReport: all.openLoadReport,
    closeLoadReport: all.closeLoadReport,
    deleteReportedLoad: all.deleteReportedLoad,
    cancelActiveLoad: all.cancelActiveLoad,
    cancelBusy: all.cancelBusy,
  };
}
