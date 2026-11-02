// lib/workorders/workOrderList.ts
//
// Pure: turns work order rows into the list an admin reads.
// Open ones first, newest first; closed ones hidden unless asked for.

import type { WorkOrderRow, WorkOrderStatus } from "../trips/types.ts";
import { isOpenWorkOrder, WORK_ORDER_SOURCE_LABEL, WORK_ORDER_STATUS_LABEL } from "./workOrders.ts";

export type WorkOrderListRow = WorkOrderRow & { created_at: string };
export type WorkOrderItem = {
  id: string;
  subject: string;
  sourceLabel: string;
  status: WorkOrderStatus;
  statusLabel: string;
  unit: string | null;
  createdAt: string;
  open: boolean;
  detail: Record<string, unknown>;
};

export function buildWorkOrderList(rows: WorkOrderListRow[], opts: { showClosed: boolean; unitName: (r: WorkOrderRow) => string | null }): { items: WorkOrderItem[]; openCount: number } {
  const all = rows.map<WorkOrderItem>((r) => ({
    id: r.work_order_id, subject: r.subject, sourceLabel: WORK_ORDER_SOURCE_LABEL[r.source] ?? r.source,
    status: r.status, statusLabel: WORK_ORDER_STATUS_LABEL[r.status] ?? r.status, unit: opts.unitName(r),
    createdAt: r.created_at, open: isOpenWorkOrder(r.status), detail: r.detail ?? {},
  }));
  const items = all.filter((i) => opts.showClosed || i.open).sort((a, b) => Number(b.open) - Number(a.open) || b.createdAt.localeCompare(a.createdAt));
  return { items, openCount: all.filter((i) => i.open).length };
}
