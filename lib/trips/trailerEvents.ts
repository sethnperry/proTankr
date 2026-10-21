// lib/trips/trailerEvents.ts
//
// Geotab trailer hooks and drops, kept on the trip as trip_events
// ("trailer_hook" / "trailer_drop") so the PTD can show them. Ids are derived
// from the event itself, so reading the same hook twice never duplicates it.

import type { TripEventRow } from "./types.ts";

export const HOOK_EVENT = "trailer_hook";
export const DROP_EVENT = "trailer_drop";

export type TrailerRecord = { type: "hook" | "drop"; at: string; trailerName: string | null; place: string | null };

/** A UUID-shaped id from the event's identity (same input, same id). */
export async function trailerEventId(tripId: string, type: string, trailerId: string, at: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tripId}|${type}|${trailerId}|${at}`));
  const h = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function trailerRecords(events: TripEventRow[]): TrailerRecord[] {
  return events
    .filter((e) => e.event_type === HOOK_EVENT || e.event_type === DROP_EVENT)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
    .map((e) => {
      const p = (e.payload ?? {}) as { trailer_name?: string | null; city?: string | null; state?: string | null };
      return {
        type: e.event_type === HOOK_EVENT ? "hook" : "drop",
        at: e.occurred_at,
        trailerName: p.trailer_name ?? null,
        place: [p.city, p.state].filter(Boolean).join(", ") || null,
      };
    });
}
