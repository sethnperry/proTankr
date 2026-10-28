// lib/push/terminalReportCore.ts
//
// A new terminal report is pushed only to a driver it changes: a truck still headed to that rack
// (not arrived yet) whose load it hits. Terminal-wide reports (long line, terminal issue) hit every
// truck headed there; an out-of-product or allocation report only trucks going for that product.
// A truck whose products are unknown is skipped (nothing certain to say). Pure.

export type NewReport = {
  reportId: string; terminalId: string; type: string; productId: string | null;
  supplierName: string | null; companyId: string; reporterUserId: string | null;
};
export type HeadedTruck = {
  userId: string; companyId: string; terminalId: string; products: string[];
};
export type ReportPush = { reportId: string; userId: string };

const WIDE = new Set(["long_line", "terminal_issue"]);

export function planReportPushes(reports: NewReport[], trucks: HeadedTruck[]): ReportPush[] {
  const out: ReportPush[] = [];
  for (const r of reports) {
    for (const t of trucks) {
      if (t.terminalId !== r.terminalId || t.userId === r.reporterUserId) continue;
      if (r.type === "out_of_allocation" && t.companyId !== r.companyId) continue; // company-only
      if (WIDE.has(r.type)) { out.push({ reportId: r.reportId, userId: t.userId }); continue; }
      if (!r.productId || t.products.length === 0) continue;
      if (t.products.includes(r.productId)) out.push({ reportId: r.reportId, userId: t.userId });
    }
  }
  return out;
}

export function reportPushText(r: NewReport, productName: string | null): string {
  if (r.type === "long_line") return "Long line";
  if (r.type === "terminal_issue") return "Terminal issue";
  if (r.type === "out_of_allocation") return r.supplierName ? `No allocation · ${r.supplierName}${productName ? ` (${productName})` : ""}` : `Out of allocation${productName ? ` · ${productName}` : ""}`;
  return `Out of ${productName ?? "a product"}`;
}
