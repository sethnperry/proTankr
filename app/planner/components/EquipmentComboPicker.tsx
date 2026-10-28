"use client";
// app/planner/components/EquipmentComboPicker.tsx
//
// Pick any company combo -- the Reports page's admin/dispatch/lead equipment selector.
// Draws the same shared EquipmentBoard every other equipment screen uses (combos only, since
// a report is about a pair), with a search box. Purely a read-only picker over the
// already-fetched combos: no RPCs, no writes.

import React, { useMemo, useState } from "react";
import type { ComboRow } from "../types";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { EquipmentBoard } from "./equipment/EquipmentBoard";
import { useEquipmentBoardStatus } from "../hooks/useEquipmentBoardStatus";
import { buildTrackRows, type TrackUnit } from "@/lib/equipment/trackList";

const unit = (id: string, name: string, kind: "truck" | "trailer"): TrackUnit => ({
  id, name, kind, region: null, localArea: null, currentRegion: null, currentLocalArea: null,
  statusCode: null, statusNotes: null, subStatus: null, statusLocation: null, statusUpdatedAt: null,
});

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

  const active = useMemo(() => combos.filter((c) => c.active !== false && c.truck_id && c.trailer_id), [combos]);
  const rows = useMemo(() => buildTrackRows(
    [...new Set(active.map((c) => String(c.truck_id)))].map((id) => unit(id, truckNameById[id] ?? id, "truck")),
    [...new Set(active.map((c) => String(c.trailer_id)))].map((id) => unit(id, trailerNameById[id] ?? id, "trailer")),
    active.map((c) => ({ comboId: c.combo_id, truckId: String(c.truck_id), trailerId: String(c.trailer_id) })),
    { region: null, localArea: null }, search,
  ), [active, truckNameById, trailerNameById, search]);
  const claimedByCombo = useMemo(() => Object.fromEntries(active.map((c) => [c.combo_id, c.claimed_by ?? null])), [active]);
  const status = useEquipmentBoardStatus(open, active.map((c) => c.claimed_by).filter((x): x is string => !!x), active.map((c) => String(c.trailer_id)), active.length);

  return (
    <FullscreenModal open={open} title="Select Equipment" onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search equipment…"
          style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 14 }}
        />
        <EquipmentBoard
          rows={rows}
          claimedByCombo={claimedByCombo}
          initials={status.initials}
          activity={status.activity} destByTrailer={status.destByTrailer}
          strips={status.strips}
          combosOnly
          onCombo={(c) => onPick(c.comboId)}
          emptyNote="No equipment found."
        />
      </div>
    </FullscreenModal>
  );
}
