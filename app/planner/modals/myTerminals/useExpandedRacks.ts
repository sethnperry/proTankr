"use client";
// app/planner/modals/myTerminals/useExpandedRacks.ts
//
// Part of MyTerminalsModal.tsx: racks and rack products for whichever terminal card is open.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TerminalRack, RackProductStatusRow } from "../rackProductTypes";

export function useExpandedRacks(expandedTerminalId: string | null) {
  const [expandedRacks, setExpandedRacks] = useState<TerminalRack[]>([]);
  const [expandedRackId, setExpandedRackId] = useState("");
  const [expandedRackProducts, setExpandedRackProducts] = useState<RackProductStatusRow[]>([]);
  const [racksLoading, setRacksLoading] = useState(false);
  const [racksError, setRacksError] = useState<string | null>(null);

  const loadExpandedRacks = useCallback(async (terminalId: string, opts?: { keepRackId?: string }) => {
    if (!terminalId) {
      setExpandedRacks([]);
      setExpandedRackId("");
      setRacksError(null);
      return;
    }
    setRacksLoading(true);
    setRacksError(null);
    const { data, error: err } = await supabase
      .from("terminal_racks")
      .select("*")
      .eq("terminal_id", terminalId)
      .order("rack_name", { ascending: true });
    if (err) {
      setRacksError(err.message);
      setExpandedRacks([]);
    } else {
      const rows = (data ?? []) as TerminalRack[];
      setExpandedRacks(rows);
      // Keep the previously-picked rack selected across a refetch (e.g. after
      // an Edit Terminal rename) if it still exists; otherwise fall back to
      // the first row, same as the initial pick.
      const keep = opts?.keepRackId;
      setExpandedRackId(keep && rows.some((r) => r.rack_id === keep) ? keep : (rows[0]?.rack_id ?? ""));
    }
    setRacksLoading(false);
  }, []);

  useEffect(() => {
    if (!expandedTerminalId) {
      setExpandedRacks([]);
      setExpandedRackId("");
      setExpandedRackProducts([]);
      setRacksError(null);
      return;
    }
    loadExpandedRacks(expandedTerminalId);
  }, [expandedTerminalId, loadExpandedRacks]);

  const loadExpandedRackProducts = useCallback(async (rackId: string) => {
    if (!rackId) { setExpandedRackProducts([]); return; }
    const { data, error: err } = await supabase
      .from("rack_product_status").select("*").eq("rack_id", rackId).eq("active", true);
    if (err) { setRacksError(err.message); return; }
    setExpandedRackProducts((data ?? []) as RackProductStatusRow[]);
  }, []);

  useEffect(() => {
    loadExpandedRackProducts(expandedRackId);
  }, [expandedRackId, loadExpandedRackProducts]);

  return {
    expandedRacks, expandedRackId, setExpandedRackId, expandedRackProducts,
    racksLoading, racksError, loadExpandedRacks, loadExpandedRackProducts,
  };
}
