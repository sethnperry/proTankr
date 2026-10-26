"use client";
// app/planner/hooks/loadWorkflow/useLoadReportView.ts
//
// Viewing, closing and deleting a past load report.

import { useCallback } from "react";
import { deleteLoad } from "@/lib/supabase/load";

import type { Props, ReportLine } from "./types";
import { friendlyLoadError } from "./friendlyError";

import type { useLoadWorkflowState } from "./useLoadWorkflowState";
import type { useLoadStart } from "./useLoadStart";
import type { useLoadCancel } from "./useLoadCancel";
import type { useLoadComplete } from "./useLoadComplete";

export function useLoadReportView(
  props: Props,
  k: ReturnType<typeof useLoadWorkflowState>,
  b: ReturnType<typeof useLoadStart>,
  c: ReturnType<typeof useLoadCancel>,
  m: ReturnType<typeof useLoadComplete>,
) {
  const { tare, setLoadingOpen, setReportLines, reportLoadId, setReportLoadId, setReportBusy, setReportError, setLoadReport } = k;
  // ── View a past completed load's report (no begin/complete involved) ─────
  // Feeds LoadingModal's "report mode" from a load that finished in an
  // EARLIER session -- page.tsx's own terminal-scoped load_log/load_lines
  // fetch builds the ReportLine[]; this just puts it on screen the same way
  // a fresh completion would. Deliberately reuses the exact same
  // reportLines/reportLoadId/loadReport state a real completion sets, so
  // Edit Load/Delete Load work identically regardless of how the report
  // was reached.
  const openLoadReport = useCallback(
    (args: { loadId: string; lines: ReportLine[]; completedAt: string | null; planSlot: number | null }) => {
      const actualLbsSum = args.lines.reduce((s, l) => s + (l.lbs ?? 0), 0);
      const actualGross = Number.isFinite(tare) ? tare + actualLbsSum : null;
      setReportLines(args.lines);
      setReportLoadId(args.loadId);
      setReportError(null);
      setLoadReport({
        planned_total_gal: args.lines.reduce((s, l) => s + l.gallons, 0),
        planned_gross_lbs: null,
        actual_gross_lbs: actualGross,
        diff_lbs: null,
        completed_at: args.completedAt,
        plan_slot: args.planSlot,
        utilization: null,
      });
      setLoadingOpen(true);
    },
    [tare],
  );

  // "New Load" -- the report is done being looked at; just closes, no DB
  // action (the load itself was already committed, on completion or on an
  // earlier session's own openLoadReport view).
  const closeLoadReport = useCallback(() => {
    setLoadingOpen(false);
    setReportLines(null);
    setReportLoadId(null);
    setLoadReport(null);
    setReportError(null);
  }, []);

  // "Delete Load" -- reuses the same owner-checked delete_load RPC
  // MyLoadsModal's own Delete action already calls.
  const deleteReportedLoad = useCallback(async () => {
    if (!reportLoadId) return;
    try {
      setReportBusy(true);
      setReportError(null);
      await deleteLoad(reportLoadId);
      closeLoadReport();
    } catch (e: any) {
      setReportError(friendlyLoadError(e, "Could not delete this load."));
    } finally {
      setReportBusy(false);
    }
  }, [reportLoadId, closeLoadReport]);

  return {
    openLoadReport,
    closeLoadReport,
    deleteReportedLoad,
  };
}
