"use client";
// app/planner/hooks/useAutoEmptyMoves.ts
//
// Empty moves with no driver input. A move opens when a trip ends and the driver has nothing open, and closes when
// the next trip begins, the truck stops at a saved place, or the shift ends. Odometers and positions come from
// telematics; the driver is asked for an odometer only when that fails (`ask`). Rules: lib/moves/emptyMoves.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTruckReadingResult } from "@/lib/telematics/useTruckReading";
import { autoEndReason, autoStartCandidate, odometerMissing, placeAt, suggestKind } from "@/lib/moves/emptyMoves";
import type { DeliveryLocation } from "@/lib/trips/deliveryLocations";
import type { EmptyMoveRow, TripRow } from "@/lib/trips/types";
import type { useEmptyMoves } from "./useEmptyMoves";

const POLL_MS = 60_000;

export function useAutoEmptyMoves(o: {
  moves: ReturnType<typeof useEmptyMoves>; trips: TripRow[]; userId: string | null; truckId: string | null; hasTrailer: boolean;
  hasOpenTrip: boolean; shiftActive: boolean; locations: DeliveryLocation[]; ready: boolean;
}) {
  const { moves, trips, userId, truckId, hasTrailer, hasOpenTrip, shiftActive, locations, ready } = o;
  const startedFor = useRef<Set<string>>(new Set());
  const busy = useRef(false);
  const [skipped, setSkipped] = useState<string | null>(null); // a move the driver chose not to type an odometer for

  // Start.
  useEffect(() => {
    if (!ready || !userId || !truckId || busy.current) return;
    const c = autoStartCandidate({ trips, moves: moves.moves, driverId: userId, hasOpenTrip, nowMs: Date.now() });
    if (!c || startedFor.current.has(c.tripId)) return;
    startedFor.current.add(c.tripId);
    busy.current = true;
    void (async () => {
      const { reading } = await fetchTruckReadingResult(truckId);
      const at = placeAt(locations, reading);
      const from = at ? { id: at.location_id, text: null } : { id: null, text: [reading?.city, reading?.state].filter(Boolean).join(", ") || null };
      moves.begin({ truckId, trailerId: null, kind: suggestKind(hasTrailer), from, to: { id: null, text: null }, beginMiles: reading?.odometerMi ?? null, source: reading?.odometerMi != null ? "geotab" : "app" });
      busy.current = false;
    })();
  }, [ready, userId, truckId, hasTrailer, hasOpenTrip, trips, moves, locations]); // eslint-disable-line react-hooks/exhaustive-deps

  // End.
  const cur = moves.current;
  const curRef = useRef<EmptyMoveRow | null>(null);
  curRef.current = cur;
  const check = useCallback(async () => {
    const m = curRef.current;
    if (!m || busy.current || !truckId) return;
    busy.current = true;
    try {
      const { reading, failed } = await fetchTruckReadingResult(truckId);
      if (failed && !hasOpenTrip && shiftActive) return; // can't see the truck: leave it open
      const end = autoEndReason({ move: m, hasOpenTrip, shiftActive, pos: reading, locations, nowMs: Date.now() });
      if (!end) return;
      const odo = reading?.odometerMi ?? null;
      moves.end(m.move_id, odo, end.place ? { id: end.place.location_id, text: null } : { id: null, text: [reading?.city, reading?.state].filter(Boolean).join(", ") || null });
    } finally { busy.current = false; }
  }, [truckId, hasOpenTrip, shiftActive, locations, moves]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !cur) return;
    void check();
    const t = window.setInterval(() => void check(), POLL_MS);
    return () => window.clearInterval(t);
  }, [ready, cur?.move_id, hasOpenTrip, shiftActive, check]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask for an odometer only when telematics left one blank (and not for a move the driver already skipped).
  const needing = moves.moves.filter((m) => m.driver_id === userId && odometerMissing(m) && m.move_id !== skipped && Date.now() - Date.parse(m.started_at) < 24 * 3600_000)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
  const ask = needing && (needing.ended_at || Date.now() - Date.parse(needing.started_at) > 20_000) ? { move: needing, field: odometerMissing(needing)! } : null;
  return {
    ask,
    answer: (value: number | null) => {
      if (!ask) return;
      if (value == null) { setSkipped(ask.move.move_id); return; }
      moves.patch(ask.move.move_id, ask.field === "begin" ? { begin_miles: value } : { end_miles: value });
    },
    skip: () => ask && setSkipped(ask.move.move_id),
  };
}
