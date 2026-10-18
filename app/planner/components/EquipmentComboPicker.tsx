"use client";
// app/planner/components/EquipmentComboPicker.tsx
//
// Search-and-pick any company equipment combo -- built for the Reports
// page's admin/dispatch/lead-only equipment selector (see CLAUDE.md "Reports
// page overhaul"). No existing lightweight "pick any combo" component
// existed: EquipmentModal/SoloEquipmentModal/admin's CoupleModal are all
// coupled to claim/couple RPCs, not a read-only picker. This is purely a
// picker over the already-fetched `combos` array (from useEquipment.ts, via
// shell.equipment.combos) -- no RPCs, no writes.

import React, { useMemo, useState } from "react";
import type { ComboRow } from "../types";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

export default function EquipmentComboPicker({
  open,
  onClose,
  combos,
  truckNameById,
  trailerNameById,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  combos: ComboRow[];
  truckNameById: Record<string, string>;
  trailerNameById: Record<string, string>;
  onPick: (comboId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const labelFor = (c: ComboRow) => {
    const name = String(c.combo_name ?? "").trim();
    if (name) return name;
    const t = truckNameById[c.truck_id ?? ""] ?? c.truck_id ?? "?";
    const tr = trailerNameById[c.trailer_id ?? ""] ?? c.trailer_id ?? "?";
    return `Truck ${t} / Trailer ${tr}`;
  };

  const filtered = useMemo(() => {
    const active = combos.filter((c) => c.active !== false);
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter((c) => labelFor(c).toLowerCase().includes(q));
  }, [combos, search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <FullscreenModal open={open} title="Select Equipment" onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search equipment…"
          style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 14 }}
        />
        {filtered.length === 0 && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "16px 0" }}>No equipment found.</div>
        )}
        {filtered.map((c) => (
          <button
            key={c.combo_id}
            type="button"
            onClick={() => onPick(c.combo_id)}
            style={{
              width: "100%", textAlign: "left" as const, padding: "12px 14px", borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            {labelFor(c)}
          </button>
        ))}
      </div>
    </FullscreenModal>
  );
}
