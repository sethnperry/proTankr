"use client";
// app/planner/modals/binder/CompartmentsSection.tsx
//
// Part of the Binder (equipment file) dialog.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

import type { CompartmentRow } from "./types";
import { CompartmentRowItem } from "./CompartmentRowItem";

export function CompartmentsSection({
  trailerId,
  expandedId,
  onToggleExpand,
}: {
  trailerId: string;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const [compartments, setCompartments] = useState<CompartmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("trailer_compartments")
      .select("trailer_id, comp_number, max_gallons, cap_gallons")
      .eq("trailer_id", trailerId)
      .eq("active", true)
      .order("comp_number");
    setCompartments((data ?? []) as CompartmentRow[]);
    setLoading(false);
  }, [trailerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !compartments.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase" as const,
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        Compartments
      </div>
      {compartments.map((c) => (
        <CompartmentRowItem
          key={c.comp_number}
          comp={c}
          isExpanded={expandedId === `trailer-comp-${c.comp_number}`}
          onToggleExpand={() => onToggleExpand(`trailer-comp-${c.comp_number}`)}
        />
      ))}
    </div>
  );
}

// ─── Per-unit permit list section ───────────────────────────────────────────
