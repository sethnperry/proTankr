"use client";
// app/planner/hooks/useHeaderIconsSlot.ts
//
// The shared Header has a slot element where the Planner portals its plan-letter /
// Equipment / Location cluster. Header renders separate portrait and landscape
// branches, each with its own slot node, so rotating the device replaces the node.
// Look it up again whenever orientation flips (plus one frame later, in case the
// Header's own copy of the orientation hook swaps its branch a frame after ours).

import { useEffect, useState } from "react";

const SLOT_ID = "planner-header-icons-slot";

export function useHeaderIconsSlot(isLandscape: boolean) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(SLOT_ID));
    const raf = requestAnimationFrame(() => setSlot(document.getElementById(SLOT_ID)));
    return () => cancelAnimationFrame(raf);
  }, [isLandscape]);
  return slot;
}
