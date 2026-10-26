"use client";
// app/planner/modals/myLoads/StatusChip.tsx
//
// Part of MyLoadsModal.tsx.




export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    completed:   { label: "LOADED",   color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
    in_progress: { label: "IN PROG",  color: "#67e8f9", bg: "rgba(103,232,249,0.12)" },
    started:     { label: "STARTED",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
    planned:     { label: "PLANNED",  color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.07)" },
  };
  const s = map[status] ?? { label: status.toUpperCase(), color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.06)" };
  return (
    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.8, padding: "3px 7px", borderRadius: 2, color: s.color, background: s.bg, whiteSpace: "nowrap", flexShrink: 0 }}>
      {s.label}
    </span>
  );
}

// ─── Date filter chips ────────────────────────────────────────────────────────
