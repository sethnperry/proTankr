"use client";
// app/planner/modals/solo/types.ts
//
// Types for the Equipment modal.

import type { SetupSession } from "@/lib/setupSession";
// ─── Types ────────────────────────────────────────────────────────────────────

export type TruckRow = {
  truck_id: string;
  truck_name: string;
  active: boolean | null;
  region: string | null;
  local_area: string | null;
  current_region: string | null;
  current_local_area: string | null;
  status_code: string | null;
  status_notes: string | null;
  sub_status: string | null;
};
export type TrailerRow = {
  trailer_id: string;
  trailer_name: string;
  active: boolean | null;
  region: string | null;
  local_area: string | null;
  current_region: string | null;
  current_local_area: string | null;
  status_code: string | null;
  status_notes: string | null;
  sub_status: string | null;
};
export type ComboRow = {
  combo_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  tare_lbs: number | null;
  target_weight: number | null;
  active: boolean | null;
  claimed_by: string | null;
};
export type UnitServiceDue = {
  unitLabel: "Truck" | "Trailer";
  typeName: string | null; // null only when the unit has no service records at all
  display: string; // "Due at 295,300 mi" / "Due 07/30/2026" / "Last serviced 07/18/2026" / "No service recorded"
};
export type UnitWash = {
  unitLabel: "Truck" | "Trailer" | "Both";
  display: string; // formatted date
};

export type Props = {
  open: boolean;
  onClose: () => void;
  authUserId: string | null;
  companyId: string;
  selectedComboId: string;
  onSelectComboId: (id: string) => void;
  onRefreshCombos: () => void;
  // Full-app admin impersonation ("Use app as {driver}", 2026-08-04) --
  // when set, couple_combo must claim equipment for setupSession.targetUserId
  // via the service-role /api/admin/setup proxy, not the real admin's own
  // browser session (which has no way to act as anyone but auth.uid()).
  setupSession?: SetupSession | null;
  /** Passed through to ScaleTicketModal, which gates the target gross weight
   *  field on it. Tare stays open to every role. */
  myRole?: string | null;
  /** Fleet vs solo. Solo is always admin, so adding/removing equipment is
   *  unaffected; on a fleet company only staff (admin/dispatch/lead) may add
   *  or remove — a plain fleet driver gets select/couple/swap only. When
   *  omitted, treated as solo (the historical single-tier default). */
  isSolo?: boolean;
  /** Phase 2 bobtail layer. The driver's currently-held units (from
   *  user_settings.current_*), so a partial (one-unit) selection can be
   *  seeded on open and persisted on close via setCurrentEquipment. */
  currentTruckId?: string | null;
  currentTrailerId?: string | null;
  setCurrentEquipment?: (truckId: string | null, trailerId: string | null) => Promise<void>;
  /** Refreshes currentTruckId/currentTrailerId from the server — must be
   *  called after a STUD deadline/readyline eviction so the OTHER (kept)
   *  unit resolves from a fresh value instead of a stale pre-eviction one. */
  onRefreshCurrentEquipment?: () => Promise<void>;
};

// ─── Styles ───────────────────────────────────────────────────────────────────

// Report-line readouts (due dates, wash dates) keep meaningful color -- an
// at-a-glance status signal. The action buttons and selection chrome below
// are just navigation/category chrome, not status -- monochrome, per theme.
