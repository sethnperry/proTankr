"use client";
// app/planner/modals/solo/useSoloState.ts
//
// State: props, rows, flags and refs.

import type { UnitLastService } from "./serviceInfo";
import type { TruckRow, TrailerRow, ComboRow, UnitServiceDue, UnitWash } from "./types";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { holderIsWorking } from "@/lib/equipment/holderWorking";
import type { ShiftEventRow } from "@/lib/trips/types";
import { type ServiceType } from "../ServiceTypeManager";
import { type EquipmentFilter } from "../RegionLocalAreaFilterModal";
import type { Props } from "./types";

export function useSoloState(props: Props) {
  const {
    open,
    onClose,
    authUserId,
    companyId,
    selectedComboId,
    onSelectComboId,
    onRefreshCombos,
    setupSession,
    myRole,
    isSolo,
    currentTruckId,
    currentTrailerId,
    setCurrentEquipment,
    onRefreshCurrentEquipment,
  } = props;
  // Adding/removing equipment is staff-only on a fleet company. Solo is
  // always admin (solo-provisioning), and when the prop is omitted we treat
  // it as solo — so a single-tier caller keeps full add/remove. Everything
  // else in this modal (couple/decouple/swap/commandeer, filter, report,
  // Binder edit) is shared by every role in both tiers.
  const canAddRemove = isSolo !== false || myRole === "admin" || myRole === "dispatch" || myRole === "lead";
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [trailers, setTrailers] = useState<TrailerRow[]>([]);
  const [combos, setCombos] = useState<ComboRow[]>([]);
  // Starts true (not false): the init/resolve effects below both guard on
  // `loading` to avoid acting on an empty pre-fetch `combos` array. If this
  // started false, there'd be a one-tick window on mount where combos is []
  // but loading hasn't flipped true yet, and the resolve-combo effect would
  // read that as "nothing selected" and clear the parent's selection.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [serviceLines, setServiceLines] = useState<UnitServiceDue[]>([]);
  // Trailer's own report line, separate from serviceLines (truck's forward-
  // looking "next due") -- backward-looking last-serviced, see
  // mostRecentServiceForUnit's own header comment.
  const [trailerServiceLine, setTrailerServiceLine] = useState<UnitLastService | null>(null);
  const [washLines, setWashLines] = useState<UnitWash[]>([]);

  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleHistoryOpen, setScaleHistoryOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [washOpen, setWashOpen] = useState(false);
  const [serviceHistoryOpen, setServiceHistoryOpen] = useState(false);
  const [washHistoryOpen, setWashHistoryOpen] = useState(false);
  // Edit (was "File") -- pick which unit, then that unit's Binder only.
  // binderOpen gates visibility; binderUnit narrows which id(s) it's
  // scoped to (null = neither selected, Binder falls back to its own
  // existing "Select equipment first" empty state). editPickerOpen gates
  // the picker sheet itself, shown only when both units are selected --
  // see openEdit().
  const [binderOpen, setBinderOpen] = useState(false);
  const [binderUnit, setBinderUnit] = useState<"truck" | "trailer" | null>(null);
  const [editPickerOpen, setEditPickerOpen] = useState(false);
  // Update Status (STUD) -- same "pick which unit, then act" shape as Edit
  // above. statusPickerOpen only shows when both units are selected;
  // statusTarget carries whichever single unit EquipmentStatusModal is
  // actually scoped to.
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{
    kind: "truck" | "trailer";
    id: string;
    name: string;
    status: string | null;
    notes: string | null;
    subStatus: string | null;
    // Permanent home local_area — never the current/editable one below
    // it in the modal, so "Belongs to - {home}" can never drift as the
    // driver edits where the unit currently is.
    homeLocalArea: string | null;
    /** A coupled pair is its own thing: set when the status applies to both units together. */
    pair?: { truckId: string; trailerId: string; truckName: string; trailerName: string } | null;
  } | null>(null);
  // Select Equipment sub-screen -- the two-column truck/trailer grid +
  // connector line + its own Filter button live here now, behind a button
  // on the main screen, per explicit direction ("the two column grid...
  // needs to be in its own window behind a select equipment button").
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<EquipmentFilter>({ region: null, localArea: null, awayOnly: false });
  const [addTruckOpen, setAddTruckOpen] = useState(false);
  const [addTrailerOpen, setAddTrailerOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ kind: "truck" | "trailer"; id: string; name: string } | null>(null);
  const [newTareTarget, setNewTareTarget] = useState<{ truckId: string; trailerId: string } | null>(null);
  const [newTareInput, setNewTareInput] = useState("");

  // The signed-in (or impersonated) driver's own home region -- fetched once
  // per open alongside the region-autodefault effect below, and reused by
  // the away-from-home coupling warning (see toggleTruck/toggleTrailer).
  const [driverHomeRegion, setDriverHomeRegion] = useState<string | null>(null);
  const [awayConfirmTarget, setAwayConfirmTarget] = useState<{ kind: "truck" | "trailer"; id: string; unitRegion: string } | null>(null);
  // Checked before the away/commandeer chain -- a Deadline flag is a
  // warning, not a hard block (a stale/wrong flag shouldn't be able to
  // strand a driver with no override), same shape as the other two.
  const [deadlineConfirmTarget, setDeadlineConfirmTarget] = useState<{
    kind: "truck" | "trailer";
    id: string;
    notes: string | null;
  } | null>(null);

  // Display names for whoever currently holds an active combo, keyed by
  // user_id -- only needs entries for OTHER users (never authUserId's own
  // id), used to warn before this screen's tap-to-switch silently steals
  // someone else's truck/trailer (couple_combo's p_force:true force-
  // decouples whatever's currently coupled, with no prior check at all).
  const [claimedByNames, setClaimedByNames] = useState<Record<string, string>>({});
  // Combo pop-out (tap a connected combo on the picker) and the three things its buttons open.
  const [detailComboId, setDetailComboId] = useState<string | null>(null);
  const [dropSwapOpen, setDropSwapOpen] = useState(false);
  const [studPickOpen, setStudPickOpen] = useState(false);
  const [docDraft, setDocDraft] = useState<{ kind: "truck" | "trailer"; id: string; files: File[] } | null>(null);
  const [docUnit, setDocUnit] = useState<{ kind: "truck" | "trailer"; id: string } | null>(null);
  // Drop trailer / Park truck: status (+ optional location) first, then the unlink.
  const [statusFlow, setStatusFlow] = useState<"drop_trailer" | "park_truck" | "park_both" | null>(null);
  const [awaitingTruck, setAwaitingTruck] = useState(false);
  // STUD flow (park a truck, a trailer or both): which unit to park, the picker waiting for a replacement trailer, the pairing to
  // confirm, and the question asked when the modal closes with an unfinished hookup.
  const [studTargetOpen, setStudTargetOpen] = useState(false);
  const [awaitingTrailer, setAwaitingTrailer] = useState(false);
  const [pairConfirm, setPairConfirm] = useState<{ truckId: string; trailerId: string; second: "truck" | "trailer" } | null>(null);
  const [closeAsk, setCloseAsk] = useState<{ kind: "truck_only" | "trailer_only"; then: "picker" | "main" } | null>(null);
  // Loose-unit pop-out, and the unit waiting for its partner after "Couple".
  const [detailUnit, setDetailUnit] = useState<{ kind: "truck" | "trailer"; id: string } | null>(null);
  const [coupleFrom, setCoupleFrom] = useState<{ kind: "truck" | "trailer"; id: string } | null>(null);
  const [takeCombo, setTakeComboRaw] = useState<{ truckId: string; trailerId: string; ownerName: string | null } | null>(null);
  const [commandeerTarget, setCommandeerTargetRaw] = useState<{ kind: "truck" | "trailer"; id: string; ownerName: string } | null>(null);
  // An admin or dispatcher never takes over equipment a driver is working with: the take-over becomes an explanation instead
  // (A solo company's admin is the driver, so this only applies to fleets.)
  const noTakeover = isSolo === false && (myRole === "admin" || myRole === "dispatch");
  const [takeoverBlocked, setTakeoverBlocked] = useState<{ what: string; ownerName: string | null } | null>(null);
  // ...unless that driver isn't working: no shift open and no trip open (a claim nobody used) is idle and can be taken.
  const holderWorking = async (truckId: string | null, trailerId: string | null): Promise<boolean> => {
    const c = combos.find((x) => x.active && x.claimed_by && ((truckId && x.truck_id === truckId) || (trailerId && x.trailer_id === trailerId)));
    const userId = c?.claimed_by ?? null;
    if (!userId) return false;
    try {
      const since = new Date(Date.now() - 3 * 86400_000).toISOString();
      const [se, tr] = await Promise.all([
        supabase.from("shift_events").select("*").eq("user_id", userId).gte("occurred_at", since).order("occurred_at"),
        supabase.from("trips").select("status").eq("driver_id", userId).in("status", ["draft", "loading", "in_transit", "delivering"]).limit(1),
      ]);
      return holderIsWorking({ userId, shiftEvents: (se.data ?? []) as ShiftEventRow[], tripStatuses: ((tr.data ?? []) as { status: string }[]).map((t) => t.status), nowIso: new Date().toISOString() });
    } catch { return true; /* can't tell: don't take it from someone */ }
  };
  const setTakeCombo = (v: { truckId: string; trailerId: string; ownerName: string | null } | null) => {
    if (v && noTakeover) { void holderWorking(v.truckId, v.trailerId).then((w) => (w ? setTakeoverBlocked({ what: "combo", ownerName: v.ownerName }) : setTakeComboRaw(v))); return; }
    setTakeComboRaw(v);
  };
  const setCommandeerTarget = (v: { kind: "truck" | "trailer"; id: string; ownerName: string } | null) => {
    if (v && noTakeover) { void holderWorking(v.kind === "truck" ? v.id : null, v.kind === "trailer" ? v.id : null).then((w) => (w ? setTakeoverBlocked({ what: v.kind, ownerName: v.ownerName }) : setCommandeerTargetRaw(v))); return; }
    setCommandeerTargetRaw(v);
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Loaders ──────────────────────────────────────────────────────────────

  return {
    open,
    onClose,
    authUserId,
    companyId,
    selectedComboId,
    onSelectComboId,
    onRefreshCombos,
    setupSession,
    myRole,
    currentTruckId,
    currentTrailerId,
    setCurrentEquipment,
    onRefreshCurrentEquipment,
    canAddRemove,
    trucks,
    setTrucks,
    trailers,
    setTrailers,
    combos,
    setCombos,
    loading,
    setLoading,
    error,
    setError,
    busy,
    setBusy,
    selectedTruckId,
    setSelectedTruckId,
    selectedTrailerId,
    setSelectedTrailerId,
    serviceTypes,
    setServiceTypes,
    serviceLines,
    setServiceLines,
    trailerServiceLine,
    setTrailerServiceLine,
    washLines,
    setWashLines,
    scaleOpen,
    setScaleOpen,
    scaleHistoryOpen,
    setScaleHistoryOpen,
    serviceOpen,
    setServiceOpen,
    washOpen,
    setWashOpen,
    serviceHistoryOpen,
    setServiceHistoryOpen,
    washHistoryOpen,
    setWashHistoryOpen,
    binderOpen,
    setBinderOpen,
    binderUnit,
    setBinderUnit,
    editPickerOpen,
    setEditPickerOpen,
    statusPickerOpen,
    setStatusPickerOpen,
    statusTarget,
    setStatusTarget,
    pickerOpen,
    setPickerOpen,
    filterOpen,
    setFilterOpen,
    filter,
    setFilter,
    addTruckOpen,
    setAddTruckOpen,
    addTrailerOpen,
    setAddTrailerOpen,
    removeTarget,
    setRemoveTarget,
    newTareTarget,
    setNewTareTarget,
    newTareInput,
    setNewTareInput,
    driverHomeRegion,
    setDriverHomeRegion,
    awayConfirmTarget,
    setAwayConfirmTarget,
    deadlineConfirmTarget,
    setDeadlineConfirmTarget,
    claimedByNames,
    setClaimedByNames,
    detailComboId,
    setDetailComboId,
    dropSwapOpen,
    setDropSwapOpen,
    studPickOpen,
    setStudPickOpen,
    docDraft,
    setDocDraft,
    docUnit,
    setDocUnit,
    statusFlow,
    setStatusFlow,
    awaitingTruck,
    setAwaitingTruck,
    studTargetOpen,
    setStudTargetOpen,
    awaitingTrailer,
    setAwaitingTrailer,
    pairConfirm,
    setPairConfirm,
    closeAsk,
    setCloseAsk,
    detailUnit,
    setDetailUnit,
    coupleFrom,
    setCoupleFrom,
    takeCombo,
    takeoverBlocked, setTakeoverBlocked,
    setTakeCombo,
    commandeerTarget,
    setCommandeerTarget,
    scrollRef,
  };
}
