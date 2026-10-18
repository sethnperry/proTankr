"use client";
// lib/ui/pending.tsx
//
// One way to show "I heard your tap" across the app (2026-10-18):
//   - every button shrinks/darkens while pressed (app/globals.css), and
//   - the control you tapped dims, shows a small spinner and ignores more
//     taps until the next screen opens or the work finishes. Mark it with
//     {...busyProps(on)} and put <Spinner/> (or busyText) in its label.
//
//   const p = usePending();
//   <button {...busyProps(p.is("report"))} onClick={() => p.go("report", href)}>
//     Load Report {p.is("report") ? <Spinner/> : "›"}
//   </button>

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function Spinner({ size = 12, style }: { size?: number; style?: React.CSSProperties }) {
  return <span className="pt-spin" aria-hidden style={{ width: size, height: size, ...style }} />;
}

/** aria-busy plus disabled, so a second tap does nothing. Use with your own
 *  <Spinner/>; a plain aria-busy={x} button gets a CSS spinner instead. */
export function busyProps(on: boolean): { "aria-busy": boolean; disabled?: boolean; "data-spin": "own" } {
  return on ? { "aria-busy": true, disabled: true, "data-spin": "own" } : { "aria-busy": false, "data-spin": "own" };
}

/** Label with a spinner while busy: busyText(on, "Save") */
export function busyText(on: boolean, label: React.ReactNode, busyLabel?: React.ReactNode) {
  if (!on) return label;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
      <Spinner />{busyLabel ?? label}
    </span>
  );
}

// How long a navigation can stay "opening" before the button comes back.
const NAV_TIMEOUT_MS = 10000;

export function usePending() {
  const router = useRouter();
  const pathname = usePathname();
  const [key, setKey] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback((k: string | null) => {
    keyRef.current = k;
    setKey(k);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  // A navigation that lands on this same screen (or a different one that
  // keeps this component mounted) clears the busy state.
  useEffect(() => { if (keyRef.current) set(null); }, [pathname, set]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** Navigate. Ignored if something is already busy. */
  const go = useCallback((k: string, href: string, opts?: { replace?: boolean }) => {
    if (keyRef.current) return;
    set(k);
    timer.current = setTimeout(() => set(null), NAV_TIMEOUT_MS);
    if (opts?.replace) router.replace(href); else router.push(href);
  }, [router, set]);

  /** Run async work. Ignored if something is already busy. */
  const run = useCallback(async <T,>(k: string, fn: () => T | Promise<T>): Promise<T | undefined> => {
    if (keyRef.current) return undefined;
    set(k);
    try { return await fn(); } finally { if (keyRef.current === k) set(null); }
  }, [set]);

  /** Mark busy by hand (e.g. before a hard window.location change). */
  const start = useCallback((k: string) => {
    if (keyRef.current) return false;
    set(k);
    timer.current = setTimeout(() => set(null), NAV_TIMEOUT_MS);
    return true;
  }, [set]);

  const is = useCallback((k: string) => key === k, [key]);

  return { pending: key, is, any: key != null, go, run, start, clear: () => set(null) };
}
