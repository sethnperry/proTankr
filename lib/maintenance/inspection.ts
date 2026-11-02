// lib/maintenance/inspection.ts
//
// A driver's inspection of a truck or trailer: the checklist per unit type, the condition scale, what blocks
// submitting, and what a failed one creates (a planned work order). Pure: no Supabase. Written through the
// offline store like every other form.

import { newId, type TripStore } from "../trips/tripStore.ts";
import type { InspectionCondition, UnitInspectionRow, WorkOrderRow } from "../trips/types.ts";
import { createWorkOrder } from "../workorders/workOrders.ts";

export type UnitKind = "truck" | "trailer";
export type { InspectionCondition };

export const CONDITIONS: { value: InspectionCondition; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "replace_soon", label: "Needs replacement soon" },
];
export const conditionLabel = (c: InspectionCondition | string | null | undefined) => CONDITIONS.find((x) => x.value === c)?.label ?? "";
const RANK: Record<InspectionCondition, number> = { good: 0, fair: 1, replace_soon: 2 };
export const worstCondition = (cs: InspectionCondition[]): InspectionCondition => cs.reduce<InspectionCondition>((w, c) => (RANK[c] > RANK[w] ? c : w), "good");

export type InspectionItem = { key: string; label: string; hint?: string };

/** The checklist per unit type. Bolsters, tires, brakes and permits are the ones the old forms asked about. */
export const INSPECTION_ITEMS: Record<UnitKind, InspectionItem[]> = {
  truck: [
    { key: "tires", label: "Tires and wheels", hint: "Tread, sidewalls, lug nuts" },
    { key: "brakes", label: "Brakes", hint: "Pads or shoes, drums, air lines" },
    { key: "lights", label: "Lights and reflectors" },
    { key: "steering", label: "Steering and suspension" },
    { key: "fluids", label: "Fluids and leaks" },
    { key: "coupling", label: "Fifth wheel and coupling" },
    { key: "glass", label: "Mirrors, glass and wipers" },
    { key: "safety", label: "Safety equipment", hint: "Extinguisher, triangles, spill kit" },
    { key: "permits", label: "Permits and documents", hint: "Registration, IFTA, insurance cards" },
  ],
  trailer: [
    { key: "tires", label: "Tires and wheels" },
    { key: "brakes", label: "Brakes", hint: "Slack, drums, air lines" },
    { key: "bolsters", label: "Bolsters and frame", hint: "Tank supports, cracks, welds" },
    { key: "tank", label: "Tank, manways and valves" },
    { key: "hoses", label: "Hoses, fittings and vapor recovery" },
    { key: "lights", label: "Lights and reflectors" },
    { key: "landing", label: "Landing gear and kingpin" },
    { key: "placards", label: "Placards and markings" },
    { key: "permits", label: "Permits and inspection stickers" },
  ],
};

export type Rating = { condition: InspectionCondition | null; note: string };
export type Ratings = Record<string, Rating>;

/** What blocks Submit: every item rated; anything not Good says what's wrong. */
export function inspectionProblem(kind: UnitKind, ratings: Ratings): string | null {
  for (const it of INSPECTION_ITEMS[kind]) {
    const r = ratings[it.key];
    if (!r?.condition) return `Rate "${it.label}".`;
    if (r.condition !== "good" && !r.note.trim()) return `Say what's wrong with "${it.label}".`;
  }
  return null;
}

export function inspectionItems(kind: UnitKind, ratings: Ratings): UnitInspectionRow["items"] {
  return INSPECTION_ITEMS[kind].map((it) => ({ key: it.key, label: it.label, condition: ratings[it.key]?.condition ?? "good", note: ratings[it.key]?.note.trim() || null }));
}

export const failedItems = (items: UnitInspectionRow["items"]) => items.filter((i) => i.condition === "replace_soon");

export type InspectionDetail = { inspection_id: string; unit_kind: UnitKind; unit_name: string; driver_name: string; items: { label: string; note: string | null }[] };

/** Writes the inspection and, when anything needs replacing soon, one planned work order for the unit. */
export function createInspection(store: TripStore, o: {
  companyId: string; driverId: string; driverName: string; kind: UnitKind; unitId: string; unitName: string; ratings: Ratings;
  campaignId: string | null; notes: string; captureId: string | null; id?: string;
}): { inspection: UnitInspectionRow; workOrder: WorkOrderRow | null } {
  const id = o.id ?? newId();
  const existing = store.get("unit_inspections", id);
  const items = inspectionItems(o.kind, o.ratings);
  const inspection: UnitInspectionRow = existing ?? {
    inspection_id: id, company_id: o.companyId, unit_kind: o.kind,
    truck_id: o.kind === "truck" ? o.unitId : null, trailer_id: o.kind === "trailer" ? o.unitId : null,
    driver_id: o.driverId, campaign_id: o.campaignId, items, overall: worstCondition(items.map((i) => i.condition)),
    notes: o.notes.trim() || null, capture_id: o.captureId, review_status: o.campaignId ? "pending" : "none",
  };
  if (!existing) store.put("unit_inspections", inspection);

  const failed = failedItems(inspection.items);
  let workOrder: WorkOrderRow | null = null;
  if (failed.length) {
    // A deterministic id from the inspection, so a retried tap can't plan the work twice. status: planned, not open.
    const woId = id.replace(/^(.{8})-(.{4})-(.{4})/, "$1-$2-4fff").slice(0, 36);
    workOrder = createWorkOrder(store, {
      id: woId.length === 36 ? woId : undefined, companyId: o.companyId, reportedBy: o.driverId, source: "failed_inspection", status: "planned",
      subject: `${o.kind === "truck" ? "Truck" : "Trailer"} ${o.unitName}: ${failed.map((f) => f.label).join(", ")}`,
      truckId: inspection.truck_id, trailerId: inspection.trailer_id, sourceRef: id,
      detail: { inspection_id: id, unit_kind: o.kind, unit_name: o.unitName, driver_name: o.driverName, items: failed.map((f) => ({ label: f.label, note: f.note })) } satisfies Record<string, unknown>,
    });
  }
  return { inspection, workOrder };
}
