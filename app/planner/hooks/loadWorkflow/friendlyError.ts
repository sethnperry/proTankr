"use client";
// app/planner/hooks/loadWorkflow/friendlyError.ts
//
// Turns a raw load failure into something a driver can act on.

// Turn a raw fetch/network failure into something a driver at a terminal can
// act on. Offline load writes surface as a bare "TypeError: Failed to fetch"
// (Chrome), "Load failed" / "The network connection was lost" (WebKit/iOS),
// or "NetworkError when attempting to fetch resource" (Firefox) -- unreadable
// in the field, and the exact strings the device checklist flagged. Anything
// we don't recognize falls back to the real message so a genuine server error
// is never hidden behind a generic "no connection."
export function friendlyLoadError(err: any, fallback: string): string {
  const raw = String(err?.message ?? err ?? "").toLowerCase();
  if (
    raw.includes("failed to fetch") ||
    raw.includes("load failed") ||
    raw.includes("networkerror") ||
    raw.includes("network request failed") ||
    raw.includes("network connection was lost") ||
    raw.includes("internet connection appears to be offline")
  ) {
    return "No connection — nothing was submitted. Check your signal and try again.";
  }
  return err?.message ?? fallback;
}
