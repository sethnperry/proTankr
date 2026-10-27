// app/planner/utils/reportRows.ts
//
// Which products a terminal-issue report can name. Normally the planned products
// (gallons above zero). When the plan is empty at this terminal (its products
// aren't sold here, or it was cleared) the report still has to be possible, so
// fall back to the plan's own products, then to what this terminal carries.

type Row = { productId?: string | null; planned_gallons?: number | null };
type Plan = Record<string, { productId?: string | null; empty?: boolean } | undefined> | null | undefined;
type TermProduct = { product_id: string; active?: boolean | null };

export function reportRows(planRows: Row[], compPlan: Plan, terminalProducts: TermProduct[]): Row[] {
  if (planRows.some((r) => r?.productId && Number(r.planned_gallons ?? 0) > 0)) return planRows;
  const fromPlan = Object.values(compPlan ?? {}).filter((c) => c && !c.empty && c.productId).map((c) => ({ productId: c!.productId, planned_gallons: 1 }));
  if (fromPlan.length) return fromPlan;
  return terminalProducts.filter((p) => p.active !== false).map((p) => ({ productId: p.product_id, planned_gallons: 1 }));
}
