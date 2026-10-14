// app/planner/cards/cardTheme.ts
//
// Shared card look + expiration-state rules for every Cards sub-tab
// (Terminals, Badges, Credentials) so the three don't drift -- same
// graphite-gradient tile look as the rest of the dark app theme (Reports
// page's ReportTile, Admin's header tiles), same expiration rule (lib/expiry.ts), same back-of-card field styles.
//
// 2026-08-19: previously each card rendered in a light "pearl card-wallet"
// tone (a per-terminal/badge pastel color via toneFor/TONES below) -- a
// deliberate physical-card-in-a-wallet metaphor, but one the user felt
// didn't belong next to the rest of the app's dark graphite theme ("those
// ivory cards don't look like they belong"). Replaced with the same
// GRAPHITE/GRAPHITE_DARKER gradient used everywhere else; TONES/toneFor
// removed entirely since nothing else referenced them.
//
// EXP_COLOR stays LIGHT-calibrated and unchanged -- CredentialsReportModal.tsx
// deliberately renders a genuine white printable page (hands off to the
// browser's print dialog) and needs dark-on-light text, not a bug to fix.
// DARK_EXP_COLOR is the new canonical dark-background version, used by
// every other consumer of this file.

import { GRAPHITE, GRAPHITE_DARKER } from "../theme";

export const CARD_BG = `linear-gradient(135deg, ${GRAPHITE} 0%, ${GRAPHITE_DARKER} 100%)`;
export const CARD_BORDER = "1px solid rgba(255,255,255,0.10)";
export const CARD_BORDER_SELECTED = "1px solid rgba(255,255,255,0.30)";
export const CARD_SHADOW = "0 6px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)";

// ── Expiration → visual state ───────────────────────────────────────────────
// The rule itself lives in lib/expiry.ts (one rule for the whole app):
// >30 days white, 8-30 yellow, 0-7 orange, past red. Terminal access times
// out to "inactive" (no access) 30 days after it expires; badges and
// credentials stay "expired". "not_set" = nothing on file.

import { expiryStateFor, EXPIRY_COLOR, EXPIRY_PRINT_COLOR, type ExpiryState } from "@/lib/expiry";

export type CardState = ExpiryState;

// Badges, credentials, permits: an expired item stays expired.
export function cardStateFor(expiresISO: string | null | undefined): CardState {
  return expiryStateFor(expiresISO);
}

// Terminal access: times out to "inactive" 30 days after it expires.
export function accessStateFor(expiresISO: string | null | undefined): CardState {
  return expiryStateFor(expiresISO, { access: true });
}

export type FilterKey = "all" | "valid" | "expiring" | "expired";
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "valid", label: "Valid" },
  { key: "expiring", label: "Expiring Soon" },
  { key: "expired", label: "Expired" },
];

export function matchesFilter(state: CardState, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "valid") return state === "valid";
  if (filter === "expiring") return state === "expiring" || state === "soon";
  if (filter === "expired") return state === "expired" || state === "inactive";
  return true;
}

// Printed (white) pages only.
export const EXP_COLOR: Record<CardState, string> = EXPIRY_PRINT_COLOR;

// Everything on the dark app background.
export const DARK_EXP_COLOR: Record<CardState, string> = EXPIRY_COLOR;

// ── Shared field styles (back-of-card form, dark graphite card background) ─

export const fieldLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 };
export const fieldInput: React.CSSProperties = { width: "100%", borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)", padding: "7px 9px", fontSize: 13, color: "#fff", boxSizing: "border-box" };
export const btnPrimary: React.CSSProperties = { flex: 1, padding: "11px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.92)", color: "#111", fontSize: 13, fontWeight: 700, cursor: "pointer" };
export const btnSecondary: React.CSSProperties = { padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
export const btnDanger: React.CSSProperties = { padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)", color: "#ef4444", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
