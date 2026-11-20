// app/planner/components/TrackerCheck.tsx
//
// The small green check shown beside an odometer value that came from (and still matches) the truck's Geotab reading.

import React from "react";

export function TrackerCheck({ size = 18 }: { size?: number }) {
  return (
    <span title="Matches the truck's tracker" aria-label="Synced with the truck's tracker" style={{ display: "inline-flex", alignItems: "center", marginLeft: 6, color: "#4ade80", flex: "0 0 auto" }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
    </span>
  );
}
