// app/planner/reports/buildTerminalCardsReport.ts
//
// Builds the plain-text "where are you carded" report a driver shares with
// a dispatcher for a single city -- three scopes:
//   "active"          -- only cards that are currently good (valid/expiring)
//   "activeExpired"   -- every carded terminal, active or expired, grouped
//   "all"             -- every terminal in the city (starred or not), each
//                        tagged with its status (Active/Expired/Not carded)
//
// Card numbers/PINs are deliberately left out -- this goes over SMS/email,
// and the dispatcher only needs status + expiration, not the credentials.

import { formatMDY, daysUntilISO_ } from "../utils/dates";
import type { CardState } from "../cards/cardTheme";

export type TerminalStatusItem = {
  tid: string;
  name: string;
  state: CardState;
  expiresISO: string | null;
};

export type CatalogTerminalItem = {
  terminal_id: string;
  name: string;
};

export type TerminalCardsScope = "active" | "activeExpired" | "all";

function expLabel(expiresISO: string | null): string {
  if (!expiresISO) return "";
  const days = daysUntilISO_(expiresISO);
  return `Exp ${formatMDY(expiresISO)}${days !== null ? ` (${days} days)` : ""}`;
}

export function buildTerminalCardsReportBody(opts: {
  city: string;
  stateCode: string | null;
  scope: TerminalCardsScope;
  starred: TerminalStatusItem[];
  catalog: CatalogTerminalItem[];
}): string {
  const { city, stateCode, scope, starred, catalog } = opts;
  const cityState = `${city}${stateCode ? `, ${stateCode}` : ""}`;
  const divider = "─".repeat(36);
  const generated = formatMDY(new Date().toISOString());

  const sortedStarred = [...starred].sort((a, b) => a.name.localeCompare(b.name));

  if (scope === "active") {
    const active = sortedStarred.filter((i) => i.state === "valid" || i.state === "expiring");
    const lines = active.length
      ? active.map((i) => `• ${i.name} — ${expLabel(i.expiresISO)}`)
      : ["(no active cards on file)"];
    return [`TERMINAL CARDS — ${cityState}`, `Generated ${generated}`, divider, `ACTIVE (${active.length})`, ...lines].join("\n");
  }

  if (scope === "activeExpired") {
    const active = sortedStarred.filter((i) => i.state === "valid" || i.state === "expiring");
    const expired = sortedStarred.filter((i) => i.state === "expired" || i.state === "inactive");
    const activeLines = active.length ? active.map((i) => `• ${i.name} — ${expLabel(i.expiresISO)}`) : ["(none)"];
    const expiredLines = expired.length ? expired.map((i) => `• ${i.name} — ${expLabel(i.expiresISO)}`) : ["(none)"];
    return [
      `TERMINAL CARDS — ${cityState}`,
      `Generated ${generated}`,
      divider,
      `ACTIVE (${active.length})`,
      ...activeLines,
      "",
      `EXPIRED (${expired.length})`,
      ...expiredLines,
    ].join("\n");
  }

  // scope === "all" -- union of starred + catalog-only terminals for this city
  const starredIds = new Set(starred.map((i) => i.tid));
  const catalogOnly: TerminalStatusItem[] = catalog
    .filter((c) => !starredIds.has(String(c.terminal_id)))
    .map((c) => ({ tid: String(c.terminal_id), name: c.name, state: "not_set" as CardState, expiresISO: null }));

  const all = [...starred, ...catalogOnly].sort((a, b) => a.name.localeCompare(b.name));
  const statusLabel: Record<CardState, string> = {
    valid: "ACTIVE", soon: "ACTIVE", expiring: "ACTIVE", expired: "EXPIRED", inactive: "NO ACCESS", not_set: "NOT CARDED",
  };
  const lines = all.map((i) => {
    const status = statusLabel[i.state];
    return i.expiresISO ? `• ${i.name} — ${status} — ${expLabel(i.expiresISO)}` : `• ${i.name} — ${status}`;
  });

  return [`ALL TERMINALS — ${cityState}`, `Generated ${generated}`, divider, ...lines].join("\n");
}
