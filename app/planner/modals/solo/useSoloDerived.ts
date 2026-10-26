"use client";
// app/planner/modals/solo/useSoloDerived.ts
//
// Derived: selected combo and rows, filtering, away notes, status header, board rows.

import type { TruckRow, TrailerRow } from "./types";
import { useMemo } from "react";
import { useEquipmentBoardStatus } from "../../hooks/useEquipmentBoardStatus";
import { buildTrackRows, type TrackUnit } from "@/lib/equipment/trackList";
import type { Props } from "./types";

import type { useSoloState } from "./useSoloState";
import type { useSoloData } from "./useSoloData";
import type { useSoloCoupling } from "./useSoloCoupling";
import type { useSoloActions } from "./useSoloActions";

export function useSoloDerived(
  props: Props,
  s: ReturnType<typeof useSoloState>,
  d: ReturnType<typeof useSoloData>,
  c: ReturnType<typeof useSoloCoupling>,
  a: ReturnType<typeof useSoloActions>,
) {
  const {
    open,
    authUserId,
    selectedComboId,
    setupSession,
    trucks,
    trailers,
    combos,
    selectedTruckId,
    selectedTrailerId,
    pickerOpen,
    filter,
    claimedByNames,
    detailComboId,
  } = s;
  const selectedCombo = useMemo(
    () => combos.find((c) => String(c.combo_id) === String(selectedComboId)) ?? null,
    [combos, selectedComboId],
  );

  // A unit is "away" when its CURRENT region or local area genuinely differs
  // from its permanent home value -- either dimension counts, not just
  // region. Comparisons are trimmed + case-folded before comparing: region/
  // local_area and profiles.region/local_area are both free text entered
  // through different forms, so "Southeast" (home) and "Southeast " or
  // "southeast" (current, stamped from a driver's profile) must never read
  // as a mismatch just because of whitespace/casing -- that showed up live
  // as an obviously-wrong "Southeast → Southeast" away badge before this
  // normalization existed.
  type LocatableUnit = {
    region: string | null;
    local_area: string | null;
    current_region: string | null;
    current_local_area: string | null;
  };
  const normLoc = (s: string | null): string => (s ?? "").trim().toLowerCase();
  const regionMismatch = (t: LocatableUnit) => !!t.current_region && normLoc(t.current_region) !== normLoc(t.region);
  const areaMismatch = (t: LocatableUnit) => !!t.current_local_area && normLoc(t.current_local_area) !== normLoc(t.local_area);
  const isAway = (t: LocatableUnit) => regionMismatch(t) || areaMismatch(t);

  // Filter button's result -- narrows the grid to whatever's CURRENTLY
  // usable in the selected region/area (home OR current match, independently
  // per field), not just permanently home there. This is the actual fix for
  // "the trailer I coupled disappears from my normal view": a unit brought
  // in from elsewhere and coupled here still shows once the current-region
  // stamp (set by couple_combo) matches, and a currently-selected truck/
  // trailer that falls out of the filter anyway stays selected -- filtering
  // is a display convenience, not a deselect -- only the visible list of
  // OTHER options shrinks.
  //
  // The selected (coupled) unit is floated to the top of its own column --
  // per explicit direction, so the two selected cards land in the same row
  // and the connector line runs straight across, with every other ("loose")
  // unit listed underneath. Array.prototype.sort is stable, so ties (i.e.
  // every non-selected row) keep their existing alphabetical order.
  const toUnit = (r: TruckRow | TrailerRow, kind: "truck" | "trailer"): TrackUnit => ({
    id: kind === "truck" ? (r as TruckRow).truck_id : (r as TrailerRow).trailer_id,
    name: kind === "truck" ? (r as TruckRow).truck_name : (r as TrailerRow).trailer_name,
    kind,
    region: r.region,
    localArea: r.local_area,
    currentRegion: r.current_region,
    currentLocalArea: r.current_local_area,
    statusCode: r.status_code,
    statusNotes: r.status_notes,
    subStatus: r.sub_status,
    statusLocation: null,
    statusUpdatedAt: null,
  });
  const boardRows = useMemo(
    () =>
      buildTrackRows(
        trucks.map((t) => toUnit(t, "truck")),
        trailers.map((t) => toUnit(t, "trailer")),
        combos
          .filter((c) => c.active !== false && c.truck_id && c.trailer_id)
          .map((c) => ({ comboId: c.combo_id, truckId: String(c.truck_id), trailerId: String(c.trailer_id) })),
        { region: filter.region, localArea: filter.localArea, awayOnly: filter.awayOnly },
        "",
      ),
    [trucks, trailers, combos, filter],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const claimedByCombo = useMemo(() => Object.fromEntries(combos.map((c) => [c.combo_id, c.claimed_by])), [combos]);
  const boardStatus = useEquipmentBoardStatus(
    open && pickerOpen,
    combos.map((c) => c.claimed_by).filter((x): x is string => !!x),
    trailers.map((t) => t.trailer_id),
    combos.length,
  );
  const detailRow = detailComboId ? (boardRows.combos.find((c) => c.comboId === detailComboId) ?? null) : null;
  const detailCombo = detailComboId ? (combos.find((c) => c.combo_id === detailComboId) ?? null) : null;
  const detailMine = !!detailComboId && String(detailComboId) === String(selectedComboId);

  // ── Status report -- "the information we want to see": who's driving
  // it, where it currently is, and whether either unit is away from its
  // own home. Built entirely from state already in this component (no new
  // fetch) -- claimedByNames already resolves OTHER drivers' names for the
  // commandeer-warning flow above; "You" is a plain self-check, no fetch
  // needed for that case. Scoped to whatever's currently selected only --
  // not a peekable locator for every unit in the picker (a bigger, separate
  // feature, confirmed out of scope for this pass).
  const effectiveUserId = setupSession?.targetUserId ?? authUserId;
  const selectedTruckRow = trucks.find((t) => t.truck_id === selectedTruckId) ?? null;
  const selectedTrailerRow = trailers.find((t) => t.trailer_id === selectedTrailerId) ?? null;

  // Only a full combo carries a claim (equipment_combos.claimed_by) -- a
  // lone bobtail/trailer-only unit has no per-unit claim to show under the
  // current schema, so "In Use by" is simply omitted for that case.
  const claimantLabel = selectedCombo?.claimed_by
    ? selectedCombo.claimed_by === effectiveUserId
      ? "You"
      : (claimedByNames[selectedCombo.claimed_by] ?? "another driver")
    : null;

  // Current location -- whichever unit is present (both are stamped
  // together by the same couple_combo call, so they should always agree
  // for a live combo; falls back to home region/local area for a unit
  // that's never been coupled under this system yet).
  const locationSource = selectedTruckRow ?? selectedTrailerRow;
  const currentRegion = locationSource ? (locationSource.current_region ?? locationSource.region) : null;
  const currentLocalArea = locationSource ? (locationSource.current_local_area ?? locationSource.local_area) : null;

  // Only named when it actually mismatches -- a normal in-area combo shows
  // no mismatch noise at all.
  const awayNotes: string[] = [];
  if (selectedTruckRow && isAway(selectedTruckRow)) {
    awayNotes.push(`Truck belongs to ${selectedTruckRow.region ?? "—"} · ${selectedTruckRow.local_area ?? "—"}`);
  }
  if (selectedTrailerRow && isAway(selectedTrailerRow)) {
    awayNotes.push(`Trailer belongs to ${selectedTrailerRow.region ?? "—"} · ${selectedTrailerRow.local_area ?? "—"}`);
  }

  // Deadline/Readyline are an abstract of PHYSICAL LOCATION -- a unit
  // that's linked to this driver is, by definition, In Use, never
  // Deadline or Readyline at the same time. So nothing shown in this
  // header ever carries a status flag; a status word here would always
  // be describing a contradiction (a unit can't be both selected AND
  // parked-somewhere-else-awaiting-pickup).
  const statusHeaderText =
    selectedTruckRow && selectedTrailerRow
      ? `${selectedTruckRow.truck_name} ⇄ ${selectedTrailerRow.trailer_name}`
      : selectedTruckRow
        ? `${selectedTruckRow.truck_name} (bobtail)`
        : selectedTrailerRow
          ? `${selectedTrailerRow.trailer_name} (no truck)`
          : "";

  return {
    selectedCombo,
    boardRows,
    claimedByCombo,
    boardStatus,
    detailRow,
    detailCombo,
    detailMine,
    selectedTruckRow,
    selectedTrailerRow,
    claimantLabel,
    currentRegion,
    currentLocalArea,
    awayNotes,
    statusHeaderText,
  };
}
