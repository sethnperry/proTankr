"use client";
// app/planner/hooks/useLoadReportLauncher.ts
//
// Opening a finished load's report in Plan Review: the "/planner?report=<id>"
// link from the dashboard, the cover shown while it loads, and sending the
// driver straight back to the dashboard when they close it. Lifted out of
// PlannerHost unchanged. A pure read of load_log / load_lines; it never
// touches the plan or any slot storage.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { useCalculatorShell } from "../CalculatorShellContext";
import type { useLoadWorkflow } from "./useLoadWorkflow";

type Args = {
  shell: ReturnType<typeof useCalculatorShell>;
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;
  leaveTo: (href: string, label: string) => void;
};

export function useLoadReportLauncher({ shell, loadWorkflow, leaveTo }: Args) {
  const { equipment, location } = shell;
  const [, setViewLastLoadMsg] = useState<string | null>(null);
  const [, setViewLastLoadBusy] = useState(false);
  const openLoadReportAtTerminal = useCallback(async (byLoadId?: string) => {
    if (!byLoadId && (!equipment.selectedComboId || !location.selectedTerminalId)) return;
    setViewLastLoadBusy(true);
    setViewLastLoadMsg(null);
    try {
      // A known load id: both reads at once (the dashboard's Load Report link).
      const linesQuery = (id: string) => supabase
        .from("load_lines")
        .select("comp_number, product_id, actual_gallons, actual_lbs, actual_api, temp_f")
        .eq("load_id", id)
        .order("comp_number", { ascending: true });
      const linesEarly = byLoadId ? linesQuery(byLoadId) : null;
      const { data: loadRow, error: loadErr } = byLoadId
        ? await supabase.from("load_log").select("load_id, completed_at, plan_slot").eq("load_id", byLoadId).maybeSingle()
        : await supabase
        .from("load_log")
        .select("load_id, completed_at, plan_slot")
        .eq("combo_id", equipment.selectedComboId)
        .eq("terminal_id", location.selectedTerminalId)
        .eq("status", "loaded")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!loadRow) { setViewLastLoadMsg("No completed load at this terminal yet."); return; }

      const { data: lineRows, error: lineErr } = await (linesEarly ?? linesQuery(String(loadRow.load_id)));
      if (lineErr) throw lineErr;

      const lines = (lineRows ?? [])
        .filter((l: any) => l.product_id && Number(l.actual_gallons ?? 0) > 0)
        .map((l: any) => ({
          comp: Number(l.comp_number),
          productId: String(l.product_id),
          gallons: Number(l.actual_gallons ?? 0),
          lbs: l.actual_lbs != null ? Number(l.actual_lbs) : null,
          api: l.actual_api != null ? Number(l.actual_api) : null,
          tempF: l.temp_f != null ? Number(l.temp_f) : null,
        }));

      if (lines.length === 0) { setViewLastLoadMsg("No completed load at this terminal yet."); return; }

      loadWorkflow.openLoadReport({
        loadId: String(loadRow.load_id),
        lines,
        completedAt: loadRow.completed_at ?? null,
        planSlot: loadRow.plan_slot ?? null,
      });
    } catch (e) {
      console.error("openLoadReportAtTerminal failed:", e);
      setViewLastLoadMsg("Could not load that report.");
    } finally {
      setViewLastLoadBusy(false);
    }
  }, [equipment.selectedComboId, location.selectedTerminalId, loadWorkflow]);

  // /planner?report=<load_id> (the dashboard's Load Report link) opens that
  // load's report once.
  const reportParamDone = useRef(false);
  // While that report loads, a plain cover hides the Planner so the driver
  // goes straight from the dashboard to the report. Set before first paint.
  const [reportPending, setReportPending] = useState(false);
  // Report opened from the dashboard: closing it (any button) goes straight
  // back there, under the same cover, so the Planner never shows.
  const reportFromDashboardRef = useRef(false);
  const reportShownRef = useRef(false);
  const [reportFromDashboard, setReportFromDashboard] = useState(false);
  useLayoutEffect(() => {
    if (new URLSearchParams(window.location.search).get("report")) {
      setReportPending(true);
      reportFromDashboardRef.current = true;
      setReportFromDashboard(true);
    }
  }, []);
  useLayoutEffect(() => {
    if (!reportFromDashboardRef.current || reportPending) return;
    if (loadWorkflow.loadingOpen || loadWorkflow.reportLines) { reportShownRef.current = true; return; }
    if (!reportShownRef.current) return; // report never opened (error): stay
    reportFromDashboardRef.current = false;
    setReportFromDashboard(false);
    leaveTo("/planner/home", "Opening dashboard…");
  }, [loadWorkflow.loadingOpen, loadWorkflow.reportLines, reportPending, leaveTo]);
  useEffect(() => {
    if (reportParamDone.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("report");
    if (!id) return;
    reportParamDone.current = true;
    params.delete("report");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    void openLoadReportAtTerminal(id).finally(() => setReportPending(false));
  }, [openLoadReportAtTerminal]);


  return { reportPending, reportFromDashboard, openLoadReportAtTerminal };
}
