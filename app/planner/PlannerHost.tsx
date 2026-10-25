"use client";
import { useTruckReading, fetchTruckShipments } from "@/lib/telematics/useTruckReading";
import { shipmentsForPickup, type GeoShipment } from "@/lib/telematics/shipmentMatch";
import { readGeoDeparture } from "@/lib/telematics/geoDepartures";
import { openAccessSteps } from "./components/access/useAccessSteps";
import { clearSetupSession } from "@/lib/setupSession";
import { usePathname, useRouter } from "next/navigation";
import SetupGate from "./components/SetupGate";
import SoloOnboarding from "./components/SoloOnboarding";
import { isOnboardingComplete } from "./utils/onboardingProgress";
import { useCalculatorShell } from "./CalculatorShellContext";

/**
 * page.tsx — CalculatorPage
 *
 * This file is intentionally thin: it wires hooks together and renders JSX.
 * Business logic lives in:
 *   hooks/useEquipment.ts   — combos, selectedComboId, persistence
 *   hooks/useLocation.ts    — states/cities, ambient temp, persistence
 *   hooks/useTerminals.ts   — my terminals, catalog, get_carded
 *   hooks/usePlanSlots.ts   — plan snapshot save/load, Supabase sync
 *   hooks/useLoadWorkflow.ts — begin_load / complete_load RPCs
 *   hooks/usePlanRows.ts    — binary search for weight-constrained max gallons
 *   utils/planMath.ts       — lbsPerGallonAtTemp, planForGallons, allocateWithCaps
 *   types.ts                — all shared types
 */



import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import { defaultLandingPath } from "@/lib/ui/driver/navDestinations";

// Module-level (not component state) so it survives this page component
// unmounting/remounting on every route change, but still resets on a true
// full reload -- exactly the "did we already do the once-per-session
// landing redirect" flag needs. A ref/useState living inside the component
// can't do this: this page genuinely remounts every time the user
// navigates back to it, which would make a same-scope flag "fresh" again
// on every visit, defeating the "once per session" intent below.
let hasCheckedDefaultLanding = false;

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { usePlanSlots } from "./hooks/usePlanSlots";
import { useLoadWorkflow } from "./hooks/useLoadWorkflow";
import { useTerminalSwitchDuringLoad } from "./hooks/useTerminalSwitchDuringLoad";
import { usePlanRows } from "./hooks/usePlanRows";
import {
  computeAvailableCapacity,
  DEFAULT_COMPANY_TARGET_GROSS_LBS,
  DEFAULT_LEGAL_GROSS_LBS,
  type CapacityCompartmentInput,
} from "@/lib/capacity/computeAvailableCapacity";
import { useFuelTempPrediction } from "./hooks/useFuelTempPrediction";

// ── Sections ───────────────────────────────────────────────────────────────────
import PlannerControls from "./sections/PlannerControls";
import { useIsLandscape } from "./hooks/useOrientation";
import TempDial from "./components/TempDial";
import PresetActionSheet from "./components/PresetActionSheet";
import { getTripPlan, markTripPlanApplied } from "@/lib/trips/tripPlan";
import PresetQuickPick from "./components/PresetQuickPick";

// ── Modals ─────────────────────────────────────────────────────────────────────
// LocationModal/MyTerminalsModal now mount once in ShellChrome
// (CalculatorLayoutClient.tsx) -- see the render-site comment further down.
import TerminalCatalogModal from "./modals/TerminalCatalogModal";
import LoadingModal from "./modals/LoadingModal";
import CancelLoadSheet from "./components/CancelLoadSheet";
import TerminalSwitchDuringLoadSheet from "./components/TerminalSwitchDuringLoadSheet";
import RecallDifferentEquipmentSheet from "./components/RecallDifferentEquipmentSheet";
import StaleApiOverlay, { type StaleProduct } from "./components/StaleApiOverlay";
import { reportDelayIssue, submitOutageReport, type OutageReportType } from "./hooks/useTerminalOutageReports";
import { isTerminalIssueCode, issueChoiceValue } from "@/lib/trips/terminalIssues";
import ProductTempModal from "./modals/ProductTempModal";
import CompartmentModal from "./modals/CompartmentModal";
import PlanWizard from "./components/PlanWizard";
import CompartmentDetailModal from "./components/CompartmentDetailModal";

// ── UI ─────────────────────────────────────────────────────────────────────────
import { styles } from "./ui/styles";

// ── Utils ──────────────────────────────────────────────────────────────────────
import { addDaysISO_, formatMDYWithCountdown_, isPastISO_ } from "./utils/dates";
import { cgSliderToBias, lbsPerGallonAtTemp, planForGallons, CG_NEUTRAL, backCorrectApiTo60 } from "./utils/planMath";
import { resolveApiBasis, apiTierColor } from "./utils/apiBasis";
import { productColorFor } from "./utils/productColor";
import { recordLocationForSwitchTracking } from "./utils/locationSwitchProgress";
import { DEFAULT_STALE_API_DAYS } from "@/lib/config/plannerSafety";
import { getTripStore, useTripStore } from "@/lib/trips/useTripStore";
import { newId as newTripId } from "@/lib/trips/tripStore";
import { useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { useSuppliers } from "@/lib/trips/useSuppliers";
import { bolConflicts } from "@/lib/trips/refCheck";
import { confirmLoaded, pickupNeedsOdometer, tripSnapshot, updateLoadedCompartments, type LoadedCompartmentEdit, type StepTimes } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripPickupRow, TripRow } from "@/lib/trips/types";
import type { LoadingTripMode, TripLoadExtras } from "./modals/LoadingModal";
import { openTripForDriver, unlinkCancelledLoad } from "@/lib/trips/tripLogic";
import { cancelPlannedLoad } from "@/lib/supabase/load";
import { clearActivePlannedLoad } from "./utils/activePlannedLoad";
import { readPlannedComps } from "@/lib/trips/addPickupCheck";
import { productLbsOnBoard } from "@/lib/trips/truckChange";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { TripEquipmentSheets, useTripEquipment } from "./hooks/useTripEquipment";
import { SupplierPanel, type PanelProduct, type SupplierSwitchEvent } from "./components/supplier/SupplierPanel";
import { useSupplierPicks } from "@/lib/suppliers/useSupplierPicks";
import { resolvePicks, readPicks, groupPicks, type SupplierPick } from "@/lib/suppliers/picks";
import { getTripSupplier, setTripSupplier, tripSupplierPicks } from "@/lib/trips/tripSupplier";
import { markSuppliersLoaded } from "@/lib/suppliers/useTerminalSuppliers";
import { Spinner } from "@/lib/ui/pending";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { ActiveComp, CompPlanInput, CompRow, ProductRow } from "./types";



// ─── Local UI helpers ─────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────


export default function PlannerHost() {
  // ── Shared shell state (equipment/location/terminals/expirations) ──────────
  // Owned once in CalculatorShellContext (layout.tsx) so the header's gear/
  // bell icons and this page's own planning logic never see two
  // independently-hydrated copies of the same selection state.
  const shell = useCalculatorShell();
  const { authUserId, setupSession, effectiveUserId, equipment, location, terminals } = shell;
  const router = useRouter();
  // This host stays mounted for every /planner screen; the Planner page itself
  // shows only on the bare /planner route. Modals (Plan Review, load report,
  // sheets) work on any screen.
  const pathname = usePathname();
  const active = pathname === "/planner";
  // Leaving the Planner for another screen: a plain cover (spinner + text)
  // goes up in the same render the modal closes, so the Planner never
  // flashes before the next screen opens.
  const [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => { if (pathname !== "/planner") setLeaving(null); }, [pathname]);
  const leaveTo = useCallback((href: string, label: string) => {
    // Plan Review / a report opened over another screen: that screen is
    // already underneath, so there's nothing to cover or navigate to.
    if (typeof window !== "undefined" && window.location.pathname !== "/planner") {
      const path = href.split("?")[0];
      if (path === window.location.pathname) {
        if (href.includes("arrive=1")) window.dispatchEvent(new Event("protankr:arrive"));
      } else {
        router.push(href);
      }
      return;
    }
    setLeaving(label);
    router.push(href);
  }, [router]);
  // Wider-than-tall with enough room for a real two-column layout -- see
  // useOrientation.ts. Computed once here and passed down (to
  // PlannerControls) rather than each consumer calling matchMedia itself.
  const isLandscape = useIsLandscape();
  // A second, much wider threshold -- tablet/desktop, not just a phone
  // turned sideways (the largest real phones still land under ~930px in
  // landscape). Below this, recap/points stay merged into one inline
  // stats row with the Load button on its own row below (see
  // recapPointsEl's "row" mode); at or above it there's enough real
  // width to give recap, points, and the Load button one equal-width/
  // equal-height row each, per explicit direction ("on obnoxiously wide
  // screens we can shift the load button over to the right of points...
  // one row of equal width and height for each"). Same hook, just a
  // second call with a bigger minWidth -- no changes needed in
  // useOrientation.ts itself.

  // Landscape composition, replacing the old fixed-width-two-column +
  // transform:scale system entirely (see CLAUDE.md's own landscape
  // history for how many rounds that took to land -- REF_COMPARTMENTS_W/
  // REF_SIDE_W/rowScale/useElementWidth/useNaturalHeight and the whole
  // measured-then-scaled machinery are gone). With Equipment/Location/
  // Temperature/the plan-letter cluster moved OUT of this page into the
  // shared header's own vertical rail in landscape
  // (CalculatorLayoutClient.tsx), there's no second column left to keep
  // legible alongside compartments -- this can just be ONE flowing
  // column now, compartments/CG-slider/recap+points/Load button in that
  // order, same as portrait, capped at a fixed max width so nothing
  // stretches to an absurd size on a huge monitor ("stretch the comps
  // and load button to fit, up to a reasonable width"). Per explicit
  // direction: "move the icon strip into a vertical column and put it
  // all the way left... keep everything else on the right and take all
  // (most) space out between cards and comp/location etc." Compartment
  // bars themselves need no special width handling here -- they're
  // already percentage-of-container (PlannerControls.tsx), so they
  // naturally stretch to fill whatever width this column has; barH's
  // own fixed 100px landscape height (unchanged) is what keeps them a
  // sensible rectangular shape instead of growing tall as they widen.
  const LANDSCAPE_MAX_W = 1100;

  // Reverses a 2026-08-04 decision that only dispatch should ever redirect
  // off bare /planner ("the only role that should default to the dispatch
  // tab on open is the dispatch role. all other roles should open to the
  // planner") -- that reasoning is superseded now that admin's Planner IS
  // the Dispatch page (app/planner/dispatch/page.tsx), not a shared page
  // admin and driver/lead both used to land on. admin now redirects the
  // same way dispatch already did; isSuperAdmin never redirects either way
  // (gets both /planner and /planner/dispatch reachable, on purpose, via
  // NavMenu -- see lib/ui/driver/navDestinations.ts).
  //
  // Gated on shell.isSuperAdminResolved, not just shell.role != null --
  // role and isSuperAdmin resolve via two fully independent effects in
  // CalculatorShellContext.tsx with no ordering guarantee, so without this
  // a real super admin whose own company role happens to be "admin" could
  // get redirected to /planner/dispatch before their super-admin flag
  // resolves true. This is the same "re-evaluation can silently re-fire the
  // one-time redirect" class of bug the module-level hasCheckedDefaultLanding
  // flag already exists to guard against, just a second, independent way
  // for that guard's own precondition to be wrong -- worth closing properly
  // rather than leaving a narrower version of the same bug in place.
  // ── Solo first-run onboarding gate ─────────────────────────────────────────
  // A brand-new (or partially-set-up) solo driver gets a guided setup flow
  // instead of the raw SetupGate/equipment-management entry. Active only for a
  // solo company that hasn't finished onboarding; the flow itself resolves the
  // exact resume step from real DB state (see SoloOnboarding). While it's
  // active, SetupGate is suppressed so the two gates never both show. `isSolo`
  // also feeds the landing redirect below (a solo driver is role 'admin' but
  // must NOT be bounced to /planner/dispatch like a fleet admin), which is why
  // this block sits above that effect.
  const [onboardingDone, setOnboardingDone] = useState(false);
  useEffect(() => { setOnboardingDone(isOnboardingComplete(effectiveUserId || null)); }, [effectiveUserId]);
  const onboardingActive = shell.isSolo === true && !onboardingDone && !!effectiveUserId && !!shell.companyId;

  useEffect(() => {
    if (hasCheckedDefaultLanding) return;
    if (!active) { hasCheckedDefaultLanding = true; return; } // opened on another screen: no landing redirect
    if (shell.role == null) return;
    if (!shell.isSuperAdminResolved) return;
    if (shell.isSolo === null) return; // wait for solo resolution -- a solo admin must not be redirected off the driver Planner
    // A deliberate visit (dashboard Plan tool, Begin Loading, a load report)
    // carries a query flag and stays on the Planner.
    const qs = new URLSearchParams(window.location.search);
    const target = defaultLandingPath(shell.role, shell.isSuperAdmin, shell.isSolo === true);
    // A solo driver finishes first-run onboarding here before landing anywhere else.
    if (target && shell.isSolo === true && !onboardingDone) return;
    hasCheckedDefaultLanding = true;
    if (qs.get("begin") || qs.get("report") || qs.get("plan")) return;
    if (target) router.replace(target);
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, onboardingDone, active, router]);

  // ── Card data (card number + PIN + private note, per terminal, per user) ──
  // Owned in CalculatorShellContext now -- the new Cards tab route needs the
  // same data, so it's shared rather than fetched twice (same pattern as
  // equipment/location/terminals above).

  // Framer-motion's layoutId shared-element transitions render a differently
  // serialized `style` attribute server-side vs. after hydration (e.g. its
  // color values gain spaces: "rgba(255,255,255,0.45)" -> "rgba(255, 255,
  // 255, 0.45)"), which is a real, uncorrected hydration mismatch React won't
  // patch up. Render plain <button>s for SSR/first paint and only swap to
  // motion.button post-mount, so hydration always diffs identical DOM.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Portal target for the plan-letter/Equipment/Location/Temperature
  // cluster, rendered by CalculatorLayoutClient.tsx's shared Header --
  // see that file's own comment on the slot div for why this is a portal
  // rather than lifting this state into the shell context.
  //
  // Real bug, fixed 2026-09-15: this used to grab the slot element ONCE on
  // mount (empty deps), on the assumption "Header is always already
  // mounted above this page's own content." True, but Header itself
  // renders TWO structurally separate branches for portrait vs. landscape
  // (see CalculatorLayoutClient.tsx's own `if (isLandscape) { ... }`
  // split), each with its OWN `<div id="planner-header-icons-slot">` --
  // same id string, but a genuinely different DOM node per branch.
  // Rotating the device swaps which branch is mounted, so the node this
  // effect grabbed at mount time gets detached from the tree; the portal
  // keeps rendering into that now-invisible orphan forever after, which is
  // exactly the reported symptom (rotate to landscape: icons vanish;
  // rotate back to portrait: still vanish, since a THIRD new node was
  // created and this effect never re-ran to notice; only a full refresh,
  // which reruns this effect fresh, brought them back). Fixed by
  // re-running the lookup whenever isLandscape itself flips -- the actual
  // signal that the branch (and therefore the slot node) just changed --
  // plus one rAF-deferred re-check as a defensive fallback for the rare
  // case this component's own isLandscape update lands a frame before
  // Header's sibling instance of the same hook swaps in its new slot.
  const [headerIconsSlot, setHeaderIconsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderIconsSlot(document.getElementById("planner-header-icons-slot"));
    const raf = requestAnimationFrame(() => {
      setHeaderIconsSlot(document.getElementById("planner-header-icons-slot"));
    });
    return () => cancelAnimationFrame(raf);
  }, [isLandscape]);

  // ── Modal open/close flags ─────────────────────────────────────────────────
  // equipOpen/expModalOpen/termOpen live in the shared shell context now --
  // the header (layout.tsx) needs to trigger the same Equipment/Expirations/
  // Terminals sheets this page renders (ExpirationModal's "resolve" links
  // open Terminals, so it has to be a shared boolean, not local to either).
  // locOpen/statePickerOpen/expandedTerminalId and the city-star/stateOptions/
  // cities derived values also live in shell now (see CalculatorShellContext) --
  // the Terminal tab's own identity header opens the same LocationModal/
  // MyTerminalsModal instances (now mounted once in ShellChrome), so this
  // page and that one can't each carry an independent copy without risking
  // the two drifting out of sync.
  const { setEquipOpen, setTermOpen, setLocOpen } = shell;
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogExpandedId, setCatalogExpandedId] = useState<string | null>(null);
  const [catalogEditingDateId, setCatalogEditingDateId] = useState<string | null>(null);
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalComp, setCompModalComp] = useState<number | null>(null);
  const [tempDialOpen, setTempDialOpen] = useState(false);
  // The Loading modal's single exit point -- opened by its bottom button
  // (renamed from "LOADED" to "Complete") or by FullscreenModal's own
  // backdrop-click/Escape (the header Close button is hidden now, see
  // hideCloseButton in LoadingModal.tsx). Offers Log the Load / Update
  // Card Only / Keep Editing -- see CancelLoadSheet.tsx for why the
  // "update card only" branch is real, not just a courtesy: begin_load
  // already re-cards the terminal on LOAD tap, before this modal ever
  // opens.
  const [cancelLoadConfirmOpen, setCancelLoadConfirmOpen] = useState(false);
  // Captured the instant LOAD/RELOAD is tapped -- whatever this terminal's
  // access date was *before* begin_load's silent re-card, so "Back to
  // Planner" can genuinely undo it (see handleBackToPlannerNoUpdate below).
  // null prevValue means the terminal had no prior access record at all.
  const preLoadCardedOnRef = useRef<{ terminalId: string; prevValue: string | null } | null>(null);

  // ── Stale-API safety (Good / Better / Best on LOAD) ──────────────────────
  // Per-product API_60 override that forces the plan's density calc heavier
  // when the driver chose "Safest"/"Safe" for a stale product at LOAD time.
  // Empty = use the normal last-observed/reference density (the "Ignore"
  // choice, and every product with a fresh reading). Cleared whenever the
  // Loading modal closes so it can never leak into the planner view.
  const [apiSafetyOverride, setApiSafetyOverride] = useState<Record<string, number>>({});
  // Per-product driver-tuned observed API + the temp it was read at, entered in
  // Plan Review's Tune panel. When present it OVERRIDES the density basis for
  // that product (see lbsPerGalForProductId's first branch), so tuning
  // recomputes planned gallons live; onTuneProduct also writes the submission
  // inputs (productInputs) so the logged weight matches what the driver tuned.
  // Cleared when the Loading modal closes (same as apiSafetyOverride).
  const [tunedApiTempByProduct, setTunedApiTempByProduct] = useState<Record<string, { api: number; tempF: number }>>({});
  // The stale-API decision overlay's own open state + which products it lists.
  const [staleApiPrompt, setStaleApiPrompt] = useState<{ products: StaleProduct[] } | null>(null);
  // Deferred begin: a choice sets the override AND flips this true; an effect
  // then begins the load on the NEXT render, once planRows has recomputed
  // against the new override (see the effect below -- begins with fresh
  // planRows, not the stale pre-override closure).
  const [beginAfterOverride, setBeginAfterOverride] = useState(false);

  // ── Action row state ────────────────────────────────────────────────────────
  // activeSlotLetter mirrors PresetDial's own (cosmetic) centered/last-tapped
  // slot, so "Save plan {letter}" always names the right preset. selectedComp
  // is which compartment bar was last tapped (tapping a bar now selects it
  // instead of opening the product picker directly -- the picker only opens
  // via the "Edit Comp N Product" action button, per the design handoff).
  const [activeSlotLetter, setActiveSlotLetter] = useState(1);
  // activeSlotLetter is the plan letter on screen, and it's what gets tagged
  // onto load_log.plan_slot. There is always one (default A), so every load
  // is tagged with a preset. (A separate "lastLoadedSlot", set only by an
  // explicit preset tap, used to do the tagging -- left over from the swipe
  // dial, where scrolling moved the letter. With the dial gone it only meant
  // a load logged after a refresh or a save-into-empty-slot was tagged null
  // while a letter was showing, and the next plan came back with every
  // compartment pinned at last load's gallons. Found live 2026-10-09.)
  const [selectedComp, setSelectedComp] = useState<number | null>(null);
  // Fired by usePlanSlots whenever slot 0 restores from a genuine local
  // draft -- restores the plan-letter highlight from whatever that draft's
  // own activeSlot says was on screen right before the refresh. This is
  // now the ONLY thing that sets activeSlotLetter on mount
  // -- the sibling "fall back to the last COMPLETED load's plan_slot"
  // effect that used to also feed these (and passively surfaced "last
  // load" info on the Planner page) was removed entirely per explicit
  // direction: no last-load info anywhere on this page anymore.
  const handlePlanRestored = useCallback((slot: number | null) => {
    if (slot != null) setActiveSlotLetter(slot);
  }, []);
  // Real bug found via a live debug capture: the "initialize compPlan
  // entries when compartments change" effect below fills in a blank entry
  // for any real compartment that doesn't have one yet -- fine for a
  // genuinely fresh combo, but if it runs BEFORE usePlanSlots' own
  // mount-time restore has had a chance to apply the real saved plan
  // (e.g. compartments happen to resolve before the combo does), it seeds
  // an all-blank compPlan, which the debounced autosave can then persist,
  // permanently clobbering a real saved plan with an empty one the next
  // time this combo loads. Gates that effect until usePlanSlots signals
  // its own restore attempt (successful or not) has already happened for
  // the current combo -- reset on every combo change so it re-gates for
  // the next one, not left permanently true from a previous combo.
  const [planRestoreAttempted, setPlanRestoreAttempted] = useState(false);
  const handleRestoreAttempted = useCallback(() => {
    setPlanRestoreAttempted(true);
  }, []);
  // "Recall Last Load" found a completed load at this terminal, but under
  // different equipment than what's currently selected -- per explicit
  // follow-up. See handleRecallLastLoad/handleViewAltLoadInReports below.
  // Purely informational (links to the load's read-only report view) --
  // never claims/switches equipment, see handleViewAltLoadInReports' own
  // comment for why.
  const [altEquipmentPrompt, setAltEquipmentPrompt] = useState<{ loadId: string; truckLabel: string; trailerLabel: string } | null>(null);

  // ── Feature hooks ──────────────────────────────────────────────────────────
  // equipment/location/terminals come from the shared shell context (see above).

  // Resolve timezone after both hooks exist
  // ── Compartments ───────────────────────────────────────────────────────────
  const [compartments, setCompartments] = useState<CompRow[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  const selectedTrailerId = equipment.selectedCombo?.trailer_id ?? null;

  useEffect(() => {
    (async () => {
      setCompError(null);
      setCompartments([]);
      if (!selectedTrailerId) return;
      setCompLoading(true);
      const { data, error } = await supabase
        .from("trailer_compartments")
        .select("trailer_id, comp_number, max_gallons, cap_gallons, position, active")
        .eq("trailer_id", selectedTrailerId)
        .order("comp_number", { ascending: true });
      if (error) { setCompError(error.message); setCompartments([]); }
      else { setCompartments(((data ?? []) as CompRow[]).filter((c) => c.active !== false)); }
      setCompLoading(false);
    })();
  }, [selectedTrailerId]);

  // ── Equipment details (truck/trailer name + make, for the Equipment info card) ──
  const [equipmentDetails, setEquipmentDetails] = useState({ truckName: "", truckMake: "", trailerName: "", trailerMake: "" });
  const selectedTruckId = equipment.selectedCombo?.truck_id ?? null;

  useEffect(() => {
    (async () => {
      if (!selectedTruckId && !selectedTrailerId) {
        setEquipmentDetails({ truckName: "", truckMake: "", trailerName: "", trailerMake: "" });
        return;
      }
      const [truckRes, trailerRes] = await Promise.all([
        selectedTruckId ? supabase.from("trucks").select("truck_name, make").eq("truck_id", selectedTruckId).maybeSingle() : Promise.resolve({ data: null }),
        selectedTrailerId ? supabase.from("trailers").select("trailer_name, make").eq("trailer_id", selectedTrailerId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setEquipmentDetails({
        truckName: (truckRes as any)?.data?.truck_name ?? "",
        truckMake: (truckRes as any)?.data?.make ?? "",
        trailerName: (trailerRes as any)?.data?.trailer_name ?? "",
        trailerMake: (trailerRes as any)?.data?.make ?? "",
      });
    })();
  }, [selectedTruckId, selectedTrailerId]);

  // ── Saddle-tank size for the Load Report's fuel-burn correction ──
  // Its own query, deliberately NOT added to the equipmentDetails select above:
  // if the fuel_tank_gallons migration hasn't run, a missing column 400s the
  // WHOLE query (this repo's stale-column bug class), which would blank the
  // truck name too. This one just fails to null.
  const [fuelTankGallons, setFuelTankGallons] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFuelTankGallons(null);
    if (!selectedTruckId) return;
    (async () => {
      const { data, error } = await supabase.from("trucks").select("fuel_tank_gallons").eq("truck_id", selectedTruckId).maybeSingle();
      if (cancelled || error) return;
      const v = Number((data as any)?.fuel_tank_gallons);
      setFuelTankGallons(Number.isFinite(v) && v > 0 ? v : null);
    })();
    return () => { cancelled = true; };
  }, [selectedTruckId]);

  const saveFuelTankGallons = useCallback(async (gallons: number) => {
    if (!selectedTruckId) throw new Error("No truck selected");
    // .select() so an RLS-filtered update (0 rows, no error) is caught instead
    // of looking like a save.
    const { data, error } = await supabase.from("trucks").update({ fuel_tank_gallons: gallons }).eq("truck_id", selectedTruckId).select("truck_id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("not allowed to edit this truck");
    setFuelTankGallons(gallons);
  }, [selectedTruckId]);

  // ── Terminal products ──────────────────────────────────────────────────────
  const [terminalProductsRaw, setTerminalProducts] = useState<ProductRow[]>([]);
  const { data: catalogProducts } = useProductsCatalog();
  // The Plan page needs no terminal: it lays plans out from the whole catalog
  // at each product's published minimum API (heaviest) and 60 F, so there is
  // always an example layout. Plan Review / loading, which run over other
  // screens, keep using the selected terminal's own products and readings.
  const planCatalogProducts = useMemo(
    () => (catalogProducts ?? [])
      .filter((p) => p.active !== false && p.api_60 != null && p.alpha_per_f != null)
      .map((p) => ({ ...p, last_api: null, last_temp_f: null, last_api_updated_at: null, min_api_observed: null })) as unknown as ProductRow[],
    [catalogProducts],
  );
  const terminalProducts = useMemo(() => (active ? planCatalogProducts : terminalProductsRaw), [active, planCatalogProducts, terminalProductsRaw]);

  // Extract terminal products fetch as a named callback so it can be called post-load.
  //
  // Reads rack_product_status only -- every terminal always has at least
  // one rack now (auto-named "Main Rack" for terminals that never touched
  // the Terminal tab, see the "unify_terminals_onto_racks" migration), so
  // there's no more terminal-wide-pool-with-optional-rack-override dual
  // path: a rack IS the terminal's product list and reference reading, full
  // stop. Waits for location.selectedRackId to resolve (chooseTerminal sets
  // it async, right after selectedTerminalId) rather than reading anything
  // terminal-scoped in the meantime -- a brief empty list while it resolves
  // beats a stale/wrong terminal's data flashing first.
  const fetchTerminalProducts = useCallback(async () => {
    if (!location.selectedTerminalId || !location.selectedRackId) { setTerminalProducts([]); return; }
    const { data, error } = await supabase
      .from("rack_product_status")
      .select(`active, last_api, last_temp_f, updated_at, min_api_observed,
        products (product_id, product_name, display_name, description, product_code, button_code, hex_code, api_60, alpha_per_f, api_min, api_max, un_number, is_dyed, canonical_product_id)`)
      .eq("rack_id", location.selectedRackId);
    if (error) { setTerminalProducts([]); return; }
    // Stats lookup by product_id across ALL rows on this rack (not just
    // active ones) -- a rack-injected-variance product (e.g. dyed diesel)
    // pools its tracking onto the canonical product's row, which needs to
    // be found here even if the canonical product itself isn't separately
    // offered/active on this rack's driver-facing list.
    const statsByProductId: Record<string, { last_api: number | null; last_api_updated_at: string | null; last_temp_f: number | null; last_loaded_at: string | null; min_api_observed: number | null }> = {};
    for (const row of (data ?? []) as any[]) {
      const pid = row.products?.product_id;
      if (!pid) continue;
      statsByProductId[pid] = {
        last_api: row.last_api ?? null,
        last_api_updated_at: row.updated_at ?? null,
        last_temp_f: row.last_temp_f ?? null,
        last_loaded_at: row.updated_at ?? null,
        min_api_observed: row.min_api_observed ?? null,
      };
    }

    const products = (data ?? []).filter((row: any) => row.active !== false)
      .map((row: any) => {
        if (!row.products) return null;
        const own = statsByProductId[row.products.product_id];
        const canonicalId = row.products.canonical_product_id as string | null | undefined;
        const stats = (canonicalId && statsByProductId[canonicalId]) ? statsByProductId[canonicalId] : own;
        return { ...row.products, ...stats };
      })
      .filter(Boolean);
    setTerminalProducts(products as ProductRow[]);
  }, [location.selectedTerminalId, location.selectedRackId]);

  // Rack's own name, for ManageTerminalProductsModal's "Active products at
  // {terminal} — {rack}" label (hidden there for the generic "Main Rack"
  // default). Cheap, separate fetch rather than piggybacking on
  // shell.rackPickerRacks -- that list only exists transiently while the
  // rack-select sheet is open, not for whatever rack ends up selected.
  const [selectedRackName, setSelectedRackName] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!location.selectedRackId) { setSelectedRackName(undefined); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("terminal_racks")
        .select("rack_name")
        .eq("rack_id", location.selectedRackId)
        .maybeSingle();
      if (!cancelled) setSelectedRackName((data as any)?.rack_name ?? undefined);
    })();
    return () => { cancelled = true; };
  }, [location.selectedRackId]);

  useEffect(() => { fetchTerminalProducts(); }, [fetchTerminalProducts]);

  // ── Planning inputs ────────────────────────────────────────────────────────
  // ── Persisted plan state — survives page refresh ─────────────────────────
  // All initialized to defaults; hydrated from localStorage in useEffect after mount
  // (avoids SSR hydration mismatch — localStorage is client-only)
  const [tempF, setTempFRaw] = useState<number>(60);

  // Per-product planned temp -- split load (e.g. diesel + regular in the same
  // trailer) genuinely have different temps (different tanks), so a single
  // shared tempF was wrong the moment more than one product was in the plan.
  // tempF is kept as the dial's own "reference" value; every existing way of
  // moving it (drag, type-in, quick +/-, snap buttons) now also shifts every
  // product's own temp by the same delta, applied once here so none of those
  // call sites needed to change. Setting one product directly (tapping its
  // row in the modal) bypasses this and only touches that product -- see
  // setSingleProductTempF below. Deliberately NOT persisted to localStorage
  // like tempF is -- same "always re-seeded from the live prediction, never
  // restored from a snapshot" rule tempF itself already follows.
  const [productTempF, setProductTempF] = useState<Record<string, number>>({});

  // Kept in sync synchronously (not via a useEffect) so setTempF can always
  // read "prev" without nesting a second setState call inside setTempFRaw's
  // own updater. That nested-call version worked in production but silently
  // double-applied the delta in dev: React 18 StrictMode double-invokes
  // updater functions to catch impure ones, and an updater that calls
  // setProductTempF as a side effect isn't pure -- both invocations actually
  // fired the nested update, doubling the shift. Caught this live testing
  // the split-load dial (a single +5.8° drag was landing as +11.6°).
  const tempFRef = useRef(60);

  const setTempF = useCallback((v: number | ((prev: number) => number)) => {
    const prev = tempFRef.current;
    const next = typeof v === "function" ? v(prev) : v;
    const delta = Math.round((next - prev) * 10) / 10;
    tempFRef.current = next;
    if (delta !== 0) {
      setProductTempF((prevProd) => {
        if (Object.keys(prevProd).length === 0) return prevProd;
        const out: Record<string, number> = {};
        for (const [pid, val] of Object.entries(prevProd)) out[pid] = Math.round((val + delta) * 10) / 10;
        return out;
      });
    }
    try { localStorage.setItem("protankr_tempF_v1", String(next)); } catch {}
    setTempFRaw(next);
  }, []);

  // Safety net for the one path that sets tempF directly (localStorage
  // hydration on mount, below) instead of through setTempF -- keeps the ref
  // truthful even then, so a delta computed right after mount is never based
  // on the stale initial 60 default.
  useEffect(() => { tempFRef.current = tempF; }, [tempF]);

  const setSingleProductTempF = useCallback((productId: string, value: number) => {
    setProductTempF((prev) => ({ ...prev, [productId]: Math.round(value * 10) / 10 }));
  }, []);

  const [cgSlider, setCgSliderRaw] = useState<number>(0.5);
  const setCgSlider = useCallback((v: number | ((prev: number) => number)) => {
    setCgSliderRaw(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem("protankr_cgSlider_v1", String(next)); } catch {}
      return next;
    });
  }, []);

  // Real bug found chasing a "plan toggles between the last two setups on
  // every refresh" report: this used to be a SECOND, fully independent
  // compPlan cache, keyed per combo+TERMINAL (`protankr_compPlan_v1:{combo}
  // :{terminal}`) and hydrated by its own effect below -- a leftover from
  // before usePlanSlots' slot 0 became the combo-scoped, terminal-
  // independent source of truth for the live plan (see that file's own
  // 2026-08-27 "one setup persists across all terminals" rework). Nothing
  // ever removed this parallel system when that landed, so BOTH restores
  // fired on every mount -- and because this one's own key depends on the
  // TERMINAL resolving (not just the combo), it frequently finished AFTER
  // usePlanSlots' own restoreLivePlan effect had already correctly applied
  // the right plan, silently overwriting it with whatever this terminal's
  // own stale, terminal-scoped cache happened to hold. That's the literal
  // "toggles between two plans" symptom: which one won was purely a
  // function of which terminal you'd last used, and exactly when its
  // hydration effect happened to resolve relative to usePlanSlots' own.
  // usePlanSlots already owns save/restore for this entirely now -- no
  // separate key, no separate hydration effect needed here at all.
  const [compPlan, setCompPlan] = useState<Record<number, CompPlanInput>>({});

  // Shares "what's the driver actually planning to load" up into the shell
  // context -- the terminal outage banner (mounted in the shared header,
  // visible on every tab) filters to only relevant reports off this, per
  // explicit direction ("only want to show people it is out of product or
  // out of allocation if they are trying to load that specific product").
  //
  // Guarded to only push a NEW state update when the actual set of product
  // ids changes, not on every compPlan object change (cap-override edits,
  // fill-level drags, etc. all change compPlan's reference without
  // changing which products are selected) -- CalculatorShellContext's own
  // `value` object is a plain literal, not memoized, so any state update
  // there re-renders the whole shell tree; pushing on every compPlan
  // change would have made that re-render fire far more often than
  // before this feature existed, on every keystroke-level plan edit.
  const plannedProductIdsSigRef = useRef<string>("");
  useEffect(() => {
    const ids = Array.from(new Set(
      Object.values(compPlan)
        .filter((c) => !c.empty && c.productId)
        .map((c) => c.productId)
    )).sort();
    const sig = ids.join(",");
    if (sig === plannedProductIdsSigRef.current) return;
    plannedProductIdsSigRef.current = sig;
    shell.setPlannedProductIds(new Set(ids));
  }, [compPlan, shell.setPlannedProductIds]);

  // "Save plan {letter}" is dirty-tracked against a baseline snapshot taken
  // right after the last load/save -- it only shows when the current plan
  // actually diverges from what's saved, and hides itself immediately after
  // a successful save (per explicit feedback: no button when there's nothing
  // new to save). Covers everything buildSnapshot()/saveToSlot() actually
  // persist -- product selection + empty flag + cap override per comp, and
  // the CG slider -- not just cap overrides, so picking a different product
  // or sliding CG also surfaces the button.
  const overridesSnapshot = useCallback((plan: Record<number, CompPlanInput>, cg: number) => {
    const comps: Record<number, { productId: string; empty: boolean; capOverride: number | null }> = {};
    for (const k of Object.keys(plan || {})) {
      const v = (plan as any)[k] ?? {};
      comps[Number(k)] = {
        productId: v.productId ?? "",
        empty: !!v.empty,
        capOverride: v.capOverride ?? null,
      };
    }
    return JSON.stringify({ comps, cg: Math.round((Number(cg) || 0) * 1000) / 1000 });
  }, []);
  // Lazy initializer (not a literal "{}") so the baseline matches whatever
  // compPlan/cgSlider actually start as -- broadening the snapshot to include
  // productId/empty/cg means a hardcoded "{}" no longer matches an empty
  // plan's real serialized shape, which made "Save plan" appear spuriously
  // on a completely fresh mount.
  const [baselineOverrides, setBaselineOverrides] = useState(() => overridesSnapshot(compPlan, cgSlider));
  const [captureBaselineNext, setCaptureBaselineNext] = useState(false);
  // Which preset slot (1-5) the action sheet is open for, if any -- set by
  // PresetQuickPick's long-press on a filled row (same reuse the sheet's
  // predecessor, the swipeable PresetDial, already established).
  const [presetSheetSlot, setPresetSheetSlot] = useState<number | null>(null);
  // Opens PresetQuickPick -- the plan-letter icon's tap target, replacing
  // the old dial entirely.
  const [presetQuickPickOpen, setPresetQuickPickOpen] = useState(false);

  // Fires once compPlan has actually re-rendered post-load (loadFromSlot
  // applies asynchronously via the hook's own setCompPlan), so the baseline
  // reflects what was really loaded, not what was on screen before it.
  //
  // Re-captures on every compPlan/cgSlider change while the flag is set,
  // and only clears it after a short quiet period (debounced, same idea as
  // usePlanSlots' own 350ms autosave debounce) rather than immediately on
  // the first change. usePlanSlots' automatic restores (slot-0-on-terminal-
  // change, last-load-from-log-on-combo-claim) hit the DB first and call
  // setCompPlan/setCgSlider only once that resolves -- consuming the flag
  // on the very next render (the pre-restore value) meant the baseline got
  // locked in *before* the real restore landed, so the button showed
  // "dirty" the instant equipment/terminal was picked, before the user had
  // touched anything.
  useEffect(() => {
    if (!captureBaselineNext) return;
    setBaselineOverrides(overridesSnapshot(compPlan, cgSlider));
    const t = setTimeout(() => setCaptureBaselineNext(false), 600);
    return () => clearTimeout(t);
  }, [compPlan, cgSlider, captureBaselineNext, overridesSnapshot]);

  // Terminal/combo switches trigger usePlanSlots' own automatic restores
  // (slot-0-on-terminal-change, last-load-from-log-on-combo-claim) -- those
  // land asynchronously via that hook's own setCompPlan/setCgSlider calls,
  // not through the explicit "Load {letter}" path. Reuse the same
  // captureBaselineNext mechanism so the baseline is recaptured once that
  // restore actually lands, instead of comparing against pre-restore state.
  useEffect(() => {
    setCaptureBaselineNext(true);
  }, [location.selectedTerminalId, equipment.selectedComboId]);

  // Hydrate tempF and cgSlider once on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem("protankr_tempF_v1");
      if (t != null && Number.isFinite(Number(t))) setTempFRaw(Number(t));
      const cg = localStorage.getItem("protankr_cgSlider_v1");
      if (cg != null && Number.isFinite(Number(cg))) setCgSliderRaw(Number(cg));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing else clears compPlan when equipment is deselected --
  // usePlanSlots' own restoreLivePlan/comboClaim effects only ever run
  // while a real combo IS selected (both start with `if (!selectedComboId)
  // return`), so this is the one remaining job the old hydration effect
  // above did that still needs doing.
  useEffect(() => {
    if (!equipment.selectedComboId) setCompPlan({});
  }, [equipment.selectedComboId]);
  // Re-gate the compartments-init effect below for every new combo -- see
  // planRestoreAttempted's own declaration for why it must wait for
  // usePlanSlots' restore attempt before seeding blank comp entries.
  useEffect(() => {
    setPlanRestoreAttempted(false);
  }, [equipment.selectedComboId]);
  const [productInputs, setProductInputs] = useState<Record<string, { api?: string; tempF?: number }>>({});
  // Named (not inline) so the mid-load terminal-switch handlers further
  // down can call these imperatively too, not just pass them as JSX props
  // to LoadingModal (which is all these ever were before the 2026-09-05
  // terminal-switch feature needed to write into productInputs from
  // outside a render).
  const setProductApi = useCallback((productId: string, api: string) => {
    setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), api } }));
  }, []);
  const setProductTemp = useCallback((productId: string, tempFVal: number) => {
    setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), tempF: tempFVal } }));
  }, []);

  // Fuel temp prediction — drives temp button border color and pre-fills ProductTempModal.
  //
  // City/state only -- the server resolves its own fresh ambient + city-level
  // coordinates (see /api/fuel-temp), never trusting a client-supplied value.
  // terminalId is passed through only for the per-terminal bias lookup. The
  // modal below shows this hook's own resolved ambientNowF, not a separately
  // polled value, so the displayed label and the predicted temp can never
  // drift apart (see fuelTempPredictor.ts / route.ts for the fuller history
  // of why this matters -- an earlier version of this app tracked ambient
  // per-terminal and once had 3 terminals silently resolving to (0,0)).
  const {
    predictedFuelTempF, confidence: fuelTempConfidence, loading: fuelTempLoading,
    ambientNowF: fuelTempAmbientF,
    unbiasedPredictionF: fuelTempUnbiasedF,
    refresh: refreshFuelTemp,
  } = useFuelTempPrediction({
    city: location.selectedCity || null,
    state: location.selectedState || null,
    terminalId: location.selectedTerminalId || null,
  });

  // Auto-apply prediction to the slider when it first arrives.
  // userAdjustedTempRef = true means the driver has manually moved the slider.
  // Resets whenever city/state changes so a new terminal gets a fresh auto-apply.
  const predAppliedForRef = useRef<string>("");
  const userAdjustedTempRef = useRef<boolean>(false);

  // Mark as user-adjusted whenever tempF changes AFTER a prediction has been
  // applied. Real bug fixed here: this used to check only whether
  // predAppliedForRef was non-empty -- but the auto-apply effect below sets
  // that ref in the SAME tick it calls setTempF, so this effect's own next
  // run (triggered by that very auto-apply) always saw a non-empty ref and
  // incorrectly marked the auto-apply's own change as a manual edit. That
  // permanently blocked ANY future re-application of a fresh prediction for
  // that city/state -- confirmed live, this is why the modal could show a
  // newer number than the button/load payload ever received. Now compares
  // the new value against the prediction itself: only a change that doesn't
  // match the last-known prediction counts as a genuine manual edit.
  const prevTempFRef = useRef<number>(tempF);
  useEffect(() => {
    if (Math.abs(tempF - prevTempFRef.current) > 0.1) {
      const matchesPrediction = predictedFuelTempF != null && Math.abs(tempF - predictedFuelTempF) < 0.1;
      if (predAppliedForRef.current !== "" && !matchesPrediction) {
        userAdjustedTempRef.current = true;
      }
    }
    prevTempFRef.current = tempF;
  }, [tempF, predictedFuelTempF]);

  // Reset on city/state change
  useEffect(() => {
    predAppliedForRef.current = "";
    userAdjustedTempRef.current = false;
    prevTempFRef.current = tempF;
  }, [location.selectedCity, location.selectedState]);

  // Setup Guide checklist's "switch to a terminal in a different city"
  // sub-task -- see utils/locationSwitchProgress.ts's own header comment
  // for why this is a write-once flag, not derived fresh from live state
  // the way the rest of the checklist is.
  useEffect(() => {
    recordLocationForSwitchTracking(effectiveUserId, location.selectedState, location.selectedCity);
  }, [effectiveUserId, location.selectedState, location.selectedCity]);

  // Apply prediction to slider when it arrives -- skip if the driver has
  // genuinely adjusted it since. Previously this stopped re-applying the
  // instant predAppliedForRef matched the current city/state key, even if
  // a LATER fetch (e.g. the periodic refresh in useFuelTempPrediction.ts)
  // returned a materially different number -- meaning a driver who left
  // the app open all day could keep seeing a temp from hours earlier even
  // though the modal's own banner (which reads predictedFuelTempF
  // directly, bypassing this effect) had already moved on. Now re-checks
  // the actual value each time, so any later fetch with a real delta still
  // lands on the button/load payload, not just the modal.
  useEffect(() => {
    if (predictedFuelTempF == null) return;
    if (userAdjustedTempRef.current) return;
    if (Math.abs(tempF - predictedFuelTempF) < 0.1) return;
    setTempF(predictedFuelTempF);
    predAppliedForRef.current = `${location.selectedCity}|${location.selectedState}`;
  }, [predictedFuelTempF, location.selectedCity, location.selectedState, tempF]);

  // Initialize compPlan entries when compartments change (adds a blank
  // entry for a real compartment that doesn't have one yet, drops any
  // entry for a compartment that no longer exists) -- built on top of
  // whatever compPlan already is, which usePlanSlots' own restore effects
  // are solely responsible for populating now (see compPlan's own
  // declaration above). Gated on planRestoreAttempted (see its own
  // declaration) so this can never seed blank entries -- which the
  // debounced autosave would then persist -- before usePlanSlots has had
  // its own chance to restore the real saved plan for this combo.
  useEffect(() => {
    if (!planRestoreAttempted) return;
    setCompPlan((prev: Record<number, CompPlanInput>) => {
      const next = { ...prev };
      for (const c of compartments) {
        const n = Number(c.comp_number);
        if (!Number.isFinite(n)) continue;
        if (!next[n]) next[n] = { empty: false, productId: "" };
      }
      // Real bug found via a live debug capture: `compartments` itself
      // starts as [] every time the trailer changes and only gets its real
      // rows once its OWN separate fetch effect resolves (see the
      // "Compartments" fetch above) -- a async gap that has nothing to do
      // with planRestoreAttempted. This effect can genuinely run with
      // compartments still empty even AFTER a real restore has landed (the
      // restore's own setCompPlan flips planRestoreAttempted true, which
      // re-triggers this effect immediately, often before the compartments
      // fetch has finished). Deleting "stale" entries against a transiently
      // empty compartments array wiped out a plan that had JUST been
      // restored, in the exact sequence a real capture showed: this ran
      // once with compartments=0 (deleting all 3 just-restored entries),
      // then again moments later once compartments genuinely loaded --
      // rebuilding them as blank instead of recovering what had just been
      // deleted. Only prune once there's a REAL, loaded compartment list to
      // compare against; an empty compartments array means "don't know
      // yet," not "this trailer has none" -- leaves compPlan untouched
      // rather than guessing.
      if (compartments.length > 0) {
        for (const key of Object.keys(next)) {
          const n = Number(key);
          if (!compartments.some((c) => Number(c.comp_number) === n)) delete next[n];
        }
      }
      return next;
    });
  }, [compartments, planRestoreAttempted]);

  // ── CG bias ────────────────────────────────────────────────────────────────
  const cgBias = useMemo(() => cgSliderToBias(cgSlider), [cgSlider]);
  const unstableLoad = cgSlider < CG_NEUTRAL;

  // ── Cap helpers ────────────────────────────────────────────────────────────
  // cap_gallons (configured in Binder's Compartments section) is the real
  // ceiling used for load planning -- max_gallons is informational only.
  // compPlan[n].capOverride is a temporary, per-load reduction on top of
  // that cap (never above it), set by dragging a compartment's handle in
  // the planner; clearing it restores the full configured cap.
  const persistedCapForComp = useCallback((compNumber: number) => {
    const c = compartments.find((x) => Number(x.comp_number) === compNumber);
    if (!c) return 0;
    const cap = c.cap_gallons != null ? Number(c.cap_gallons) : Number(c.max_gallons ?? 0);
    return Number.isFinite(cap) ? Math.max(0, cap) : 0;
  }, [compartments]);

  const effectiveMaxGallonsForComp = useCallback((compNumber: number, persistedCap: number) => {
    const override = compPlan[compNumber]?.capOverride;
    if (override == null) return Math.max(0, Math.floor(persistedCap));
    return Math.max(0, Math.floor(Math.min(Number(override), persistedCap)));
  }, [compPlan]);

  // Compartments the driver has capped below their configured safety cap
  // (comp -> cap gallons), for Plan Review's CAPPED tag.
  const capOverridesForReview = useMemo(() => {
    const out: Record<number, number> = {};
    for (const c of compartments) {
      const n = Number(c.comp_number);
      const override = compPlan[n]?.capOverride;
      if (override == null || !Number.isFinite(Number(override))) continue;
      const persisted = persistedCapForComp(n);
      if (Number(override) < persisted) out[n] = Math.floor(Number(override));
    }
    return out;
  }, [compartments, compPlan, persistedCapForComp]);

  // ── lbs/gal helper ────────────────────────────────────────────────────────
  // True if any planned compartment is using the fallback reference API (no driver-observed last_api)
  const planUsesReferenceApi = useMemo(() => {
    return Object.values(compPlan).some((slot) => {
      if (!slot || slot.empty || !slot.productId) return false;
      const p = terminalProducts.find((p) => p.product_id === slot.productId);
      return p != null && (p.last_api == null || !Number.isFinite(Number(p.last_api)));
    });
  }, [compPlan, terminalProducts]);

  // The one API basis per product (see apiBasis.ts for the rules). Density,
  // the Tune line and the Log the Load prefill all read this, so they can't
  // disagree. Order: the driver's tune, then a stale-API choice made at LOAD
  // (Safest / Safe / Ignore), then the normal rules.
  const apiBasisForProduct = useCallback((productId: string) => {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.api_60 == null || p.alpha_per_f == null) return null;
    const basis = resolveApiBasis({
      alphaPerF: Number(p.alpha_per_f),
      api60Ref: Number(p.api_60),
      apiMin: p.api_min != null ? Number(p.api_min) : null,
      minApiObserved: (p as any).min_api_observed != null ? Number((p as any).min_api_observed) : null,
      lastApi: p.last_api != null ? Number(p.last_api) : null,
      lastTempF: p.last_temp_f != null ? Number(p.last_temp_f) : null,
      lastApiUpdatedAt: (p as any).last_api_updated_at ?? null,
      tuned: active ? null : (tunedApiTempByProduct[productId] ?? null),
      nowMs: Date.now(),
    });
    const overrideApi60 = apiSafetyOverride[productId];
    if (!active && basis.tier !== "tuned" && overrideApi60 != null && Number.isFinite(overrideApi60)) {
      return { ...basis, api60: Number(overrideApi60), displayApi: Number(overrideApi60) };
    }
    return basis;
  }, [terminalProducts, apiSafetyOverride, tunedApiTempByProduct, active]);

  const lbsPerGalForProductId = useCallback((productId: string): number | null => {
    const p = terminalProducts.find((x) => x.product_id === productId);
    const basis = apiBasisForProduct(productId);
    if (!p || !basis) return null;
    // A tuned reading is density at the temp it was read at; otherwise at
    // this product's planned temp.
    const tuned = tunedApiTempByProduct[productId];
    const t = active ? 60 : basis.tier === "tuned" && tuned ? Number(tuned.tempF) : (productTempF[productId] ?? tempF);
    return lbsPerGallonAtTemp(basis.api60, Number(p.alpha_per_f), t);
  }, [terminalProducts, tempF, productTempF, apiBasisForProduct, tunedApiTempByProduct, active]);

  // ── Active compartments ────────────────────────────────────────────────────
  const activeComps = useMemo<ActiveComp[]>(() => {
    if (!selectedTrailerId || compartments.length === 0 || terminalProducts.length === 0) return [];
    const out: ActiveComp[] = [];
    for (const c of compartments) {
      const compNumber = Number(c.comp_number);
      const persistedCap = persistedCapForComp(compNumber);
      const maxGallons = effectiveMaxGallonsForComp(compNumber, persistedCap);
      const position = -(Number(c.position ?? 0)); // DB +position = REAR → flip to FRONT
      if (!Number.isFinite(compNumber) || maxGallons <= 0) continue;
      const sel = compPlan[compNumber];
      if (!sel || sel.empty || !sel.productId) continue;
      const lbsPerGal = lbsPerGalForProductId(sel.productId);
      if (lbsPerGal == null || !(lbsPerGal > 0)) continue;
      out.push({ compNumber, maxGallons, position: Number.isFinite(position) ? position : 0, productId: sel.productId, lbsPerGal });
    }
    out.sort((a, b) => a.position - b.position);
    return out;
  }, [selectedTrailerId, compartments, terminalProducts, compPlan, tempF, apiSafetyOverride, lbsPerGalForProductId]);

  // Seed productTempF for any planned product that doesn't have an entry yet
  // (new product just added to the plan), and drop entries for products no
  // longer in the plan. New products seed to the CURRENT dial value (tempF)
  // -- not the raw prediction -- so a product added after the driver has
  // already nudged the dial away from the prediction picks up that nudge
  // too, instead of jumping back to the un-adjusted number.
  const plannedProductIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of activeComps) if (c.productId) s.add(c.productId);
    return s;
  }, [activeComps]);

  useEffect(() => {
    setProductTempF((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const pid of plannedProductIds) {
        if (!(pid in next)) { next[pid] = tempF; changed = true; }
      }
      for (const pid of Object.keys(next)) {
        if (!plannedProductIds.has(pid)) { delete next[pid]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [plannedProductIds, tempF]);

  // ── Second pickup on a partly loaded trailer ───────────────────────────────
  // Added from the Driver Dashboard ("+ Another pickup") with the empty
  // compartments it fills (trip_pickups.planned_comps). Here the Planner
  // plans only those compartments, and what's already aboard counts as part
  // of the tare, so the plan fills the rest up to the target and the gross
  // includes everything on the trailer.
  const tripStoreHook = useTripStore(effectiveUserId || null);
  const tripPartial = useMemo(() => {
    if (!effectiveUserId) return null;
    const rows = tripStoreHook.state.rows;
    const trip = openTripForDriver(Object.values(rows.trips ?? {}) as TripRow[], effectiveUserId);
    if (!trip) return null;
    const pk = (Object.values(rows.trip_pickups ?? {}) as TripPickupRow[])
      .filter((p) => p.trip_id === trip.trip_id && !p.left_at)
      .sort((a, b) => a.seq - b.seq)[0];
    const planned = pk ? readPlannedComps(pk.planned_comps) : null;
    if (!pk || !planned) return null;
    const aboard = (Object.values(rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[])
      .filter((c) => c.trip_id === trip.trip_id && c.pickup_id !== pk.pickup_id && c.disposition === "loaded");
    return { pickup: pk, planned, aboard };
  }, [effectiveUserId, tripStoreHook.state]);
  const onBoardLbs = useMemo(() => {
    if (!tripPartial) return 0;
    const alpha = (id: string | null) => {
      const p = id ? catalogProducts.find((x) => x.product_id === id) : null;
      return p?.alpha_per_f != null ? Number(p.alpha_per_f) : null;
    };
    return Math.round(productLbsOnBoard(tripPartial.aboard, alpha).lbs);
  }, [tripPartial, catalogProducts]);

  // Keep the plan to the picked compartments: those get a product (the one
  // picked on the dashboard unless the driver changes it), every other
  // compartment stays empty. Caps are left alone.
  useEffect(() => {
    if (!tripPartial || compartments.length === 0) return;
    const want = new Map(tripPartial.planned.map((p) => [p.comp_number, p.product_id]));
    setCompPlan((prev: Record<number, CompPlanInput>) => {
      let changed = false;
      const next: Record<number, CompPlanInput> = { ...prev };
      for (const c of compartments) {
        const n = Number(c.comp_number);
        if (!Number.isFinite(n)) continue;
        const cur = prev[n] ?? { empty: true, productId: "" };
        const pid = want.get(n);
        if (pid) {
          if (cur.empty || !cur.productId) { next[n] = { ...cur, empty: false, productId: pid }; changed = true; }
        } else if (!cur.empty || cur.productId) {
          next[n] = { ...cur, empty: true, productId: "" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tripPartial, compPlan, compartments]);

  // ── Weight limits ──────────────────────────────────────────────────────────
  // target_weight = the gross weight the driver is trying to hit (renamed from gross_limit_lbs)
  const targetWeight = Number((equipment.selectedCombo as any)?.target_weight ?? 0);
  // On a second pickup, product already aboard rides as tare.
  const tare = Number(equipment.selectedCombo?.tare_lbs ?? 0) + onBoardLbs;
  const allowedLbs = Math.max(0, targetWeight - tare);  // payload = target - tare

  const capacityGallonsActive = useMemo(
    () => activeComps.reduce((s, c) => s + Number(c.maxGallons || 0), 0),
    [activeComps]
  );

  // ── Plan rows (binary search) ──────────────────────────────────────────────
  const plannedResult = usePlanRows({ selectedTrailerId, activeComps, allowedLbs, cgBias, capacityGallonsActive, planForGallons });

  // ── Available capacity (payload utilization, Phase 1) ─────────────────────
  // A SECOND solve of the same plan, and the one real difference is the
  // ceiling it uses: activeComps above is built from
  // effectiveMaxGallonsForComp (the driver's own capOverride handle drag),
  // while this is built from persistedCapForComp (the admin-gated configured
  // cap). That substitution is the whole anti-gaming rule -- a driver
  // reducing their own ceiling is exactly what the metric exists to catch, so
  // it must not be able to shrink the denominator too. Everything else -- CG
  // bias, per-product density at the confirmed temp, positions, the weight
  // ceiling -- is identical, and both go through the same solveMaxGallons.
  //
  // Deliberately NOT read from incentive_settings: its target_gross_lbs
  // column doesn't exist until this pass's migration is applied, and adding
  // it to that fetch's select early would 400 the whole query and break the
  // existing incentive card (the same class of failure as the buffer_lbs
  // incident). The combo's own target_weight is the ceiling the Planner
  // already plans against anyway, so it is the honest number to measure
  // against; record_load_utilization resolves the same value server-side.
  const capacityCompartments = useMemo<CapacityCompartmentInput[]>(() => {
    if (!selectedTrailerId) return [];
    const out: CapacityCompartmentInput[] = [];
    for (const c of compartments) {
      const n = Number(c.comp_number);
      if (!Number.isFinite(n)) continue;
      const sel = compPlan[n];
      if (!sel || sel.empty || !sel.productId) continue;

      const persistedCap = persistedCapForComp(n);
      if (!(persistedCap > 0)) continue;

      const p = terminalProducts.find((x) => x.product_id === sel.productId);
      if (!p || p.api_60 == null || p.alpha_per_f == null) continue;

      out.push({
        comp_number: n,
        position: -(Number(c.position ?? 0)), // DB +position = REAR -> flip to FRONT
        cap_gallons: persistedCap,
        cap_override_gallons: sel.capOverride ?? null, // recorded, never used in the math
        product_id: sel.productId,
        api_60: Number(p.api_60),
        alpha_per_f: Number(p.alpha_per_f),
        observed_api: p.last_api != null ? Number(p.last_api) : null,
        observed_api_temp_f: p.last_temp_f != null ? Number(p.last_temp_f) : null,
        temp_f: productTempF[sel.productId] ?? tempF,
      });
    }
    return out;
  }, [selectedTrailerId, compartments, compPlan, terminalProducts, persistedCapForComp, productTempF, tempF]);

  const capacityResult = useMemo(
    () => computeAvailableCapacity({
      tare_lbs: tare,
      target_gross_lbs: targetWeight > 0 ? targetWeight : DEFAULT_COMPANY_TARGET_GROSS_LBS,
      legal_gross_lbs: DEFAULT_LEGAL_GROSS_LBS,
      cg_bias: cgBias,
      compartments: capacityCompartments,
    }),
    [tare, targetWeight, cgBias, capacityCompartments],
  );
  const planRows = plannedResult.planRows;

  const plannedGallonsByComp = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (const r of planRows as any[]) {
      const n = Number(r.comp_number ?? r.compNumber ?? 0);
      if (Number.isFinite(n)) m[n] = Number(r.planned_gallons ?? r.plannedGallons ?? 0);
    }
    return m;
  }, [planRows]);

  // ── Loading modal: Plan Review gallons override ─────────────────────────────
  // Isolated per-compartment override, applied AFTER planRows is already
  // computed -- deliberately NOT compPlan.capOverride, which feeds INTO
  // usePlanRows'/planForGallons's binary-search allocation and can cause
  // OTHER compartments to gain gallons to compensate (confirmed by reading
  // usePlanRows.ts -- it always maximizes total gallons under the weight
  // budget). Editing one compartment here changes only that compartment;
  // every other row is mathematically guaranteed untouched, even if that
  // leaves legal weight capacity unused (explicit product decision -- e.g.
  // reacting to a stale API by intentionally loading light on just that
  // compartment, not redistributing the "missing" gallons elsewhere).
  // Reset to {} on every fresh LOAD tap (see beginLoadToSupabase); never
  // persisted to compPlan or presets -- more ephemeral than capOverride
  // even (which is itself already excluded from saved presets).
  const [loadingGallonsOverride, setLoadingGallonsOverride] = useState<Record<number, number>>({});

  const effectivePlanRows = useMemo(() => {
    if (Object.keys(loadingGallonsOverride).length === 0) return planRows;
    return planRows.map((r) =>
      loadingGallonsOverride[r.comp_number] != null
        ? { ...r, planned_gallons: loadingGallonsOverride[r.comp_number] }
        : r
    );
  }, [planRows, loadingGallonsOverride]);

  const effectivePlannedWeightLbs = useMemo(
    () => effectivePlanRows.reduce((sum, r: any) => sum + Number(r.planned_gallons ?? 0) * Number(r.lbsPerGal ?? 0), 0),
    [effectivePlanRows]
  );
  const effectivePlannedGallonsTotal = effectivePlanRows.reduce((s, r) => s + r.planned_gallons, 0);

  // Live weight/diff shown in the Loading modal's Plan Review phase. This is
  // the PLAN's own solved weight (effectivePlannedWeightLbs = Σ gallons ×
  // each comp's solved lbsPerGal), which solveMaxGallons already caps at
  // allowedLbs (= target − tare), so a fresh plan's live weight can never
  // exceed target -- exactly the safety guarantee the driver expects.
  //
  // It deliberately does NOT recompute from productInputs here: API/temp are
  // now entered at Log the Load (a later step), so in Plan Review those are
  // just prefilled defaults. Recomputing with them re-derived density on a
  // different back-correction basis than the solve used (observed temp vs.
  // current temp), which made the preview drift HEAVIER than the plan and
  // read as "over target" on a plan that was actually under it. Using the
  // solved weight keeps the preview and the plan identical.
  const livePreviewGrossLbs = Number.isFinite(tare) ? tare + effectivePlannedWeightLbs : null;
  const livePreviewDiffLbs = livePreviewGrossLbs != null && targetWeight > 0 ? livePreviewGrossLbs - targetWeight : null;

  // ── Plan slots ─────────────────────────────────────────────────────────────
  // Must be declared BEFORE loadWorkflow so planSlots.refreshLastLoad is defined
  const planSlots = usePlanSlots({
    authUserId: effectiveUserId, selectedTerminalId: location.selectedTerminalId, selectedComboId: equipment.selectedComboId,
    tempF, compPlan, setCompPlan,
    cgSlider, setCgSlider,
    compartmentsLoaded: compartments.length > 0,
    activeSlotLetter,
    onPlanRestored: handlePlanRestored,
    onRestoreAttempted: handleRestoreAttempted,
  });

  // ── Load workflow ──────────────────────────────────────────────────────────
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of terminalProducts) { if (p.product_id) m.set(p.product_id, p.product_name ?? p.product_id); }
    return m;
  }, [terminalProducts]);

  // Shared by the PresetActionSheet summary and PresetQuickPick's per-row
  // summary (one implementation, not two copies -- this project has hit
  // real bugs before from exactly this kind of duplicated logic drifting
  // apart, e.g. CustomSelect.tsx/ServiceTypeManager.tsx's own precedent). A
  // preset saved at a different terminal may reference a product not sold
  // here, which productNameById (scoped to the *current* terminal) won't
  // resolve; surfaced honestly rather than silently dropped, since that's
  // exactly the mismatch the LOAD-blocking flow below also has to catch.
  const summaryForSlot = useCallback((slot: number) => {
    const snap = planSlots.peekSlot(slot);
    const plan = snap?.compPlan;
    if (!plan) return "Empty";
    const names = new Set<string>();
    let hasUnavailable = false;
    for (const v of Object.values(plan)) {
      if (!v || v.empty || !v.productId) continue;
      const name = productNameById.get(v.productId);
      if (name) names.add(name); else hasUnavailable = true;
    }
    const parts = Array.from(names);
    if (hasUnavailable) parts.push("unavailable product");
    return parts.length > 0 ? parts.join(", ") : "Empty";
  }, [planSlots, productNameById]);

  const presetSheetSummary = useMemo(() => {
    if (presetSheetSlot == null) return "";
    return summaryForSlot(presetSheetSlot);
  }, [presetSheetSlot, summaryForSlot]);

  // PresetQuickPick's per-row name -- direct peekSlot read, no memoization
  // needed (cheap localStorage read, same pattern peekSlot's own callers
  // already use elsewhere on this page).
  const nameForSlot = useCallback((slot: number) => planSlots.peekSlot(slot)?.name, [planSlots]);

  // PresetQuickPick's per-row colored-dot readout -- per explicit direction
  // ("instead of describing the plan just use colored dots for a quick
  // visual representation... the product selection, and each [compartment]")
  // -- reusing the same productColorFor family-coding the outage banner's
  // detail cards already use (diesel yellow / premium red / else white).
  // An empty compartment (or one with no product selected) renders black;
  // a compartment whose product isn't resolvable at the current terminal
  // (see summaryForSlot's own "unavailable product" case) still gets a
  // real dot -- productColorFor("") falls through to white -- rather than
  // silently disappearing from the readout.
  //
  // Iterates over the equipment's own real `compartments` list now, not
  // just whatever keys happen to exist in the saved plan snapshot -- per
  // explicit follow-up ("on this trailer, 3 comps, all plans should have
  // 3 dots"): a preset saved before this pass, or one whose snapshot never
  // recorded a since-added compartment, previously produced fewer dots
  // than the trailer actually has. Reading real compartment numbers
  // instead means the dot count can never drift from the truth, and a
  // missing plan entry for a real compartment (not just one explicitly
  // marked empty) also correctly renders black rather than being skipped.
  //
  // Order: DESCENDING comp number, not ascending -- matches
  // PlannerControls.tsx's own physical display order exactly (see that
  // file's `ordered = [...compartments].sort(asc).reverse()`, "right-to-
  // left display" comment) -- per explicit correction ("comp 1 is on the
  // right, looking at the passenger side... the dots are backwards").
  const colorsForSlot = useCallback((slot: number): string[] => {
    const plan = planSlots.peekSlot(slot)?.compPlan;
    return [...compartments]
      .map((c: any) => Number(c.comp_number))
      .sort((a, b) => b - a)
      .map((n) => {
        const v = plan?.[n];
        return (!v || v.empty || !v.productId) ? "#000000" : productColorFor(productNameById.get(v.productId) ?? "");
      });
  }, [planSlots, productNameById, compartments]);

  // Compartments whose planned product isn't sold at the currently selected
  // terminal -- almost always the result of loading a preset saved at a
  // different terminal (presets are terminal-independent, per the rework
  // above). A live derived value (not a one-time check at load time) so it
  // also catches a terminal switch after the fact. Feeds both the
  // auto-resolve flow below and the LOAD button's hard block.
  const unavailableComps = useMemo(() => {
    // terminalProducts starts empty and only resolves after its own async
    // chain (terminal -> rack -> network fetch, see fetchTerminalProducts
    // above) -- if a preset applies (autosave restore, or a tap) before
    // that finishes, every real product in compPlan would otherwise look
    // "unavailable" against a still-empty catalog. Confirmed live: a
    // reported "product not available" was a false positive from exactly
    // this race -- the product genuinely was sold at the terminal, the
    // catalog just hadn't loaded yet. No way to tell "still loading" apart
    // from "terminal genuinely has zero configured products" from this
    // array alone, but treating the empty-catalog case as "nothing flagged"
    // is the safe default either way -- the LOAD button's own separate
    // planRows.length === 0 gate already covers a load that can't proceed
    // at all, and flagging "not available" against an unknown catalog is
    // misleading regardless of which case it is.
    if (terminalProducts.length === 0) return [];
    const availableIds = new Set(terminalProducts.map((p) => p.product_id));
    const result: number[] = [];
    for (const [compStr, v] of Object.entries(compPlan)) {
      if (!v || v.empty || !v.productId) continue;
      if (!availableIds.has(v.productId)) result.push(Number(compStr));
    }
    return result.sort((a, b) => a - b);
  }, [compPlan, terminalProducts]);

  // Auto-resolve flow: right after a preset load, open the first unavailable
  // comp's Edit Comp modal with the "Product Not Available" banner. Once
  // that specific comp is actually fixed (no longer in unavailableComps),
  // auto-advance to the next one. A dismiss without fixing stops the
  // auto-advance -- the driver can still resolve manually later, or just
  // hit LOAD and get the hard-block message below.
  const [checkAvailabilityNext, setCheckAvailabilityNext] = useState(false);
  const autoResolveActiveRef = useRef(false);
  const resolvingCompRef = useRef<number | null>(null);
  const prevCompModalOpenRef = useRef(false);

  useEffect(() => {
    if (!checkAvailabilityNext) return;
    setCheckAvailabilityNext(false);
    if (unavailableComps.length > 0) {
      const first = unavailableComps[0];
      autoResolveActiveRef.current = true;
      resolvingCompRef.current = first;
      setCompModalComp(first);
      setCompModalOpen(true);
      setSelectedComp(first);
    }
  }, [checkAvailabilityNext, unavailableComps]);

  useEffect(() => {
    const wasOpen = prevCompModalOpenRef.current;
    prevCompModalOpenRef.current = compModalOpen;
    if (!wasOpen || compModalOpen) return; // only on open -> closed
    if (!autoResolveActiveRef.current) return;

    const justClosedComp = resolvingCompRef.current;
    const stillUnavailable = justClosedComp != null && unavailableComps.includes(justClosedComp);
    if (stillUnavailable) {
      // Dismissed without fixing -- stop auto-advancing.
      autoResolveActiveRef.current = false;
      resolvingCompRef.current = null;
      return;
    }
    if (unavailableComps.length > 0) {
      const next = unavailableComps[0];
      resolvingCompRef.current = next;
      setCompModalComp(next);
      setCompModalOpen(true);
      setSelectedComp(next);
    } else {
      autoResolveActiveRef.current = false;
      resolvingCompRef.current = null;
    }
  }, [compModalOpen, unavailableComps]);

  // Supplier from dispatch, per planned product, for this terminal visit
  // (SupplierPanel). Cleared once a load is logged so the next visit asks again.
  const supplierPicks = useSupplierPicks(effectiveUserId || null, location.selectedTerminalId ? String(location.selectedTerminalId) : null);
  const supplierPicksRef = useRef(supplierPicks);
  supplierPicksRef.current = supplierPicks;
  // Picks resolved against the current plan (set below, once products are known).
  const resolvedSupplierPicksRef = useRef<{ product_id: string; supplier_id: string | null; name: string }[]>([]);

  const loadWorkflow = useLoadWorkflow({
    authUserId: effectiveUserId || null,
    selectedComboId: equipment.selectedComboId,
    selectedTerminalId: location.selectedTerminalId,
    selectedRackId: location.selectedRackId,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    selectedCityId: location.selectedCityId,
    tare, cgBias,
    ambientTempF: location.ambientTempF,
    tempF, planRows: effectivePlanRows, plannedGallonsTotal: effectivePlannedGallonsTotal, plannedWeightLbs: effectivePlannedWeightLbs,
    terminalProducts, productNameById,
    productInputs, setProductInputs,
    setLoadingGallonsOverride,
    onRefreshTerminalProducts: fetchTerminalProducts,
    onRefreshTerminalAccess: terminals.refreshTerminalAccessForUser,
    // After a load is logged, the temp just entered becomes the anchor for the
    // next plan (route.ts). Clear any earlier manual dial nudge so the fresh
    // anchored prediction is allowed to apply, and refetch it right away.
    onPostLoadComplete: async () => {
      // The suppliers this load ran on worked here: stamp them and clear any
      // "not working" flag, then forget the picks for the next visit.
      const sp = supplierPicksRef.current;
      const ids = resolvedSupplierPicksRef.current.map((p) => p.supplier_id).filter((x): x is string => !!x);
      if (ids.length && shell.companyId && location.selectedTerminalId && effectiveUserId) {
        void markSuppliersLoaded(shell.companyId, String(location.selectedTerminalId), ids, effectiveUserId);
      }
      sp.clear();
      userAdjustedTempRef.current = false;
      refreshFuelTemp();
      await planSlots.refreshLastLoad();
    },
    predictedTempF: predictedFuelTempF,
    unbiasedPredictedTempF: fuelTempUnbiasedF,
    activeSlotLetter,
    capacityResult,
  });

  // The truck's own fuel level (telematics), used only when recent.
  const fuelReading = useTruckReading(selectedTruckId ?? null, loadWorkflow.loadingOpen);
  const recentFuelPct = fuelReading?.fuelLevelPct != null && fuelReading.at && Date.now() - Date.parse(fuelReading.at) < 30 * 60_000 ? fuelReading.fuelLevelPct : null;

  // ── Trip mode for the Loaded flow ─────────────────────────────────────────
  // When this load is attached to a trip pickup, Plan Review's Loaded steps
  // also take BOL, supplier and net per compartment, then times and the
  // loading driver's signature, and the report's next step is Arrived at
  // Delivery. No trip -> the Planner works exactly as before.
  const tripStoreObj = tripStoreHook.store;
  const { settings: tripSettings, reasons: tripReasons } = useTripSettings(shell.companyId || null);
  const tripSignature = useDriverSignature(effectiveUserId || null);
  const { suppliers: tripSuppliers, addSupplier: addTripSupplier } = useSuppliers(tripStoreObj, tripStoreHook.state, shell.companyId || null, effectiveUserId || null);
  const tripLoadId = loadWorkflow.reportLoadId ?? loadWorkflow.activeLoadId ?? null;
  const tripPickup = useMemo(() => {
    if (!tripLoadId) return null;
    const pickups = Object.values(tripStoreHook.state.rows.trip_pickups ?? {}) as TripPickupRow[];
    const pk = pickups.find((p) => p.load_id === tripLoadId);
    if (!pk) return null;
    const trip = (tripStoreHook.state.rows.trips ?? {})[pk.trip_id] as TripRow | undefined;
    if (!trip || trip.status === "complete" || trip.status === "cancelled") return null;
    return pk;
  }, [tripLoadId, tripStoreHook.state]);

  // The open trip's next pickup that isn't loaded or left yet. Loading can't
  // begin until the driver has arrived there.
  const tripWaitingPickup = useMemo<TripPickupRow | null>(() => {
    if (!effectiveUserId) return null;
    const trip = openTripForDriver(Object.values(tripStoreHook.state.rows.trips ?? {}) as TripRow[], effectiveUserId);
    if (!trip || (trip.status !== "draft" && trip.status !== "loading" && trip.status !== "in_transit")) return null;
    return (Object.values(tripStoreHook.state.rows.trip_pickups ?? {}) as TripPickupRow[])
      .filter((p) => p.trip_id === trip.trip_id && !p.load_id && !p.left_at)
      .sort((a, b) => a.seq - b.seq)[0] ?? null;
  }, [effectiveUserId, tripStoreHook.state]);
  const tripNeedsArrive = !!tripWaitingPickup && !tripWaitingPickup.arrived_at;
  // Before the driver has arrived, the rack isn't known; it's asked on Arrive.
  useEffect(() => {
    if (!active) return; // other screens (the dashboard) manage this themselves
    shell.setDeferRackPick(tripNeedsArrive);
    return () => shell.setDeferRackPick(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripNeedsArrive, active]);

  // Shipment numbers (BOLs) the driver entered in the telematics app on this truck since arriving. The
  // driver enters it before opening ProTankr, so it's asked for ONCE, when Finish Loading starts (never
  // polled), through a company-wide cache on the server. A slow or failed answer just means no suggestion.
  const [geoShips, setGeoShips] = useState<GeoShipment[]>([]);
  const geoPickupId = tripPickup?.pickup_id ?? null;
  const geoArrived = tripPickup?.arrived_at ?? null;
  const geoTruckId = useMemo(() => {
    const t = tripPickup ? (Object.values(tripStoreHook.state.rows.trips ?? {}) as TripRow[]).find((x) => x.trip_id === tripPickup.trip_id) : null;
    return t?.truck_id ?? shell.equipment.selectedCombo?.truck_id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPickupId, shell.equipment.selectedCombo?.truck_id]);
  useEffect(() => { setGeoShips([]); }, [geoPickupId]);
  const loadGeoShips = useCallback(() => {
    if (!geoPickupId || !geoArrived || !geoTruckId) return;
    void fetchTruckShipments(geoTruckId, new Date(Date.parse(geoArrived) - 3600000).toISOString()).then(setGeoShips);
  }, [geoPickupId, geoArrived, geoTruckId]);

  const tripModeForLoading = useMemo<LoadingTripMode | null>(() => {
    if (!tripPickup || !tripStoreObj || !shell.companyId) return null;
    const comps = (Object.values(tripStoreHook.state.rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[])
      .filter((c) => c.pickup_id === tripPickup.pickup_id && c.disposition !== "cancelled");
    const compDefaults: LoadingTripMode["compDefaults"] = {};
    const compPicks = resolvePicks(supplierPicks.picks, [...plannedProductIds]);
    for (const c of comps) {
      const picked = !c.supplier && c.product_id ? compPicks.find((p) => p.product_id === c.product_id) : null;
      compDefaults[c.comp_number] = {
        bol: c.bol_number,
        supplier: c.supplier ?? picked?.name ?? null,
        supplierId: (c as any).supplier_id ?? picked?.supplier_id ?? null,
        net: c.net_gallons,
        netTouched: c.net_gallons != null && c.net_calculated_gallons != null && c.net_gallons !== c.net_calculated_gallons,
      };
    }
    // Compartments with no trip row yet still default to the rack's pick, so
    // Finish Loading doesn't ask for a supplier already chosen.
    for (const [k, v] of Object.entries(compPlan)) {
      const n = Number(k);
      if (compDefaults[n] || !v || v.empty || !v.productId) continue;
      const picked = compPicks.find((p) => p.product_id === String(v.productId));
      if (picked) compDefaults[n] = { bol: null, supplier: picked.name, supplierId: picked.supplier_id, net: null, netTouched: false };
    }
    const snap = tripSnapshot(tripStoreObj, tripPickup.trip_id);
    const allComps = Object.values(tripStoreHook.state.rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[];
    const trips = Object.values(tripStoreHook.state.rows.trips ?? {}) as TripRow[];
    const mine = new Set(comps.map((c) => c.compartment_load_id));
    const usedElsewhere = allComps.filter((c) => !mine.has(c.compartment_load_id) && c.bol_number).map((c) => String(c.bol_number));
    const geotabBols = shipmentsForPickup(geoShips, { arrivedAt: tripPickup.arrived_at, leftAt: tripPickup.left_at }, Date.now(), usedElsewhere).map((s) => s.documentNumber);
    return {
      pickupName: null,
      geotabBols,
      settings: tripSettings,
      reasons: tripReasons.filter((r) => r.kind === "loading" && r.is_active),
      arrivedAt: tripPickup.arrived_at,
      departedAt: readGeoDeparture(tripPickup.pickup_id),
      beganAt: tripPickup.begin_at,
      existingTimes: tripPickup.left_at ? { arrivedAt: tripPickup.arrived_at, beginAt: tripPickup.begin_at, leftAt: tripPickup.left_at } as StepTimes : null,
      existingDelayReasonId: tripPickup.delay_code && isTerminalIssueCode(tripPickup.delay_code)
        ? issueChoiceValue(tripPickup.delay_code) : tripPickup.delay_reason_id,
      existingDelayNote: tripPickup.delay_note,
      needsOdometer: pickupNeedsOdometer(snap.pickups, tripPickup.pickup_id),
      existingOdometer: tripPickup.odometer,
      suppliers: tripSuppliers,
      onAddSupplier: addTripSupplier,
      checkBols: (values) => bolConflicts(trips, allComps, shell.companyId!, values, mine),
      signature: tripSignature.svg,
      onSaveSignature: tripSignature.save,
      compDefaults,
      onArrivedAtDelivery: () => {
        leaveTo("/planner/home?arrive=1", "Opening dashboard…");
        loadWorkflow.closeLoadReport();
      },
      onBackToDashboard: () => leaveTo("/planner/home", "Opening dashboard…"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripPickup, tripStoreObj, tripStoreHook.state, shell.companyId, tripSettings, tripReasons, tripSuppliers, addTripSupplier, tripSignature.svg, tripSignature.save, supplierPicks.picks, plannedProductIds, compPlan, geoShips]);

  // Runs right after recordLoadCompleted wrote gross/temp/API for this load.
  const recordTripLoaded = useCallback((extras: TripLoadExtras | undefined, editOnly: boolean) => {
    if (!extras || !tripStoreObj || !tripPickup || !effectiveUserId || !shell.companyId) return;
    const pickup = (tripStoreObj.list("trip_pickups", (p) => p.pickup_id === tripPickup.pickup_id)[0]) ?? tripPickup;
    const comps = tripStoreObj.list("trip_compartment_loads", (c) => c.pickup_id === pickup.pickup_id && c.disposition !== "cancelled");
    if (editOnly) {
      updateLoadedCompartments(tripStoreObj, comps.map((c) => {
        const x = extras.byComp[c.comp_number];
        return {
          compartment_load_id: c.compartment_load_id,
          bol_number: x ? x.bol : c.bol_number,
          supplier: x ? x.supplier : c.supplier,
          supplier_id: x ? x.supplierId : ((c as any).supplier_id ?? null),
          net_gallons: x ? x.net : c.net_gallons,
        };
      }));
    } else if (extras.times) {
      const edits: LoadedCompartmentEdit[] = comps.map((c) => {
        const x = extras.byComp[c.comp_number];
        return {
          compartment_load_id: c.compartment_load_id,
          comp_number: c.comp_number,
          product_id: c.product_id,
          order_id: c.order_id,
          bol_number: x?.bol ?? c.bol_number,
          supplier: x?.supplier ?? c.supplier,
          supplier_id: x ? x.supplierId : ((c as any).supplier_id ?? null),
          gross_gallons: c.gross_gallons,
          net_gallons: x?.net ?? c.net_gallons,
          net_calculated_gallons: c.net_calculated_gallons,
          temp_f: c.temp_f,
          api: c.api,
        };
      });
      confirmLoaded(tripStoreObj, {
        userId: effectiveUserId,
        companyId: shell.companyId,
        trailerId: equipment.selectedCombo?.trailer_id ?? equipment.currentTrailerId ?? null,
        pickup,
        times: extras.times,
        delayReasonId: extras.delayReasonId ?? null,
        delayNote: extras.delayNote ?? null,
        odometer: extras.odometer ?? null,
        compartments: edits,
        signed: !!extras.signed,
        now: new Date(),
        newId: newTripId,
      });
      const bolSupplierIds = edits.map((c) => c.supplier_id).filter((x): x is string => !!x);
      if (bolSupplierIds.length && pickup.terminal_id) {
        void markSuppliersLoaded(shell.companyId, String(pickup.terminal_id), bolSupplierIds, effectiveUserId);
      }
      void reportDelayIssue({
        delayChoice: extras.delayReasonId ?? null,
        terminalId: pickup.terminal_id, rackId: pickup.rack_id,
        productIds: edits.map((c) => c.product_id).filter((x): x is string => !!x),
        companyId: shell.companyId, userId: effectiveUserId,
        truckLabel: equipment.truckNameById[equipment.selectedCombo?.truck_id ?? ""] ?? "",
      });
    }
    void tripStoreHook.syncNow();
    // Finished loading on a trip: back to the Driver Dashboard (the report
    // is a link on the trip card there).
    if (!editOnly && extras.times) {
      leaveTo("/planner/home", "Opening dashboard…");
      loadWorkflow.closeLoadReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStoreObj, tripPickup, effectiveUserId, shell.companyId, equipment.selectedCombo, equipment.currentTrailerId]);

  // ── Incentive running-average card ────────────────────────────────────────
  // Left side is this load's own recovered points; right side is the
  // average recovered points per load across the current report period.
  // The old separate "You earned X points" confirmation line was removed
  // 2026-08-20 as redundant with this card's own "This Load" figure.
  // Running average uses the SAME report period the admin already
  // configures for the Period Report (pay_period_type/pay_period_anchor_date)
  // -- no separate averaging-period concept. Simplified 2026-08-17 per
  // explicit follow-up ("if we are keeping the report period and anchor
  // date thing we can just match the averaging period for the planner card
  // to that same period") -- this reverses the same-day decision to add an
  // independent, anchor-less averaging period. Whole card only renders once
  // incentive_settings.enabled is confirmed true for this company.
  // Payload-utilization driver card (Phase 2) removed from this page
  // entirely per explicit direction -- utilization reporting still exists
  // (Reports hub, admin Fleet dashboard), it's just no longer shown here
  // alongside "what am I planning right now."

  // "Back to Planner" -- per explicit follow-up, this must genuinely undo
  // everything: no load logged AND the terminal card reverted to whatever
  // it was before this LOAD tap (not left at the fresh re-card the way
  // "Update Card, No Load" deliberately keeps). Cancels the load first
  // (closes the modal, deletes the load_log row), then restores the
  // captured pre-load access date -- or, if there was none, deletes the
  // row entirely so the terminal goes back to genuinely "not carded"
  // rather than picking some fallback date that was never real.
  const handleBackToPlannerNoUpdate = useCallback(async () => {
    setCancelLoadConfirmOpen(false);
    await loadWorkflow.cancelActiveLoad();
    const captured = preLoadCardedOnRef.current;
    preLoadCardedOnRef.current = null;
    if (!captured) return;
    if (captured.prevValue) {
      await terminals.setAccessDateForTerminal(captured.terminalId, captured.prevValue);
    } else {
      await terminals.deleteAccessDateForTerminal(captured.terminalId);
    }
  }, [loadWorkflow, terminals]);

  // ── LOAD -> (stale-API check) -> begin ───────────────────────────────────
  // The pre-load temp-confirm step (ProductTempModal on the LOAD tap) is
  // gone -- temp is now entered per product at Log the Load. LOAD instead
  // checks for stale/missing API readings and, if any, offers the Good /
  // Better / Best safety overlay before beginning; otherwise it begins
  // directly. (ProductTempModal is still used for the mid-load different-
  // city reconfirm -- handleConfirmTempReconfirm below.)
  //
  // requestBegin sets the chosen per-product density override and defers the
  // actual begin to the effect below, so the load snapshots planRows that
  // already reflect the override (not the stale pre-override closure).
  const requestBegin = useCallback((override: Record<string, number>) => {
    setApiSafetyOverride(override);
    setBeginAfterOverride(true);
  }, []);

  useEffect(() => {
    if (!beginAfterOverride) return;
    setBeginAfterOverride(false);
    preLoadCardedOnRef.current = {
      terminalId: location.selectedTerminalId,
      prevValue: terminals.accessDateByTerminalId[location.selectedTerminalId] ?? null,
    };
    loadWorkflow.beginLoadToSupabase();
    // Terminal access steps: starts them if there's no access here, or shows
    // what's left if they're underway (see AccessStepsHost).
    if (location.selectedTerminalId) {
      openAccessSteps({ terminalId: String(location.selectedTerminalId), fromLoad: { prevCardedOn: preLoadCardedOnRef.current.prevValue } });
    }
    // beginLoadToSupabase closes over the current (post-override) planRows;
    // this effect runs after that render commits, so the snapshot is fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginAfterOverride]);

  // Clear the safety override AND the Tune-panel overrides whenever the Loading
  // modal closes (complete, cancel, update-card, or back) so a heavier
  // assumption or a driver's tuned reading never lingers into the planner view
  // or the next load.
  useEffect(() => {
    if (!loadWorkflow.loadingOpen) { setApiSafetyOverride({}); setTunedApiTempByProduct({}); }
  }, [loadWorkflow.loadingOpen]);

  // A temp override (Tune panel or the Confirm Temp dial) is for that load
  // only. When the Loading modal closes after being open, drop every
  // per-product temp back to the system value and let the prediction take
  // over again. Gated on a real open -> close transition so it never fires
  // on mount. A page refresh already lands here: productTempF isn't
  // persisted and userAdjustedTempRef starts false, so auto-apply wins.
  const wasLoadingOpenRef = useRef(false);
  useEffect(() => {
    const was = wasLoadingOpenRef.current;
    wasLoadingOpenRef.current = loadWorkflow.loadingOpen;
    if (!was || loadWorkflow.loadingOpen) return;
    userAdjustedTempRef.current = false;
    const base = predictedFuelTempF ?? tempFRef.current;
    if (predictedFuelTempF != null) setTempF(predictedFuelTempF);
    setProductTempF((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const out: Record<string, number> = {};
      for (const k of keys) out[k] = Math.round(base * 10) / 10;
      return out;
    });
    refreshFuelTemp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadWorkflow.loadingOpen]);

  // computeStalePlannedProducts / buildStaleOverride / handleStale* live
  // further down, after lastProductInfoById + productHexCodeById are declared
  // (they reference those), so they aren't in this block.

  // Wired into CancelLoadSheet's new "Report Terminal Issue" flow -- see
  // CLAUDE.md "Terminal outage banners." Stays a thin call-through to the
  // actual write logic in useTerminalOutageReports.ts, matching how
  // handleBackToPlannerNoUpdate above is the only place that touches
  // loadWorkflow/terminals for its own concern.
  //
  // Optional terminal/rack override, added for
  // TerminalSwitchDuringLoadSheet's own "Report Terminal Issue" -- that
  // sheet's report is about the terminal the driver was ALREADY loading
  // at (the previous one, from the switch snapshot), not whichever
  // terminal the picker just left `location.selectedTerminalId` pointing
  // at. CancelLoadSheet's own call site never passes these, so its
  // existing behavior (report against the live current selection) is
  // completely unchanged.
  const handleSubmitOutageReport = useCallback(
    async (reportType: OutageReportType, productIds: string[], overrideTerminalId?: string, overrideRackId?: string | null) => {
      const truckId = equipment.selectedCombo?.truck_id ?? "";
      const truckLabel = equipment.truckNameById[truckId] ?? truckId;
      const base = {
        terminalId: overrideTerminalId ?? String(location.selectedTerminalId || ""),
        selectedRackId: overrideTerminalId ? (overrideRackId ?? null) : (location.selectedRackId ? String(location.selectedRackId) : null),
        reportType,
        companyId: shell.companyId || "",
        userId: effectiveUserId || "",
        truckLabel,
      };
      // Allocation at this terminal names the supplier picked for each
      // product, one report per supplier ("No Allocation - Atlas - MO (D2)").
      if (reportType === "out_of_allocation" && !overrideTerminalId) {
        const picks = resolvedSupplierPicksRef.current;
        const bySupplier = new Map<string, { supplier: { supplier_id: string | null; name: string } | null; ids: string[] }>();
        for (const pid of productIds) {
          const pk = picks.find((x) => x.product_id === pid);
          const key = pk ? (pk.supplier_id ?? pk.name) : "";
          const g = bySupplier.get(key) ?? { supplier: pk ? { supplier_id: pk.supplier_id, name: pk.name } : null, ids: [] };
          g.ids.push(pid);
          bySupplier.set(key, g);
        }
        for (const g of bySupplier.values()) {
          const r = await submitOutageReport({ ...base, productIds: g.ids, supplier: g.supplier });
          if (r.error) return r;
        }
        return { error: null };
      }
      return submitOutageReport({ ...base, productIds });
    },
    [equipment.selectedCombo, equipment.truckNameById, location.selectedTerminalId, location.selectedRackId, shell.companyId, effectiveUserId]
  );

  // Pushes a recalled load's report into loadWorkflow and re-syncs the
  // preset dial -- shared by the normal "Recall Last Load" tap and the
  // "switch equipment, then recall" path below, since both end the same
  // way once a report actually comes back.
  const applyRecalledReport = useCallback((report: any | null) => {
    if (report) {
      loadWorkflow.setLoadReport(report);
      // planSlots.recallLastLoad() already called setCompPlan/setCgSlider
      // (via applySnapshot) before this runs -- without this, the "Save
      // Plan" button's dirty-check compared the just-recalled plan against
      // whatever baseline was captured BEFORE the recall, so it showed up
      // immediately even though nothing the driver actually did had
      // changed anything yet. Same captureBaselineNext mechanism every
      // other programmatic plan-load (preset tap, terminal/combo switch)
      // already uses -- this was the one path that never set it.
      setCaptureBaselineNext(true);
    }
    if (report?.plan_slot) {
      setActiveSlotLetter(report.plan_slot);
    }
  }, [loadWorkflow]);

  // "Recall Last Load" -- tries the current equipment first (the common
  // case); if this terminal has no completed load under it, checks
  // whether the driver's own last load HERE used different equipment
  // before giving up silently, per explicit follow-up. Never claims/
  // switches equipment -- see RecallDifferentEquipmentSheet.tsx's own
  // comment for why (someone else could genuinely be running it).
  const handleRecallLastLoad = useCallback(async () => {
    const report = await planSlots.recallLastLoad();
    if (report) { applyRecalledReport(report); return; }
    if (!location.selectedTerminalId) return;
    const match = await planSlots.findLastLoadAtTerminalDifferentEquipment(String(location.selectedTerminalId));
    if (match) setAltEquipmentPrompt(match);
  }, [planSlots, applyRecalledReport, location.selectedTerminalId]);

  // "View last load" button (replaces the old always-visible last-load/
  // utilization cards, per explicit direction). A real, separate concern
  // from the plan-restore machinery above -- this never touches compPlan
  // or any slot storage, it's a pure read of load_log/load_lines for
  // display in Plan Review's own Load Report mode. Scoped to the CURRENT
  // terminal (per explicit direction: "reopen the last load at that
  // terminal"), not just this combo's most recent load anywhere.
  const [viewLastLoadMsg, setViewLastLoadMsg] = useState<string | null>(null);
  const [viewLastLoadBusy, setViewLastLoadBusy] = useState(false);
  const openLoadReportAtTerminal = useCallback(async (byLoadId?: string) => {
    if (!byLoadId && (!equipment.selectedComboId || !location.selectedTerminalId)) return;
    setViewLastLoadBusy(true);
    setViewLastLoadMsg(null);
    try {
      // A known load id: both reads at once (the dashboard's Load Report link).
      const linesQuery = (id: string) => supabase
        .from("load_lines")
        .select("comp_number, product_id, actual_gallons, actual_lbs, actual_api, temp_f")
        .eq("load_id", id)
        .order("comp_number", { ascending: true });
      const linesEarly = byLoadId ? linesQuery(byLoadId) : null;
      const { data: loadRow, error: loadErr } = byLoadId
        ? await supabase.from("load_log").select("load_id, completed_at, plan_slot").eq("load_id", byLoadId).maybeSingle()
        : await supabase
        .from("load_log")
        .select("load_id, completed_at, plan_slot")
        .eq("combo_id", equipment.selectedComboId)
        .eq("terminal_id", location.selectedTerminalId)
        .eq("status", "loaded")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!loadRow) { setViewLastLoadMsg("No completed load at this terminal yet."); return; }

      const { data: lineRows, error: lineErr } = await (linesEarly ?? linesQuery(String(loadRow.load_id)));
      if (lineErr) throw lineErr;

      const lines = (lineRows ?? [])
        .filter((l: any) => l.product_id && Number(l.actual_gallons ?? 0) > 0)
        .map((l: any) => ({
          comp: Number(l.comp_number),
          productId: String(l.product_id),
          gallons: Number(l.actual_gallons ?? 0),
          lbs: l.actual_lbs != null ? Number(l.actual_lbs) : null,
          api: l.actual_api != null ? Number(l.actual_api) : null,
          tempF: l.temp_f != null ? Number(l.temp_f) : null,
        }));

      if (lines.length === 0) { setViewLastLoadMsg("No completed load at this terminal yet."); return; }

      loadWorkflow.openLoadReport({
        loadId: String(loadRow.load_id),
        lines,
        completedAt: loadRow.completed_at ?? null,
        planSlot: loadRow.plan_slot ?? null,
      });
    } catch (e) {
      console.error("openLoadReportAtTerminal failed:", e);
      setViewLastLoadMsg("Could not load that report.");
    } finally {
      setViewLastLoadBusy(false);
    }
  }, [equipment.selectedComboId, location.selectedTerminalId, loadWorkflow]);

  // /planner?report=<load_id> (the dashboard's Load Report link) opens that
  // load's report once.
  const reportParamDone = useRef(false);
  // While that report loads, a plain cover hides the Planner so the driver
  // goes straight from the dashboard to the report. Set before first paint.
  const [reportPending, setReportPending] = useState(false);
  // Report opened from the dashboard: closing it (any button) goes straight
  // back there, under the same cover, so the Planner never shows.
  const reportFromDashboardRef = useRef(false);
  const reportShownRef = useRef(false);
  const [reportFromDashboard, setReportFromDashboard] = useState(false);
  useLayoutEffect(() => {
    if (new URLSearchParams(window.location.search).get("report")) {
      setReportPending(true);
      reportFromDashboardRef.current = true;
      setReportFromDashboard(true);
    }
  }, []);
  useLayoutEffect(() => {
    if (!reportFromDashboardRef.current || reportPending) return;
    if (loadWorkflow.loadingOpen || loadWorkflow.reportLines) { reportShownRef.current = true; return; }
    if (!reportShownRef.current) return; // report never opened (error): stay
    reportFromDashboardRef.current = false;
    setReportFromDashboard(false);
    leaveTo("/planner/home", "Opening dashboard…");
  }, [loadWorkflow.loadingOpen, loadWorkflow.reportLines, reportPending, leaveTo]);
  useEffect(() => {
    if (reportParamDone.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("report");
    if (!id) return;
    reportParamDone.current = true;
    params.delete("report");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    void openLoadReportAtTerminal(id).finally(() => setReportPending(false));
  }, [openLoadReportAtTerminal]);

  // Deliberately does NOT claim/switch equipment -- per explicit follow-up,
  // someone else could genuinely be running that truck/trailer right now,
  // and force-claiming it out from under them just to satisfy a "let me
  // peek at my last load" convenience is a real, disruptive side effect
  // (an earlier version of this did claim it directly; reversed). Instead
  // links to the load's own read-only report view -- Reports already
  // knows how to show a single load's detail without touching any
  // equipment-claim state at all.
  const handleViewAltLoadInReports = useCallback(() => {
    if (!altEquipmentPrompt) return;
    router.push(`/planner/reports?loadId=${encodeURIComponent(altEquipmentPrompt.loadId)}`);
    setAltEquipmentPrompt(null);
  }, [altEquipmentPrompt, router]);

  // The effect that used to live here seeded loadWorkflow.loadReport (and
  // the plan-letter highlight) from usePlanSlots' own "last completed
  // load" fallback on every mount -- removed entirely per explicit
  // direction: no last-load info anywhere on the Planner page anymore,
  // passively or otherwise. loadReport is now set only by a real
  // completion or by explicitly opening a load's report (see
  // openLoadReportAtTerminal below); the plan-letter highlight is fully
  // owned by handlePlanRestored (a real local draft) and the explicit
  // preset-tap/recall handlers.

  // recapBaseline/recapValid (the "is the recap card's data still valid"
  // freshness check) removed entirely -- see the recap card's own comment
  // further down for why it was a real bug, not just an edge case: it
  // compared the live plan against a baseline captured whenever
  // loadReport happened to change, which trivially matched itself
  // regardless of whether loadReport actually described that plan. The
  // recap card no longer reads from loadReport at all.

  // ── Terminal filters / expirations ────────────────────────────────────────
  // Also shared via context (see above) -- myTerminalIdSet, terminalFilters,
  // expirations all come from `shell` now.
  const { myTerminalIdSet, terminalFilters } = shell;
  const { catalogTerminalsInCity } = terminalFilters;

  // Fetch terminal access dates for city terminals
  useEffect(() => {
    (async () => {
      if (!authUserId || !location.selectedState || !location.selectedCity) return;
      const ids = catalogTerminalsInCity.map((t) => String(t.terminal_id));
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from("terminal_access").select("terminal_id, carded_on")
        .eq("user_id", effectiveUserId).in("terminal_id", ids);
      if (error) return;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { if (r?.terminal_id && r?.carded_on) map[String(r.terminal_id)] = String(r.carded_on); });
      // Note: access date map lives in useTerminals; this local fetch augments the catalog view
    })();
  }, [authUserId, location.selectedState, location.selectedCity, catalogTerminalsInCity]);

  // ── Derived labels ─────────────────────────────────────────────────────────
  const terminalLabel = useMemo(() => {
    if (!location.selectedTerminalId) return undefined;
    const t = terminals.terminals.find((t) => String(t.terminal_id) === String(location.selectedTerminalId))
      ?? terminals.terminalCatalog.find((t) => String(t.terminal_id) === String(location.selectedTerminalId));
    return t?.terminal_name ? String(t.terminal_name) : "Terminal";
  }, [terminals.terminals, terminals.terminalCatalog, location.selectedTerminalId]);

  const {
    terminalSwitchConfirm,
    handleTapTerminalInLoadingModal,
    handleUpdateCardAtPrevious,
    handleSwitchWithoutUpdating,
    handleSubmitOutageReportForPreviousTerminal,
    tempReconfirmProductIds,
    setTempReconfirmProductIds,
    handleConfirmTempReconfirm,
    switchReportedIssueRef,
    switchReasonNoteRef,
  } = useTerminalSwitchDuringLoad({
    shell, loadWorkflow, tripStoreHook, tripPickup, tripWaitingPickup, effectiveUserId, terminalLabel,
    effectivePlanRows: effectivePlanRows as any[], setProductApi, setProductTemp, setTunedApiTempByProduct,
    userAdjustedTempRef, setTempDialOpen, setTempF, tempF, fuelTempLoading, predictedFuelTempF,
    handleSubmitOutageReport,
  });

  // ── lastProductInfoById ────────────────────────────────────────────────────
// IMPORTANT: derive from `terminalProducts` because that list is refreshed after LOADED.
const lastProductInfoById = useMemo(() => {
  const out: Record<string, { last_api: number | null; last_api_updated_at: string | null }> = {};
  for (const p of terminalProducts) {
    const pid = String((p as any).product_id ?? "");
    if (!pid) continue;
    out[pid] = {
      last_api: (p as any).last_api ?? null,
      last_api_updated_at: (p as any).last_api_updated_at ?? null,
    };
  }
  return out;
}, [terminalProducts]);

  // ── Placard data ──────────────────────────────────────────────────────────


  const productHexCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) { if (p.product_id && p.hex_code) rec[p.product_id] = String(p.hex_code); }
    return rec;
  }, [terminalProducts]);

  // Short code for the Tune panel (product code, not the full label) -- same
  // fallback chain the compartment bars already use.
  const productCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) {
      if (!p.product_id) continue;
      const code = (p as any).button_code || (p as any).product_code || String(p.product_name ?? "").split(/\s+/)[0] || "";
      rec[p.product_id] = String(code);
    }
    return rec;
  }, [terminalProducts]);

  // ── Supplier card ─────────────────────────────────────────────────────────
  const supplierPanelProducts = useMemo<PanelProduct[]>(() => [...plannedProductIds].map((pid) => ({
    id: pid,
    code: productCodeById[pid] || (productNameById.get(pid) ?? "Product"),
    color: productHexCodeById[pid] || productColorFor(productNameById.get(pid) ?? ""),
  })), [plannedProductIds, productCodeById, productNameById, productHexCodeById]);
  const resolvedSupplierPicks = useMemo(
    () => resolvePicks(supplierPicks.picks, supplierPanelProducts.map((p) => p.id)),
    [supplierPicks.picks, supplierPanelProducts],
  );
  resolvedSupplierPicksRef.current = resolvedSupplierPicks;
  const [supplierPromptToken, setSupplierPromptToken] = useState(0);
  const needsSupplierPick = supplierPicks.loaded && !supplierPicks.skipped && resolvedSupplierPicks.length === 0;
  // The supplier picked on Begin Trip is preset at every rack on the trip
  // (rack hops, a later visit). Reads storage directly so it never overwrites
  // a pick or a skip already saved for this terminal.
  const openTripIdForSupplier = useMemo(() => {
    if (!effectiveUserId) return null;
    const trip = openTripForDriver(Object.values(tripStoreHook.state.rows.trips ?? {}) as TripRow[], effectiveUserId);
    return trip && trip.status !== "complete" && trip.status !== "cancelled" ? trip.trip_id : null;
  }, [effectiveUserId, tripStoreHook.state]);
  // Which supplier is asked once loading begins (Plan Review), not while
  // planning: open the picker then if none is set yet. The token resets when
  // Plan Review closes so the next load asks fresh.
  useEffect(() => {
    if (!loadWorkflow.loadingOpen) { setSupplierPromptToken(0); return; }
    if (loadWorkflow.reportLines || !needsSupplierPick || !location.selectedTerminalId) return;
    setSupplierPromptToken((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadWorkflow.loadingOpen]);
  useEffect(() => {
    const tid = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
    if (!openTripIdForSupplier || !tid || !effectiveUserId) return;
    if (readPicks(effectiveUserId, tid)) return;
    const ts = getTripSupplier(effectiveUserId, openTripIdForSupplier);
    if (ts) supplierPicks.setPicks(tripSupplierPicks(ts));
  }, [openTripIdForSupplier, location.selectedTerminalId, effectiveUserId, supplierPicks.picks, supplierPicks.setPicks]);
  // A change at the rack carries forward on the trip when it's one supplier.
  const onSupplierPicks = useCallback((next: SupplierPick[]) => {
    supplierPicks.setPicks(next);
    const groups = groupPicks(next);
    if (openTripIdForSupplier && effectiveUserId && groups.length === 1) {
      setTripSupplier(effectiveUserId, openTripIdForSupplier, { supplier_id: groups[0].supplier_id, name: groups[0].name });
    }
  }, [supplierPicks.setPicks, openTripIdForSupplier, effectiveUserId]);
  const onSupplierSwitched = useCallback((e: SupplierSwitchEvent) => {
    const pk = tripPickup ?? tripWaitingPickup;
    if (!pk || !tripStoreObj || !effectiveUserId) return;
    tripStoreObj.put("trip_events", {
      event_id: newTripId(), trip_id: pk.trip_id, event_type: "supplier_switch", occurred_at: new Date().toISOString(),
      actor_id: effectiveUserId, pickup_id: pk.pickup_id, delivery_id: null,
      payload: { from: e.from, to: e.to, reason: e.reason, note: e.note || null, product_ids: e.productIds },
    });
    void tripStoreHook.syncNow();
  }, [tripPickup, tripWaitingPickup, tripStoreObj, effectiveUserId, tripStoreHook]);

  // Confidence -> temp color (same palette as the temp prediction, so the Tune
  // panel's temp keeps the confidence color the driver already knows).
  const tuneTempColor = useMemo(() => {
    const c = fuelTempConfidence;
    if (c === "high") return "#4ade80";
    if (c === "medium") return "#fbbf24";
    if (c === "low") return "#f87171";
    return "#ffffff";
  }, [fuelTempConfidence]);

  // Per-product rows for Plan Review's Tune panel: code · temp · API · lbs/gal
  // · date. Minimal by design. The density (lbsPerGal) already reflects any
  // tune (lbsPerGalForProductId reads tunedApiTempByProduct), so the panel and
  // the planned gallons can never disagree.
  const tuneRows = useMemo(() => {
    const ids = Array.from(plannedProductIds);
    const rows = ids.map((pid) => {
      const tuned = tunedApiTempByProduct[pid] ?? null;
      const p = terminalProducts.find((x) => x.product_id === pid);
      const info = lastProductInfoById[pid];
      const lpg = lbsPerGalForProductId(pid);
      const tempVal = tuned ? tuned.tempF : (productTempF[pid] ?? tempF);

      // The API the plan stands on (same helper as the density) and a color
      // for how fresh the reading is: green <=6h, white <=12h, orange <=24h,
      // red older or no reading. A tuned value is white.
      let displayApi: number | null = tuned ? tuned.api : null;
      let apiColor = "#ffffff";
      const basis = apiBasisForProduct(pid);
      if (basis) {
        displayApi = basis.displayApi;
        apiColor = apiTierColor(basis.tier);
      }

      // #2: short absolute date/time of the last physical update, or "no
      // reading" if never updated. (Tuned rows show "edited · just now".)
      let lastApiDateLabel: string | null = null;
      if (info?.last_api_updated_at) {
        const d = new Date(info.last_api_updated_at);
        if (!Number.isNaN(d.getTime())) {
          let h = d.getHours(); const mm = d.getMinutes();
          const ap = h < 12 ? "AM" : "PM"; h = h % 12; if (h === 0) h = 12;
          lastApiDateLabel = `${d.getMonth() + 1}/${d.getDate()} ${h}:${String(mm).padStart(2, "0")} ${ap}`;
        }
      }
      const dateLabel = tuned ? "just now" : (lastApiDateLabel ?? "no reading");
      // The last real network reading (independent of any tune), shown as
      // context inside the Tune overlay.
      const lastApi = p?.last_api != null && Number.isFinite(Number(p.last_api)) ? Number(p.last_api) : null;

      return {
        productId: pid,
        code: productCodeById[pid] || (productNameById.get(pid) ?? pid),
        dotColor: (productHexCodeById[pid] && productHexCodeById[pid].trim()) || "rgba(255,255,255,0.5)",
        tempF: tempVal,
        api: displayApi,
        apiColor,
        lbsPerGal: lpg != null && Number.isFinite(lpg) ? lpg : null,
        dateLabel,
        tuned: !!tuned,
        lastApi,
        lastApiDateLabel,
      };
    });
    rows.sort((a, b) => a.code.localeCompare(b.code));
    return rows;
  }, [plannedProductIds, tunedApiTempByProduct, terminalProducts, lastProductInfoById, productTempF, tempF, lbsPerGalForProductId, apiBasisForProduct, productCodeById, productNameById, productHexCodeById]);

  // Apply a Tune-panel edit: drives the planning density (tunedApiTempByProduct
  // + productTempF) AND the submission inputs (productInputs) so the logged
  // weight matches what the driver tuned. Gallons recompute live off the
  // density change.
  const onTuneProduct = useCallback((productId: string, api: number, tempFVal: number) => {
    setTunedApiTempByProduct((prev) => ({ ...prev, [productId]: { api, tempF: tempFVal } }));
    setSingleProductTempF(productId, tempFVal);
    setProductApi(productId, String(api));
    setProductTemp(productId, tempFVal);
  }, [setSingleProductTempF, setProductApi, setProductTemp]);

  // ── Stale-API decision helpers ────────────────────────────────────────────
  // (Placed here, after lastProductInfoById + productHexCodeById, which they
  // read; requestBegin + the begin/clear effects live up near the other load
  // handlers since they don't depend on these.)
  // Sourced from lib/config/plannerSafety.ts so it can move to a super-admin
  // dashboard control later without hunting for a hardcoded 7 (see #2).
  const STALE_API_DAYS = DEFAULT_STALE_API_DAYS;
  const computeStalePlannedProducts = useCallback((): StaleProduct[] => {
    const out: StaleProduct[] = [];
    for (const pid of plannedProductIds) {
      const info = lastProductInfoById[pid];
      const lastApi = info?.last_api;
      const ts = info?.last_api_updated_at;
      let stale = false;
      if (lastApi == null || !Number.isFinite(Number(lastApi))) {
        // Never loaded here -> NOT prompted. lbsPerGalForProductId already
        // defaults an unproven product to its published heaviest (api_min),
        // so there's nothing to decide -- the safe assumption is automatic.
        stale = false;
      } else if (!ts) {
        // A reading with no timestamp is unknown-age, not fresh -- we can't
        // prove it's current, so treat it as stale and let the driver decide.
        stale = true;
      } else {
        const d = new Date(ts);
        stale = !Number.isNaN(d.getTime()) && (Date.now() - d.getTime()) > STALE_API_DAYS * 86400000;
      }
      if (stale) {
        out.push({
          productId: pid,
          name: productNameById.get(pid) ?? pid,
          dotColor: (productHexCodeById[pid] && productHexCodeById[pid].trim()) || "rgba(255,255,255,0.5)",
        });
      }
    }
    return out;
  }, [plannedProductIds, lastProductInfoById, productNameById, productHexCodeById]);

  // What Log the Load starts each product's API box at: whatever the driver
  // entered/tuned, else the same number the plan stands on. Blank on a first
  // load at a terminal (no history) so the first reading saved is a real BOL
  // number -- prefilling product min there let a tap-through record product
  // min as if the terminal had measured it (2026-09-28/29).
  const productInputsForModal = useMemo(() => {
    const out: Record<string, { api?: string; tempF?: number }> = { ...productInputs };
    for (const pid of plannedProductIds) {
      const cur = out[pid];
      if (cur?.api) continue;
      const b = apiBasisForProduct(pid);
      const api = b && b.hasHistory ? String(Math.round(b.displayApi * 100) / 100) : "";
      out[pid] = { ...(cur ?? {}), api };
    }
    return out;
  }, [productInputs, plannedProductIds, apiBasisForProduct]);

  // Build the per-product API_60 override for a stale-API choice. `pick`
  // returns the chosen API for one product, or null to leave it on its
  // normal density (fresh products are never in the stale list anyway).
  const buildStaleOverride = useCallback((pick: (p: ProductRow) => number | null): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const sp of staleApiPrompt?.products ?? []) {
      const prod = terminalProducts.find((p) => p.product_id === sp.productId);
      if (!prod) continue;
      const v = pick(prod);
      if (v != null && Number.isFinite(v)) map[sp.productId] = Number(v);
    }
    return map;
  }, [staleApiPrompt, terminalProducts]);

  const handleStaleSafest = useCallback(() => {
    // Published heaviest -> api_min (fall back to api_60 if not seeded yet).
    const map = buildStaleOverride((p) => (p.api_min != null ? Number(p.api_min) : (p.api_60 != null ? Number(p.api_60) : null)));
    setStaleApiPrompt(null);
    requestBegin(map);
  }, [buildStaleOverride, requestBegin]);

  const handleStaleSafe = useCallback(() => {
    // "Heaviest this terminal has seen" -> the lowest of min_api_observed and
    // the last reading. Product min (api_min, else api_60) only when this
    // terminal has no history at all -- that's what "Safest" is for. This used
    // to clamp to min(observed, product min), which made Safe identical to
    // Safest at any terminal lighter than the published minimum (2026-09-28,
    // same fix as apiBasis.ts).
    const map = buildStaleOverride((p) => {
      const observed = [p.min_api_observed, p.last_api]
        .filter((v) => v != null && Number.isFinite(Number(v)))
        .map(Number);
      if (observed.length > 0) return Math.min(...observed);
      return p.api_min != null && Number.isFinite(Number(p.api_min)) ? Number(p.api_min)
        : p.api_60 != null && Number.isFinite(Number(p.api_60)) ? Number(p.api_60)
        : null;
    });
    setStaleApiPrompt(null);
    requestBegin(map);
  }, [buildStaleOverride, requestBegin]);

  const handleStaleIgnore = useCallback(() => {
    // Proceed on the last-known reading. Past 7 days the default basis is the
    // terminal min, so "Ignore" has to pin the reading explicitly.
    const map = buildStaleOverride((p) => {
      if (p.last_api == null || !Number.isFinite(Number(p.last_api)) || p.alpha_per_f == null) return null;
      const t = p.last_temp_f != null && Number.isFinite(Number(p.last_temp_f)) ? Number(p.last_temp_f) : 60;
      return backCorrectApiTo60(Number(p.last_api), t, Number(p.alpha_per_f));
    });
    setStaleApiPrompt(null);
    requestBegin(map);
  }, [buildStaleOverride, requestBegin]);

  // ProductTempModal's "Confirm & Continue" for the LOAD flow (step 2, after
  // the driver confirms/adjusts temp). Closes the temp modal, then runs the
  // stale-API check: if anything's stale, open the Good/Better/Best overlay;
  // otherwise begin directly. requestBegin's effect captures
  // preLoadCardedOnRef and starts begin_load. (The temp modal's own header
  // Close is the bail-out -- nothing has begun yet, nothing to undo.)
  const handleConfirmTempAndBeginLoad = useCallback(() => {
    setTempDialOpen(false);
    const stale = computeStalePlannedProducts();
    if (stale.length > 0) {
      setStaleApiPrompt({ products: stale });
    } else {
      requestBegin({});
    }
  }, [computeStalePlannedProducts, requestBegin]);

  // Per-product rows for the Temp modal's product list (dot + name + own
  // temp, tap to adjust just that one) -- same shape as LoadingModal's own
  // planned-compartments/product-groups rows, for visual continuity.
  const tempModalProductGroups = useMemo(() => {
    return Array.from(plannedProductIds)
      .map((pid) => ({
        productId: pid,
        name: productNameById.get(pid) ?? pid,
        hex: (productHexCodeById[pid] && productHexCodeById[pid].trim()) || "rgba(255,255,255,0.5)",
        tempF: productTempF[pid] ?? tempF,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plannedProductIds, productNameById, productHexCodeById, productTempF, tempF]);

  // City starring, stateOptions/selectedStateLabel/selectedStateName/cities/
  // topCities/allCities all live in shell now (see the destructure above) --
  // TerminalCatalogModal below is Planner-only dead code (never opened, see
  // this file's own git history) so its starBtnClass stays local; nothing
  // else here needs a second copy of the picker-list logic.
  const starBtnClass = (active: boolean) =>
    ["h-8 w-8 flex items-center justify-center rounded-[2px] border transition",
      active ? "border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10"
        : "border-white/10 text-white/40 hover:bg-white/5 hover:text-white/80"].join(" ");

  // ── Derived load state ─────────────────────────────────────────────────────
  // unavailableComps is deliberately NOT folded into loadDisabled -- per
  // spec, tapping LOAD while it's non-empty should produce an explicit
  // "Cannot Load" message (see loadBlockedMsg below), not just a silently
  // inert button, so a driver who ignores the compartment-bar warning still
  // gets told exactly why.
  const loadDisabled =
    loadWorkflow.beginLoadBusy ||
    !equipment.selectedComboId ||
    !location.selectedTerminalId ||
    !location.selectedState ||
    !location.selectedCity ||
    !location.selectedCityId ||
    planRows.length === 0;

  const [loadBlockedMsg, setLoadBlockedMsg] = useState<string | null>(null);
  useEffect(() => {
    if (unavailableComps.length === 0) setLoadBlockedMsg(null);
  }, [unavailableComps]);

  // "RELOAD" used to mean "the plan I'm about to submit is the same one
  // already on file as the last load," tracked via recapValid -- removed
  // along with that mechanism (see the recap card's own comment for why:
  // recapValid didn't actually verify the live plan matched the last real
  // load, it just trivially matched itself). Always "LOAD" now.
  // On a trip, the tap is the moment loading begins (it becomes the
  // pickup's begin time), so the button says so.

  // Mid-trip equipment change, shared with the Driver Dashboard: warning
  // before the picker, and the truck-change record when a loaded trailer is
  // now behind a different truck.
  const tripEquip = useTripEquipment(tripStoreHook, effectiveUserId || null);
  const openEquipment = tripEquip.openEquipment;

  // Begin Loading / Continue Trip from the dashboard: when a plan is already in
  // place, open Plan Review right over the dashboard (what BEGIN LOADING would
  // do). With no plan, or if it can't start, go to the Planner so the driver
  // can see why. Waits for presets/equipment and gives up after 8 s.
  const beginReadyRef = useRef({ go: false, plan: false, empty: false });
  beginReadyRef.current = {
    go: !loadDisabled && !tripNeedsArrive && !loadWorkflow.activeLoadId && unavailableComps.length === 0 && planSlots.presetsReady,
    plan: plannedProductIds.size > 0,
    // presets are in, nothing is planned, and nothing else is pending: no
    // plan to review, so don't wait for "go" (which can never become true)
    empty: planSlots.presetsReady && plannedProductIds.size === 0 && !tripNeedsArrive && !loadWorkflow.activeLoadId,
  };
  const beginTickRef = useRef<number | null>(null);
  const startBeginWatch = useCallback(() => {
    if (beginTickRef.current != null) window.clearInterval(beginTickRef.current);
    const started = Date.now();
    const finish = (open: boolean) => {
      if (beginTickRef.current != null) window.clearInterval(beginTickRef.current);
      beginTickRef.current = null;
      if (open) requestBegin({});
      else if (window.location.pathname !== "/planner") router.push("/planner?plan=1");
    };
    beginTickRef.current = window.setInterval(() => {
      const r = beginReadyRef.current;
      if (r.go) {
        // give a just-applied trip plan a moment to land before deciding
        if (!r.plan && Date.now() - started < 1500) return;
        finish(r.plan);
      } else if (r.empty && Date.now() - started > 1500) {
        finish(false);
      } else if (Date.now() - started > 8000) {
        finish(false);
      }
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, shell.setLoadOverlayOpen]);
  useEffect(() => () => { if (beginTickRef.current != null) window.clearInterval(beginTickRef.current); }, []);

  // Requests from other screens (shell.postPlannerIntent) and, for a hard
  // load, the old ?begin=1 / ?report= links.
  const intent = shell.plannerIntent;
  useEffect(() => {
    if (!intent) return;
    shell.consumePlannerIntent(intent.id);
    if (intent.kind === "begin") {
      void (async () => {
        // Plan Review is already running (the host stays mounted): just show it.
        if (loadWorkflow.activeLoadId) { loadWorkflow.setLoadingOpen(true); return; }
        // After a full reload the started load is gone from memory but the
        // pickup still points at it: finished -> its report, else release it
        // so Plan Review can start again on the same pickup.
        const rows = tripStoreHook.state.rows;
        const trip = effectiveUserId ? openTripForDriver(Object.values(rows.trips ?? {}) as TripRow[], effectiveUserId) : null;
        const comps = Object.values(rows.trip_compartment_loads ?? {}) as { pickup_id: string; disposition: string }[];
        const stale = trip
          ? (Object.values(rows.trip_pickups ?? {}) as TripPickupRow[]).find((p) =>
              p.trip_id === trip.trip_id && p.load_id && !p.left_at && !comps.some((c) => c.pickup_id === p.pickup_id && c.disposition !== "cancelled"))
          : null;
        if (stale?.load_id && effectiveUserId) {
          let status: string | null = null;
          try {
            const { data } = await supabase.from("load_log").select("status").eq("load_id", stale.load_id).maybeSingle();
            status = (data as { status?: string } | null)?.status ?? null;
          } catch { /* offline: treat as still planned */ }
          if (status === "loaded" || status === "completed") { void openLoadReportAtTerminal(stale.load_id); return; }
          try { await cancelPlannedLoad(stale.load_id); } catch (e) { console.warn("[trips] release planned load failed (non-fatal):", e); }
          clearActivePlannedLoad(effectiveUserId);
          unlinkCancelledLoad(getTripStore(effectiveUserId), { userId: effectiveUserId, loadId: stale.load_id, now: new Date(), newId: newTripId });
        }
        startBeginWatch();
      })();
    } else if (intent.kind === "report" && intent.loadId) {
      void openLoadReportAtTerminal(intent.loadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.id]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("begin")) return;
    params.delete("begin");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    startBeginWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Tells the screen underneath that Plan Review / a report is up.
  const overlayUp = !!(loadWorkflow.loadingOpen || loadWorkflow.reportLines);
  useEffect(() => { shell.setLoadOverlayOpen(overlayUp); }, [overlayUp]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same tap-to-load/tap-empty-to-save sequence the old PresetDial's own
  // onLoad/onSave props used -- preserved verbatim, just triggered from
  // PresetQuickPick's row taps now instead of the dial's.
  const handlePresetLoad = (n: number) => {
    planSlots.loadFromSlot(n);
    setActiveSlotLetter(n);
    setCaptureBaselineNext(true);
    setCheckAvailabilityNext(true);
    setPresetQuickPickOpen(false);
  };
  // The plan picked on Begin Trip: loaded the first time the Planner opens
  // for that trip (once presets have synced), then left alone.
  const tripPlanTripId = tripWaitingPickup?.trip_id ?? null;
  useEffect(() => {
    if (!effectiveUserId || !tripPlanTripId || !planSlots.presetsReady || !equipment.selectedComboId) return;
    const pending = getTripPlan(effectiveUserId, tripPlanTripId);
    if (!pending || pending.applied) return;
    markTripPlanApplied(effectiveUserId, tripPlanTripId);
    if (!planSlots.peekSlot(pending.slot)) return;
    handlePresetLoad(pending.slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, tripPlanTripId, planSlots.presetsReady, equipment.selectedComboId]);
  const handlePresetSaveEmpty = (n: number) => {
    planSlots.saveToSlot(n);
    setBaselineOverrides(overridesSnapshot(compPlan, cgSlider));
    setActiveSlotLetter(n);
    setPresetQuickPickOpen(false);
  };

  // Extracted to a const purely for readability -- rendered in exactly one
  // spot, full-width, in every orientation (see the render below for why).
  const presetQuickPickEl = (
    <PresetQuickPick
      open={presetQuickPickOpen}
      onClose={() => setPresetQuickPickOpen(false)}
      slots={planSlots.PLAN_SLOTS}
      slotHas={planSlots.slotHas}
      activeSlot={activeSlotLetter}
      // Also gated on presetsReady -- until the initial server sync for
      // this equipment combo has actually completed, a slot that reads
      // "empty" might just be unsynced, not really empty, and tapping it
      // would treat it as an implicit save. Interacting during that
      // window silently overwrote real presets with whatever was
      // on-screen at the time -- see usePlanSlots.ts.
      disabled={!location.selectedTerminalId || !planSlots.presetsReady}
      disabledReason={!location.selectedTerminalId ? "Select a terminal first" : "Syncing presets…"}
      getSummary={summaryForSlot}
      getName={nameForSlot}
      getColors={colorsForSlot}
      onLoad={handlePresetLoad}
      onSaveEmpty={handlePresetSaveEmpty}
      onOpenActions={(n) => setPresetSheetSlot(n)}
      onRename={(n, name) => planSlots.renameSlot(n, name)}
      onRecallLastLoad={handleRecallLastLoad}
    />
  );

  const planLetterIconRef = useRef<HTMLButtonElement | null>(null);
  const savePlanButtonRef = useRef<HTMLButtonElement | null>(null);
  const compartmentsAreaRef = useRef<HTMLDivElement | null>(null);

  const stabilityBannerEl = unstableLoad ? (
    <div style={{ ...styles.error, marginTop: 0, marginBottom: 12, textAlign: "center" as const }}>
      ⚠️ Unstable load (rear of neutral)
    </div>
  ) : null;

  const currentOverrides = overridesSnapshot(compPlan, cgSlider);
  const isDirty = currentOverrides !== baselineOverrides;

  // ── Plan Builder (wizard) + compartment detail ─────────────────────────────
  // Every coupled trailer must have at least one plan. With none (no preset
  // 1-5 holding a product and nothing live), the Plan Builder opens by itself
  // and cannot be dismissed; "New Plan" on the Plan page opens it on request.
  const [wizardNew, setWizardNew] = useState(false);
  const [detailComp, setDetailComp] = useState<number | null>(null);
  const hasAnyPlan = useMemo(() => {
    const holds = (plan: any) => Object.values(plan ?? {}).some((v: any) => v && !v.empty && v.productId);
    if (holds(compPlan)) return true;
    for (let n = 1; n <= 5; n++) { const snap = planSlots.peekSlot(n); if (snap && holds(snap.compPlan)) return true; }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compPlan, planSlots.slotHas, planSlots.presetsReady, equipment.selectedComboId]);
  const wizardAuto = !!equipment.selectedComboId && !equipment.isBobtail && !equipment.isTrailerOnly
    && !!selectedTrailerId && !compLoading && compartments.length > 0
    && planSlots.presetsReady && planRestoreAttempted
    && !onboardingActive && !setupSession && !hasAnyPlan
    && !loadWorkflow.loadingOpen && !loadWorkflow.activeLoadId;
  const wizardOpen = wizardNew || wizardAuto;
  const canSetCap = shell.isSuperAdmin || shell.role === "admin" || shell.role === "lead" || shell.role === "dispatch";

  const handleWizardSaveCaps = useCallback(async (changes: Record<number, number>) => {
    if (!selectedTrailerId) return;
    for (const [n, cap] of Object.entries(changes)) {
      const { data, error } = await supabase.from("trailer_compartments").update({ cap_gallons: cap })
        .eq("trailer_id", selectedTrailerId).eq("comp_number", Number(n)).select("comp_number");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("not allowed to change this cap");
    }
    setCompartments((prev) => prev.map((c) => (changes[Number(c.comp_number)] != null ? { ...c, cap_gallons: changes[Number(c.comp_number)] } : c)));
  }, [selectedTrailerId]);

  const handleWizardFinish = useCallback((plan: Record<number, any>) => {
    const slotFilled = (n: number) => { const snap = planSlots.peekSlot(n); return !!snap && Object.values(snap.compPlan ?? {}).some((v: any) => v && !v.empty && v.productId); };
    const empty = [1, 2, 3, 4, 5].find((n) => !slotFilled(n));
    const target = empty ?? activeSlotLetter;
    const first = !hasAnyPlan;
    planSlots.saveSnapshotToSlot(target, { compPlan: plan, name: first ? "Default" : undefined }, { makeLive: true });
    setActiveSlotLetter(target);
    setCaptureBaselineNext(true);
    setBaselineOverrides(overridesSnapshot(plan, cgSlider));
    setWizardNew(false);
    if (!wizardNew && !active) router.push("/planner?plan=1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSlots, activeSlotLetter, hasAnyPlan, cgSlider, wizardNew, active, router]);

  // ── Partial equipment (Phase 2: persistent bobtail / trailer-only) ────────
  // A driver can hold just a truck (bobtail) or just a trailer (via a
  // per-unit take-over) with no full combo. The setup gate is satisfied by
  // that held unit (see comboSelected below), so the planner body renders --
  // but there's no tare and no compartments, so the whole plan/compartments/
  // CG/recap/LOAD apparatus is hidden and replaced with a prompt to pick the
  // missing unit. A partial state literally cannot load, by construction:
  // there is no full combo for beginLoadToSupabase to snapshot.
  const isPartialEquipment = equipment.isBobtail || equipment.isTrailerOnly;
  const heldUnitLabel = equipment.isBobtail
    ? (equipment.currentTruckName ? `Truck ${equipment.currentTruckName}` : "Truck")
    : (equipment.currentTrailerName ? `Trailer ${equipment.currentTrailerName}` : "Trailer");
  const missingUnitWord = equipment.isBobtail ? "trailer" : "truck";
  const partialPanelEl = (
    <div style={{ marginTop: 24, textAlign: "center" as const }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
        Currently holding
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 4 }}>{heldUnitLabel}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 8, lineHeight: 1.5, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
        {equipment.isBobtail
          ? "No trailer coupled — add one to plan a load."
          : "No truck coupled — add one to plan a load."}
      </div>
      <button type="button" onClick={openEquipment}
        style={{ marginTop: 18, background: "#ffffff", color: "#000000", border: "none", borderRadius: 2, padding: "12px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        Select a {missingUnitWord}
      </button>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  // Landscape: trim the page's own side padding (16px -> 6px each side) so
  // the two-column row below reclaims that width instead of leaving it as
  // unused margin -- symmetric either way, so the preset dial's own
  // "center within this content width" math (see below) still lands
  // exactly on the viewport center, same as the tab bar's own centering,
  // regardless of how much padding there is. Portrait keeps the original
  // 16px unchanged.
  //
  // Landscape also raises styles.page's own maxWidth (1100, shared by
  // every page in the app) -- missed in an earlier pass, and the real
  // reason a three-column row once measured only ~1088px wide on a
  // 1400px-wide viewport (156px of dead margin on each side,
  // `margin:"0 auto"` centering a page that was still capped at 1100
  // regardless of the padding fix). 1100 stays exactly as-is for
  // portrait. Safe to raise unconditionally for every landscape width
  // now (not gated behind a wide-only threshold) -- the row's own
  // transform:scale is what actually bounds its rendered size (capped at
  // 1.6x, see rowScale above), so a generous maxWidth here just means a
  // narrow phone's own physical width remains the real limit, same as
  // before.
  // paddingTop/paddingBottom are ALSO trimmed here now (6px, was still the
  // original 16px -- a real, found-live gap, not a guess: `...styles.page`
  // spreads padding:16 on all four sides first, and the paddingLeft/Right
  // override above only ever touched two of them, silently leaving 16px
  // of unclaimed vertical space above the preset dial on every landscape
  // load). Per explicit follow-up: "there's a bunch of empty space above
  // the equipment button... shift the whole thing up to just below the
  // header."
  const pageStyle = isLandscape
    ? { ...styles.page, padding: 6, maxWidth: 1800 }
    : styles.page;
  // Shown in Plan Review once loading begins (not while planning).
  const supplierPanelEl = (
    <SupplierPanel
        userId={effectiveUserId || null}
        companyId={shell.companyId || null}
        terminalId={location.selectedTerminalId ? String(location.selectedTerminalId) : null}
        terminalName={terminalLabel ?? null}
        rackId={location.selectedRackId ? String(location.selectedRackId) : null}
        truckLabel={equipment.truckNameById[equipment.selectedCombo?.truck_id ?? ""] ?? ""}
        products={supplierPanelProducts}
        picks={resolvedSupplierPicks}
        onPicks={onSupplierPicks}
        suppliers={tripSuppliers}
        onAddSupplier={addTripSupplier}
        promptToken={supplierPromptToken}
        onSkip={supplierPicks.skip}
        onSwitched={onSupplierSwitched}
    />
  );

  return (
    <>
    <div style={active ? pageStyle : { display: "none" }}>
      {(leaving || reportPending) && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 49, background: "#0b0b0b", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "rgba(255,255,255,0.55)", fontSize: 15 }}>
          <Spinner size={14} />{leaving ?? "Opening load report…"}
        </div>,
        document.body,
      )}
      {/* Admin setup session banner */}
      {setupSession && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", marginBottom: 8, borderRadius: 2, background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.30)" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fb923c", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Setting up planner for</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginTop: 1 }}>{setupSession.targetDisplayName}</div>
          </div>
          <button type="button"
            onClick={() => {
              clearSetupSession();
              // Hard navigation -- when returnTo stays inside the
              // /planner layout (e.g. "/planner/dispatch"),
              // CalculatorShellProvider never unmounts on a router.push, so
              // it never re-reads sessionStorage and the just-cleared
              // session would silently stick (confirmed live: the "Setting
              // up planner for" banner stayed visible after this click).
              // Same fix as the Dispatch tab's own "Use app as X" entry
              // point, applied symmetrically to the exit.
              window.location.href = setupSession.returnTo ?? "/admin";
            }}
            style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 2, border: "1px solid rgba(251,146,60,0.40)", background: "rgba(251,146,60,0.15)", color: "#fb923c", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            ← Return to {setupSession.returnTo === "/planner/dispatch" ? "Dispatch" : "Admin"}
          </button>
        </div>
      )}

      {/* PresetQuickPick + PresetActionSheet -- both plain overlay sheets,
          position in the JSX tree doesn't matter functionally, rendered
          together here. The plan-letter icon that opens PresetQuickPick
          lives in the new compact icon row inside mainInfoStack below (see
          that row's own definition) -- replacing the old swipeable
          PresetDial, which used to render here as its own full-width
          element (portrait) or inside the compartments column (landscape).
          Both those render sites are gone; this is purely the sheet
          itself now, not a visible-by-default element. */}
      {presetQuickPickEl}

      <PresetActionSheet
        open={presetSheetSlot != null}
        letter={presetSheetSlot != null ? String.fromCharCode(64 + presetSheetSlot) : ""}
        summary={presetSheetSummary}
        onLoad={() => {
          if (presetSheetSlot != null) {
            planSlots.loadFromSlot(presetSheetSlot);
            setActiveSlotLetter(presetSheetSlot);
            setCaptureBaselineNext(true);
            setCheckAvailabilityNext(true);
          }
          setPresetSheetSlot(null);
        }}
        onConfirmEdit={() => {
          if (presetSheetSlot != null) {
            planSlots.saveToSlot(presetSheetSlot);
            setBaselineOverrides(overridesSnapshot(compPlan, cgSlider));
          }
          setPresetSheetSlot(null);
        }}
        onConfirmClear={() => {
          if (presetSheetSlot != null) planSlots.clearSlot(presetSheetSlot);
          setPresetSheetSlot(null);
        }}
        onClose={() => setPresetSheetSlot(null)}
      />

      {/* Action row ("Save plan {letter}" / "Edit Comp N Product") used to
          render here, portrait-only, ahead of locationLineEl/compartments
          -- now renders as part of the single top cluster inside the
          compartments column below (locationLineEl -> stabilityBannerEl
          -> actionRowEl -> PlannerControls), unconditional on orientation,
          per explicit direction that locationLineEl should be the top row
          with everything else -- including this -- below it. */}

      {/* Single content column, both orientations -- see LANDSCAPE_MAX_W's
          own comment above for why the old fixed-width two-column +
          transform:scale system is gone. locationLineEl/stabilityBannerEl/
          actionRowEl/compartments/CG-slider all live in this first block;
          recap+points/Load button are a second sibling block below (see
          the IIFE further down) -- two adjacent margin:auto divs at the
          same maxWidth read as one continuous column, so splitting them
          this way (rather than merging the second IIFE's body up into
          this one) needed no change to how either block's own internals
          are written. */}
      <div style={isLandscape ? { maxWidth: LANDSCAPE_MAX_W, margin: "0 auto" } : undefined}>
      <TripEquipmentSheets {...tripEquip.sheets} />
      {isPartialEquipment ? partialPanelEl : (
      <>
      {stabilityBannerEl}
      <div ref={compartmentsAreaRef} style={{ marginTop: 16 }}>
      <PlannerControls
        styles={styles}
        selectedTrailerId={selectedTrailerId}
        compLoading={compLoading}
        compartments={compartments}
        compError={compError}
        persistedCapForComp={persistedCapForComp}
        effectiveMaxGallonsForComp={effectiveMaxGallonsForComp}
        plannedGallonsByComp={plannedGallonsByComp}
        compPlan={compPlan}
        setCompPlan={setCompPlan}
        terminalProducts={terminalProducts}
        selectedComp={selectedComp}
        onSelectComp={(n: number) => setDetailComp(n)}
        selectedTerminalId={location.selectedTerminalId ?? ""}
        isLandscape={isLandscape}
      />
      </div>

      <CompartmentModal
        open={compModalOpen}
        compNumber={compModalComp}
        compartments={compartments}
        compPlan={compPlan}
        terminalProducts={terminalProducts}
        styles={styles}
        setCompPlan={setCompPlan}
        onClose={() => { setCompModalOpen(false); setCompModalComp(null); setSelectedComp(null); }}
        selectedRackId={active ? "" : (location.selectedRackId ?? "")}
        rackName={selectedRackName}
        terminalName={terminalLabel}
        onTerminalProductsChanged={fetchTerminalProducts}
        myRole={shell.role}
        searchable
      />

      {(() => {
        const n = detailComp;
        const c = n == null ? null : compartments.find((x) => Number(x.comp_number) === n);
        if (n == null || !c) return null;
        const trueMax = Number(c.max_gallons ?? 0);
        const persisted = persistedCapForComp(n);
        const sel = compPlan[n];
        const isEmpty = !!sel?.empty || !sel?.productId;
        const prod: any = !isEmpty ? terminalProducts.find((p) => p.product_id === sel?.productId) : null;
        const name = prod ? String(prod.display_name || prod.product_name || "Product") : "Empty";
        return (
          <CompartmentDetailModal
            open
            compNumber={n}
            trueMax={trueMax}
            persistedCap={persisted}
            capGallons={effectiveMaxGallonsForComp(n, persisted)}
            plannedGallons={Number(plannedGallonsByComp?.[n] ?? 0)}
            hasOverride={sel?.capOverride != null}
            productLabel={name}
            code={isEmpty ? "MT" : String(prod?.button_code ?? prod?.product_code ?? name.split(" ")[0]).trim().toUpperCase()}
            color={(prod?.hex_code && String(prod.hex_code).trim()) || productColorFor(prod?.product_name ?? "")}
            isEmpty={isEmpty}
            onCapChange={(g) => setCompPlan((prev: any) => ({ ...prev, [n]: { ...(prev[n] ?? { empty: false, productId: "" }), capOverride: g } }))}
            onResetCap={() => setCompPlan((prev: any) => ({ ...prev, [n]: { ...(prev[n] ?? { empty: false, productId: "" }), capOverride: null } }))}
            onChangeProduct={() => { setDetailComp(null); setCompModalComp(n); setCompModalOpen(true); }}
            onClose={() => setDetailComp(null)}
          />
        );
      })()}

      {/* CG Slider — always visible. The "Unstable load" warning that used
          to render right here moved up to the top cluster (see
          stabilityBannerEl, above locationLineEl/actionRowEl) per explicit
          direction -- unstableLoad itself is unchanged, just read from a
          different render site now. */}
      <div style={{ marginTop: 18 }}>
        <style jsx global>{`
          input.cgRange { -webkit-appearance: none; appearance: none; background: transparent; height: 24px; }
          input.cgRange:focus { outline: none; }
          input.cgRange::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.10); border: none; }
          input.cgRange::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -9px; background: transparent; border: none; opacity: 0; }
          input.cgRange::-moz-range-track { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.10); border: none; }
          input.cgRange::-moz-range-thumb { width: 22px; height: 22px; background: transparent; border: none; opacity: 0; }
        `}</style>
        <div style={{ position: "relative", width: "100%" }}>
          <input type="range" className="cgRange" min={0} max={1} step={0.005} value={cgSlider}
            onChange={(e) => setCgSlider(Number(e.target.value))}
            style={{ width: "100%" }} disabled={!equipment.selectedCombo}
          />
          {/* Puck — fixed white now, per explicit direction ("the CG
              handle to white"), no longer accent/theme-driven. */}
          <div aria-hidden style={{
            position: "absolute",
            left: `${Math.max(0, Math.min(1, cgSlider)) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 22, height: 22,
            borderRadius: "50%",
            background: "#ffffff",
            pointerEvents: "none",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px", marginTop: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>Rear</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>Front</span>
        </div>
      </div>
      </>
      )}
      </div>
      {/* ── Info cards, Load button, Load summary ── */}
      {(() => {
        // Real bug found live: this card used to show the LAST COMPLETED
        // load's own numbers (via loadReport), gated on a "recapValid"
        // freshness check -- but that check compared the live plan against
        // a baseline captured whenever loadReport happened to change, which
        // on a fresh mount/refresh is seeded from history (usePlanSlots'
        // own comboClaim effect always sets lastLoadReport to the last
        // completed load, independent of whatever draft actually restored)
        // -- not from anything that verified the two ever matched. The
        // baseline just trivially matched whatever was already live at that
        // moment, so the card confidently displayed a past load's (e.g.
        // "Plan B") numbers under whatever plan the driver actually had
        // open, and its label -- a full-width tappable button wired to
        // Recall Last Load -- silently overwrote the live plan with that
        // past load's content on a single tap that looked like inert status
        // text. Per explicit direction, this card is now a plain LIVE
        // summary of whatever's actually in the compartments right now --
        // no history, no validity check, nothing to accidentally recall.
        // Recall Last Load still exists as its own explicit action, moved
        // into PresetQuickPick (see onRecallLastLoad below) where it can't
        // be tapped by accident.
        const plannedGal = effectivePlanRows.length ? effectivePlannedGallonsTotal : null;
        const plannedGalText = plannedGal == null ? "—" : `${Math.round(plannedGal).toLocaleString()} gal`;
        const grossLbs = plannedGal != null ? livePreviewGrossLbs : null;
        const grossText = grossLbs == null ? "—" : `${Math.round(grossLbs).toLocaleString()} lbs`;

        // Live planned gross weight, colored against this combo's own
        // target and the fixed 80,000 lb federal legal limit (same
        // threshold LoadReportModal already uses for its "drain to 80k"
        // line).
        const LEGAL_GROSS_LBS = 80000;
        const grossColor =
          grossLbs == null || !(targetWeight > 0) ? "#fff"
          : grossLbs >= LEGAL_GROSS_LBS ? "#ef4444"
          : grossLbs >= targetWeight ? "#4ade80"
          : "#fff";

        // Plan-letter / Equipment / Location cluster -- portaled into the
        // shared header's slot div (see headerIconsSlot above and
        // CalculatorLayoutClient.tsx's own comment) instead of rendering as
        // its own row in the page body. Styling matches the mockup: plan
        // letter is bold text with a small active dot underneath (not a
        // boxed icon button), Equipment is a plain "EQ" label (a flat muted
        // tone regardless of hasEquipment -- the mockup shows this gray
        // even with real equipment selected), Location is a solid/filled
        // pin (not the stroke outline used elsewhere). Temperature used to
        // be a fourth icon here (a live °F reading, color carrying
        // confidence) -- removed per explicit direction to reduce the
        // header's icon count. Temp is confirmed/adjusted on the LOAD tap
        // (ProductTempModal, step 1) and again per product at Log the Load,
        // so there's no standalone always-on temp control in the header.
        const headerIconsEl = (
          <>
            {/* Trailer number, gray. Equipment, terminal and the bell are not
                needed on the Plan page. */}
            {equipmentDetails.trailerName ? (
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3, color: "rgba(255,255,255,0.5)" }}>
                {equipmentDetails.trailerName}
              </span>
            ) : null}
          </>
        );

        // Recap + incentive-points cards. Per explicit follow-up against a
        // real device screenshot of the previous "merged into one inline
        // stats band" landscape treatment ("that looks bad... keep the
        // cards the way they look in portrait mode, just shift the card
        // over so they're side by side") -- recapCard/pointsCard below are
        // now EXACTLY portrait's own card content/layout (label, gal/lbs
        // baseline row, right-aligned target/diff, This-Load/Period-Avg
        // space-between row) with zero mode-dependent field styling left
        // in them at all. The only thing that changes across portrait/
        // landscape/ultra-wide is how the two whole cards are ARRANGED
        // (stacked, side by side, or grid cell) -- never their own
        // internal look. `flex:1, minWidth:0` on each card is what makes
        // them share width evenly when placed in a row; harmless (and
        // simply unused) when they're stacked in a column instead.
        const recapCard = (
          <div style={{ borderRadius: 2, background: "transparent", padding: "10px 14px", flex: 1, minWidth: 0 }}>
            {/* Plain status text now -- not a button, nothing to tap. See
                this block's own comment above for why this used to
                silently overwrite the live plan. */}
            <div style={{
              marginBottom: 6, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase" as const, letterSpacing: 0.4,
            }}>
              Plan
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{plannedGalText}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: grossColor, textAlign: "right" as const }}>{grossText}</div>
            </div>
            {!active && planUsesReferenceApi && planRows.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: "#fb923c", marginTop: 4 }}>⚠ using ref API</div>
            )}
          </div>
        );

        // The Plan page's button: "New Plan" starts the Plan Builder; once the
        // driver changes anything it becomes "Save Plan" and goes back to
        // "New Plan" after saving.
        const planPickerEl = (
          <button ref={planLetterIconRef} type="button" disabled={!planSlots.presetsReady}
            onClick={() => setPresetQuickPickOpen(true)}
            style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)", padding: "12px 14px", width: "100%", cursor: planSlots.presetsReady ? "pointer" : "not-allowed", opacity: planSlots.presetsReady ? 1 : 0.4, color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: 0.3 }}
          >
            Plan {String.fromCharCode(64 + activeSlotLetter)} ▾
          </button>
        );
        const planButtonEl = (
          <button ref={savePlanButtonRef} type="button"
            onClick={() => {
              if (isDirty) { planSlots.saveToSlot(activeSlotLetter); setBaselineOverrides(currentOverrides); }
              else setWizardNew(true);
            }}
            style={{ borderRadius: 2, border: "none", background: "#ffffff", padding: "12px 14px", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: "#000000", letterSpacing: 0.3 }}>{isDirty ? "Save Plan" : "New Plan"}</span>
          </button>
        );
        const closeButtonEl = (
          <button type="button" aria-busy={!!leaving}
            onClick={() => leaveTo("/planner/home", "Opening dashboard…")}
            style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)", padding: "12px 14px", width: "100%", cursor: "pointer", color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 700, letterSpacing: 0.3 }}
          >
            Close
          </button>
        );

        // Partial (bobtail / trailer-only): no full combo -> no recap, no
        // utilization, no LOAD. Only the header icon cluster (EQ / pin /
        // plan-letter) still portals in, so the driver can pick the missing
        // unit. The partial prompt itself renders up in the compartments
        // block (partialPanelEl), not here.
        if (isPartialEquipment) {
          return <>{active && headerIconsSlot && createPortal(headerIconsEl, headerIconsSlot)}</>;
        }
        return (
          <>
            <div style={isLandscape ? { maxWidth: LANDSCAPE_MAX_W, margin: "0 auto", marginTop: 14, display: "flex", flexDirection: "column", gap: 12 } : { marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
              {recapCard}
              {planPickerEl}
              {planButtonEl}
              {closeButtonEl}
            </div>
            {active && headerIconsSlot && createPortal(headerIconsEl, headerIconsSlot)}
          </>
        );
      })()}

      {onboardingActive ? (
        <SoloOnboarding
          userId={effectiveUserId}
          companyId={shell.companyId!}
          selectedState={location.selectedState}
          selectedCity={location.selectedCity}
          selectedTerminalId={location.selectedTerminalId}
          onOpenLocation={() => setLocOpen(true)}
          onOpenTerminal={() => setTermOpen(true)}
          fetchCombos={equipment.fetchCombos}
          setSelectedComboId={equipment.setSelectedComboId}
          setCurrentEquipment={equipment.setCurrentEquipment}
          onComplete={() => setOnboardingDone(true)}
        />
      ) : (
        <SetupGate
          comboSelected={!!equipment.selectedComboId || equipment.isBobtail || equipment.isTrailerOnly}
          locationSelected={!!(location.selectedState && location.selectedCity) || active}
          terminalSelected={!!location.selectedTerminalId || active}
          equipmentLabel={equipment.equipmentLabel}
          locationLabel={location.locationLabel}
          terminalLabel={terminalLabel}
          onOpenEquipment={() => setEquipOpen(true)}
          onOpenLocation={() => setLocOpen(true)}
          onOpenTerminal={() => setTermOpen(true)}
        />
      )}

    </div>
      {/* ── Modals ── (outside the page div, so they still show while the Planner itself is hidden) */}
      <PlanWizard
        open={wizardOpen}
        mode={wizardNew ? "new" : "first"}
        compartments={compartments}
        products={planCatalogProducts}
        canSetCap={canSetCap}
        replacingLetter={wizardNew && [1, 2, 3, 4, 5].every((n) => { const snap = planSlots.peekSlot(n); return !!snap && Object.values(snap.compPlan ?? {}).some((v: any) => v && !v.empty && v.productId); }) ? String.fromCharCode(64 + activeSlotLetter) : null}
        onSaveCaps={handleWizardSaveCaps}
        onFinish={handleWizardFinish}
        onCancel={() => setWizardNew(false)}
      />
      <LoadingModal
        supplierSection={supplierPanelEl}
        open={loadWorkflow.loadingOpen} onClose={() => { /* no accidental dismissal -- exits are the explicit buttons */ }}
        userId={effectiveUserId}
        styles={styles}
        planRows={effectivePlanRows as any[]}
        capOverrides={capOverridesForReview}
        productNameById={productNameById}
        productHexCodeById={productHexCodeById}
        productInputs={productInputsForModal}
        equipmentLabel={equipment.equipmentLabel}
        terminalLabel={terminalLabel}
        locationLabel={location.locationLabel}
        rackName={selectedRackName}
        onTapTerminal={handleTapTerminalInLoadingModal}
        onSetCompartmentCap={(comp, capGallons) => {
          // Tap-to-adjust in Plan Review sets the compartment CAP (feeds the
          // weight-bounded solver -> can't overload), not a raw gallons
          // override. Bounded to the physical cap; recomputes the plan live.
          const physical = persistedCapForComp(comp);
          const clamped = Math.max(0, Math.min(physical || capGallons, Math.round(capGallons)));
          setCompPlan((prev: any) => ({
            ...prev,
            [comp]: { ...(prev[comp] ?? { empty: false, productId: "" }), capOverride: clamped },
          }));
        }}
        persistedCapForComp={persistedCapForComp}
        livePreviewGrossLbs={livePreviewGrossLbs}
        livePreviewDiffLbs={livePreviewDiffLbs}
        targetWeight={targetWeight}
        report={loadWorkflow.reportLines ? {
          lines: loadWorkflow.reportLines,
          actualGrossLbs: loadWorkflow.loadReport?.actual_gross_lbs ?? null,
        } : null}
        onNewLoad={loadWorkflow.closeLoadReport}
        onEditLoad={(entries, extras) => loadWorkflow.onLoadedFromLoadingModal(entries, { loadId: loadWorkflow.reportLoadId ?? undefined, afterTripRecord: () => recordTripLoaded(extras, true) })}
        onDeleteLoad={loadWorkflow.deleteReportedLoad}
        deleteBusy={loadWorkflow.reportBusy}
        deleteError={loadWorkflow.reportError}
        onLoaded={(entries, extras) => loadWorkflow.onLoadedFromLoadingModal(entries, extras ? { afterTripRecord: () => recordTripLoaded(extras, false) } : undefined)}
        trip={tripModeForLoading}
        onFinishLoadingStart={loadGeoShips}
        onUpdateCardOnly={() => loadWorkflow.cancelActiveLoad()}
        onReportTerminalIssue={() => setCancelLoadConfirmOpen(true)}
        onBackToPlanner={handleBackToPlannerNoUpdate}
        onAdjustPlan={handleBackToPlannerNoUpdate}
        loadedDisabled={loadWorkflow.completeBusy}
        loadedLabel={loadWorkflow.completeBusy ? "Saving…" : "Finish Loading"}
        returnLabel={reportFromDashboard ? "Back to Dashboard" : undefined}
        errorMessage={loadWorkflow.completeError}
        allPlannedUnavailable={unavailableComps.length > 0}
        tuneRows={tuneRows}
        onTuneProduct={onTuneProduct}
        tuneTempColor={tuneTempColor}
        ambientTempF={fuelTempAmbientF}
        fuelTankGallons={fuelTankGallons}
        liveFuelPct={recentFuelPct}
        onSaveFuelTankGallons={saveFuelTankGallons}
      />

      <TerminalSwitchDuringLoadSheet
        open={!!terminalSwitchConfirm}
        prevTerminalName={terminalSwitchConfirm?.prev.terminalName ?? ""}
        newTerminalName={terminalSwitchConfirm?.next.terminalName ?? ""}
        onUpdateCardAtPrevious={handleUpdateCardAtPrevious}
        onSwitchWithoutUpdating={handleSwitchWithoutUpdating}
        darkMode={shell.theme.darkMode}
        accentColor={shell.theme.accentColor}
        planRows={effectivePlanRows as any[]}
        productNameById={productNameById}
        onSubmitOutageReport={handleSubmitOutageReportForPreviousTerminal}
        requireReason={!!((loadWorkflow.activeLoadId && tripPickup) || tripWaitingPickup?.arrived_at)}
        onReasonPicked={(code, note) => {
          if (!switchReportedIssueRef.current) switchReportedIssueRef.current = code;
          switchReasonNoteRef.current = note;
        }}
      />

      {/* Opened only from the Loading modal's "Report Terminal Issue" button
          now (the other three actions are the modal's own buttons), so it
          opens straight into the outage-report flow. */}
      <CancelLoadSheet
        open={cancelLoadConfirmOpen}
        initialMode="reportType"
        onDismiss={() => setCancelLoadConfirmOpen(false)}
        onBackToPlanner={() => { setCancelLoadConfirmOpen(false); handleBackToPlannerNoUpdate(); }}
        onLogTheLoad={() => { setCancelLoadConfirmOpen(false); loadWorkflow.onLoadedFromLoadingModal({}); }}
        onUpdateCardOnly={() => { setCancelLoadConfirmOpen(false); loadWorkflow.cancelActiveLoad(); }}
        darkMode={shell.theme.darkMode}
        accentColor={shell.theme.accentColor}
        planRows={effectivePlanRows as any[]}
        productNameById={productNameById}
        onSubmitOutageReport={handleSubmitOutageReport}
      />

      <StaleApiOverlay
        open={!!staleApiPrompt}
        products={staleApiPrompt?.products ?? []}
        onSafest={handleStaleSafest}
        onSafe={handleStaleSafe}
        onIgnore={handleStaleIgnore}
        onCancel={() => setStaleApiPrompt(null)}
      />

      <RecallDifferentEquipmentSheet
        open={!!altEquipmentPrompt}
        truckLabel={altEquipmentPrompt?.truckLabel ?? ""}
        trailerLabel={altEquipmentPrompt?.trailerLabel ?? ""}
        onViewInReports={handleViewAltLoadInReports}
        onCancel={() => setAltEquipmentPrompt(null)}
        darkMode={shell.theme.darkMode}
        accentColor={shell.theme.accentColor}
      />

      <ProductTempModal
        open={tempDialOpen}
        onClose={() => { setTempDialOpen(false); setTempReconfirmProductIds(null); }}
        // Two callers share this instance: the LOAD flow's pre-load temp
        // confirm (tempReconfirmProductIds null -> confirm temp, then
        // stale-API check, then begin) and the mid-load terminal-switch
        // different-city reconfirm (tempReconfirmProductIds set -> propagate
        // the confirmed temp into the in-progress plan and return to Plan
        // Review).
        onConfirm={tempReconfirmProductIds != null ? handleConfirmTempReconfirm : handleConfirmTempAndBeginLoad}
        styles={styles}
        selectedCity={location.selectedCity}
        selectedState={location.selectedState}
        selectedTerminalId={location.selectedTerminalId}
        ambientTempLoading={fuelTempLoading && fuelTempAmbientF == null}
        ambientTempF={fuelTempAmbientF}
        tempF={tempF}
        setTempF={setTempF}
        productGroups={tempModalProductGroups}
        onSetProductTemp={setSingleProductTempF}
        predictedFuelTempF={predictedFuelTempF}
        fuelTempConfidence={fuelTempConfidence}
        fuelTempLoading={fuelTempLoading}
        TempDial={TempDial}
      />

      {/* LocationModal/MyTerminalsModal now mount once in ShellChrome (see
          CalculatorLayoutClient.tsx) -- shared with the Terminal tab's own
          identity header, both reading/writing the one shell.location. */}

      <TerminalCatalogModal
        open={catalogOpen}
        onClose={() => { setCatalogOpen(false); setTermOpen(true); }}
        selectedState={location.selectedState}
        selectedCity={location.selectedCity}
        termError={terminals.termError}
        catalogError={terminals.catalogError}
        catalogTerminalsInCity={catalogTerminalsInCity}
        myTerminalIds={myTerminalIdSet}
        setMyTerminalIds={() => {}}
        catalogExpandedId={catalogExpandedId}
        setCatalogExpandedId={setCatalogExpandedId}
        catalogEditingDateId={catalogEditingDateId}
        setCatalogEditingDateId={setCatalogEditingDateId}
        accessDateByTerminalId={terminals.accessDateByTerminalId}
        setAccessDateForTerminal_={terminals.setAccessDateForTerminal}
        isoToday_={(tz) => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); return `${p.find(x=>x.type==="year")?.value}-${p.find(x=>x.type==="month")?.value}-${p.find(x=>x.type==="day")?.value}`; }}
        toggleTerminalStar={terminals.toggleTerminalStar}
        starBtnClass={starBtnClass}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
        setCatalogOpen={setCatalogOpen}
        setTermOpen={setTermOpen}
      />

    </>
  );
}
