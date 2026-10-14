// lib/expiry.ts
//
// One expiration rule for the whole app: terminal access, badges,
// credentials, equipment permits, the bell, Dispatch, Fleet Cards, Reports,
// and the Driver Dashboard's access strip.
//
//   more than 30 days left   valid     white
//   8 to 30 days left        soon      yellow
//   0 to 7 days left         expiring  orange
//   past the date            expired   red
//
// Terminal access only: 30 days after it expires it times out to "inactive"
// (no access). Badges, credentials and permits stay "expired" no matter how
// long ago, because an expired license is still a problem.
//
// Pure, no React, so it can be tested and shared by server and client code.

export const EXP_SOON_DAYS = 30;
export const EXP_WARN_DAYS = 7;
export const ACCESS_GRACE_DAYS = 30;

export type ExpiryState = "not_set" | "valid" | "soon" | "expiring" | "expired" | "inactive";

export function expiryStateForDays(days: number | null | undefined, opts: { access?: boolean } = {}): ExpiryState {
  if (days == null || !Number.isFinite(days)) return "not_set";
  if (days > EXP_SOON_DAYS) return "valid";
  if (days > EXP_WARN_DAYS) return "soon";
  if (days >= 0) return "expiring";
  if (opts.access && days < -ACCESS_GRACE_DAYS) return "inactive";
  return "expired";
}

// Whole days from today (local) to an ISO date. Negative = past.
export function daysUntilIso(iso: string | null | undefined, todayIso?: string): number | null {
  if (!iso) return null;
  const parse = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  };
  const end = parse(iso);
  if (end == null) return null;
  let start: number | null;
  if (todayIso) start = parse(todayIso);
  else {
    const n = new Date();
    start = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  }
  if (start == null) return null;
  return Math.round((end - start) / 86400000);
}

export function expiryStateFor(iso: string | null | undefined, opts: { access?: boolean; todayIso?: string } = {}): ExpiryState {
  return expiryStateForDays(daysUntilIso(iso, opts.todayIso), opts);
}

// Dark background (everywhere except printed pages).
export const EXPIRY_COLOR: Record<ExpiryState, string> = {
  not_set: "rgba(255,255,255,0.35)",
  valid: "rgba(255,255,255,0.85)",
  soon: "#facc15",
  expiring: "#f97316",
  expired: "#ef4444",
  inactive: "rgba(255,255,255,0.35)",
};

// White printable pages.
export const EXPIRY_PRINT_COLOR: Record<ExpiryState, string> = {
  not_set: "rgba(0,0,0,0.4)",
  valid: "#1a1a1a",
  soon: "#a16207",
  expiring: "#c2410c",
  expired: "#b91c1c",
  inactive: "rgba(0,0,0,0.4)",
};

export const EXPIRY_LABEL: Record<ExpiryState, string> = {
  not_set: "Not on file",
  valid: "Current",
  soon: "Expires soon",
  expiring: "Expiring",
  expired: "Expired",
  inactive: "No access",
};

// Anything worth flagging (soon or worse, not counting timed-out access).
export const isFlagged = (s: ExpiryState) => s === "soon" || s === "expiring" || s === "expired";
