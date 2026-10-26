"use client";
// app/planner/modals/solo/StatusBlock.tsx
//
// The "In use by / Currently / away" card under the main dialog header.

import type { SoloModel } from "./useSoloEquipment";
import { S } from "./styles";

export function StatusBlock({ m }: { m: SoloModel }) {
  const { awayNotes, claimantLabel, currentLocalArea, currentRegion, selectedTrailerRow, selectedTruckRow, statusHeaderText } = m;
  return !selectedTruckRow && !selectedTrailerRow ? (
    <div style={S.statusEmpty}>No equipment selected — tap Select Equipment to choose your truck and trailer.</div>
  ) : (
    <div style={S.statusCard}>
      <div style={S.statusHeader}>{statusHeaderText}</div>
      {claimantLabel && (
        <div style={S.statusLine}>
          <span style={S.statusLabel}>In Use by</span>
          <span style={S.statusValue}>{claimantLabel}</span>
        </div>
      )}
      {(currentRegion || currentLocalArea) && (
        <div style={S.statusLine}>
          <span style={S.statusLabel}>Currently</span>
          <span style={S.statusValue}>
            {currentRegion ?? "—"} · {currentLocalArea ?? "—"}
          </span>
        </div>
      )}
      {awayNotes.map((note) => (
        <div key={note} style={S.statusAwayNote}>
          {note}
        </div>
      ))}
    </div>
  );
}
