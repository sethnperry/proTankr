"use client";
// app/admin/WorkOrdersModal.tsx
//
// Company Dashboard → Work orders. Thin data wrapper around WorkOrdersView.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { buildWorkOrderList, type WorkOrderListRow } from "@/lib/workorders/workOrderList";
import type { WorkOrderStatus } from "@/lib/trips/types";
import { WorkOrdersView } from "./WorkOrdersView";

export default function WorkOrdersModal({ open, onClose, companyId, canEdit }: { open: boolean; onClose: () => void; companyId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<WorkOrderListRow[]>([]);
  const [units, setUnits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: e } = await supabase.from("work_orders")
      .select("work_order_id, company_id, truck_id, trailer_id, subject, source, status, source_ref, detail, reported_by, created_at")
      .eq("company_id", companyId).order("created_at", { ascending: false }).limit(500);
    if (e) setError(e.message); else setRows((data ?? []) as WorkOrderListRow[]);
    const [t, r] = await Promise.all([
      supabase.from("trucks").select("truck_id, truck_name").eq("company_id", companyId),
      supabase.from("trailers").select("trailer_id, trailer_name").eq("company_id", companyId),
    ]);
    const m: Record<string, string> = {};
    for (const x of (t.data ?? []) as any[]) m[x.truck_id] = `Truck ${x.truck_name}`;
    for (const x of (r.data ?? []) as any[]) m[x.trailer_id] = `Trailer ${x.trailer_name}`;
    setUnits(m);
    setLoading(false);
  }, [companyId]);
  useEffect(() => { if (open && companyId) void load(); }, [open, companyId, load]);

  const list = useMemo(() => buildWorkOrderList(rows, { showClosed, unitName: (r) => (r.truck_id ? units[r.truck_id] : r.trailer_id ? units[r.trailer_id] : null) ?? null }), [rows, showClosed, units]);

  const setStatus = async (id: string, status: WorkOrderStatus) => {
    setBusyId(id);
    const { error: e } = await supabase.from("work_orders").update({ status, updated_at: new Date().toISOString() }).eq("work_order_id", id);
    setBusyId(null);
    if (e) setError(e.message); else setRows((rs) => rs.map((r) => (r.work_order_id === id ? { ...r, status } : r)));
  };

  return (
    <FullscreenModal open={open} title="Work orders" onClose={onClose} footer={null}>
      <WorkOrdersView {...list} showClosed={showClosed} onShowClosed={setShowClosed} loading={loading} error={error} canEdit={canEdit} onStatus={(id, s) => void setStatus(id, s)} busyId={busyId} />
    </FullscreenModal>
  );
}
