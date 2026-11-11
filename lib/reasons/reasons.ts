// lib/reasons/reasons.ts
//
// Reason lists that carry a category, kept in company settings (delay_reasons). Used for the Shift Explanation
// (why a shift ran long), call-out reasons, and the rest. A reason is never deleted, only hidden, so old records
// keep their label. Pure: no Supabase.

export type ReasonKind = "loading" | "delivery" | "shift_explanation" | "callout" | "nonproductive" | "paper_log";

export type Reason = { reason_id: string; kind: ReasonKind; label: string; sort_order: number; is_active: boolean; category?: string | null };

export const SHIFT_CATEGORIES = [
  { code: "breakdown", label: "Breakdown" },
  { code: "shop_time", label: "Shop time" },
  { code: "wait_on_dispatch", label: "Wait on dispatch" },
  { code: "traffic_weather", label: "Traffic or weather" },
  { code: "terminal_delay", label: "Terminal delay" },
  { code: "customer_delay", label: "Customer delay" },
  { code: "other", label: "Other" },
] as const;

export type ReasonCategory = (typeof SHIFT_CATEGORIES)[number]["code"];

/** Which lists have a category per reason. */
export const KINDS_WITH_CATEGORY: ReadonlySet<ReasonKind> = new Set<ReasonKind>(["shift_explanation", "callout", "nonproductive"]);

export const KIND_TITLE: Record<ReasonKind, string> = {
  loading: "Loading delay reasons",
  delivery: "Delivery delay reasons",
  shift_explanation: "Shift explanation reasons",
  callout: "Call-out reasons",
  nonproductive: "Working while off duty (ELD) reasons",
  paper_log: "Paper log reasons",
};

/** What a company starts with until it writes its own. Shown, never saved for it. */
export const DEFAULT_SHIFT_REASONS: { label: string; category: ReasonCategory }[] = [
  { label: "Truck broke down", category: "breakdown" },
  { label: "Waiting on a repair", category: "shop_time" },
  { label: "In the shop for service", category: "shop_time" },
  { label: "Waiting on dispatch for a load", category: "wait_on_dispatch" },
  { label: "Waiting on dispatch for instructions", category: "wait_on_dispatch" },
  { label: "Heavy traffic or an accident", category: "traffic_weather" },
  { label: "Weather", category: "traffic_weather" },
  { label: "Long wait at the terminal or the store", category: "terminal_delay" },
];

/** Why a driver is working while the ELD shows off duty, until the company writes its own. Feeds gray-zone reporting. */
export const DEFAULT_OFF_DUTY_REASONS: { label: string; category: ReasonCategory }[] = [
  { label: "Waiting on dispatch", category: "wait_on_dispatch" },
  { label: "Waiting on a repair", category: "shop_time" },
  { label: "Truck broke down", category: "breakdown" },
  { label: "Waiting at the terminal or the store", category: "terminal_delay" },
  { label: "Heavy traffic or weather", category: "traffic_weather" },
  { label: "Forgot to change my ELD status", category: "other" },
];

/** Why a driver keeps a paper log instead of the ELD, until the company writes its own. */
export const DEFAULT_PAPER_LOG_REASONS = [
  "ELD or tablet not working",
  "Phone or tablet battery dead",
  "Can't log in",
  "Roadside inspection or DOT request",
  "No signal or app outage",
];

/** Why a driver calls out, until the company writes its own. */
export const DEFAULT_CALLOUT_REASONS: { label: string; category: ReasonCategory }[] = [
  { label: "Sick", category: "other" },
  { label: "Family emergency", category: "other" },
  { label: "Personal", category: "other" },
  { label: "Vehicle or transportation problem", category: "other" },
  { label: "Weather", category: "traffic_weather" },
];

export function categoryLabel(code: string | null | undefined): string {
  return SHIFT_CATEGORIES.find((c) => c.code === code)?.label ?? "";
}

/** The reasons a driver can pick: this kind, still shown, in the company's order. */
export function activeReasons(list: Reason[], kind: ReasonKind): Reason[] {
  return list.filter((r) => r.kind === kind && r.is_active).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/** The company's list, or the built-in starter when it has none. */
export function reasonsOrDefault(list: Reason[], kind: ReasonKind): { reason_id: string; label: string; category: string | null }[] {
  const own = activeReasons(list, kind);
  if (own.length) return own.map((r) => ({ reason_id: r.reason_id, label: r.label, category: r.category ?? null }));
  if (kind === "shift_explanation") return DEFAULT_SHIFT_REASONS.map((r, i) => ({ reason_id: `default-${i}`, label: r.label, category: r.category }));
  if (kind === "callout") return DEFAULT_CALLOUT_REASONS.map((r, i) => ({ reason_id: `default-${i}`, label: r.label, category: r.category }));
  if (kind === "nonproductive") return DEFAULT_OFF_DUTY_REASONS.map((r, i) => ({ reason_id: `default-${i}`, label: r.label, category: r.category }));
  if (kind === "paper_log") return DEFAULT_PAPER_LOG_REASONS.map((label, i) => ({ reason_id: `default-${i}`, label, category: null }));
  return [];
}

export type ReasonGroup = { category: string; label: string; reasons: { reason_id: string; label: string; category: string | null }[] };

/** Chips grouped by category, in the order the categories are listed (uncategorised last). */
export function groupByCategory(reasons: { reason_id: string; label: string; category: string | null }[]): ReasonGroup[] {
  const out: ReasonGroup[] = [];
  for (const c of SHIFT_CATEGORIES) {
    const rs = reasons.filter((r) => r.category === c.code);
    if (rs.length) out.push({ category: c.code, label: c.label, reasons: rs });
  }
  const rest = reasons.filter((r) => !r.category || !SHIFT_CATEGORIES.some((c) => c.code === r.category));
  if (rest.length) out.push({ category: "", label: "", reasons: rest });
  return out;
}
