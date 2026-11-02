// lib/workorders/workOrders.ts
//
// Work orders. A pump down, a failed inspection and a repair request each create exactly one. Written through the
// same offline store as trips and shift events: the id is made on the phone, so a retry can never make a second.

import { newId, type TripStore } from "../trips/tripStore.ts";
import type { WorkOrderRow, WorkOrderSource, WorkOrderStatus } from "../trips/types.ts";

export const WORK_ORDER_SOURCE_LABEL: Record<WorkOrderSource, string> = {
  pump_down: "Pump down",
  failed_inspection: "Failed inspection",
  repair_request: "Repair request",
  other: "Other",
};

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: "Open",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  denied: "Denied",
  planned: "Planned",
  done: "Done",
  cancelled: "Cancelled",
};

const CLOSED: WorkOrderStatus[] = ["done", "cancelled", "denied"];
export const isOpenWorkOrder = (s: WorkOrderStatus) => !CLOSED.includes(s);

/** A repair request starts waiting on its approver; everything else starts open. */
export function startingStatus(source: WorkOrderSource): WorkOrderStatus {
  return source === "repair_request" ? "awaiting_approval" : "open";
}

export function createWorkOrder(
  store: TripStore,
  o: { companyId: string; reportedBy: string; subject: string; source: WorkOrderSource; truckId?: string | null; trailerId?: string | null; sourceRef?: string | null; detail?: Record<string, unknown>; id?: string },
): WorkOrderRow {
  const subject = o.subject.trim();
  if (!subject) throw new Error("A work order needs a subject.");
  const id = o.id ?? newId();
  // The same id again (a retried tap) is the same work order, not a second one.
  const existing = store.get("work_orders", id);
  if (existing) return existing;
  const row: WorkOrderRow = {
    work_order_id: id,
    company_id: o.companyId,
    truck_id: o.truckId ?? null,
    trailer_id: o.trailerId ?? null,
    subject,
    source: o.source,
    status: startingStatus(o.source),
    source_ref: o.sourceRef ?? null,
    detail: o.detail ?? {},
    reported_by: o.reportedBy,
  };
  store.put("work_orders", row);
  return row;
}
