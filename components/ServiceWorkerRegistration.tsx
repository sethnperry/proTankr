"use client";
// components/ServiceWorkerRegistration.tsx
// Registers the service worker on mount.
// Import this in app/layout.tsx.

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Never register in dev -- cache-first build assets + auto re-registration
    // on every reload means any local source change can appear to silently
    // "not take effect" no matter how many times the dev server restarts,
    // since the SW keeps re-caching whatever bundle was current at each
    // reload. Cost several hours to track down once; don't reintroduce it.
    if (process.env.NODE_ENV !== "production") return;

    // Only auto-reload when a service worker was already controlling this
    // page (i.e. an update took over mid-session or on a later visit) --
    // not on a brand-new user's very first install, which would otherwise
    // cause a surprising extra reload right after their first page load.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    if (hadController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[SW] registered:", reg.scope);
        // Check for a new version whenever the tab regains focus -- PWAs
        // often stay backgrounded for a long time between opens.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update();
        });
        // Answers tapped on a notification while offline are re-sent when the app is open and online.
        const flush = () => navigator.serviceWorker.controller?.postMessage("flush-answers");
        window.addEventListener("online", flush);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flush(); });
        flush();
      })
      .catch((err) => console.error("[SW] registration failed:", err));
  }, []);

  return null;
}
