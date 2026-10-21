"use client";
// lib/dispatch/useHosNotifier.ts
//
// Browser notification when a driver on a load newly drops under 2 hours on a
// clock (or goes from under 2 to under 1). The first look is a baseline so
// opening the dashboard doesn't announce drivers who were already low; what's
// been announced is remembered per user. Needs the page open and notification
// permission (the dashboard's "Enable alerts").

import { useEffect, useRef } from "react";
import { pushEnabledHere } from "@/lib/push/subscribe";
import type { HosAlert } from "./hosAlerts";
import { diffHosAlerts, hosNotificationBody, type KnownHos } from "./hosNotify";

function read(key: string): KnownHos {
  try { return JSON.parse(localStorage.getItem(key) ?? "{}") as KnownHos; } catch { return {}; }
}

export function useHosNotifier(o: { userId: string | null; alerts: HosAlert[]; ready: boolean }) {
  const { userId, alerts, ready } = o;
  const key = `proTankr:u:${userId}:hosKnown`;
  const started = useRef(false);
  // With server push on, the cron job sends these; don't also show them from the page.
  const serverPush = useRef(false);
  useEffect(() => { void pushEnabledHere().then((v) => { serverPush.current = v; }); }, []);
  useEffect(() => {
    if (!userId || !ready) return;
    const known = read(key);
    const { fresh, next } = diffHosAlerts(known, alerts);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage blocked */ }
    if (!started.current) { started.current = true; return; } // baseline
    if (!fresh.length || serverPush.current) return;
    const n = hosNotificationBody(fresh);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(n.title, { body: n.body, tag: "protankr-dispatch-hos" });
    } catch { /* some browsers only allow notifications from a service worker */ }
  }, [alerts, ready, userId]); // eslint-disable-line react-hooks/exhaustive-deps
}
