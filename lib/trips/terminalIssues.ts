// lib/trips/terminalIssues.ts
//
// The one list of terminal issues, used three ways from a single tap:
// why a rack was slow (loading delay), why the driver couldn't load there
// (rack hop), and the outage banner other drivers see. The codes match
// terminal_outage_reports.report_type. Product issues need the products;
// Long Line and Terminal Issue are terminal-wide. Out of Allocation only
// warns the reporter's own company (RLS); the rest warn everyone.

export type TerminalIssueCode = "out_of_product" | "out_of_allocation" | "long_line" | "terminal_issue";

export const TERMINAL_ISSUES: { code: TerminalIssueCode; label: string; productScoped: boolean }[] = [
  { code: "long_line", label: "Long Line", productScoped: false },
  { code: "out_of_product", label: "Out of Product", productScoped: true },
  { code: "out_of_allocation", label: "Out of Allocation", productScoped: true },
  { code: "terminal_issue", label: "Terminal Issue", productScoped: false },
];

export function isTerminalIssueCode(v: unknown): v is TerminalIssueCode {
  return typeof v === "string" && TERMINAL_ISSUES.some((t) => t.code === v);
}

export function terminalIssueLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return TERMINAL_ISSUES.find((t) => t.code === code)?.label ?? null;
}

// The delay picker mixes these with the company's own reasons. A terminal
// issue is carried as "issue:<code>" so it never lands in delay_reason_id
// (a uuid foreign key).
const PREFIX = "issue:";
export function issueChoiceValue(code: TerminalIssueCode): string {
  return PREFIX + code;
}
export function splitDelayChoice(choice: string | null): { delayReasonId: string | null; delayCode: TerminalIssueCode | null } {
  if (choice && choice.startsWith(PREFIX)) {
    const code = choice.slice(PREFIX.length);
    return { delayReasonId: null, delayCode: isTerminalIssueCode(code) ? code : null };
  }
  return { delayReasonId: choice, delayCode: null };
}

// Why a rack ended with no load. The terminal issues, plus reasons that
// aren't the terminal's fault. Stored in trip_pickups.no_load_reason.
export const OTHER_NO_LOAD_REASONS: { code: string; label: string }[] = [
  { code: "load_changed", label: "Load changed by dispatch" },
  { code: "other", label: "Other" },
];

export function noLoadReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return terminalIssueLabel(code) ?? OTHER_NO_LOAD_REASONS.find((r) => r.code === code)?.label ?? null;
}
