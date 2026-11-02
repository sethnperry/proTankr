// lib/approvals/token.ts
//
// One-time approve and deny links, the rules only. The signed token is the whole control (there is no login
// behind an emailed link), so: the token is long and random, only its hash is stored, a link expires, opening it
// decides nothing (a mail scanner that fetches the link must not approve), and the first decision is final.
// Pure: node's crypto only, no Supabase.

import { createHash, randomBytes } from "node:crypto";

export type Decision = "approve" | "deny";

export const DEFAULT_TTL_DAYS = 14;

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Only tokens shaped like ours get as far as the database. */
export function looksLikeToken(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
}

export function expiryFrom(now: number, ttlDays = DEFAULT_TTL_DAYS): string {
  return new Date(now + ttlDays * 86400_000).toISOString();
}

export function approvalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/approve/${token}`;
}

/** What each purpose's decision does to its record. */
export const PURPOSE_STATUS: Record<string, { approve: string; deny: string; table: "work_orders" }> = {
  repair_request: { approve: "approved", deny: "denied", table: "work_orders" },
};

export function statusFor(purpose: string, decision: Decision): string | null {
  const p = PURPOSE_STATUS[purpose];
  return p ? p[decision] : null;
}

export type DecideResult =
  | { ok: true; decision: Decision; purpose: string; subjectId: string; companyId: string }
  | { ok: false; reason: "unknown" | "used" | "expired" };
