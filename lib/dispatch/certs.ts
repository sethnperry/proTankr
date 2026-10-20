// lib/dispatch/certs.ts
//
// A terminal can require a certificate on the trailer ("Marathon trailer
// certification"): a trailer permit type tied to that terminal. Dispatch
// checks the trailer a driver holds against it. Pure.

import { daysUntilIso, expiryStateForDays, type ExpiryState } from "../expiry.ts";

export type CertType = { permit_type_id: string; name: string };
export type CertRecord = { trailer_id: string; permit_type_id: string; expiration_date: string | null };

export type TrailerCert =
  | { kind: "missing"; names: string[] }                       // required here, none on file
  | { kind: "ok"; name: string; iso: string; days: number; state: ExpiryState; permitTypeId: string };

/** The cert a trailer has for this terminal: the latest-dated record among the
 *  terminal's cert types. null = this terminal requires nothing. */
export function trailerCert(types: CertType[], records: CertRecord[], trailerId: string, todayIso?: string): TrailerCert | null {
  if (types.length === 0) return null;
  const names = new Map(types.map((t) => [t.permit_type_id, t.name]));
  let best: { iso: string; type: string } | null = null;
  for (const r of records) {
    if (r.trailer_id !== trailerId || !r.expiration_date || !names.has(r.permit_type_id)) continue;
    if (!best || r.expiration_date > best.iso) best = { iso: r.expiration_date, type: r.permit_type_id };
  }
  if (!best) return { kind: "missing", names: types.map((t) => t.name) };
  const days = daysUntilIso(best.iso, todayIso) ?? 0;
  return { kind: "ok", name: names.get(best.type)!, iso: best.iso, days, state: expiryStateForDays(days), permitTypeId: best.type };
}

/** True when the trailer can't be loaded at the terminal as things stand. */
export function certBlocks(c: TrailerCert | null): boolean {
  return !!c && (c.kind === "missing" || c.state === "expired");
}
