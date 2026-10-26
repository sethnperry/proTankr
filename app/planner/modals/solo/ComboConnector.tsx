"use client";
// app/planner/modals/solo/ComboConnector.tsx
//
// Connector line between the selected truck and trailer cards.

import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
export function ComboConnector({
  containerRef,
  fromRef,
  toRef,
  active,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fromRef: React.RefObject<HTMLDivElement | null>;
  toRef: React.RefObject<HTMLDivElement | null>;
  active: boolean;
}) {
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    const from = fromRef.current;
    const to = toRef.current;
    if (!active || !container || !from || !to) {
      setLine((prev) => (prev === null ? prev : null));
      return;
    }

    const cRect = container.getBoundingClientRect();
    const fRect = from.getBoundingClientRect();
    const tRect = to.getBoundingClientRect();

    const next = {
      x1: fRect.right - cRect.left + container.scrollLeft,
      y1: fRect.top + fRect.height / 2 - cRect.top + container.scrollTop,
      x2: tRect.left - cRect.left + container.scrollLeft,
      y2: tRect.top + tRect.height / 2 - cRect.top + container.scrollTop,
    };
    // Redrawing the SVG can itself nudge the container's measured size by a
    // sub-pixel amount, which would re-trigger the ResizeObserver below and
    // loop forever. Only update state when the coordinates actually moved.
    setLine((prev) => (prev && prev.x1 === next.x1 && prev.y1 === next.y1 && prev.x2 === next.x2 && prev.y2 === next.y2 ? prev : next));
  }, [active, containerRef, fromRef, toRef]);

  // Recompute after EVERY render (post-DOM-mutation, pre-paint), not just on
  // scroll/resize -- selecting a different truck/trailer, or the filter
  // changing which cards are rendered, moves fromRef/toRef to new DOM
  // positions without the container itself changing size and without any
  // scroll/resize event ever firing, so the line was going stale (stuck
  // pointing at wherever the cards used to be) on exactly those two real
  // actions. This is cheap (two getBoundingClientRect reads, only while
  // `active`) and the existing no-op guard in recompute() above already
  // skips the state update entirely when nothing actually moved.
  useLayoutEffect(() => {
    recompute();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    container.addEventListener("scroll", recompute);
    window.addEventListener("resize", recompute);

    return () => {
      ro.disconnect();
      container.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [recompute, containerRef]);

  if (!line) return null;

  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="rgba(255,255,255,0.55)" strokeWidth={2} />
    </svg>
  );
}

// ─── Long-press handlers ──────────────────────────────────────────────────────
// Plain factory (not a hook) -- built fresh per rendered card inside a .map(),
// so it must not call useRef/useCallback/etc. (variable-length lists would
// violate the Rules of Hooks). State lives in a closure instead; that's fine
// here since it's stateless timer plumbing, not anything that needs to
// survive re-renders with referential stability.
