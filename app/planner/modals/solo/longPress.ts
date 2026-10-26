"use client";
// app/planner/modals/solo/longPress.ts
//
// Long-press helper (timer plumbing, no hooks).

export function createLongPress(onLongPress: () => void, ms = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;

  const start = () => {
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      onLongPress();
    }, ms);
  };
  const clear = () => {
    if (timer) clearTimeout(timer);
  };

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    didFire: () => fired,
  };
}

// CustomSelect itself now lives in lib/ui/CustomSelect.tsx (shared with
// RecordHistoryModal.tsx's record-edit form -- importing it locally per-file
// is how the native-<select> popup styling bug crept back in once already).

// ServiceTypeEditorModal/ServiceTypeSelect moved to ServiceTypeManager.tsx
// 2026-08-07 so the fleet-tier equipment modal can share them too.

// ─── Service/Wash due computation ────────────────────────────────────────────
// Per-unit, not merged across truck+trailer: the report shows one line per
// present unit. Within a unit, "what's next" is the type whose OWN next-due
// threshold is soonest -- not whichever type happened to be logged most
// recently (2026-08-07: that was the original behavior and could surface a
// type that's actually due far in the future just because it was the last
// thing entered, while a type due imminently sat unreported one row down in
// the full Service History).
