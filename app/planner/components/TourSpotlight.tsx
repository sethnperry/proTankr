"use client";
// app/planner/components/TourSpotlight.tsx
//
// A small, reusable "look here" highlight -- a dimmed backdrop with a
// cutout around a real DOM element, plus a caption bubble explaining what
// to tap. Shared by the Setup Guide (page.tsx, continuously follows
// whichever step is next) and the first-open Plan Review walkthrough
// (LoadingModal.tsx, a short two-step sequence).
//
// Deliberately NOT the old in-app tour (pulsing-ring, tap-to-advance,
// /planner?tour=setup) this project already tried once and retired -- see
// that retirement's own note in app/learn/page.tsx ("unreliable tap-zone
// targeting... forced the user to actually perform each step instead of
// just watching one"). This version never blocks a tap: the backdrop and
// the cutout both have pointerEvents:none, so the real control underneath
// is always directly tappable through the overlay -- this is purely
// visual guidance, and it self-resolves the moment the driver acts
// (acting on the real control makes the target's ref go away, which
// naturally hides the highlight -- see LoadingModal.tsx's own use). The
// caption bubble's own dismiss button is the only interactive part.
//
// Targeting is also robust the way the old tour's wasn't -- a real React
// ref to the actual control, not a selector/coordinate guess, re-measured
// via ResizeObserver + resize/scroll listeners + a short settle-timer
// burst (same defensive-remeasurement pattern this app already
// established in useElementWidth.ts/useNaturalHeight.ts for "the first
// synchronous read can land before layout has actually settled").

import { useEffect, useState, type RefObject } from "react";

type Rect = { top: number; left: number; width: number; height: number };

function measure(ref: RefObject<HTMLElement | null>): Rect | null {
  const el = ref.current;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Re-measures the target while `active`; null the instant it stops being
// active OR the ref's element isn't actually mounted/visible -- both are
// treated as "nothing to show," never a forced highlight of something
// that isn't really there.
export function useSpotlightRect(ref: RefObject<HTMLElement | null>, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    const update = () => setRect(measure(ref));
    update();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ref.current && ro) ro.observe(ref.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const timers = [50, 150, 400, 1000].map((ms) => window.setTimeout(update, ms));

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro?.disconnect();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ref` itself
    // (the RefObject) is stable; only `active` should re-arm this.
  }, [active]);

  return rect;
}

export default function Spotlight({
  rect,
  title,
  body,
  actionLabel = "Got it",
  onAction,
}: {
  rect: Rect | null;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction: () => void;
}) {
  if (!rect) return null;

  const pad = 8;
  const holeTop = rect.top - pad;
  const holeLeft = rect.left - pad;
  const holeW = rect.width + pad * 2;
  const holeH = rect.height + pad * 2;

  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 400;
  const spaceBelow = viewportH - (holeTop + holeH);
  const spaceAbove = holeTop;
  const captionBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
  const captionW = Math.min(260, viewportW - 32);

  return (
    // z-index 45 -- deliberately below FullscreenModal's z-50 (and well
    // below sheet-style overlays like PresetQuickPick's 10300) so ANY real
    // modal opening always covers this, no per-modal "is X open" tracking
    // needed to avoid a broken-looking stack.
    <div style={{ position: "fixed", inset: 0, zIndex: 45, pointerEvents: "none" }}>
      <div
        style={{
          position: "fixed",
          top: holeTop, left: holeLeft, width: holeW, height: holeH,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.70)",
          border: "2px solid #4ade80",
          transition: "top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          ...(captionBelow ? { top: holeTop + holeH + 12 } : { top: Math.max(12, holeTop - 12), transform: "translateY(-100%)" }),
          left: Math.max(16, Math.min(holeLeft, viewportW - captionW - 16)),
          width: captionW,
          pointerEvents: "auto",
          background: "#1c1c1e",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          padding: "12px 14px",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>{title}</div>
        {body && (
          <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)", lineHeight: 1.45, marginTop: 4 }}>
            {body}
          </div>
        )}
        <button
          type="button"
          onClick={onAction}
          style={{
            marginTop: 10, fontSize: 12, fontWeight: 800, color: "#4ade80",
            background: "none", border: "none", padding: 0, cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
