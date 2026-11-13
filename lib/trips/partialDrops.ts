// lib/trips/partialDrops.ts
//
// A partial drop: part of a compartment goes into a store tank (or through a metered wet hose) and the rest stays
// aboard for the next stop. Recorded as one "partial_drop" trip event per compartment per stop. The compartment's
// loaded gallons are reduced to what is left, so every weight and "aboard" figure stays right; the PTD adds the
// dropped gallons back to the BOL totals from these events. Gross gallons only. Pure: no Supabase.

import type { TripEventRow } from "./types.ts";

export const PARTIAL_DROP_EVENT = "partial_drop";

export type PartialDrop = {
  compartment_load_id: string;
  comp_number: number;
  product_id: string | null;
  tank_number: string | null;
  /** Gross gallons dropped at this stop. */
  gallons: number;
  /** True when typed from the driver's eye (no meter). */
  estimated: boolean;
  meter_start: number | null;
  meter_end: number | null;
  /** Gross gallons still aboard in this compartment after the drop. */
  remaining: number;
  /** Net gallons the dropped gross stands for (the load's own net scaled), when the load had one. */
  net_equiv: number | null;
};

export const partialPayload = (p: PartialDrop): Record<string, unknown> => ({ ...p });

export function partialsOf(events: TripEventRow[]): (PartialDrop & { delivery_id: string | null })[] {
  return events
    .filter((e) => e.event_type === PARTIAL_DROP_EVENT)
    .map((e) => ({ ...(e.payload as unknown as PartialDrop), delivery_id: e.delivery_id ?? null }));
}

/** What is left in a compartment and the net that goes with it, after dropping `gallons` of `gross`. */
export function afterPartial(gross: number, net: number | null, gallons: number): { remaining: number; remainingNet: number | null; netEquiv: number | null } {
  const g = Math.max(0, Math.min(gross, gallons));
  const remaining = Math.round((gross - g) * 100) / 100;
  if (net == null || gross <= 0) return { remaining, remainingNet: null, netEquiv: null };
  const netEquiv = Math.round(net * (g / gross) * 100) / 100;
  return { remaining, remainingNet: Math.round((net - netEquiv) * 100) / 100, netEquiv };
}

/** What a wet-hose or partial entry says: gallons from the meter when both readings are given, else the typed gallons. */
export function partialEntry(o: { gallons: string; meterStart: string; meterEnd: string }): { gallons: number; estimated: boolean; meterStart: number | null; meterEnd: number | null } | { error: string } {
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));
  const ms = n(o.meterStart), me = n(o.meterEnd), g = n(o.gallons);
  if ((ms == null) !== (me == null)) return { error: "Enter both meter readings, or neither." };
  if (ms != null && me != null) {
    if (![ms, me].every(Number.isFinite) || me <= ms) return { error: "The ending meter has to be higher than the start." };
    return { gallons: Math.round((me - ms) * 100) / 100, estimated: false, meterStart: ms, meterEnd: me };
  }
  if (g == null || !Number.isFinite(g) || g <= 0) return { error: "Enter the gallons dropped, or the meter readings." };
  return { gallons: g, estimated: true, meterStart: null, meterEnd: null };
}
