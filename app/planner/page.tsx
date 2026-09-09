"use client";
import { motion } from "framer-motion";
import { clearSetupSession } from "@/lib/setupSession";
import { useRouter } from "next/navigation";
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



import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { usePlanRows } from "./hooks/usePlanRows";
import {
  computeAvailableCapacity,
  DEFAULT_COMPANY_TARGET_GROSS_LBS,
  DEFAULT_LEGAL_GROSS_LBS,
  type CapacityCompartmentInput,
} from "@/lib/capacity/computeAvailableCapacity";
import { UTILIZATION_ACTUAL_WORD } from "@/lib/capacity/computeUtilization";
import { useDriverPeriodUtilization } from "@/lib/capacity/useUtilization";
import { useUtilizationPeriod } from "@/lib/capacity/useUtilizationPeriod";
import { useFuelTempPrediction } from "./hooks/useFuelTempPrediction";

// ── Sections ───────────────────────────────────────────────────────────────────
import PlannerControls from "./sections/PlannerControls";
import { useIsLandscape } from "./hooks/useOrientation";
import PresetActionSheet from "./components/PresetActionSheet";
import PresetQuickPick from "./components/PresetQuickPick";
import { SolidPinIcon } from "./components/PlannerIcons";

// ── Modals ─────────────────────────────────────────────────────────────────────
// LocationModal/MyTerminalsModal now mount once in ShellChrome
// (CalculatorLayoutClient.tsx) -- see the render-site comment further down.
import TerminalCatalogModal from "./modals/TerminalCatalogModal";
import LoadingModal from "./modals/LoadingModal";
import CancelLoadSheet from "./components/CancelLoadSheet";
import TerminalSwitchDuringLoadSheet from "./components/TerminalSwitchDuringLoadSheet";
import RecallDifferentEquipmentSheet from "./components/RecallDifferentEquipmentSheet";
import StaleApiOverlay, { type StaleProduct } from "./components/StaleApiOverlay";
import { submitOutageReport, type OutageReportType } from "./hooks/useTerminalOutageReports";
import ProductTempModal from "./modals/ProductTempModal";
import CompartmentModal from "./modals/CompartmentModal";

// ── UI ─────────────────────────────────────────────────────────────────────────
import { styles } from "./ui/styles";

// ── Utils ──────────────────────────────────────────────────────────────────────
import { addDaysISO_, daysUntilISO_, formatMDYWithCountdown_, formatMDYWithTime_, isPastISO_ } from "./utils/dates";
import { normState } from "./utils/normalize";
import { cgSliderToBias, bestLbsPerGallon, lbsPerGallonAtTemp, planForGallons, CG_NEUTRAL, backCorrectApiTo60 } from "./utils/planMath";
import { resolveApiBasis, apiTierColor } from "./utils/apiBasis";
import { writeActivePlannedLoad } from "./utils/activePlannedLoad";
import { productColorFor } from "./utils/productColor";
import { DEFAULT_STALE_API_DAYS } from "@/lib/config/plannerSafety";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { ActiveComp, CompPlanInput, CompRow, ProductRow } from "./types";



// ─── Local UI helpers ─────────────────────────────────────────────────────────

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));



// TempDial component -- "moon" redesign: a glowing gradient orb with
// scattered decorative tick marks around it (reference image supplied by
// user), same drag-anywhere-in-the-widget sensitivity as the old ring/arc
// version (the hit area is still the full outer box, not just the visible
// orb, so dragging isn't harder to grab). Tapping without dragging opens a
// centered numeric-keypad popup to type the value directly -- same pattern
// as the compartment cap's precise-entry popup in PlannerControls.tsx.
type TempDialProps = { value: number; min: number; max: number; step: number; onChange: (v: number) => void };

const TEMP_DIAL_TICKS = Array.from({ length: 12 }, (_, i) => {
  const angle = i * 30 + 9; // slight offset so ticks don't land exactly on the cardinal points
  const big = i % 2 === 0;
  const dist = big ? 116 : 108 + ((i * 37) % 9); // subtle scatter, not a perfect ring
  const rad = (angle * Math.PI) / 180;
  return { cx: 120 + Math.cos(rad) * dist, cy: 120 + Math.sin(rad) * dist, angle, big };
});

function TempDial({ value, min, max, step, onChange }: TempDialProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const sweepStart = -135;
  const sweepEnd = 135;
  const sweep = sweepEnd - sweepStart;

  const angleToValue = useCallback((deg: number) => {
    const anchorAngle = -90;
    const degPerUnit = sweep / (max - min || 1);
    const raw = 60 + (clampNum(deg, sweepStart, sweepEnd) - anchorAngle) / (degPerUnit || 1);
    return clampNum(Math.round((Math.round(raw / step) * step) * 10) / 10, min, max);
  }, [min, max, step, sweep, sweepStart, sweepEnd]);

  const setFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    onChange(angleToValue(clampNum((Math.atan2(dy, dx) * 180) / Math.PI, sweepStart, sweepEnd)));
  }, [angleToValue, onChange, sweepStart, sweepEnd]);

  function commitTyped() {
    const parsed = clampNum(Math.round((Number(typedValue) || 0) * 10) / 10, min, max);
    onChange(parsed);
    setTyping(false);
  }

  return (
    <div
      ref={ref}
      style={{ width: "100%", maxWidth: 420, margin: "0 auto", aspectRatio: "1/1", position: "relative", touchAction: "none" }}
      onPointerDown={(e) => {
        if (typing) return;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        pointerDownRef.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (typing || !dragging) return;
        const start = pointerDownRef.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) movedRef.current = true;
        if (movedRef.current) setFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        if (typing) return;
        setDragging(false);
        if (!movedRef.current) { setTypedValue(String(value)); setTyping(true); }
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <svg viewBox="0 0 240 240" style={{ width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
        {TEMP_DIAL_TICKS.map((t, i) => t.big ? (
          <rect key={i} x={t.cx - 1.5} y={t.cy - 8} width={3} height={16} rx={1.5}
            fill="rgba(255,255,255,0.55)" transform={`rotate(${t.angle + 90} ${t.cx} ${t.cy})`} />
        ) : (
          <rect key={i} x={t.cx - 2} y={t.cy - 2} width={4} height={4}
            fill="rgba(255,255,255,0.28)" transform={`rotate(45 ${t.cx} ${t.cy})`} />
        ))}
      </svg>
      <div style={{ position: "absolute", top: 6, left: 0, right: 0, textAlign: "center", fontWeight: 900, fontSize: 14, color: "rgba(255,255,255,0.55)", pointerEvents: "none" }}>60°F</div>
      <div style={{
        position: "absolute", inset: 0, margin: "auto", width: "68%", height: "68%",
        borderRadius: "50%", pointerEvents: "none",
        background: "radial-gradient(circle at 34% 28%, #ffffff 0%, #f4f4f4 30%, #d9d9d9 62%, #b6b6b6 100%)",
        boxShadow: "0 22px 48px rgba(0,0,0,0.55), inset 0 -12px 26px rgba(0,0,0,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      }}>
        <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, letterSpacing: -0.6, color: "#181818" }}>
          {value.toFixed(1)}°F
        </div>
      </div>

      {/* Tap-to-type -- opens on a tap that didn't drag, anywhere in the widget */}
      {typing && (
        <div
          onClick={(e) => { e.stopPropagation(); setTyping(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 280, background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>
              Set Temp (°F) for All Products
            </div>
            <input
              type="text" inputMode="decimal" autoFocus
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value.replace(/[^0-9.\-]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") commitTyped(); }}
              style={{ width: "100%", textAlign: "center" as const, background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.20)", color: "#fff", fontSize: 40, fontWeight: 700, padding: "4px 0" }}
            />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{min}° to {max}°</div>
            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
              <button type="button" onClick={() => setTyping(false)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={commitTyped}
                style={{ flex: 1, padding: "12px 0", borderRadius: 6, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────


export default function CalculatorPage() {
  // ── Shared shell state (equipment/location/terminals/expirations) ──────────
  // Owned once in CalculatorShellContext (layout.tsx) so the header's gear/
  // bell icons and this page's own planning logic never see two
  // independently-hydrated copies of the same selection state.
  const shell = useCalculatorShell();
  const { authUserId, setupSession, effectiveUserId, equipment, location, terminals, expirations } = shell;
  const router = useRouter();
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
  const isUltraWideLandscape = useIsLandscape(1600);

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
    if (shell.role == null) return;
    if (!shell.isSuperAdminResolved) return;
    if (shell.isSolo === null) return; // wait for solo resolution -- a solo admin must not be redirected off the driver Planner
    hasCheckedDefaultLanding = true;
    const target = defaultLandingPath(shell.role, shell.isSuperAdmin, shell.isSolo === true);
    if (target) router.replace(target);
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, router]);

  // ── Card data (card number + PIN + private note, per terminal, per user) ──
  // Owned in CalculatorShellContext now -- the new Cards tab route needs the
  // same data, so it's shared rather than fetched twice (same pattern as
  // equipment/location/terminals above).
  const { cardDataByTerminalId, setCardDataForTerminal_ } = shell;

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
  // rather than lifting this state into the shell context. Grabbed once
  // on mount (Header is always already mounted above this page's own
  // content by the time this effect runs, since it lives in the same
  // layout that renders {children}).
  const [headerIconsSlot, setHeaderIconsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setHeaderIconsSlot(document.getElementById("planner-header-icons-slot")); }, []);

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
  const {
    equipOpen, setEquipOpen, termOpen, setTermOpen,
    locOpen, setLocOpen, statePickerOpen, setStatePickerOpen,
    expandedTerminalId, setExpandedTerminalId,
    isCityStarred, toggleCityStar,
    stateOptions, selectedStateLabel, selectedStateName, cities, topCities, allCities,
  } = shell;
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
  // Separate from activeSlotLetter on purpose. activeSlotLetter mirrors
  // PresetDial's own scroll-centered position -- it changes on a mere
  // swipe/preview, with no real load involved (PresetDial's own comment:
  // scrolling "deliberately does NOT itself trigger any action"). But it
  // used to ALSO be what got tagged onto load_log.plan_slot at load time,
  // so a driver who previewed a different letter without tapping it could
  // get a completed load tagged with the wrong preset -- confirmed live,
  // this is why refresh sometimes highlighted the wrong letter even though
  // the restored compPlan content itself was correct. lastLoadedSlot only
  // ever changes inside a genuine load action (PresetDial's onLoad,
  // PresetActionSheet's onLoad, or the mount-time resync below) and is
  // what actually gets tagged to the load -- activeSlotLetter still drives
  // "Save plan {letter}" unchanged.
  const [lastLoadedSlot, setLastLoadedSlot] = useState<number | null>(null);
  const [selectedComp, setSelectedComp] = useState<number | null>(null);
  // presetDialSyncedRef: one-shot guard for the mount-time resync effect
  // below -- set once the last-completed load's own plan_slot resolves
  // after mount, so activeSlotLetter agrees with whichever preset's plan
  // was actually restored into the compartments (previously it always
  // showed A regardless of which preset the restored plan came from). Name
  // kept from when this also had to re-center a swipeable dial (now gone,
  // replaced by PresetQuickPick -- a plain icon showing activeSlotLetter
  // directly needs no separate "please recenter" signal, just the state
  // change itself) -- the ref's own guard purpose is unchanged, only the
  // now-removed presetDialSyncTo state it used to also set alongside it.
  const presetDialSyncedRef = useRef(false);
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

  // ── Terminal products ──────────────────────────────────────────────────────
  const [terminalProducts, setTerminalProducts] = useState<ProductRow[]>([]);

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

  // compPlan is keyed per combo+terminal so switching equipment restores the right plan
  const compPlanKey = useMemo(() => {
    const cid = equipment.selectedComboId ?? "";
    const tid = location.selectedTerminalId ?? "";
    return cid && tid ? `protankr_compPlan_v1:${cid}:${tid}` : null;
  }, [equipment.selectedComboId, location.selectedTerminalId]);

  const [compPlan, setCompPlanRaw] = useState<Record<number, CompPlanInput>>({});

  const setCompPlan = useCallback((updater: any) => {
    setCompPlanRaw((prev: Record<number, CompPlanInput>) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (compPlanKey) {
        try { localStorage.setItem(compPlanKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, [compPlanKey]);

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

  // Ref holds the hydrated plan so compartments init doesn't overwrite it
  const hydratedCompPlanRef = useRef<Record<number, CompPlanInput> | null>(null);
  // Which combo this effect last (re)hydrated compPlan for. compPlanKey embeds
  // the TERMINAL, so it also changes on a plain terminal switch -- but the live
  // plan is combo-scoped (see usePlanSlots' planScopeKey and the 2026-08-27
  // "one setup persists across all terminals" decision), so a terminal-only
  // change must NOT touch compPlan. This ref lets the effect tell a real combo
  // change apart from a terminal switch and skip the latter -- previously it
  // wiped the plan to {} on every terminal switch (the new terminal has no
  // saved compPlanKey), which is exactly what emptied a plan when switching
  // terminals from inside Plan Review.
  const compPlanHydratedComboRef = useRef<string | null>(null);

  // Hydrate compPlan on a real combo change (or fresh mount); leave it alone
  // on a terminal-only change. The combo is only marked "hydrated" once we've
  // actually read a real (non-null) compPlanKey -- crucial because on a fresh
  // mount the combo usually resolves BEFORE the terminal, so compPlanKey goes
  // null -> value; marking the combo hydrated on that first null run would
  // make the terminal ARRIVING look like a terminal switch and skip loading
  // the saved plan (empty compartments on reload -- the bug this guards
  // against without over-firing).
  useEffect(() => {
    const cid = equipment.selectedComboId ? String(equipment.selectedComboId) : "";

    // No combo -> nothing to scope a plan to.
    if (!cid) {
      compPlanHydratedComboRef.current = null;
      hydratedCompPlanRef.current = null;
      setCompPlanRaw({});
      return;
    }

    // Terminal not resolved yet (compPlanKey needs both combo AND terminal):
    // wait for the real key rather than clearing the plan in the gap.
    if (!compPlanKey) return;

    // Already hydrated this combo from a real key -> a later compPlanKey change
    // is a terminal switch; the live plan is combo-scoped, so leave it alone.
    if (compPlanHydratedComboRef.current === cid) return;

    // First real hydration for this combo (fresh mount or genuine combo change).
    compPlanHydratedComboRef.current = cid;
    try {
      const raw = localStorage.getItem(compPlanKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") {
          hydratedCompPlanRef.current = p;
          setCompPlanRaw(p);
          return;
        }
      }
    } catch {}
    hydratedCompPlanRef.current = null;
    setCompPlanRaw({});
  }, [compPlanKey, equipment.selectedComboId]);
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

  // Initialize compPlan entries when compartments change
  // Merges with hydratedCompPlanRef so saved products survive even if
  // this runs in the same batch as hydration (React may see stale prev = {})
  useEffect(() => {
    setCompPlanRaw((prev: Record<number, CompPlanInput>) => {
      const base = hydratedCompPlanRef.current ?? prev;
      const next = { ...base };
      for (const c of compartments) {
        const n = Number(c.comp_number);
        if (!Number.isFinite(n)) continue;
        if (!next[n]) next[n] = { empty: false, productId: "" };
      }
      for (const key of Object.keys(next)) {
        const n = Number(key);
        if (!compartments.some((c) => Number(c.comp_number) === n)) delete next[n];
      }
      return next;
    });
  }, [compartments]);

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

  // ── lbs/gal helper ────────────────────────────────────────────────────────
  // True if any planned compartment is using the fallback reference API (no driver-observed last_api)
  const planUsesReferenceApi = useMemo(() => {
    return Object.values(compPlan).some((slot) => {
      if (!slot || slot.empty || !slot.productId) return false;
      const p = terminalProducts.find((p) => p.product_id === slot.productId);
      return p != null && (p.last_api == null || !Number.isFinite(Number(p.last_api)));
    });
  }, [compPlan, terminalProducts]);

  const lbsPerGalForProductId = useCallback((productId: string): number | null => {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.api_60 == null || p.alpha_per_f == null) return null;
    // Driver explicitly tuned this product's API/temp in Plan Review's Tune
    // panel -- their own reading wins over everything (the terminal's last-
    // observed value, the stale-safety override, and the api_min fallback).
    // Back-correct the observed API (read at the tuned temp) to API_60, then
    // density at that same temp -- identical math to bestLbsPerGallon's
    // observed-reading path, just sourced from the driver's entry.
    const tuned = tunedApiTempByProduct[productId];
    if (tuned && Number.isFinite(tuned.api) && Number.isFinite(tuned.tempF)) {
      const api60 = backCorrectApiTo60(Number(tuned.api), Number(tuned.tempF), Number(p.alpha_per_f));
      return lbsPerGallonAtTemp(api60, Number(p.alpha_per_f), Number(tuned.tempF));
    }
    // Stale-API safety override wins outright: the driver chose to assume a
    // specific (heavier) API_60 for this product on the LOAD stale-API
    // prompt, so density is computed from that directly -- never the
    // last-observed/reference reading, which is exactly what they overrode.
    const overrideApi60 = apiSafetyOverride[productId];
    if (overrideApi60 != null && Number.isFinite(overrideApi60)) {
      const t = productTempF[productId] ?? tempF;
      return lbsPerGallonAtTemp(Number(overrideApi60), Number(p.alpha_per_f), t);
    }
    // Otherwise resolve the API basis by confidence (see apiBasis.ts): a fresh
    // observed reading if there is one, else the terminal's observed minimum,
    // else the product's published minimum -- the same resolver the Tune panel
    // displays, so the shown basis and the planned gallons can never disagree.
    // A stale/unknown reading always falls back to the HEAVIEST minimum, so it
    // can only ever make the plan more conservative, never lighter.
    const basis = resolveApiBasis({
      alphaPerF: Number(p.alpha_per_f),
      api60Ref: Number(p.api_60),
      apiMin: p.api_min != null ? Number(p.api_min) : null,
      minApiObserved: (p as any).min_api_observed != null ? Number((p as any).min_api_observed) : null,
      lastApi: p.last_api != null ? Number(p.last_api) : null,
      lastTempF: p.last_temp_f != null ? Number(p.last_temp_f) : null,
      lastApiUpdatedAt: (p as any).last_api_updated_at ?? null,
      tuned: tunedApiTempByProduct[productId] ?? null,
      nowMs: Date.now(),
      staleDays: DEFAULT_STALE_API_DAYS,
    });
    const t = productTempF[productId] ?? tempF;
    return lbsPerGallonAtTemp(basis.api60, Number(p.alpha_per_f), t);
  }, [terminalProducts, tempF, productTempF, apiSafetyOverride, tunedApiTempByProduct]);

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

  // ── Weight limits ──────────────────────────────────────────────────────────
  // target_weight = the gross weight the driver is trying to hit (renamed from gross_limit_lbs)
  const targetWeight = Number((equipment.selectedCombo as any)?.target_weight ?? 0);
  const tare = Number(equipment.selectedCombo?.tare_lbs ?? 0);
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

  const plannedWeightLbs = useMemo(
    () => planRows.reduce((sum, r: any) => sum + Number(r.planned_gallons ?? 0) * Number(r.lbsPerGal ?? 0), 0),
    [planRows]
  );

  const plannedGallonsTotal = planRows.reduce((s, r) => s + r.planned_gallons, 0);

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
    onPostLoadComplete: planSlots.refreshLastLoad,
    predictedTempF: predictedFuelTempF,
    // Pass lastLoadedSlot (the preset actually loaded via a real tap), not
    // activeSlotLetter (the dial's cosmetic scroll position) -- see the
    // comment on lastLoadedSlot's declaration above for why. The hook's own
    // "activeSlotLetter" arg name/doc comment ("which named preset was
    // active when LOAD was tapped") already describes this value's real
    // meaning; left as-is inside useLoadWorkflow.ts to keep this a
    // page.tsx-only fix.
    activeSlotLetter: lastLoadedSlot,
    capacityResult,
  });

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
  // ── Payload utilization (Phase 2 driver display) ──────────────────────────
  // The period this driver's running average covers. Reuses the company's own
  // configured report period when there IS one, and falls back to a rolling
  // 30 days when there isn't -- measurement has to work for a company that has
  // configured nothing at all (see docs/incentive-redesign-plan.md, TEST K),
  // so this deliberately doesn't gate on incentive_settings the way the legacy
  // points card does.
  const utilPeriod = useUtilizationPeriod(shell.companyId ?? null);

  const driverUtilization = useDriverPeriodUtilization(effectiveUserId || null, utilPeriod.since);

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
      return submitOutageReport({
        terminalId: overrideTerminalId ?? String(location.selectedTerminalId || ""),
        selectedRackId: overrideTerminalId ? (overrideRackId ?? null) : (location.selectedRackId ? String(location.selectedRackId) : null),
        productIds,
        reportType,
        companyId: shell.companyId || "",
        userId: effectiveUserId || "",
        truckLabel,
      });
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
      setLastLoadedSlot(report.plan_slot);
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

  // Seed the Target/Actual/Diff summary from the last *completed* load for
  // this combo as soon as it's available (mount, or switching equipment) --
  // there's no "My Loads" button on this page anymore, so this is the only
  // way that summary ever gets populated outside of a load just finished in
  // this same session. Guarded so it never clobbers a fresher report (either
  // one this session just produced, or one restored via My Loads).
  useEffect(() => {
    if (planSlots.lastLoadReport && !loadWorkflow.loadReport) {
      loadWorkflow.setLoadReport(planSlots.lastLoadReport);
    }
    // Sync activeSlotLetter (what the plan-letter icon/PresetQuickPick
    // shows as "active") to match whichever preset the just-restored plan
    // actually came from. Guarded to fire once and only while no genuine
    // load action has happened yet this session (lastLoadedSlot == null) --
    // previously gated on activeSlotLetter === 1, which assumed an
    // untouched dial always read exactly 1; the historical dial is gone
    // now, but lastLoadedSlot remains the right guard since it only ever
    // changes on a real load action, never a passive restore.
    if (planSlots.lastLoadReport?.plan_slot && !presetDialSyncedRef.current && lastLoadedSlot == null) {
      presetDialSyncedRef.current = true;
      setLastLoadedSlot(planSlots.lastLoadReport.plan_slot);
      setActiveSlotLetter(planSlots.lastLoadReport.plan_slot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSlots.lastLoadReport]);

  // "Recall Last Load" card: captures exactly what was live the instant
  // loadReport became set -- either the state a fresh mount just restored
  // from the last completed load (compPlan + CG, see usePlanSlots.ts's
  // restoreCg fix), or the plan the driver just actually submitted this
  // session. Compared against current live state below (recapValid) to
  // decide whether the card's numbers still mean anything -- see that
  // memo's own comment for why this replaced the old "always show the
  // last load's numbers, label says whether they're live" design.
  //
  // Real state, not a ref: a ref mutation doesn't trigger a re-render, so
  // recapValid's comparison below would never re-run right after this was
  // captured (only on some LATER, unrelated state change) -- the classic
  // ref-vs-state trap, caught live before shipping (recapValid stayed
  // false forever otherwise, even the instant after a perfectly matching
  // baseline was captured).
  type RecapBaseline = { compPlanJSON: string; cgSlider: number; comboId: string; terminalId: string; rackId: string };
  const [recapBaseline, setRecapBaseline] = useState<RecapBaseline | null>(null);
  const prevLoadReportRef = useRef<typeof loadWorkflow.loadReport>(null);
  useEffect(() => {
    if (loadWorkflow.loadReport && loadWorkflow.loadReport !== prevLoadReportRef.current) {
      setRecapBaseline({
        compPlanJSON: JSON.stringify(compPlan),
        cgSlider,
        comboId: String(equipment.selectedComboId || ""),
        terminalId: String(location.selectedTerminalId || ""),
        rackId: String(location.selectedRackId || ""),
      });
    }
    prevLoadReportRef.current = loadWorkflow.loadReport;
  }, [loadWorkflow.loadReport, compPlan, cgSlider, equipment.selectedComboId, location.selectedTerminalId, location.selectedRackId]);

  // False the moment ANYTHING about the live plan drifts from the baseline
  // captured above -- product swapped, cap dragged, CG moved, equipment or
  // terminal/rack changed. Per explicit direction: rather than a label
  // that says "this is historical, not live" (tried already, still read as
  // ambiguous), the numbers themselves disappear the instant they'd be
  // wrong -- if they're showing, they're guaranteed accurate to the
  // current plan, full stop.
  const recapValid =
    !!recapBaseline &&
    !!loadWorkflow.loadReport &&
    recapBaseline.compPlanJSON === JSON.stringify(compPlan) &&
    recapBaseline.cgSlider === cgSlider &&
    recapBaseline.comboId === String(equipment.selectedComboId || "") &&
    recapBaseline.terminalId === String(location.selectedTerminalId || "") &&
    recapBaseline.rackId === String(location.selectedRackId || "");


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

  const selectedTerminal = useMemo(
    () => terminals.terminals.find((t) => String(t.terminal_id) === String(location.selectedTerminalId)) ?? null,
    [terminals.terminals, location.selectedTerminalId]
  );

  // For display name only — also check catalog for terminals not yet visited
  const selectedTerminalAny = useMemo(
    () => selectedTerminal
      ?? terminals.terminalCatalog.find((t) => String(t.terminal_id) === String(location.selectedTerminalId))
      ?? null,
    [selectedTerminal, terminals.terminalCatalog, location.selectedTerminalId]
  );

  const terminalDisplayISO = useMemo(() => {
    if (!selectedTerminal) return null; // needs full TerminalRow for expiry calc
    return terminals.terminalDisplayInfo(selectedTerminal, location.selectedTerminalId);
  }, [selectedTerminal, terminals, location.selectedTerminalId]);

  const terminalCardedText = terminalDisplayISO ? formatMDYWithCountdown_(terminalDisplayISO) : undefined;
  const terminalCardedClass = terminalCardedText
    ? (isPastISO_(terminalDisplayISO!) ? "text-red-500" : "text-white/50") : undefined;

  // ── Mid-load terminal switch (Plan Review's tappable terminal name) ────────
  // Per explicit direction: tapping the terminal name in LoadingModal opens
  // the shared location/terminal picker without leaving Plan Review. If
  // that picker actually changes the terminal, TerminalSwitchDuringLoadSheet
  // asks what to do about it once the picker (and any rack pick it triggers)
  // settles -- see that component's own header comment for the three
  // choices' exact semantics.
  //
  // terminalSwitchWatch is a snapshot of "what was true right before the
  // picker opened" plus a flag that an effect below is actively waiting for
  // the picker to close; terminalSwitchConfirm is the resolved before/after
  // pair once it has (only set when the terminal genuinely changed -- if
  // the driver closes the picker without picking anything, or re-picks the
  // same terminal, nothing happens and Plan Review is exactly as it was).
  type TerminalSnapshot = {
    terminalId: string; terminalName: string; rackId: string; city: string; state: string;
  };
  const [terminalSwitchWatch, setTerminalSwitchWatch] = useState<TerminalSnapshot | null>(null);
  const [terminalSwitchConfirm, setTerminalSwitchConfirm] = useState<{ prev: TerminalSnapshot; next: TerminalSnapshot } | null>(null);

  const handleTapTerminalInLoadingModal = useCallback(() => {
    setTerminalSwitchWatch({
      terminalId: String(location.selectedTerminalId || ""),
      terminalName: terminalLabel || "Terminal",
      rackId: String(location.selectedRackId || ""),
      city: location.selectedCity, state: location.selectedState,
    });
    shell.setTermOpen(true);
  }, [location.selectedTerminalId, location.selectedRackId, location.selectedCity, location.selectedState, terminalLabel, shell]);

  // Waits for the picker (and any rack-pick it triggers) to fully settle --
  // shell.termOpen/locOpen/rackPickerOpen are the three sheets this could
  // still be mid-flight through (picking a new city via "Change" routes
  // through locOpen too); shell.rackResolving covers the real gap between
  // picking a terminal and rackPickerOpen actually flipping true a moment
  // later (an awaited network round trip) -- confirmed live this gap is
  // real: without it, this effect could fire and open the terminal-switch
  // confirm sheet at the same instant the rack picker was about to open,
  // showing both at once. Only opens the confirm sheet if the terminal
  // genuinely ended up different from the snapshot; otherwise this was just
  // a look, not a switch, and Plan Review needs no further interruption.
  useEffect(() => {
    if (!terminalSwitchWatch) return;
    if (shell.termOpen || shell.locOpen || shell.rackPickerOpen || shell.rackResolving) return;
    const prev = terminalSwitchWatch;
    setTerminalSwitchWatch(null);
    const newTerminalId = String(location.selectedTerminalId || "");
    if (!newTerminalId || newTerminalId === prev.terminalId) return;
    setTerminalSwitchConfirm({
      prev,
      next: {
        terminalId: newTerminalId,
        terminalName: terminalLabel || "Terminal",
        rackId: String(location.selectedRackId || ""),
        city: location.selectedCity, state: location.selectedState,
      },
    });
  }, [terminalSwitchWatch, shell.termOpen, shell.locOpen, shell.rackPickerOpen, shell.rackResolving, location.selectedTerminalId, location.selectedRackId, location.selectedCity, location.selectedState, terminalLabel]);

  // Every planned product's id -- used both to re-seed API/Temp after a
  // confirmed switch (below) and to scope the "Report Terminal Issue"
  // product picker to this load's own plan (via handleSubmitOutageReport).
  const plannedProductIdsForSwitch = useMemo(
    () => Array.from(new Set(
      (effectivePlanRows as any[])
        .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
        .map((r) => String(r.productId))
    )),
    [effectivePlanRows]
  );

  // Option 1: discard the terminal pick entirely -- revert location back to
  // exactly what it was before the picker opened (state/city/terminal/rack
  // together, via location.skipResetRef -- see useLocation.ts's own
  // "Reset city/terminal/rack on state/city change" effects; setting these
  // one at a time without it would have each successive setter's own reset
  // effect immediately clobber the one before it, same technique that
  // file's own persisted-location restore already uses internally), then
  // refresh/renew today's access date at the terminal being stayed at.
  const handleUpdateCardAtPrevious = useCallback(() => {
    if (!terminalSwitchConfirm) return;
    const { prev } = terminalSwitchConfirm;
    setTerminalSwitchConfirm(null);
    if (prev.terminalId !== String(location.selectedTerminalId || "")) {
      location.skipResetRef.current = true;
      location.setSelectedState(prev.state);
      location.setSelectedCity(prev.city);
      location.setSelectedTerminalId(prev.terminalId);
      location.setSelectedRackId(prev.rackId);
      setTimeout(() => { location.skipResetRef.current = false; }, 50);
    }
    (async () => {
      try {
        await terminals.setAccessDateForTerminal(prev.terminalId, new Date().toISOString());
        await terminals.refreshTerminalAccessForUser();
      } catch (err) {
        console.warn("handleUpdateCardAtPrevious: access-date refresh failed (non-fatal):", err);
      }
    })();
  }, [terminalSwitchConfirm, location, terminals]);

  // Option 2: keep the new terminal (already live-applied by the picker
  // itself -- nothing to re-apply here), retag the active load's own DB row
  // so its terminal_id/rack_id reflect reality (plain non-blocking UPDATE,
  // same pattern beginLoadToSupabase already uses for rack_id/plan_slot),
  // and deliberately do NOT touch terminal_access for the new terminal --
  // that's the whole point of "No Card Update." Then re-seed API for every
  // planned product from the new terminal (clearing lets LoadingModal's own
  // prefill-if-empty effect re-populate once terminalProducts resolves for
  // it, same mechanism a fresh LOAD tap already relies on) and refresh temp:
  // silently, in the background, if the city didn't change (same city just
  // means a different terminal-specific bias correction, not a real reason
  // to interrupt the driver again); by reopening Confirm Temp for a real
  // review if it did (see the two effects below).
  const handleSwitchWithoutUpdating = useCallback(() => {
    if (!terminalSwitchConfirm) return;
    const { prev, next } = terminalSwitchConfirm;
    setTerminalSwitchConfirm(null);

    if (loadWorkflow.activeLoadId) {
      supabase.from("load_log")
        .update({ terminal_id: next.terminalId, rack_id: next.rackId || null })
        .eq("load_id", loadWorkflow.activeLoadId)
        .then(({ error }) => { if (error) console.error("[terminal-switch] failed to retag load_log terminal:", error.message); });

      // Keep the in-progress-load marker in sync with the new terminal so a
      // close-and-reopen after a mid-review switch resumes HERE, not at the
      // terminal where begin_load originally ran (see activePlannedLoad).
      writeActivePlannedLoad(effectiveUserId || null, {
        loadId: loadWorkflow.activeLoadId,
        comboId: String(equipment.selectedComboId || ""),
        terminalId: String(next.terminalId || ""),
        rackId: next.rackId ? String(next.rackId) : null,
        state: String(next.state || ""),
        city: String(next.city || ""),
      });
    }

    for (const pid of plannedProductIdsForSwitch) setProductApi(pid, "");
    // Drop any Tune-panel overrides too -- a tuned reading was for the OLD
    // terminal; the new terminal's own reading (or a fresh tune) should apply.
    setTunedApiTempByProduct((prev) => {
      const next = { ...prev };
      for (const pid of plannedProductIdsForSwitch) delete next[pid];
      return next;
    });

    const cityChanged = prev.city !== next.city || prev.state !== next.state;
    userAdjustedTempRef.current = false; // an explicit driver-triggered refresh should win over any earlier manual nudge
    if (cityChanged) {
      setTempReconfirmProductIds(plannedProductIdsForSwitch);
      setTempDialOpen(true);
    } else {
      setPendingSameCityTempApply({ armed: true, sawLoadingStart: false, productIds: plannedProductIdsForSwitch });
    }
  }, [terminalSwitchConfirm, loadWorkflow.activeLoadId, plannedProductIdsForSwitch, setProductApi, effectiveUserId, equipment.selectedComboId]);

  // Same-city silent refresh: waits for useFuelTempPrediction's own refetch
  // (already triggered automatically -- its signature includes terminalId,
  // see that hook) to complete a full cycle for the NEW terminal before
  // applying, rather than grabbing whatever predictedFuelTempF happens to
  // be the instant the switch is confirmed (which would usually still be
  // the OLD terminal's stale value, since the fetch is async). Watches
  // fuelTempLoading's own true->false transition instead of guessing at a
  // timeout.
  const [pendingSameCityTempApply, setPendingSameCityTempApply] = useState<{ armed: boolean; sawLoadingStart: boolean; productIds: string[] } | null>(null);
  useEffect(() => {
    if (!pendingSameCityTempApply) return;
    if (fuelTempLoading) {
      if (!pendingSameCityTempApply.sawLoadingStart) {
        setPendingSameCityTempApply((p) => (p ? { ...p, sawLoadingStart: true } : p));
      }
      return;
    }
    if (!pendingSameCityTempApply.sawLoadingStart) return; // fetch hasn't even started yet
    const { productIds } = pendingSameCityTempApply;
    setPendingSameCityTempApply(null);
    if (predictedFuelTempF != null) {
      setTempF(predictedFuelTempF);
      for (const pid of productIds) setProductTemp(pid, predictedFuelTempF);
    }
  }, [pendingSameCityTempApply, fuelTempLoading, predictedFuelTempF, setProductTemp]);

  // Different-city reconfirm: reopens the SAME ProductTempModal instance
  // the initial LOAD flow uses, but with a different onConfirm (see that
  // modal's render site below) -- this one never begins a new load, it
  // just propagates the driver-confirmed tempF into every planned
  // product's own tempF field (mirroring beginLoadToSupabase's own "Init
  // per-product inputs" seeding) and returns to the still-open Plan Review.
  const [tempReconfirmProductIds, setTempReconfirmProductIds] = useState<string[] | null>(null);
  const handleConfirmTempReconfirm = useCallback(() => {
    const pids = tempReconfirmProductIds ?? [];
    setTempReconfirmProductIds(null);
    setTempDialOpen(false);
    for (const pid of pids) setProductTemp(pid, tempF);
  }, [tempReconfirmProductIds, tempF, setProductTemp]);

  // Terminal-switch's own "Report Terminal Issue" is about the terminal the
  // driver was already loading at (prev), not the live selection (which by
  // this point is `next`) -- see handleSubmitOutageReport's own override
  // params.
  const handleSubmitOutageReportForPreviousTerminal = useCallback(
    (reportType: OutageReportType, productIds: string[]) => {
      const prev = terminalSwitchConfirm?.prev;
      return handleSubmitOutageReport(reportType, productIds, prev?.terminalId, prev?.rackId || null);
    },
    [terminalSwitchConfirm, handleSubmitOutageReport]
  );

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
    const now = Date.now();
    const rows = ids.map((pid) => {
      const tuned = tunedApiTempByProduct[pid] ?? null;
      const p = terminalProducts.find((x) => x.product_id === pid);
      const info = lastProductInfoById[pid];
      const lpg = lbsPerGalForProductId(pid);
      const tempVal = tuned ? tuned.tempF : (productTempF[pid] ?? tempF);

      // Which API the planner is standing on + its confidence tier -- the SAME
      // resolver the density uses, so the shown API/lb-gal and the planned
      // gallons can never disagree. Colored like the temp: green (fresh/tuned),
      // white (within the stale window), amber (terminal minimum), red (product
      // minimum -- nothing observed here).
      let displayApi: number | null = tuned ? tuned.api : null;
      let apiColor = "#ffffff";
      if (p && p.alpha_per_f != null && p.api_60 != null) {
        const basis = resolveApiBasis({
          alphaPerF: Number(p.alpha_per_f),
          api60Ref: Number(p.api_60),
          apiMin: p.api_min != null ? Number(p.api_min) : null,
          minApiObserved: (p as any).min_api_observed != null ? Number((p as any).min_api_observed) : null,
          lastApi: p.last_api != null ? Number(p.last_api) : null,
          lastTempF: p.last_temp_f != null ? Number(p.last_temp_f) : null,
          lastApiUpdatedAt: (p as any).last_api_updated_at ?? null,
          tuned,
          nowMs: now,
          staleDays: DEFAULT_STALE_API_DAYS,
        });
        displayApi = basis.displayApi;
        apiColor = apiTierColor(basis.tier);
      }

      // #2: short absolute date/time of the last physical update, or "no
      // reading" if never updated. (Tuned rows show "edited · just now".)
      let dateLabel: string;
      if (tuned) {
        dateLabel = "just now";
      } else if (info?.last_api_updated_at) {
        const d = new Date(info.last_api_updated_at);
        if (Number.isNaN(d.getTime())) {
          dateLabel = "no reading";
        } else {
          let h = d.getHours(); const mm = d.getMinutes();
          const ap = h < 12 ? "AM" : "PM"; h = h % 12; if (h === 0) h = 12;
          dateLabel = `${d.getMonth() + 1}/${d.getDate()} ${h}:${String(mm).padStart(2, "0")} ${ap}`;
        }
      } else {
        dateLabel = "no reading";
      }

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
      };
    });
    rows.sort((a, b) => a.code.localeCompare(b.code));
    return rows;
  }, [plannedProductIds, tunedApiTempByProduct, terminalProducts, lastProductInfoById, productTempF, tempF, lbsPerGalForProductId, productCodeById, productNameById, productHexCodeById]);

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
    // "Heaviest this terminal has seen" -> min_api_observed, but clamped so it
    // can NEVER be lighter than the established safe reference (api_min, else
    // api_60). Lower API = heavier, so the safe value is the MIN (heavier) of
    // the observed reading and the reference: Safe is always at least as heavy
    // as Safest, never lighter -- a terminal that has only ever seen a light
    // reading can't talk the plan into assuming lighter-than-published.
    const map = buildStaleOverride((p) => {
      const ref =
        p.api_min != null && Number.isFinite(Number(p.api_min)) ? Number(p.api_min)
        : p.api_60 != null && Number.isFinite(Number(p.api_60)) ? Number(p.api_60)
        : null;
      const observed =
        p.min_api_observed != null && Number.isFinite(Number(p.min_api_observed)) ? Number(p.min_api_observed) : null;
      if (ref == null) return observed;           // no reference -> best effort
      return observed != null ? Math.min(observed, ref) : ref;
    });
    setStaleApiPrompt(null);
    requestBegin(map);
  }, [buildStaleOverride, requestBegin]);

  const handleStaleIgnore = useCallback(() => {
    setStaleApiPrompt(null);
    requestBegin({}); // proceed on the last-known reading
  }, [requestBegin]);

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
    ["h-8 w-8 flex items-center justify-center rounded-lg border transition",
      active ? "border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10"
        : "border-white/10 text-white/40 hover:bg-white/5 hover:text-white/80"].join(" ");

  // ── Plan styles ────────────────────────────────────────────────────────────
  const planStyles = useMemo(() => ({
    ...styles,
    smallBtn: { ...styles.smallBtn, padding: "10px 14px", minWidth: 112, borderRadius: 14, letterSpacing: "0.4px" },
    badge: { ...styles.badge, marginRight: 10 },
  }), []);

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

  // "RELOAD" means "the plan I'm about to submit is the same one already on
  // file as the last load" -- tracks recapValid (the live plan genuinely
  // matching the last completed load), not just "a last load exists at
  // all" (loadWorkflow.loadReport, which stays set from history even after
  // the driver has built a totally different plan -- that's what made this
  // say RELOAD for a brand new plan; caught live, not the original design).
  const loadLabel = loadWorkflow.beginLoadBusy ? "Loading…"
    : loadWorkflow.activeLoadId ? "Load started"
    : recapValid ? "RELOAD"
    : "LOAD";

  // Same tap-to-load/tap-empty-to-save sequence the old PresetDial's own
  // onLoad/onSave props used -- preserved verbatim, just triggered from
  // PresetQuickPick's row taps now instead of the dial's.
  const handlePresetLoad = (n: number) => {
    planSlots.loadFromSlot(n);
    setLastLoadedSlot(n);
    setActiveSlotLetter(n);
    setCaptureBaselineNext(true);
    setCheckAvailabilityNext(true);
    setPresetQuickPickOpen(false);
  };
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
    />
  );

  // Passive, tappable location readout -- directly above the compartments,
  // separate from the pin icon in the new compact row (which stays the
  // "open the picker" action). Recommended and shipped as-is per the
  // earlier design conversation: "it would be nice to at least display the
  // location on the planner as that is the thing that changes most
  // frequently" -- everywhere else tried didn't look right, this was the
  // best-found position (since superseded, see below). Same step-based
  // open logic as the old Location card (Select Location -> Select
  // Terminal) so tapping the line behaves identically to tapping the pin
  // icon.
  //
  // Restyled per the header-merge mockup into a 2-line block, then
  // reordered again per explicit same-day follow-up ("put the terminal
  // first and the city state separated by a dot"): terminal name leads,
  // followed by "· City, State" (the "·" matches this app's own
  // established separator convention -- e.g. the RECAP label's own
  // "· {date}"). Rack name moved onto that SAME line per a further
  // same-day follow-up ("put the rack on the same line with the
  // terminal, all the way to the right, same weight") -- pushed to the
  // far right via justify-content:space-between on the row, styled
  // identically to the terminal/city-state (white, 700) instead of its
  // old dim gray. The terminal+city/state pair gets its own
  // overflow:hidden sub-wrapper so IT truncates first on a narrow screen
  // (ellipsis) rather than squeezing the rack name, which stays
  // flexShrink:0 so it's never the one that gets clipped. Rack name
  // reuses selectedRackName (already fetched above for PlannerControls'
  // own use), not a new query.
  const locationStep: "location" | "terminal" = location.selectedCity && location.selectedState ? "terminal" : "location";
  const locationLineEl = (
    <button
      type="button"
      onClick={() => { if (locationStep === "location") setLocOpen(true); else setTermOpen(true); }}
      style={{
        width: "100%", boxSizing: "border-box" as const, textAlign: "left" as const,
        border: "none", background: "none", padding: "0 2px", marginTop: 10, marginBottom: 18,
        cursor: "pointer", display: "flex", minWidth: 0,
      }}
    >
      {location.selectedTerminalId ? (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, width: "100%", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, overflow: "hidden" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {terminalLabel}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              · {location.locationLabel}
            </span>
          </div>
          {/* Reverted to gray/500 the same day -- "the rack label on the
              right can go back to grey" -- stays on the same line, far
              right (see the row's own justify-content:space-between),
              just no longer white/700 like the terminal/city-state. */}
          {selectedRackName && (
            <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.45)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {selectedRackName}
            </span>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>
          {locationStep === "location" ? "Select location" : "Select terminal"}
        </span>
      )}
    </button>
  );

  // Extracted alongside presetDialEl for the same reason -- landscape
  // renders it inside the compartments (right) column instead of
  // full-width above the whole two-column row, per explicit follow-up:
  // "the plan slot row extended all the way into the left column. it
  // should only stretch across the right column. the save plan button
  // should be on the right as well." Was two conditional render sites
  // (portrait-only above locationLineEl, landscape-only inside the
  // compartments column) -- now one unconditional render site inside the
  // compartments column for both orientations, per the same-day follow-up
  // below.
  //
  // stabilityBannerEl: moved up out of the CG-slider block into this same
  // top cluster, per
  // explicit direction ("this should be the top row [locationLineEl].
  // everything else will be below it: the stability banner, then the
  // save plan and edit product button") -- unstableLoad itself (computed
  // above from cgSlider) is unchanged, only where the warning renders.
  const stabilityBannerEl = unstableLoad ? (
    <div style={{ ...styles.error, marginTop: 0, marginBottom: 12, textAlign: "center" as const }}>
      ⚠️ Unstable load (rear of neutral)
    </div>
  ) : null;

  const currentOverrides = overridesSnapshot(compPlan, cgSlider);
  const isDirty = currentOverrides !== baselineOverrides;
  const activeLetter = String.fromCharCode(64 + activeSlotLetter);
  const actionRowEl = (!isDirty && selectedComp == null) ? null : (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, minHeight: 18 }}>
      <div>
        {isDirty && (
          <button type="button"
            onClick={() => { planSlots.saveToSlot(activeSlotLetter); setBaselineOverrides(currentOverrides); }}
            style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Save plan {activeLetter}
          </button>
        )}
      </div>
      <div>
        {selectedComp != null && (
          <button type="button"
            onClick={() => { setCompModalComp(selectedComp); setCompModalOpen(true); }}
            style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Edit Comp {selectedComp} Product
          </button>
        )}
      </div>
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
  return (
    <div style={pageStyle}>
      {/* Admin setup session banner */}
      {setupSession && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", marginBottom: 8, borderRadius: 12, background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.30)" }}>
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
            style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(251,146,60,0.40)", background: "rgba(251,146,60,0.15)", color: "#fb923c", cursor: "pointer", whiteSpace: "nowrap" as const }}>
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
            setLastLoadedSlot(presetSheetSlot);
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
      {locationLineEl}
      {stabilityBannerEl}
      {actionRowEl}
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
        onSelectComp={(n: number) => {
          if (!location.selectedTerminalId) return;
          setSelectedComp(n);
        }}
        selectedTerminalId={location.selectedTerminalId ?? ""}
        isLandscape={isLandscape}
      />

      <CompartmentModal
        open={compModalOpen}
        compNumber={compModalComp}
        compartments={compartments}
        compPlan={compPlan}
        terminalProducts={terminalProducts}
        styles={styles}
        setCompPlan={setCompPlan}
        onClose={() => { setCompModalOpen(false); setCompModalComp(null); setSelectedComp(null); }}
        selectedRackId={location.selectedRackId ?? ""}
        rackName={selectedRackName}
        terminalName={terminalLabel}
        onTerminalProductsChanged={fetchTerminalProducts}
        myRole={shell.role}
      />

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
      </div>
      {/* ── Info cards, Load button, Load summary ── */}
      {(() => {
        const { loadReport } = loadWorkflow;

        // This card recalls the last completed load -- see recapValid above
        // for the full reasoning. Its numbers only ever show real, accurate
        // figures: exactly what was loaded, for as long as the live plan
        // still matches it exactly (product, gallons, CG, equipment,
        // terminal, rack); the instant any of that drifts, they dash out
        // rather than keep displaying a number that's no longer true.
        // Gallons alone still falls back to the live plan when there's no
        // completed load at all yet (pre-existing behavior, e.g. a brand
        // new combo -- nothing to recall yet, so nothing to invalidate).
        const plannedGal = loadReport
          ? (recapValid ? loadReport.planned_total_gal : null)
          : (planRows.length ? plannedGallonsTotal : null);
        const plannedGalText = plannedGal == null ? "—" : `${Math.round(plannedGal).toLocaleString()} gal`;
        const targetLbs = loadReport && recapValid ? loadReport.planned_gross_lbs : null;
        const targetText = targetLbs == null ? "—" : `${Math.round(targetLbs).toLocaleString()} lbs`;
        const actualLbs = loadReport && recapValid ? loadReport.actual_gross_lbs : null;
        const actualText = actualLbs == null ? "—" : `${Math.round(actualLbs).toLocaleString()} lbs`;
        const diff = loadReport && recapValid ? loadReport.diff_lbs ?? null : null;
        const diffText = diff == null ? "—" : `${diff >= 0 ? "+" : ""}${Math.round(diff).toLocaleString()} lbs`;
        const diffColor = diff == null ? "rgba(255,255,255,0.85)" : diff > 0 ? "#ef4444" : "#4ade80";

        // Always present (and tappable) whenever there's a completed load to
        // recall at all -- but the text itself now tracks recapValid: while
        // the numbers below are genuinely showing the last load ("Recap"),
        // full detail (which plan, when) is worth surfacing; once they've
        // dashed out, the plan/date/time detail would describe numbers that
        // are no longer even visible, so it collapses to a bare action.
        const recapLabel = loadReport
          ? (recapValid
              ? `Recap${loadReport.plan_slot ? ` · Plan ${String.fromCharCode(64 + loadReport.plan_slot)}` : ""}${loadReport.completed_at ? ` · ${formatMDYWithTime_(loadReport.completed_at)}` : ""}`
              : "Recall Last Load")
          : null;

        // Actual weight, colored against this combo's own target and the
        // fixed 80,000 lb federal legal limit (same threshold LoadReportModal
        // already uses for its "drain to 80k" line).
        const LEGAL_GROSS_LBS = 80000;
        const actualGross = actualLbs;
        const actualColor =
          actualGross == null || !(targetWeight > 0) ? "#fff"
          : actualGross >= LEGAL_GROSS_LBS ? "#ef4444"
          : actualGross >= targetWeight ? "#4ade80"
          : "#fff";

        const locationSelected = Boolean(location.selectedCity && location.selectedState);
        const terminalSelected = Boolean(location.selectedTerminalId);
        const hasEquipment = Boolean(equipment.selectedCombo);

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
            {(() => {
              const letter = String.fromCharCode(64 + activeSlotLetter);
              const presetDisabled = !location.selectedTerminalId || !planSlots.presetsReady;
              return (
                <button
                  type="button"
                  disabled={presetDisabled}
                  onClick={() => setPresetQuickPickOpen(true)}
                  title="Presets"
                  style={{
                    background: "none", border: "none", padding: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 3, cursor: presetDisabled ? "not-allowed" : "pointer",
                    opacity: presetDisabled ? 0.4 : 1,
                  }}
                >
                  <span style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{letter}</span>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />
                </button>
              );
            })()}

            {(() => {
              const equipBtnProps = {
                type: "button" as const,
                onClick: () => setEquipOpen(true),
                title: "Equipment",
                // boxShadow/borderRadius explicitly zeroed -- SetupGate's
                // own version of this shared-layoutId button has a real
                // card boxShadow (see SetupGate.tsx), and framer-motion's
                // layoutId crossfade carries that value into whichever
                // element the id lands on next unless the destination
                // gives it something explicit to animate all the way to;
                // without this it was a permanent, not just transient,
                // faint box around "EQ" in the header.
                style: { background: "none", border: "none", borderRadius: 0, boxShadow: "none", padding: 0, cursor: "pointer" as const, display: "flex", alignItems: "center" },
              };
              const equipChildren = <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.5, color: "rgba(255,255,255,0.55)" }}>EQ</span>;
              return mounted ? (
                <motion.button {...equipBtnProps} layoutId="setup-equipment-btn">{equipChildren}</motion.button>
              ) : (
                <button {...equipBtnProps}>{equipChildren}</button>
              );
            })()}

            {(() => {
              const step: "location" | "terminal" = locationSelected ? "terminal" : "location";
              const locTermBtnProps = {
                type: "button" as const,
                onClick: () => { if (step === "location") setLocOpen(true); else setTermOpen(true); },
                title: "Location",
                // Same boxShadow/borderRadius zeroing as the Equipment
                // button above, same reason -- this shares SetupGate's
                // card layoutId too.
                style: { background: "none", border: "none", borderRadius: 0, boxShadow: "none", padding: 0, cursor: "pointer" as const, display: "flex", alignItems: "center" },
              };
              // White, not red, per explicit same-day follow-up ("the
              // location icon can go white instead of red").
              const locTermChildren = <SolidPinIcon color="#ffffff" size={19} />;
              return mounted ? (
                <motion.button {...locTermBtnProps} layoutId={step === "location" ? "setup-location-btn" : "setup-terminal-btn"}>{locTermChildren}</motion.button>
              ) : (
                <button {...locTermBtnProps}>{locTermChildren}</button>
              );
            })()}
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
          <div style={{ borderRadius: 16, background: "transparent", padding: "10px 14px", flex: 1, minWidth: 0 }}>
            {recapLabel && (
              <button
                type="button"
                onClick={handleRecallLastLoad}
                style={{
                  background: "none", border: "none", padding: 0, marginBottom: 6, cursor: "pointer",
                  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase" as const, letterSpacing: 0.4, textAlign: "left" as const,
                }}
              >
                {recapLabel}
              </button>
            )}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{plannedGalText}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: actualColor, textAlign: "right" as const }}>{actualText}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "right" as const }}>
                Target {targetText} · <span style={{ color: diffColor, fontWeight: 600 }}>Diff {diffText}</span>
              </div>
            </div>
            {planUsesReferenceApi && planRows.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: "#fb923c", marginTop: 4 }}>⚠ using ref API</div>
            )}
          </div>
        );

        // ── Payload utilization card (Phase 2) ──────────────────────────
        // The driver's one performance card. It replaced the legacy
        // "recovered points" card, which is now deleted outright along with
        // the rest of the benchmark-driven incentive system -- the spec is
        // explicit that two incentive systems must not run visibly at once,
        // and there is no longer a second one to fall back to.
        //
        // Reads "PLANNED", never "LOADED" -- actual gallons are currently
        // copied from the plan, so the stronger word would be a claim the
        // data doesn't support. See UTILIZATION_ACTUAL_WORD.
        const util = loadReport?.utilization ?? null;
        const periodPct = driverUtilization.summary.utilization_pct;

        const utilizationCard = (util || periodPct != null) ? (
          <div style={{ borderRadius: 16, background: "transparent", padding: "10px 14px", flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.4 }}>This Load</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: util?.utilization_pct != null ? "#4ade80" : "rgba(255,255,255,0.85)" }}>
                  {util?.utilization_pct != null ? `${util.utilization_pct.toFixed(1)}%` : "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" as const, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
                  {utilPeriod.shortLabel}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
                  {periodPct != null ? `${periodPct.toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>
            {util && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                {Math.round(util.actual_gallons).toLocaleString()} of{" "}
                {Math.round(util.effective_available_gallons).toLocaleString()} gal available{" "}
                {UTILIZATION_ACTUAL_WORD}
                {util.unused_gallons >= 1 && ` · ${Math.round(util.unused_gallons).toLocaleString()} gal left`}
              </div>
            )}
            {/* Why a load isn't scored, in the driver's own words -- never a
                bare blank. An externally-capped or safety-excluded load is
                explained, not silently dropped (spec sections 10, 11, 22). */}
            {util?.exception_reason && (
              <div style={{
                fontSize: 11, marginTop: 4, lineHeight: 1.4,
                color: util.eligibility === "excluded_safety" ? "#ef4444" : "rgba(255,255,255,0.45)",
              }}>
                {util.exception_reason}
              </div>
            )}
          </div>
        ) : null;

        const perfCard = utilizationCard;
        const hasPerfCard = perfCard != null;

        const loadButtonEl = (
          <button type="button"
            onClick={() => {
              if (unavailableComps.length > 0) {
                setLoadBlockedMsg(`Cannot Load, all planned products are not available at ${terminalLabel || "this terminal"}`);
                return;
              }
              // Temp + API are confirmed/tuned inside Plan Review's Tune panel
              // now (no separate Confirm Temp step). Staleness is handled there
              // too: the density falls back to the heaviest safe minimum for a
              // stale/missing reading (see apiBasis.ts) and the Tune line colors
              // the API by confidence, so the interrupting Good/Better/Best
              // overlay is no longer needed -- begin straight into Plan Review.
              requestBegin({});
            }}
            disabled={loadDisabled}
            style={{
              // Fixed white bg / black text now, per explicit direction --
              // was themeFill/themeTextOnFill (graphite or accent-colored
              // fill with white text in dark mode); this button no longer
              // follows the accent color at all.
              borderRadius: 6, border: "none", background: "#ffffff",
              padding: "10px 14px", width: "100%", height: isUltraWideLandscape ? "100%" : undefined,
              cursor: loadDisabled ? "not-allowed" : "pointer", opacity: loadDisabled ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: "#000000", letterSpacing: 0.3 }}>{loadLabel}</span>
          </button>
        );

        const loadBlockedMsgEl = loadBlockedMsg ? (
          <div style={{ ...styles.error, textAlign: "center" as const }}>{loadBlockedMsg}</div>
        ) : null;

        const footnoteEl = (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", textAlign: "center" as const, lineHeight: 1.4 }}>
            Product API & temp confirm automatically after this load, sharpening the number for the next driver at this terminal.
          </div>
        );

        // Composition: portrait stacks recapCard/pointsCard exactly as
        // it always has. Normal landscape places the same two cards SIDE
        // BY SIDE instead (flex row, each card's own flex:1 splitting the
        // width evenly) -- reverses the immediately preceding pass's
        // "merge everything into one inline stats band" attempt, which
        // looked bad live (confirmed via a real device screenshot: a lot
        // of dead space, no visual separation between the two cards'
        // figures). Ultra-wide landscape (isUltraWideLandscape) goes one
        // step further, per explicit direction ("on obnoxiously wide
        // screens we can shift the load button over to the right of
        // points, all in one row of equal width and height for each"):
        // recapCard, pointsCard, and the Load button become three
        // grid cells of genuinely equal width AND height
        // (alignItems:"stretch" is what makes the Load button's own cell
        // match the taller card cells' height -- paired with the button's
        // own height:"100%" above -- not a hardcoded number). The same
        // intermediate "points splits into its own box but Load stays
        // full-width below" state described in the user's own message
        // ("until it makes sense to shift the points out and over") is
        // still deliberately not built -- hedged twice in their own
        // phrasing ("if possible... if that makes sense"), no mockup for
        // it, and this pass already has two clear reference points (the
        // side-by-side mockup, and the plainly-described ultra-wide end
        // state) to build against; a real width band to add later if
        // wanted, between isLandscape and isUltraWideLandscape.
        const statsAndLoadEl = isUltraWideLandscape ? (
          <div style={{ display: "grid", gridTemplateColumns: hasPerfCard ? "1fr 1fr 1fr" : "1fr 1fr", gap: 16, alignItems: "stretch" }}>
            {recapCard}
            {perfCard}
            {loadButtonEl}
          </div>
        ) : isLandscape ? (
          <>
            <div style={{ display: "flex", flexDirection: "row", gap: 14 }}>
              {recapCard}
              {perfCard}
            </div>
            {loadButtonEl}
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {recapCard}
              {perfCard}
            </div>
            {loadButtonEl}
          </>
        );
        return (
          <>
            <div style={isLandscape ? { maxWidth: LANDSCAPE_MAX_W, margin: "0 auto", marginTop: 14, display: "flex", flexDirection: "column", gap: 12 } : { marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
              {statsAndLoadEl}
              {loadBlockedMsgEl}
              {footnoteEl}
            </div>
            {headerIconsSlot && createPortal(headerIconsEl, headerIconsSlot)}
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
          onComplete={() => setOnboardingDone(true)}
        />
      ) : (
        <SetupGate
          comboSelected={!!equipment.selectedComboId}
          locationSelected={!!(location.selectedState && location.selectedCity)}
          terminalSelected={!!location.selectedTerminalId}
          equipmentLabel={equipment.equipmentLabel}
          locationLabel={location.locationLabel}
          terminalLabel={terminalLabel}
          onOpenEquipment={() => setEquipOpen(true)}
          onOpenLocation={() => setLocOpen(true)}
          onOpenTerminal={() => setTermOpen(true)}
        />
      )}

      {/* ── Modals ── */}
      <LoadingModal
        open={loadWorkflow.loadingOpen} onClose={() => { /* no accidental dismissal -- exits are the explicit buttons */ }}
        styles={styles}
        planRows={effectivePlanRows as any[]}
        productNameById={productNameById}
        productHexCodeById={productHexCodeById}
        productInputs={productInputs}
        equipmentLabel={equipment.equipmentLabel}
        terminalLabel={terminalLabel}
        onTapTerminal={handleTapTerminalInLoadingModal}
        setProductApi={setProductApi}
        setProductTemp={setProductTemp}
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
        onLoaded={() => loadWorkflow.onLoadedFromLoadingModal()}
        onUpdateCardOnly={() => loadWorkflow.cancelActiveLoad()}
        onReportTerminalIssue={() => setCancelLoadConfirmOpen(true)}
        onBackToPlanner={handleBackToPlannerNoUpdate}
        loadedDisabled={loadWorkflow.completeBusy}
        loadedLabel={loadWorkflow.completeBusy ? "Saving…" : "Log the Load"}
        errorMessage={loadWorkflow.completeError}
        allPlannedUnavailable={unavailableComps.length > 0}
        tuneRows={tuneRows}
        onTuneProduct={onTuneProduct}
        tuneTempColor={tuneTempColor}
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
      />

      {/* Opened only from the Loading modal's "Report Terminal Issue" button
          now (the other three actions are the modal's own buttons), so it
          opens straight into the outage-report flow. */}
      <CancelLoadSheet
        open={cancelLoadConfirmOpen}
        initialMode="reportType"
        onDismiss={() => setCancelLoadConfirmOpen(false)}
        onBackToPlanner={() => { setCancelLoadConfirmOpen(false); handleBackToPlannerNoUpdate(); }}
        onLogTheLoad={() => { setCancelLoadConfirmOpen(false); loadWorkflow.onLoadedFromLoadingModal(); }}
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
    </div>
  );
}
