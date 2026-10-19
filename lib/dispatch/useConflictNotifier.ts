"use client";
// lib/dispatch/useConflictNotifier.ts
//
// Tells a dispatcher when a NEW conflict appears while the dashboard is open:
// a NEW marker on the card until they mark it seen, a count in the tab title,
// and (if allowed) a browser notification. The first load is a baseline, so
// opening the dashboard never announces conflicts that were already there.
// What's been announced is remembered per user so a refresh doesn't repeat it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conflict } from "./conflicts";
import { conflictPairs, diffNew, notificationBody } from "./conflictAlerts";

export type NotifyState = "unsupported" | "default" | "granted" | "denied";

function readSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]); } catch { return new Set(); }
}
function writeSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s].slice(-400))); } catch { /* storage blocked */ }
}

export function useConflictNotifier(opts: {
  userId: string | null;
  conflicts: Conflict[];
  ready: boolean; // trips and reports have both loaded once
  terminalName: (id: string) => string;
  reportLabel: (c: Conflict, reportId: string) => string;
}) {
  const { userId, conflicts, ready } = opts;
  const knownKey = `proTankr:u:${userId}:dispatchKnown`;
  const unseenKey = `proTankr:u:${userId}:dispatchUnseen`;
  const [unseen, setUnseen] = useState<Set<string>>(new Set());
  const [permission, setPermission] = useState<NotifyState>("default");
  const known = useRef<Set<string> | null>(null);
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : (Notification.permission as NotifyState));
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    if (known.current === null) {
      // First look: everything present counts as already known. Pairs that were
      // announced but not marked seen before a refresh keep their marker.
      const seenBefore = readSet(knownKey);
      known.current = new Set([...seenBefore, ...conflictPairs(conflicts)]);
      writeSet(knownKey, known.current);
      const stillUnseen = readSet(unseenKey);
      const live = new Set(conflicts.map((c) => c.terminalId));
      setUnseen(new Set([...stillUnseen].filter((t) => live.has(t))));
      return;
    }
    const { fresh, terminalIds } = diffNew(known.current, conflicts);
    if (fresh.length === 0) return;
    fresh.forEach((p) => known.current!.add(p));
    writeSet(knownKey, known.current);
    setUnseen((prev) => { const n = new Set([...prev, ...terminalIds]); writeSet(unseenKey, n); return n; });
    const { terminalName, reportLabel } = latest.current;
    const n = notificationBody(conflicts, fresh, terminalName, reportLabel);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(n.title, { body: n.body, tag: "protankr-dispatch-conflict" });
      }
    } catch { /* some browsers only allow notifications from a service worker */ }
  }, [conflicts, ready, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab title: "(2) ProTankr" while anything is unseen.
  const count = useMemo(() => conflicts.filter((c) => unseen.has(c.terminalId)).length, [conflicts, unseen]);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
    return () => { document.title = document.title.replace(/^\(\d+\)\s*/, ""); };
  }, [count]);

  const markSeen = useCallback((terminalId: string) => {
    setUnseen((prev) => { if (!prev.has(terminalId)) return prev; const n = new Set(prev); n.delete(terminalId); writeSet(unseenKey, n); return n; });
  }, [unseenKey]);
  const markAllSeen = useCallback(() => { setUnseen(new Set()); writeSet(unseenKey, new Set()); }, [unseenKey]);

  const enable = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try { setPermission((await Notification.requestPermission()) as NotifyState); } catch { /* ignore */ }
  }, []);

  return { unseen, permission, enable, markSeen, markAllSeen };
}
