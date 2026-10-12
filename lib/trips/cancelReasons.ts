// lib/trips/cancelReasons.ts
//
// Why a load was cancelled. Reasons compound (traffic, then a rack hop, then
// a long wait for gauging, then still no allocation), so a cancel records a
// list, in the order the driver picked them. The terminal-issue codes match
// lib/trips/terminalIssues.ts so reports can group them together.

export type CancelReasonCode =
  | "out_of_allocation"
  | "out_of_product"
  | "long_line"
  | "terminal_gauging"
  | "terminal_issue"
  | "rack_hopping"
  | "traffic"
  | "hours_of_service"
  | "weather"
  | "equipment"
  | "dispatch_cancelled"
  | "customer_cancelled"
  | "entered_by_mistake"
  | "other";

export const CANCEL_REASONS: { code: CancelReasonCode; label: string; group: "Terminal" | "Road" | "Other" }[] = [
  { code: "out_of_allocation", label: "Out of Allocation", group: "Terminal" },
  { code: "out_of_product", label: "Out of Product", group: "Terminal" },
  { code: "long_line", label: "Long Line", group: "Terminal" },
  { code: "terminal_gauging", label: "Terminal Gauging / Sourcing Reset", group: "Terminal" },
  { code: "terminal_issue", label: "Terminal Issue", group: "Terminal" },
  { code: "rack_hopping", label: "Rack Hopping", group: "Terminal" },
  { code: "traffic", label: "Traffic", group: "Road" },
  { code: "hours_of_service", label: "Out of Hours (HOS)", group: "Road" },
  { code: "weather", label: "Weather", group: "Road" },
  { code: "equipment", label: "Equipment Problem", group: "Road" },
  { code: "dispatch_cancelled", label: "Dispatch Cancelled", group: "Other" },
  { code: "customer_cancelled", label: "Customer Cancelled", group: "Other" },
  { code: "entered_by_mistake", label: "Entered by Mistake", group: "Other" },
  { code: "other", label: "Other", group: "Other" },
];

export function cancelReasonLabel(code: string): string {
  return CANCEL_REASONS.find((r) => r.code === code)?.label ?? code;
}

// "Traffic → Rack Hopping → Out of Allocation", in the order picked.
export function cancelReasonsText(codes: string[] | null | undefined): string {
  return (codes ?? []).map(cancelReasonLabel).join(" → ");
}

// The terminal issue an unfinished rack is closed with, for the PTD.
export function rackReasonFor(codes: string[]): string {
  const terminal = ["out_of_allocation", "out_of_product", "long_line", "terminal_issue"];
  return codes.find((c) => terminal.includes(c)) ?? "other";
}

// How many cancelled loads list each reason, most common first.
export function reasonCounts(trips: { trip: { cancel_reasons?: string[] | null } }[]): { code: string; count: number }[] {
  const n = new Map<string, number>();
  for (const { trip } of trips) for (const c of new Set(trip.cancel_reasons ?? [])) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}
