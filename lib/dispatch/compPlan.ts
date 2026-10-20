// lib/dispatch/compPlan.ts
//
// The dispatcher's compartment plan: which product goes in which compartment
// of the trailer, and for each product group (same product = one group) the
// order number and supplier. Pure.

export type CompPlan = Record<number, string>; // comp_number -> product_id
export type GroupOverride = { orderNumber?: string; supplierId?: string | null };
export type PlanGroup = { productId: string; comps: number[]; orderNumber: string; supplierId: string | null };
export type PlannedComp = { comp_number: number; product_id: string; order_id?: string | null; supplier_id?: string | null };

/** One group per product, ordered by its lowest compartment. A group with no
 * order/supplier of its own takes the defaults. */
export function groupsFromPlan(
  plan: CompPlan,
  overrides: Record<string, GroupOverride>,
  defaults: { orderNumber: string; supplierId: string | null },
): PlanGroup[] {
  const by = new Map<string, number[]>();
  for (const [k, pid] of Object.entries(plan)) {
    if (!pid) continue;
    const n = Number(k);
    if (!Number.isFinite(n)) continue;
    by.set(pid, [...(by.get(pid) ?? []), n]);
  }
  return [...by.entries()]
    .map(([productId, comps]) => {
      const o = overrides[productId] ?? {};
      return {
        productId,
        comps: comps.sort((a, b) => a - b),
        orderNumber: (o.orderNumber ?? "").trim() || defaults.orderNumber.trim(),
        supplierId: o.supplierId !== undefined && o.supplierId !== null ? o.supplierId : defaults.supplierId,
      };
    })
    .sort((a, b) => a.comps[0] - b.comps[0]);
}

/** Distinct order numbers in first-seen order (case-insensitive), blanks dropped. */
export function distinctOrders(groups: PlanGroup[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    const n = g.orderNumber.trim();
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
  }
  return out;
}

/** planned_comps as written on the pickup: one entry per compartment, with its
 * order and supplier. `orderIdFor` maps an order number to its trip_orders id. */
export function plannedCompsFor(groups: PlanGroup[], orderIdFor: (n: string) => string | null): PlannedComp[] {
  const out: PlannedComp[] = [];
  for (const g of groups) {
    for (const c of g.comps) {
      out.push({ comp_number: c, product_id: g.productId, order_id: g.orderNumber.trim() ? orderIdFor(g.orderNumber.trim()) : null, supplier_id: g.supplierId });
    }
  }
  return out.sort((a, b) => a.comp_number - b.comp_number);
}

/** Per-compartment order/supplier from stored planned_comps (tolerates junk). */
export function readPlannedMeta(v: unknown): Map<number, { order_id: string | null; supplier_id: string | null; product_id: string }> {
  const m = new Map<number, { order_id: string | null; supplier_id: string | null; product_id: string }>();
  if (!Array.isArray(v)) return m;
  for (const x of v) {
    const n = Number((x as any)?.comp_number);
    const p = (x as any)?.product_id;
    if (!Number.isFinite(n) || n <= 0 || typeof p !== "string" || !p) continue;
    const o = (x as any)?.order_id, s = (x as any)?.supplier_id;
    m.set(n, { product_id: p, order_id: typeof o === "string" && o ? o : null, supplier_id: typeof s === "string" && s ? s : null });
  }
  return m;
}

/** A trailer plan slot's stored payload <-> the editor's plan. */
export function planFromSlotPayload(payload: any): CompPlan {
  const cp = payload?.compPlan;
  const out: CompPlan = {};
  if (cp && typeof cp === "object") {
    for (const [k, v] of Object.entries(cp as Record<string, any>)) {
      const n = Number(k);
      if (Number.isFinite(n) && v && !v.empty && typeof v.productId === "string" && v.productId) out[n] = v.productId;
    }
  }
  return out;
}

export function slotPayloadFromPlan(plan: CompPlan, compNumbers: number[]): { compPlan: Record<number, { empty: boolean; productId: string }> } {
  const compPlan: Record<number, { empty: boolean; productId: string }> = {};
  for (const n of compNumbers) compPlan[n] = plan[n] ? { empty: false, productId: plan[n] } : { empty: true, productId: "" };
  return { compPlan };
}
