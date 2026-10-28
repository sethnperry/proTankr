"use client";
// app/admin/AdminLoadsModal.tsx
// Reuses MyLoadsModal to show a driver's load history from the admin page.
// Fetches data internally so the admin page doesn't need new state.

import React, { useEffect, useState } from "react";
import MyLoadsModal from "@/app/planner/modals/MyLoadsModal";
import { useLoadHistory } from "@/app/planner/hooks/useLoadHistory";
import { supabase } from "@/lib/supabase/client";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";

type Props = {
  open: boolean;
  onClose: () => void;
  targetUserId: string;
  targetDisplayName: string;
  companyId?: string | null;
};

export default function AdminLoadsModal({ open, onClose, targetUserId, targetDisplayName, companyId }: Props) {
  const loadHistory = useLoadHistory(targetUserId);
  // Sourced from the shared cached catalog (lib/queries/useTerminalsCatalog.ts)
  // instead of this modal's own supabase.from("terminals") fetch on every
  // open -- MyLoadsModal only needs terminal_id/terminal_name for label
  // resolution, a subset of the shared catalog's columns.
  const { data: terminalCatalog = [] } = useTerminalsCatalog();
  const [combos, setCombos] = useState<any[]>([]);

  // Load combos once per open so MyLoadsModal can resolve equipment labels
  useEffect(() => {
    if (!open) return;
    supabase
      .from("equipment_combos")
      .select("combo_id, combo_name, truck_id, trailer_id")
      .eq("active", true)
      .then(({ data }) => setCombos(data ?? []));
  }, [open]);

  return (
    <MyLoadsModal
      open={open}
      onClose={onClose}
      authUserId={targetUserId}
      companyId={companyId}
      rows={loadHistory.rows}
      loading={loadHistory.loading}
      error={loadHistory.error}
      linesCache={loadHistory.linesCache}
      linesLoading={loadHistory.linesLoading}
      onFetchLines={loadHistory.fetchLines}
      onFetchRange={loadHistory.fetch}
      terminalCatalog={terminalCatalog}
      combos={combos}
      headerOverride={targetDisplayName}
    />
  );
}
