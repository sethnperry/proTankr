"use client";
// lib/suppliers/useSupplierPicks.ts
//
// The current visit's supplier picks for this terminal, kept on the phone
// (see picks.ts). Reloads when the terminal changes.

import { useCallback, useEffect, useState } from "react";
import { readPicks, writePicks, type SupplierPick } from "./picks";

export function useSupplierPicks(userId: string | null, terminalId: string | null) {
  const [picks, setPicksState] = useState<SupplierPick[]>([]);
  const [skipped, setSkippedState] = useState(false);
  // Which terminal the state above was read for. Until it matches, the picks
  // aren't known yet, so callers must not treat them as "none picked".
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    const v = readPicks(userId, terminalId);
    setPicksState(v?.picks ?? []);
    setSkippedState(!!v?.skipped);
    setLoadedFor(`${userId}|${terminalId}`);
  }, [userId, terminalId]);
  const loaded = loadedFor === `${userId}|${terminalId}`;

  const setPicks = useCallback((next: SupplierPick[]) => {
    setPicksState(next);
    setSkippedState(false);
    writePicks(userId, terminalId, next.length ? { at: Date.now(), picks: next } : null);
  }, [userId, terminalId]);

  const skip = useCallback(() => {
    setSkippedState(true);
    writePicks(userId, terminalId, { at: Date.now(), picks: [], skipped: true });
  }, [userId, terminalId]);

  const clear = useCallback(() => {
    setPicksState([]);
    setSkippedState(false);
    writePicks(userId, terminalId, null);
  }, [userId, terminalId]);

  return { picks, skipped, loaded, setPicks, skip, clear };
}
