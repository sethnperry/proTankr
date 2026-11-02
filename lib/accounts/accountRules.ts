// lib/accounts/accountRules.ts
//
// Account rules, the rules only: how a rule matches a load's shipper and customer, which (rule, trip) pairs are due
// to send, what a rule form must have, and the load summary that goes out as a PDF. Pure: no Supabase, no network.

import type { ReportDoc } from "../reports/reportDoc.ts";

export type MatchField = "customer" | "shipper" | "either";
export type MatchMode = "equals" | "contains";
export type DocKind = "ptd" | "meter_tickets";
export const DOC_KINDS: { value: DocKind; label: string }[] = [
  { value: "ptd", label: "Load summary (PDF)" },
  { value: "meter_tickets", label: "Meter ticket photos" },
];

export type Rule = { rule_id: string; name: string; match_field: MatchField; match_text: string; match_mode: MatchMode; emails: string[]; documents: DocKind[]; delay_minutes: number; is_active: boolean };
export type TripNames = { shipper: string | null; customer: string | null; orderShippers?: (string | null)[]; orderCustomers?: (string | null)[] };

/** "ACME  Inc." and "acme inc" are the same account. */
export const norm = (s: string | null | undefined): string => (s ?? "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

const namesFor = (t: TripNames, field: MatchField): string[] => {
  const sh = [t.shipper, ...(t.orderShippers ?? [])], cu = [t.customer, ...(t.orderCustomers ?? [])];
  return (field === "shipper" ? sh : field === "customer" ? cu : [...sh, ...cu]).map(norm).filter(Boolean);
};
export function matches(rule: Pick<Rule, "match_field" | "match_text" | "match_mode">, t: TripNames): boolean {
  const want = norm(rule.match_text);
  if (!want) return false;
  return namesFor(t, rule.match_field).some((n) => (rule.match_mode === "equals" ? n === want : n.includes(want)));
}

/** The rules that should send for a completed trip now: active, matching, past their delay, not sent before. */
export function dueRules(rules: Rule[], t: TripNames, completedAt: string | null, alreadySent: Set<string>, now: number): Rule[] {
  const done = completedAt ? Date.parse(completedAt) : NaN;
  if (!Number.isFinite(done)) return [];
  return rules.filter((r) => r.is_active && !alreadySent.has(r.rule_id) && matches(r, t) && now >= done + r.delay_minutes * 60_000);
}

export const EMAIL_RE = /^\S+@\S+\.\S+$/;
export const parseEmails = (text: string): string[] => [...new Set(text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean))];

export type RuleForm = { name: string; matchText: string; emails: string; documents: DocKind[]; delayMinutes: string };
export function ruleProblem(f: RuleForm): string | null {
  if (!f.name.trim()) return "Give the rule a name.";
  if (!norm(f.matchText)) return "Enter the account name to match.";
  const emails = parseEmails(f.emails);
  if (emails.length === 0) return "Enter at least one email address.";
  const bad = emails.find((e) => !EMAIL_RE.test(e));
  if (bad) return `"${bad}" isn't an email address.`;
  if (f.documents.length === 0) return "Choose at least one document to send.";
  const d = f.delayMinutes.trim() === "" ? 0 : Number(f.delayMinutes);
  if (!Number.isFinite(d) || d < 0 || d > 2880 || !Number.isInteger(d)) return "Delay is whole minutes, 0 to 2880.";
  return null;
}

/** Every load has a shipper and a customer (Begin Trip asks for both when the company requires it). */
export function namesProblem(shipper: string, customer: string): string[] {
  const out: string[] = [];
  if (!shipper.trim()) out.push("shipper");
  if (!customer.trim()) out.push("customer");
  return out;
}

// ── The load summary ───────────────────────────────────────────────────────────────────────────────────────
export type SummaryIn = {
  orderNumbers: string[]; shipper: string | null; customer: string | null; driver: string; truck: string | null; trailer: string | null;
  startedAt: string | null; completedAt: string | null; beginMiles: number | null; endMiles: number | null;
  pickups: { terminal: string; arrivedAt: string | null; leftAt: string | null; noLoad: boolean }[];
  deliveries: { place: string; arrivedAt: string | null; leftAt: string | null }[];
  loads: { comp: number; product: string; bol: string | null; supplier: string | null; gross: number | null; net: number | null; tempF: number | null; api: number | null; tank: string | null }[];
};
const dt = (iso: string | null) => { const d = iso ? new Date(iso) : null; return d && Number.isFinite(d.getTime()) ? d.toLocaleString("en-US", { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : ""; };
const gal = (n: number | null) => (n == null ? "" : Math.round(n).toLocaleString("en-US"));

export function summaryDoc(s: SummaryIn): ReportDoc {
  const order = s.orderNumbers.filter(Boolean).join(", ") || "load";
  return {
    title: "Load summary", who: `Order ${order}`, when: dt(s.completedAt),
    cells: [["Shipper", s.shipper ?? "—"], ["Customer", s.customer ?? "—"], ["Driver", s.driver], ["Truck / trailer", [s.truck, s.trailer].filter(Boolean).join(" / ") || "—"]],
    sections: [
      { heading: "Product", table: { head: ["Comp", "Product", "BOL", "Supplier", "Gross gal", "Net gal", "Temp", "API", "Tank"], widths: [0.07, 0.2, 0.13, 0.13, 0.1, 0.1, 0.08, 0.08, 0.11],
        align: ["l", "l", "l", "l", "r", "r", "r", "r", "l"], rows: s.loads.map((l) => [String(l.comp), l.product, l.bol ?? "", l.supplier ?? "", gal(l.gross), gal(l.net), l.tempF == null ? "" : String(l.tempF), l.api == null ? "" : String(l.api), l.tank ?? ""]) } },
      { heading: "Pickups", table: { head: ["Terminal", "Arrived", "Left", ""], widths: [0.4, 0.25, 0.25, 0.1], rows: s.pickups.map((p) => [p.terminal, dt(p.arrivedAt), dt(p.leftAt), p.noLoad ? "No load" : ""]) } },
      { heading: "Deliveries", table: { head: ["Delivered to", "Arrived", "Finished"], widths: [0.5, 0.25, 0.25], rows: s.deliveries.map((d) => [d.place, dt(d.arrivedAt), dt(d.leftAt)]) } },
      ...(s.beginMiles != null && s.endMiles != null ? [{ heading: "Miles", text: `${Math.round(s.beginMiles).toLocaleString("en-US")} to ${Math.round(s.endMiles).toLocaleString("en-US")} (${Math.round(s.endMiles - s.beginMiles).toLocaleString("en-US")} mi)` }] : []),
    ],
    subject: `Load complete: order ${order}${s.customer ? ` for ${s.customer}` : ""}`,
    attached: `load summary for order ${order}`,
    fileName: `load-${order.replace(/[^A-Za-z0-9]+/g, "-")}`,
  };
}
