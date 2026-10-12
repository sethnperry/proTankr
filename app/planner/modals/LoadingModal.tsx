"use client";

import React, { useMemo, useEffect, useState, useRef } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ValueEntryOverlay from "../components/ValueEntryOverlay";
import FuelBurnOverlay from "../components/FuelBurnOverlay";
import Spotlight, { useSpotlightRect } from "../components/TourSpotlight";
import { isPlanReviewTourSeen, markPlanReviewTourSeen } from "../utils/tourProgress";
import { correctedGrossLbs, burnCreditLbs, LEGAL_GROSS_LBS as LEGAL_LIMIT_LBS } from "../utils/fuelBurn";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";
import type { ReportLine } from "../hooks/useLoadWorkflow";
import { SupplierPicker } from "../components/trip/SupplierPicker";
import { DelayReasonField, SignatureAccept, TimesEditor, delayReasonOk, fieldInput, fieldLabel, fmtTime, numOrNull } from "../components/trip/tripUi";
import { calculateNetGallons, netMethodForProduct } from "@/lib/trips/netGallons";
import { defaultStepTimes, delayMinutes, needsDelayReason, timesProblem, type StepTimes } from "@/lib/trips/tripFlow";
import { normalizeRef } from "@/lib/trips/refs";
import { buildBolGroups, distributeWhole, initialBolAssignment, type BolAssignment } from "@/lib/trips/bolGroups";
import type { SupplierRow } from "@/lib/trips/types";
import type { DelayReason, TripSettings } from "@/lib/trips/useTripData";
import { loadingOffset } from "@/lib/trips/useTripData";

// ── Trip mode (2026-10-11) ─────────────────────────────────────────────────
// When the load is attached to an open trip, "Loaded" also collects what the
// dashboard's Loaded screen used to: BOL and supplier per compartment (carried
// into the next compartment, editable), net gallons (calculated, editable to
// match the BOL), then one window for the times and one for the loading
// driver's signature. The report's main button becomes "Arrived at Delivery".
export type TripCompExtra = {
  bol: string;
  supplier: string;
  supplierId: string | null;
  net: number | null;
  netCalculated: number | null;
};
export type TripLoadExtras = {
  byComp: Record<number, TripCompExtra>;
  times?: StepTimes;
  delayReasonId?: string | null;
  delayNote?: string | null;
  odometer?: number | null;
  signed?: boolean;
};
export type LoadingTripMode = {
  pickupName: string | null;
  settings: TripSettings;
  reasons: DelayReason[];
  arrivedAt: string | null;
  existingTimes: StepTimes | null;
  // When Start Loading was tapped (the pickup's begin time), if recorded.
  beganAt: string | null;
  existingDelayReasonId: string | null;
  existingDelayNote: string | null;
  needsOdometer: boolean;
  existingOdometer: number | null;
  suppliers: SupplierRow[];
  onAddSupplier: (name: string) => SupplierRow | null;
  // BOL numbers among `values` already on another load.
  checkBols: (values: string[]) => Promise<string[]>;
  signature: string | null;
  onSaveSignature: (path: string) => Promise<void>;
  // What's already recorded per compartment (edit, and the report).
  compDefaults: Record<number, { bol: string | null; supplier: string | null; supplierId: string | null; net: number | null; netTouched: boolean }>;
  onArrivedAtDelivery: () => void;
  onBackToDashboard?: () => void;
};

// One full-card step window, same look as ValueEntryOverlay.
function StepCard({ title, children, onBack, backLabel, onNext, nextLabel, error }: {
  title: string;
  children: React.ReactNode;
  onBack: () => void;
  backLabel: string;
  onNext: () => void;
  nextLabel: string;
  error?: string | null;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingLeft: 16, paddingRight: 16, paddingBottom: 16,
      paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
    }}>
      <div style={{
        width: "100%", maxWidth: 380, maxHeight: "calc(100dvh - 48px)", overflowY: "auto" as const, boxSizing: "border-box" as const,
        background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, padding: 18,
        display: "flex", flexDirection: "column", gap: 12, color: "#fff",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const, textAlign: "center" as const }}>
          {title}
        </div>
        {children}
        {error && <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", textAlign: "center" as const }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onBack}
            style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {backLabel}
          </button>
          <button type="button" onClick={onNext}
            style={{ flex: 1, padding: "12px 0", borderRadius: 4, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Plan Review (redesign 2026-09-05) / Load Report (redesign 2026-09-20) ──
// Per explicit direction, this screen went back to being clean and simple:
// compartments show the product LABEL + a colored dot + gallons, and nothing
// else -- "the gallons are all the driver needs before getting out to load."
// API and temperature were removed from this screen entirely; they're now
// entered only when the driver comes back with a BOL and taps "Log the Load"
// (one product at a time, via ValueEntryOverlay with the product's colored
// dot at the top -- see the log-the-load sequence below).
//
// The "next steps" that used to live in a separate bottom sheet (CancelLoadSheet)
// are now the modal's own action buttons: Log the Load / Update Card, No Load /
// Report Terminal Issue / Back to Planner. Report Terminal Issue still hands
// off to CancelLoadSheet (opened directly in its report flow by page.tsx) so
// the multi-step outage-report UI lives in one place.
//
// 2026-09-20: repurposed into a genuine two-mode modal, per explicit
// direction to stop showing any "last load" info on the Planner page at
// all. `report` (null in the normal planning flow) switches this same
// modal into a read-only Load Report the instant a load actually
// completes -- no more closing back to the Planner automatically. The
// three action buttons become Return to Planner / Edit Load / Delete Load
// in that mode (see the props/JSX below for exactly what each does).

type PlanRowLike = {
  comp_number: number;
  planned_gallons?: number | null;
  productId?: string | null;
};

export type ProductInputs = Record<
  string,
  {
    api?: string; // keep string for partial typing
    tempF?: number;
  }
>;

// One row of the "Load basis" / Tune panel -- the density basis behind the
// planned gallons, per product. All values are precomputed in page.tsx so this
// modal stays presentational; lbsPerGal already reflects any tune, so the panel
// and the planned gallons can never disagree.
export type TuneRow = {
  productId: string;
  code: string;
  dotColor: string;
  tempF: number;
  api: number | null;
  apiColor: string; // confidence color for the API value (see apiBasis.ts tiers)
  lbsPerGal: number | null;
  dateLabel: string;
  tuned: boolean;
  // Last real network API reading + when (regardless of any tune) -- context
  // shown inside the Tune overlay.
  lastApi?: number | null;
  lastApiDateLabel?: string | null;
};

const LEGAL_GROSS_LBS = 80000;

// Shared threshold coloring for a gross-weight figure (live preview OR a
// completed load's real actual weight) against this combo's own target and
// the fixed federal legal limit: white under target, green between target
// and legal, red at/over legal. Same three-tier logic the Planner's own
// live-plan summary card already uses.
function weightColor(gross: number | null | undefined, target: number | undefined): string {
  if (gross == null || !(Number(target) > 0)) return "#ffffff";
  if (gross >= LEGAL_GROSS_LBS) return "#ef4444";
  if (gross >= Number(target)) return "#4ade80";
  return "#ffffff";
}

// The Tune panel: shows the density basis (code · temp · API · lbs/gal · date)
// per product and lets the driver correct it with a fresh gauge/BOL reading.
// Tapping a row opens the same numeric overlay used to update temp/api
// elsewhere, with current ambient + the last real API reading shown as
// context (this is a basis adjustment BEFORE loading, not the post-load BOL
// entry -- hence the caution copy rather than "from your gauge or BOL"); a correction recomputes the planned gallons live (page.tsx's
// onTuneProduct feeds the density). Temp keeps its confidence color.
//
// Review-mode only -- the Load Report's own basis listing (further down)
// is a deliberately non-interactive sibling, not this component reused.
function TunePanel({ rows, tempColor, onTune, ambientTempF, cityLabel }: {
  rows: TuneRow[];
  tempColor: string;
  onTune: (productId: string, api: number, tempF: number) => void;
  ambientTempF?: number | null;
  cityLabel?: string | null;
}) {
  const [editing, setEditing] = useState<TuneRow | null>(null);
  const [apiStr, setApiStr] = useState("");
  const [tempStr, setTempStr] = useState("");

  if (!rows || rows.length === 0) return null;

  function openEdit(r: TuneRow) {
    setTempStr(String(Math.round(r.tempF * 10) / 10));
    setApiStr(r.api != null ? String(Math.round(r.api * 10) / 10) : "");
    setEditing(r);
  }
  function commit() {
    if (!editing) return;
    const api = Number(apiStr);
    const t = Number(tempStr);
    if (Number.isFinite(api) && api > 0 && Number.isFinite(t)) {
      onTune(editing.productId, Math.round(api * 10) / 10, Math.round(t * 10) / 10);
    }
    setEditing(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>
        Load basis · tap to tune
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <button
            key={r.productId}
            type="button"
            onClick={() => openEdit(r)}
            style={{
              display: "flex", flexDirection: "column", gap: 4,
              padding: "9px 12px", borderRadius: 10,
              border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
              cursor: "pointer", width: "100%", textAlign: "left" as const,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.dotColor, flexShrink: 0, alignSelf: "center" }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{r.code}</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: tempColor }}>{r.tempF.toFixed(1)}°F</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: r.apiColor }}>{r.api != null ? `${r.api.toFixed(1)} API` : "— API"}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>{r.lbsPerGal != null ? `${r.lbsPerGal.toFixed(2)} lb/gal` : "—"}</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: r.tuned ? "#4ade80" : "rgba(255,255,255,0.4)" }}>
                {r.tuned ? "edited · just now" : r.dateLabel}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>tune ›</span>
            </div>
          </button>
        ))}
      </div>

      <ValueEntryOverlay
        open={!!editing}
        title={editing ? `Tune ${editing.code}` : "Tune"}
        dotColor={editing?.dotColor}
        fields={[
          { key: "temp", label: "Temp °F", value: tempStr, onChange: setTempStr, decimal: true, suffix: "°F" },
          { key: "api", label: "API", value: apiStr, onChange: setApiStr, decimal: true, suffix: "API" },
        ]}
        hint={
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" as const }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              {ambientTempF != null && Number.isFinite(ambientTempF) && (
                <span>Ambient <b style={{ color: "#fff" }}>{Math.round(ambientTempF)}°F</b>{cityLabel ? ` · ${cityLabel}` : ""}</span>
              )}
              <span>
                Last API{" "}
                {editing?.lastApi != null
                  ? <><b style={{ color: "#fff" }}>{editing.lastApi.toFixed(1)}</b>{editing.lastApiDateLabel ? ` · ${editing.lastApiDateLabel}` : ""}</>
                  : "— no reading"}
              </span>
            </div>
            <span>Adjust basis for known product condition. Adjust with caution.</span>
          </div>
        }
        onCancel={() => setEditing(null)}
        onSubmit={commit}
        submitLabel="Set"
      />
    </div>
  );
}

// Load Report's own read-only basis listing -- same fields TunePanel shows
// (dot/code/temp/API/lbs-gal), grouped per product from the load's own real
// entered values, but plain text: no card, no border, no tap target. "The
// load basis comes out of the card... no longer tunable," per explicit
// direction.
function ReportBasisRows({ rows, productNameById, productHexCodeById }: {
  rows: { productId: string; api: number | null; tempF: number | null; lbsPerGal: number | null }[];
  productNameById: Map<string, string>;
  productHexCodeById?: Record<string, string>;
}) {
  if (!rows.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.2, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const }}>
        Load basis
      </div>
      {rows.map((r) => {
        const dotColor = (productHexCodeById?.[r.productId] && String(productHexCodeById[r.productId]).trim()) || "rgba(255,255,255,0.5)";
        const label = productNameById.get(r.productId) ?? r.productId;
        return (
          <div key={r.productId} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 2px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)", flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {label}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
              {r.tempF != null ? `${r.tempF.toFixed(1)}°F` : "—"} · {r.api != null ? `${r.api.toFixed(1)} API` : "—"} · {r.lbsPerGal != null ? `${r.lbsPerGal.toFixed(2)} lb/gal` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function LoadingModal(props: {
  open: boolean;
  onClose: () => void;

  styles: any;

  // Reflects any Phase-1 gallons overrides already applied -- this modal is
  // a pure "Plan Review" phase now, so what's shown here IS the plan that
  // begin_load already snapshotted, adjusted live by whatever's been tapped
  // in this session.
  planRows: PlanRowLike[];
  // comp number -> the driver's cap override, for compartments capped below
  // their configured safety cap. Plan Review tags a row CAPPED when its
  // gallons sit at that cap, so a restriction is visible without moving it.
  capOverrides?: Record<number, number>;
  productNameById: Map<string, string>;

  // Product dot color (catalog hex_code) -- the one visual carried through
  // everywhere a product appears, to avoid cross-drops.
  productHexCodeById?: Record<string, string>;

  // Prefill fallback only now -- the per-compartment "Log the Load" sequence
  // (below) writes real per-compartment entries instead of these shared
  // per-product values, but a compartment that's the FIRST of its product in
  // the sequence still seeds its API/Temp fields from here (last-observed /
  // predicted), exactly as before.
  productInputs: ProductInputs;

  // Sets the compartment's CAP (max gallons) -- feeds the weight-bounded
  // solver, so it can never plan the load over target (unlike a raw gallons
  // override, which could). Lets the driver cap a compartment down to recover
  // from a mistype without a separate control. Bounded to the physical cap.
  onSetCompartmentCap: (comp: number, capGallons: number) => void;
  // The compartment's real configured ceiling (same bound the cap-slider's
  // own blown-up entry uses) -- null/undefined means no cap is known, in
  // which case the override is left unbounded.
  persistedCapForComp?: (comp: number) => number | null;

  // Live weight preview -- same math complete_load will actually submit
  // (computeActualLbsForLine), so this can never disagree with the recap.
  livePreviewGrossLbs?: number | null;
  livePreviewDiffLbs?: number | null;
  targetWeight?: number;

  // ── Report mode ──────────────────────────────────────────────────────────
  // Non-null the instant a load completes (or when page.tsx opens a past
  // load's report via its own "view last load at this terminal" fetch) --
  // switches this whole modal from an editable Plan Review into a read-only
  // Load Report. Null the rest of the time (normal planning flow).
  report?: { lines: ReportLine[]; actualGrossLbs: number | null } | null;
  // "Return to Planner" -- just closes back to the Planner, no DB action (the load's
  // already committed).
  onNewLoad?: () => void;
  // "Edit Load" -- reopens the same per-compartment Gallons/API/Temp entry
  // sequence used at Log the Load, seeded from this report's own real
  // values, and updates the already-submitted load with whatever's
  // re-entered.
  onEditLoad?: (compEntries: Record<number, { gallons: number; api: number; tempF: number }>, extras?: TripLoadExtras) => void;
  // "Delete Load" -- removes this completed load entirely. Destructive;
  // this modal shows its own inline confirm before calling it.
  onDeleteLoad?: () => void;
  deleteBusy?: boolean;
  deleteError?: string | null;

  // ── Action buttons (now in the modal itself, not a separate sheet) ──
  // Log the Load: runs the per-compartment Gallons/API/Temp entry sequence
  // internally (physical comp order), then fires this once every planned
  // compartment has a real entry -- page.tsx/useLoadWorkflow then submits
  // using these driver-entered values directly, not the plan's own numbers.
  onLoaded: (compEntries: Record<number, { gallons: number; api: number; tempF: number }>, extras?: TripLoadExtras) => void;
  // Set when this load is attached to an open trip (see LoadingTripMode).
  trip?: LoadingTripMode | null;
  // Update Card, No Load: cancels the load, keeps today's terminal access.
  onUpdateCardOnly: () => void;
  // Report Terminal Issue: hands off to CancelLoadSheet's report flow.
  onReportTerminalIssue: () => void;
  // Back to Planner: genuinely undoes the load + re-card (page.tsx).
  onBackToPlanner: () => void;

  // Disables the action buttons + relabels Log the Load while completing.
  loadedDisabled?: boolean;
  loadedLabel?: string;

  // Optional: styled warning block (if you wire it from page.tsx)
  errorMessage?: string | null;

  // Safety-confirmation block -- equipment/location identification shown
  // before a driver commits to a load.
  equipmentLabel?: string | null;
  terminalLabel?: string | null;
  // "City, State" -- rendered next to terminalLabel ("Terminal · City,
  // State"), same pairing the main Planner page's own location line uses.
  locationLabel?: string | null;
  // Rendered across from the terminal/city-state pair (far right, same
  // row) -- same layout as the main Planner's own location line.
  rackName?: string | null;
  // Tapping the terminal name opens the shared location/terminal picker
  // without leaving this modal (mid-load switch flow, see page.tsx).
  onTapTerminal?: () => void;
  // True when the plan HAS products but none of them are sold at the
  // currently-selected terminal -- e.g. after a mid-review terminal switch
  // to a place that carries different products. Those comps get dropped
  // upstream (page.tsx's activeComps, no density -> no planRow), so the modal
  // can't tell this apart from a genuinely empty plan on its own; page.tsx
  // passes it in so the empty state reads as a real explanation instead of a
  // dead-end "No filled compartments." (see page.tsx unavailableComps).
  allPlannedUnavailable?: boolean;
  // "Load basis" / Tune panel: the density basis (temp/API/lbs-gal/date) behind
  // the planned gallons, per product, editable to recompute gallons live.
  tuneRows?: TuneRow[];
  onTuneProduct?: (productId: string, api: number, tempF: number) => void;
  tuneTempColor?: string;
  // Current ambient at the selected city (same value the temp prediction
  // used) -- context inside the Tune overlay.
  ambientTempF?: number | null;

  // Fuel-burn correction (Load Report, over legal only). Saddle-tank size
  // saved on the selected truck, and a saver for the first time it's entered.
  fuelTankGallons?: number | null;
  onSaveFuelTankGallons?: (gallons: number) => Promise<void>;

  // Drives the first-open "look here" walkthrough (see the spotlight block
  // near the bottom of this component) -- a plain id to key its one-time
  // "seen" localStorage flag by, same per-user convention tourProgress.ts
  // already uses elsewhere.
  userId?: string | null;
}) {
  const {
    open,
    onClose,
    styles,
    planRows,
    capOverrides,
    productNameById,
    productHexCodeById,
    productInputs,
    onSetCompartmentCap,
    persistedCapForComp,
    livePreviewGrossLbs,
    targetWeight,
    report,
    onNewLoad,
    onEditLoad,
    onDeleteLoad,
    deleteBusy,
    deleteError,
    onLoaded,
    onUpdateCardOnly,
    onReportTerminalIssue,
    onBackToPlanner,
    loadedDisabled,
    loadedLabel,
    errorMessage,
    equipmentLabel,
    terminalLabel,
    locationLabel,
    rackName,
    onTapTerminal,
    allPlannedUnavailable,
    tuneRows,
    onTuneProduct,
    tuneTempColor,
    ambientTempF,
    fuelTankGallons,
    onSaveFuelTankGallons,
    userId,
    trip,
  } = props;

  // Fuel-burn correction -- display only, never written to the load. The
  // recorded actual weight (and everything derived from it) stays exactly as
  // measured. Cleared whenever a different report is shown.
  const [burnGallons, setBurnGallons] = useState<number | null>(null);
  const [burnOpen, setBurnOpen] = useState(false);
  const [burnSaveError, setBurnSaveError] = useState<string | null>(null);
  useEffect(() => { setBurnGallons(null); setBurnOpen(false); setBurnSaveError(null); }, [report]);

  const plannedLines = useMemo(() => {
    return (planRows ?? [])
      .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
      .map((r) => ({
        comp: Number(r.comp_number),
        productId: String(r.productId),
        gallons: Number(r.planned_gallons ?? 0),
      }))
      .filter((x) => Number.isFinite(x.comp) && x.comp > 0 && Number.isFinite(x.gallons) && x.gallons > 0);
  }, [planRows]);

  // ── First-open walkthrough ("look here" spotlight) ────────────────────
  // Two fixed steps, shown once ever per driver: step 0 points at the
  // planned-compartments/Total block ("Load This"), step 1 points at the
  // "Log the Load" button. Unlike the Setup Guide's own spotlight (which
  // continuously re-derives its target from live state), this one really
  // is a small fixed sequence -- Plan Review only has two things worth
  // calling out on a first visit, not an open-ended checklist. The "seen"
  // flag is written the instant the tour STARTS, not after both steps are
  // dismissed -- tapping straight through to a real action (rather than
  // reading the captions) makes the refs these steps target disappear
  // from the DOM anyway (the view switches to the Log-the-Load sequence),
  // which naturally ends the tour either way; marking it seen up front
  // just guarantees it can never show a second time regardless of how the
  // driver exits.
  const plannedBlockRef = useRef<HTMLDivElement | null>(null);
  const logLoadButtonRef = useRef<HTMLButtonElement | null>(null);
  const [tourStep, setTourStep] = useState<0 | 1 | null>(null);
  useEffect(() => {
    if (open && !report && plannedLines.length > 0 && userId && !isPlanReviewTourSeen(userId)) {
      markPlanReviewTourSeen(userId);
      setTourStep(0);
    }
    if (!open) setTourStep(null);
  }, [open, report, plannedLines.length, userId]);
  const plannedBlockRect = useSpotlightRect(plannedBlockRef, tourStep === 0);
  const logLoadButtonRect = useSpotlightRect(logLoadButtonRef, tourStep === 1);

  // ── Edit Load: the same per-compartment sequence below, sourced from the
  // report's own real values instead of the plan. Set by tapping "Edit
  // Load" in report mode; cleared whenever the sequence exits (finished or
  // cancelled) so a later "Log the Load" (impossible while report is set,
  // but defensive) never inherits it.
  const [editingReport, setEditingReport] = useState(false);

  // Compartments in physical order -- the Log-the-Load sequence walks these
  // one at a time (not one per product), so two compartments of the same
  // product each get their own genuine Gallons/API/Temp entry instead of
  // sharing one. Sourced from the report's own lines while editing a
  // completed load, from the live plan otherwise.
  const sequenceSourceLines = editingReport && report
    ? report.lines.map((l) => ({ comp: l.comp, productId: l.productId, gallons: l.gallons }))
    : plannedLines;
  const orderedCompLines = useMemo(
    () => [...sequenceSourceLines].sort((a, b) => a.comp - b.comp),
    [sequenceSourceLines]
  );
  // The report's own real API/temp per compartment -- preferred over the
  // "inherited from an earlier compartment of the same product" chain and
  // the last-observed/predicted fallback below, since re-editing a real
  // load should default to what was actually entered, not a fresh guess.
  const reportEntryByComp = useMemo(() => {
    const m = new Map<number, { api: number | null; tempF: number | null }>();
    if (report) for (const l of report.lines) m.set(l.comp, { api: l.api, tempF: l.tempF });
    return m;
  }, [report]);

  // ── Phase-1 gallons tap-to-adjust overlay (unchanged) ───────────────────
  const [gallonsTarget, setGallonsTarget] = useState<{ comp: number; productId: string } | null>(null);
  const [gallonsInput, setGallonsInput] = useState("");
  const gallonsCap = gallonsTarget ? persistedCapForComp?.(gallonsTarget.comp) ?? null : null;

  function openGallonsOverlay(comp: number, productId: string, currentGallons: number) {
    setGallonsTarget({ comp, productId });
    setGallonsInput(String(Math.round(currentGallons)));
  }
  function commitGallonsOverlay() {
    if (!gallonsTarget) return;
    const n = parseInt(gallonsInput, 10);
    if (Number.isFinite(n)) {
      const clamped = gallonsCap != null ? Math.max(0, Math.min(gallonsCap, n)) : Math.max(0, n);
      onSetCompartmentCap(gallonsTarget.comp, clamped);
    }
    setGallonsTarget(null);
  }

  // ── Finish Loading / Edit Load: one window per product ─────────────────
  // (2026-10-11) The driver enters what's on the BOL once per product, not
  // once per compartment: BOL # and supplier (trip mode), then API, temp,
  // gross and net. When one product came on more than one BOL, Split Load
  // assigns its compartments to BOL groups and each group gets its own
  // window. A window's gross and net are spread over its compartments by
  // planned gallons (lib/trips/bolGroups.ts), so onLoaded/onEditLoad still
  // get one entry per compartment, same shape as before.
  const [compSeqIndex, setCompSeqIndex] = useState<number | null>(null);
  const [bolAssign, setBolAssign] = useState<BolAssignment>({});
  const [splitProductId, setSplitProductId] = useState<string | null>(null);
  const [splitDraft, setSplitDraft] = useState<BolAssignment>({});
  const [seqGallons, setSeqGallons] = useState("");
  const [seqApi, setSeqApi] = useState("");
  const [seqTemp, setSeqTemp] = useState("");
  const [compEntries, setCompEntries] = useState<Record<number, { gallons: number; api: number; tempF: number }>>({});
  // Trip mode extras for the current window and the ones already confirmed.
  const [seqBol, setSeqBol] = useState("");
  const [seqSupplier, setSeqSupplier] = useState("");
  const [seqSupplierId, setSeqSupplierId] = useState<string | null>(null);
  const [seqNet, setSeqNet] = useState("");
  const [seqNetTouched, setSeqNetTouched] = useState(false);
  const [seqError, setSeqError] = useState<string | null>(null);
  const [seqBusy, setSeqBusy] = useState(false);
  const [seqFocus, setSeqFocus] = useState<string | null>(null);
  const [pickingSupplier, setPickingSupplier] = useState(false);
  const [tripExtras, setTripExtras] = useState<Record<number, TripCompExtra>>({});
  const okBols = useRef<Set<string>>(new Set());
  // After the products: the times window, then the signature window.
  const [tripStep, setTripStep] = useState<"times" | "sign" | null>(null);
  const [tripTimes, setTripTimes] = useState<StepTimes | null>(null);
  const [tripReasonId, setTripReasonId] = useState<string | null>(null);
  const [tripNote, setTripNote] = useState("");
  const [tripOdometer, setTripOdometer] = useState("");
  const [tripSigned, setTripSigned] = useState(false);
  const [tripStepError, setTripStepError] = useState<string | null>(null);

  const seqGroups = useMemo(
    () => buildBolGroups(orderedCompLines.map((l) => ({ comp: l.comp, productId: l.productId, gallons: l.gallons })), bolAssign),
    [orderedCompLines, bolAssign]
  );
  const lineByComp = useMemo(() => new Map(orderedCompLines.map((l) => [l.comp, l])), [orderedCompLines]);
  const seqGroup = compSeqIndex != null ? seqGroups[compSeqIndex] ?? null : null;
  const seqGroupKey = seqGroup ? `${seqGroup.productId}:${seqGroup.comps.join(",")}` : "";

  // Reset all sequence state whenever the modal closes, so a re-open never
  // resumes a half-finished sequence from a previous load.
  useEffect(() => {
    if (!open) {
      setCompSeqIndex(null);
      setCompEntries({});
      setGallonsTarget(null);
      setEditingReport(false);
      setConfirmDelete(false);
      setTripExtras({});
      setTripStep(null);
      setSeqError(null);
      setSeqBusy(false);
      setPickingSupplier(false);
      setBolAssign({});
      setSplitProductId(null);
      okBols.current = new Set();
    }
  }, [open]);

  // Prefill the current window. Values already confirmed for its
  // compartments (the driver went Back) are shown as-is. Otherwise gross is
  // the planned gallons for those compartments; API/temp come from the
  // report being edited, else an earlier window of the same product, else
  // the last-observed/predicted values seeded into productInputs. BOL and
  // supplier carry over from the previous window when it's a different
  // product (one BOL usually covers the whole load); a split of the same
  // product starts blank because it's a different BOL by definition.
  useEffect(() => {
    if (compSeqIndex == null || !seqGroup) return;
    setSeqError(null);
    const comps = seqGroup.comps;
    const first = comps[0];
    const prevGroup = compSeqIndex > 0 ? seqGroups[compSeqIndex - 1] : null;

    if (trip) {
      const own = tripExtras[first];
      const def = trip.compDefaults[first];
      const prevExtra = prevGroup && prevGroup.productId !== seqGroup.productId ? tripExtras[prevGroup.comps[0]] : undefined;
      setSeqBol(own?.bol ?? def?.bol ?? prevExtra?.bol ?? "");
      if (own) { setSeqSupplier(own.supplier); setSeqSupplierId(own.supplierId); }
      else if (def?.supplier) { setSeqSupplier(def.supplier); setSeqSupplierId(def.supplierId); }
      else { setSeqSupplier(prevExtra?.supplier ?? ""); setSeqSupplierId(prevExtra?.supplierId ?? null); }
      const ownAll = comps.every((c) => tripExtras[c]);
      const defAll = comps.every((c) => trip.compDefaults[c]?.net != null);
      if (ownAll) {
        const net = comps.reduce((t, c) => t + (tripExtras[c].net ?? 0), 0);
        const calc = comps.reduce((t, c) => t + (tripExtras[c].netCalculated ?? 0), 0);
        setSeqNet(String(net));
        setSeqNetTouched(comps.some((c) => tripExtras[c].net !== tripExtras[c].netCalculated) && net !== calc);
      } else if (defAll && comps.some((c) => trip.compDefaults[c]?.netTouched)) {
        setSeqNet(String(comps.reduce((t, c) => t + (trip.compDefaults[c]?.net ?? 0), 0)));
        setSeqNetTouched(true);
      } else {
        setSeqNet("");
        setSeqNetTouched(false);
      }
      setSeqFocus("bol");
    } else {
      setSeqFocus("api");
    }

    if (comps.every((c) => compEntries[c])) {
      setSeqGallons(String(Math.round(comps.reduce((t, c) => t + compEntries[c].gallons, 0))));
      setSeqApi(String(compEntries[first].api));
      setSeqTemp(compEntries[first].tempF.toFixed(1));
      return;
    }

    setSeqGallons(String(Math.round(comps.reduce((t, c) => t + (lineByComp.get(c)?.gallons ?? 0), 0))));

    const ownReportEntry = reportEntryByComp.get(first);
    if (ownReportEntry && ownReportEntry.api != null && ownReportEntry.tempF != null) {
      setSeqApi(String(ownReportEntry.api));
      setSeqTemp(ownReportEntry.tempF.toFixed(1));
      return;
    }

    let inherited: { api: number; tempF: number } | null = null;
    for (let i = compSeqIndex - 1; i >= 0; i--) {
      const g = seqGroups[i];
      if (g.productId !== seqGroup.productId) continue;
      const entry = compEntries[g.comps[0]];
      if (entry) { inherited = { api: entry.api, tempF: entry.tempF }; break; }
    }
    if (inherited) {
      setSeqApi(String(inherited.api));
      setSeqTemp(inherited.tempF.toFixed(1));
    } else {
      const pi = productInputs[seqGroup.productId];
      setSeqApi(pi?.api ? String(pi.api) : "");
      setSeqTemp(pi?.tempF != null ? Number(pi.tempF).toFixed(1) : "");
    }
    // Keyed on the window only -- re-seeding on every compEntries/
    // productInputs change would clobber what the driver is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compSeqIndex, seqGroupKey]);

  function startLogSequence() {
    if (orderedCompLines.length === 0) { onLoaded({}); return; }
    setCompEntries({});
    setTripExtras({});
    setBolAssign({});
    setCompSeqIndex(0);
  }
  function startEditSequence() {
    if (!report) return;
    // Real bug caught before shipping: orderedCompLines still reflects the
    // PRE-update editingReport value here (setEditingReport is async, only
    // takes effect on the next render) -- checking it instead of
    // report.lines directly would wrongly fall through to "nothing to
    // edit" whenever the live plan (plannedLines) happens to be empty,
    // even though the report itself has real lines to edit.
    setEditingReport(true);
    if (report.lines.length === 0) { onEditLoad?.({}); return; }
    setCompEntries({});
    setTripExtras({});
    // Compartments of one product already on different BOLs start split.
    const bols: Record<number, string | null> = {};
    if (trip) for (const l of report.lines) bols[l.comp] = trip.compDefaults[l.comp]?.bol ?? null;
    setBolAssign(initialBolAssignment(report.lines.map((l) => ({ comp: l.comp, productId: l.productId, gallons: l.gallons })), bols));
    setCompSeqIndex(0);
  }
  function cancelLogSequence() {
    setCompSeqIndex(null);
    setEditingReport(false);
  }
  function goToPreviousCompStep() {
    if (compSeqIndex == null || compSeqIndex <= 0) return;
    setCompSeqIndex(compSeqIndex - 1);
  }

  // ── Split Load: assign one product's compartments to BOLs ───────────────
  function openSplit() {
    if (!seqGroup) return;
    const pid = seqGroup.productId;
    const draft: BolAssignment = {};
    for (const g of seqGroups) if (g.productId === pid) for (const c of g.comps) draft[c] = g.bolIndex;
    setSplitDraft(draft);
    setSplitProductId(pid);
  }
  function finishSplit() {
    const pid = splitProductId;
    if (!pid) return;
    const productComps = orderedCompLines.filter((l) => l.productId === pid).map((l) => l.comp);
    const next = { ...bolAssign };
    for (const c of productComps) next[c] = splitDraft[c] ?? 1;
    // The grouping changed, so this product's confirmed windows start over.
    setCompEntries((prev) => { const o = { ...prev }; for (const c of productComps) delete o[c]; return o; });
    setTripExtras((prev) => { const o = { ...prev }; for (const c of productComps) delete o[c]; return o; });
    setBolAssign(next);
    setSplitProductId(null);
    const regrouped = buildBolGroups(orderedCompLines.map((l) => ({ comp: l.comp, productId: l.productId, gallons: l.gallons })), next);
    const firstIdx = regrouped.findIndex((g) => g.productId === pid);
    setCompSeqIndex(firstIdx >= 0 ? firstIdx : 0);
  }

  async function commitCompStep() {
    if (compSeqIndex == null || seqBusy) return;
    const group = seqGroups[compSeqIndex];
    if (!group) { setCompSeqIndex(null); return; }

    const gallonsN = parseFloat(seqGallons);
    const apiN = parseFloat(seqApi);
    const tempN = parseFloat(seqTemp);
    // Keep the window open on invalid input rather than advancing (or
    // completing) with garbage data.
    if (!Number.isFinite(gallonsN) || !Number.isFinite(apiN) || !Number.isFinite(tempN) || gallonsN < 0) {
      setSeqError("Enter API, temp and gross.");
      return;
    }

    // Sanity check against what these compartments can hold (a typo, not a
    // real BOL, is the only way past it). Editing a logged load skips it:
    // there's no live plan cap to bound against.
    if (!editingReport && persistedCapForComp) {
      const caps = group.comps.map((c) => persistedCapForComp(c));
      if (caps.every((c) => c != null)) {
        const hold = caps.reduce((t, c) => t + (c as number), 0);
        if (gallonsN > hold + 1) { setSeqError(`More than ${group.comps.length > 1 ? "these compartments hold" : "this compartment holds"} (${Math.round(hold).toLocaleString()} gal).`); return; }
      }
    }

    let bol = "";
    let netN: number | null = null;
    if (trip) {
      bol = seqBol.trim();
      if (!bol) { setSeqError("Enter the BOL number."); return; }
      if (!seqSupplier.trim()) { setSeqError("Pick the supplier."); return; }
      netN = parseFloat(seqNetShown);
      if (!Number.isFinite(netN) || netN < 0) { setSeqError("Enter the net gallons."); return; }
      // A split exists because the BOLs differ.
      const key = normalizeRef(bol);
      const sameProductOther = seqGroups.some((g, i) => i !== compSeqIndex && g.productId === group.productId
        && tripExtras[g.comps[0]] && normalizeRef(tripExtras[g.comps[0]].bol) === key);
      if (sameProductOther) { setSeqError("Each split needs its own BOL number."); return; }
      if (!okBols.current.has(key)) {
        setSeqBusy(true);
        const dup = await trip.checkBols([bol]).catch(() => [] as string[]);
        setSeqBusy(false);
        if (dup.length) { setSeqError(`BOL ${bol} is already on another load.`); return; }
        okBols.current.add(key);
      }
    }

    // Spread the window's gross (and net) over its compartments by planned gallons.
    const weights = group.comps.map((c) => lineByComp.get(c)?.gallons ?? 0);
    const grossShares = distributeWhole(gallonsN, weights);
    const updated = { ...compEntries };
    group.comps.forEach((c, i) => { updated[c] = { gallons: grossShares[i], api: apiN, tempF: tempN }; });
    setCompEntries(updated);

    let updatedExtras = tripExtras;
    if (trip && netN != null) {
      const netShares = distributeWhole(netN, grossShares);
      const calcShares = seqCalc != null ? distributeWhole(seqCalc, grossShares) : group.comps.map(() => null);
      updatedExtras = { ...tripExtras };
      group.comps.forEach((c, i) => {
        updatedExtras[c] = {
          bol, supplier: seqSupplier.trim(), supplierId: seqSupplierId,
          net: netShares[i], netCalculated: calcShares[i],
        };
      });
      setTripExtras(updatedExtras);
    }

    const isLast = compSeqIndex >= seqGroups.length - 1;
    if (isLast) {
      setCompSeqIndex(null);
      if (editingReport) {
        onEditLoad?.(updated, trip ? { byComp: updatedExtras } : undefined);
        setEditingReport(false);
      } else if (trip) {
        // On to the times window, then the signature. Begin is the Start
        // Loading tap; leave is now.
        setTripTimes(trip.existingTimes ?? defaultStepTimes(new Date(), loadingOffset(trip.settings), trip.arrivedAt, trip.beganAt));
        setTripReasonId(trip.existingDelayReasonId);
        setTripNote(trip.existingDelayNote ?? "");
        setTripOdometer(trip.existingOdometer != null ? String(trip.existingOdometer) : "");
        setTripSigned(false);
        setTripStepError(null);
        setTripStep("times");
      } else {
        onLoaded(updated);
      }
    } else {
      setCompSeqIndex(compSeqIndex + 1);
    }
  }

  const showLivePreview = livePreviewGrossLbs != null;

  const totalPlannedGallons = useMemo(
    () => plannedLines.reduce((sum, x) => sum + x.gallons, 0),
    [plannedLines]
  );

  // ── Delete Load: inline confirm, no separate sheet ──────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);

  // ── Report mode: per-product sums + whole-load total + basis rows ───────
  const reportLinesSorted = useMemo(
    () => (report ? [...report.lines].sort((a, b) => a.comp - b.comp) : []),
    [report]
  );
  const reportByProduct = useMemo(() => {
    const map = new Map<string, { productId: string; gallons: number; lbs: number; apiSum: number; apiCount: number; tempSum: number; tempCount: number }>();
    for (const l of reportLinesSorted) {
      const cur = map.get(l.productId) ?? { productId: l.productId, gallons: 0, lbs: 0, apiSum: 0, apiCount: 0, tempSum: 0, tempCount: 0 };
      cur.gallons += l.gallons;
      cur.lbs += l.lbs ?? 0;
      if (l.api != null) { cur.apiSum += l.api; cur.apiCount += 1; }
      if (l.tempF != null) { cur.tempSum += l.tempF; cur.tempCount += 1; }
      map.set(l.productId, cur);
    }
    return Array.from(map.values());
  }, [reportLinesSorted]);
  const reportTotalGallons = reportByProduct.reduce((s, p) => s + p.gallons, 0);
  const reportTotalLbs = reportByProduct.reduce((s, p) => s + p.lbs, 0);
  const reportBasisRows = reportByProduct.map((p) => ({
    productId: p.productId,
    api: p.apiCount > 0 ? p.apiSum / p.apiCount : null,
    tempF: p.tempCount > 0 ? p.tempSum / p.tempCount : null,
    lbsPerGal: p.gallons > 0 ? p.lbs / p.gallons : null,
  }));

  const seqCalc = trip && seqGroup
    ? calculateNetGallons(numOrNull(seqGallons), numOrNull(seqApi), numOrNull(seqTemp), netMethodForProduct(productNameById.get(seqGroup.productId) ?? null))
    : null;
  const seqNetShown = seqNetTouched ? seqNet : (seqCalc != null ? String(seqCalc) : seqNet);

  function finishTimesStep() {
    if (!trip || !tripTimes) return;
    const tp = timesProblem(tripTimes);
    if (tp) return setTripStepError(tp);
    if (!delayReasonOk(tripTimes, trip.settings.loading_delay_threshold_minutes, tripReasonId, tripNote)) return setTripStepError("Pick a delay reason.");
    if (trip.needsOdometer && numOrNull(tripOdometer) == null) return setTripStepError("Enter the odometer.");
    setTripStepError(null);
    setTripStep("sign");
  }
  function finishSignStep() {
    if (!trip || !tripTimes) return;
    if (!tripSigned) return setTripStepError("Accept your signature to finish.");
    const delayNeeded = needsDelayReason(delayMinutes(tripTimes.arrivedAt, tripTimes.beginAt), trip.settings.loading_delay_threshold_minutes);
    setTripStep(null);
    onLoaded(compEntries, {
      byComp: tripExtras,
      times: tripTimes,
      delayReasonId: delayNeeded ? tripReasonId : null,
      delayNote: delayNeeded && !tripReasonId ? tripNote.trim() || null : null,
      odometer: trip.needsOdometer ? numOrNull(tripOdometer) : trip.existingOdometer,
      signed: tripSigned,
    });
  }
  const seqDot = seqGroup ? ((productHexCodeById?.[seqGroup.productId] && String(productHexCodeById[seqGroup.productId]).trim()) || "rgba(255,255,255,0.5)") : undefined;
  const seqLabel = seqGroup
    ? `${productNameById.get(seqGroup.productId) ?? seqGroup.productId}${seqGroup.bolCount > 1 ? ` · BOL ${seqGroup.bolIndex} of ${seqGroup.bolCount}` : ""}`
    : "";
  const seqProductCompCount = seqGroup ? orderedCompLines.filter((l) => l.productId === seqGroup.productId).length : 0;
  const seqIsLast = compSeqIndex != null && compSeqIndex >= seqGroups.length - 1;
  const seqSubmitLabel = !seqIsLast ? "Next" : (editingReport ? "Save Load" : trip ? "Next" : "Finish Loading");

  const busy = Boolean(loadedDisabled);

  return (
    <FullscreenModal open={open} title={report ? "Load Report" : "Plan Review"} onClose={onClose} footer={null} hideCloseButton>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        {/* Safety-confirmation block -- Equipment (unit numbers) stacked
            above Terminal, per explicit direction; Terminal · City/State
            (white/bold, tappable) then rack across from it on the same
            row, right-aligned/gray -- same layout the main Planner page's
            own location line uses. */}
        {(equipmentLabel || terminalLabel) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 2px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {equipmentLabel && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {equipmentLabel}
              </div>
            )}
            {terminalLabel && (
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, overflow: "hidden" }}>
                  {onTapTerminal && !report ? (
                    <button
                      type="button"
                      onClick={onTapTerminal}
                      style={{
                        display: "flex", alignItems: "baseline", gap: 6, background: "none", border: "none", padding: 0,
                        cursor: "pointer", minWidth: 0,
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{terminalLabel}</span>
                      {locationLabel && (
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>· {locationLabel}</span>
                      )}
                      <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 700, flexShrink: 0 }}>›</span>
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{terminalLabel}</span>
                      {locationLabel && (
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>· {locationLabel}</span>
                      )}
                    </>
                  )}
                </div>
                {rackName && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.45)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {rackName}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {report ? (
          // ── Load Report -- read-only, compressed, grey ──────────────────
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.2, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const }}>
              Compartments
            </div>
            {reportLinesSorted.map((l) => {
              const dotColor = (productHexCodeById?.[l.productId] && String(productHexCodeById[l.productId]).trim()) || "rgba(255,255,255,0.5)";
              const label = productNameById.get(l.productId) ?? l.productId;
              return (
                <div key={`${l.comp}-${l.productId}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", flexShrink: 0, width: 20 }}>C{l.comp}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)", flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>{Math.round(l.gallons)} gal</span>
                </div>
              );
            })}

            {trip && (() => {
              // BOL and supplier per BOL, with the compartments on it. Net
              // gallons are billing-only (PTD), so the recap doesn't show them.
              const groups: { bol: string; supplier: string; comps: number[] }[] = [];
              for (const l of reportLinesSorted) {
                const d = trip.compDefaults[l.comp];
                if (!d) continue;
                const bol = d.bol || "—";
                const supplier = d.supplier || "No supplier";
                const g = groups.find((x) => x.bol === bol && x.supplier === supplier);
                if (g) g.comps.push(l.comp); else groups.push({ bol, supplier, comps: [l.comp] });
              }
              if (!groups.length) return null;
              const tm = trip.existingTimes;
              return (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 3, marginTop: 6, padding: "6px 10px", borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
                }}>
                  {groups.map((g) => (
                    <div key={`${g.bol}|${g.supplier}`} style={{ display: "flex", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.55)", minWidth: 0 }}>
                      <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        BOL {g.bol} · {g.supplier}
                      </span>
                      <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>{g.comps.map((c) => `C${c}`).join(" ")}</span>
                    </div>
                  ))}
                  {tm && (
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "2px 12px", paddingTop: 4, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      <span>Arrived {fmtTime(tm.arrivedAt)}</span>
                      <span>Begin {fmtTime(tm.beginAt)}</span>
                      <span>Depart {fmtTime(tm.leftAt)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Totals -- per-product sums (2+ distinct products only, see
                below) plus the whole-load Total, grouped inside one bordered
                box so they read as their own distinct "totals" section
                instead of blending into the raw compartment list above --
                per explicit follow-up, same bordered-box treatment already
                used for the Actual Weight card further down. */}
            <div style={{
              display: "flex", flexDirection: "column", gap: 2,
              marginTop: 6, padding: "6px 10px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
            }}>
              {/* Only meaningful with 2+ distinct products -- with just one,
                  this line would just repeat the Total line below it. */}
              {reportByProduct.length > 1 && reportByProduct.map((p) => {
                const dotColor = (productHexCodeById?.[p.productId] && String(productHexCodeById[p.productId]).trim()) || "rgba(255,255,255,0.5)";
                const label = productNameById.get(p.productId) ?? p.productId;
                return (
                  <div key={p.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 2px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {label} total
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>
                      {Math.round(p.gallons)} gal
                    </span>
                  </div>
                );
              })}

              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 2px 2px",
                marginTop: reportByProduct.length > 1 ? 2 : 0,
                borderTop: reportByProduct.length > 1 ? "1px solid rgba(255,255,255,0.10)" : "none",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>
                  {Math.round(reportTotalGallons)} gal · {Math.round(reportTotalLbs).toLocaleString()} lbs
                </span>
              </div>
            </div>
          </div>
        ) : (
          // ── Plan Review -- editable, per compartment ─────────────────────
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>Planned compartments</div>

            {plannedLines.length === 0 ? (
              allPlannedUnavailable ? (
                <div
                  style={{
                    borderRadius: 6,
                    border: "1px solid rgba(255,170,60,0.35)",
                    background: "rgba(255,170,60,0.10)",
                    padding: "10px 12px",
                    color: "rgba(255,225,190,0.95)",
                    fontWeight: 700,
                    lineHeight: 1.3,
                  }}
                >
                  None of your planned products are sold at {terminalLabel || "this terminal"}. Tap “Didn’t Load / Cancel” below to swap them for products carried here.
                </div>
              ) : (
                <div style={styles.help}>No filled compartments in the plan.</div>
              )
            ) : (
              <div ref={plannedBlockRef} style={{ display: "grid", gap: 8 }}>
                {plannedLines.map((x) => {
                  const dotColor = (productHexCodeById?.[x.productId] && String(productHexCodeById[x.productId]).trim()) || "rgba(255,255,255,0.5)";
                  const label = productNameById.get(x.productId) ?? x.productId;
                  return (
                    <div
                      key={`${x.comp}-${x.productId}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "10px 12px", borderRadius: 10,
                        border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.5)", flexShrink: 0, width: 24 }}>C{x.comp}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {label}
                        </span>
                        {capOverrides?.[x.comp] != null && x.gallons >= capOverrides[x.comp] - 1 && (
                          <span style={{
                            flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                            color: "#fb923c", border: "1px solid rgba(251,146,60,0.5)",
                            borderRadius: 4, padding: "1px 5px",
                          }}>
                            CAPPED
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openGallonsOverlay(x.comp, x.productId, x.gallons)}
                        style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", textAlign: "right" as const, flexShrink: 0 }}
                      >
                        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4 }}>GAL</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{Math.round(x.gallons)}</div>
                      </button>
                    </div>
                  );
                })}

                {/* Total -- boxed the same way as Load Report's own totals
                    section, so it reads as a distinct summary rather than
                    another compartment in the list above. */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginTop: 2, padding: "8px 10px", borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Total</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>{Math.round(totalPlannedGallons)} gal</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Load basis / Tune panel (review mode: interactive card, tap to
            correct) vs. Load Report's own plain read-only rows. */}
        {report
          ? <ReportBasisRows rows={reportBasisRows} productNameById={productNameById} productHexCodeById={productHexCodeById} />
          : (tuneRows && onTuneProduct && tuneRows.length > 0 && (
              <TunePanel rows={tuneRows} tempColor={tuneTempColor || "#ffffff"} onTune={onTuneProduct} ambientTempF={ambientTempF} cityLabel={locationLabel ? locationLabel.split(",")[0] : null} />
            ))}

        {/* Weight -- review mode: "Live Weight," label left / value right,
            colored by target-vs-legal threshold, no separate "vs Target"
            column anymore. Report mode: "Actual Weight," same coloring,
            bigger/bolder -- this is the real number now, not a preview. */}
        {report ? (
          report.actualGrossLbs != null && (<>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 14px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Actual Weight</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: weightColor(report.actualGrossLbs, targetWeight) }}>
                {Math.round(report.actualGrossLbs).toLocaleString()} lbs
              </div>
            </div>
            {report.actualGrossLbs > LEGAL_LIMIT_LBS && (
              burnGallons != null ? (
                (() => {
                  const corrected = correctedGrossLbs(report.actualGrossLbs!, burnGallons);
                  return (
                    <button
                      type="button"
                      onClick={() => setBurnOpen(true)}
                      style={{
                        display: "flex", flexDirection: "column", gap: 4, width: "100%", textAlign: "left" as const,
                        padding: "12px 14px", borderRadius: 6, cursor: "pointer",
                        border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>After Fuel Burn</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: weightColor(corrected, targetWeight) }}>
                          {Math.round(corrected).toLocaleString()} lbs
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                        <span>{Math.round(burnGallons)} gal burned · −{Math.round(burnCreditLbs(burnGallons)).toLocaleString()} lbs</span>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>edit ›</span>
                      </div>
                      {corrected > LEGAL_LIMIT_LBS && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>
                          Still about {Math.round(corrected - LEGAL_LIMIT_LBS).toLocaleString()} lbs over legal.
                        </div>
                      )}
                    </button>
                  );
                })()
              ) : (
                <button
                  type="button"
                  onClick={() => setBurnOpen(true)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                    padding: "12px 14px", borderRadius: 6, cursor: "pointer", textAlign: "left" as const,
                    border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#f87171" }}>Likely over the legal limit</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Adjust for fuel burned since your tare</span>
                  </div>
                  <span style={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }}>›</span>
                </button>
              )
            )}
            {burnSaveError && (
              <div style={{ fontSize: 12, color: "rgba(255,210,210,0.9)" }}>{burnSaveError}</div>
            )}
            <FuelBurnOverlay
              open={burnOpen}
              savedTankGallons={fuelTankGallons ?? null}
              initialGallons={burnGallons}
              onCancel={() => setBurnOpen(false)}
              onApply={(gal, tankToSave) => {
                setBurnGallons(gal);
                setBurnOpen(false);
                setBurnSaveError(null);
                if (tankToSave != null && onSaveFuelTankGallons) {
                  onSaveFuelTankGallons(tankToSave).catch((e: any) => {
                    setBurnSaveError(`Couldn't save the tank size to this truck: ${e?.message ?? "unknown error"}`);
                  });
                }
              }}
            />
          </>)
        ) : (
          showLivePreview && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 12px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Live Weight</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: weightColor(livePreviewGrossLbs, targetWeight) }}>
                {Math.round(livePreviewGrossLbs!).toLocaleString()} lbs
              </div>
            </div>
          )
        )}

        {errorMessage ? (
          <div
            style={{
              borderRadius: 6,
              border: "1px solid rgba(255,80,80,0.35)",
              background: "rgba(255,80,80,0.10)",
              padding: "10px 12px",
              color: "rgba(255,210,210,0.95)",
              fontWeight: 850,
              lineHeight: 1.25,
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        {report ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {deleteError ? (
              <div style={{ borderRadius: 6, border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.10)", padding: "10px 12px", color: "rgba(255,210,210,0.95)", fontWeight: 700, lineHeight: 1.25 }}>
                {deleteError}
              </div>
            ) : null}

            {trip ? (
              <button
                type="button"
                onClick={trip.onArrivedAtDelivery}
                style={{ ...(styles as any).doneBtn, width: "100%" }}
              >
                Arrived at Delivery
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { onClose(); onNewLoad?.(); }}
                style={{ ...(styles as any).doneBtn, width: "100%" }}
              >
                Return to Planner
              </button>
            )}

            {/* Edit opens a small menu; Delete lives inside it so it can't be
                tapped by accident from the report itself. */}
            {!editMenuOpen ? (
              <button
                type="button"
                onClick={() => { setEditMenuOpen(true); setConfirmDelete(false); }}
                disabled={Boolean(deleteBusy)}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 10,
                  border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
                  color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  opacity: deleteBusy ? 0.55 : 1,
                }}
              >
                Edit Load
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 10, border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW }}>
                <button
                  type="button"
                  onClick={() => { setEditMenuOpen(false); startEditSequence(); }}
                  disabled={Boolean(deleteBusy)}
                  style={{
                    width: "100%", padding: "12px 16px", borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.92)", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Edit Details
                </button>
                {confirmDelete ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => onDeleteLoad?.()}
                      disabled={Boolean(deleteBusy)}
                      style={{
                        flex: 1, padding: "12px 16px", borderRadius: 10,
                        border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.15)",
                        color: "#fca5a5", fontSize: 15, fontWeight: 700, cursor: "pointer",
                        opacity: deleteBusy ? 0.6 : 1,
                      }}
                    >
                      {deleteBusy ? "Deleting…" : "Confirm Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={Boolean(deleteBusy)}
                      style={{
                        flex: 1, padding: "12px 16px", borderRadius: 10,
                        border: CARD_BORDER, background: "transparent",
                        color: "rgba(255,255,255,0.75)", fontSize: 15, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={Boolean(deleteBusy)}
                    style={{
                      width: "100%", padding: "10px 16px", borderRadius: 10,
                      border: "1px solid rgba(239,68,68,0.25)", background: "transparent",
                      color: "#f87171", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    Delete Load
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setEditMenuOpen(false); setConfirmDelete(false); }}
                  disabled={Boolean(deleteBusy)}
                  style={{ width: "100%", padding: "6px 0", border: "none", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
            )}

            {trip && (
              <button
                type="button"
                onClick={() => { onClose(); onNewLoad?.(); trip.onBackToDashboard?.(); }}
                style={{ width: "100%", padding: "10px 0", border: "none", background: "transparent", color: "rgba(255,255,255,0.40)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Back to Dashboard
              </button>
            )}
          </div>
        ) : (
          /* Action buttons -- the "next steps" that used to live in a separate
             sheet, now directly in the modal. */
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <button
              ref={logLoadButtonRef}
              type="button"
              onClick={startLogSequence}
              disabled={busy}
              style={{ ...(styles as any).doneBtn, opacity: busy ? 0.55 : 1, width: "100%" }}
            >
              {loadedDisabled ? (loadedLabel ?? "Saving…") : "Finish Loading"}
            </button>

            <button
              type="button"
              onClick={onUpdateCardOnly}
              disabled={busy}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 10,
                border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
                color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700, cursor: "pointer",
                opacity: busy ? 0.55 : 1,
              }}
            >
              Update Card, No Load
            </button>

            <button
              type="button"
              onClick={onReportTerminalIssue}
              disabled={busy}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 10,
                border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
                color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700, cursor: "pointer",
                opacity: busy ? 0.55 : 1,
              }}
            >
              Report Terminal Issue
            </button>

            <button
              type="button"
              onClick={onBackToPlanner}
              disabled={busy}
              style={{
                width: "100%", padding: "10px 0",
                borderRadius: 6, border: "none", background: "transparent",
                color: "rgba(255,255,255,0.40)", fontSize: 13, fontWeight: 700, cursor: "pointer",
                opacity: busy ? 0.55 : 1,
              }}
            >
              Didn&apos;t Load / Cancel
            </button>
          </div>
        )}
      </div>

      {/* Compartment cap tap-to-adjust -- sets the max gallons for this comp
          (weight-bounded solver, can't overload); recovers from a mistype.
          Review mode only -- report mode's compartments aren't tappable. */}
      <ValueEntryOverlay
        open={gallonsTarget != null}
        title={gallonsTarget ? `Cap · C${gallonsTarget.comp}` : "Cap"}
        fields={[{ key: "gallons", label: "Max gallons", value: gallonsInput, onChange: setGallonsInput, suffix: "gal" }]}
        hint={gallonsCap != null ? `Up to ${Math.round(gallonsCap)} gal` : undefined}
        onCancel={() => setGallonsTarget(null)}
        onSubmit={commitGallonsOverlay}
      />

      {/* Finish Loading / Edit Load: one window per product (per BOL after
          a split). BOL # and supplier first (trip mode), then API, temp,
          gross, net -- the keypad's Next walks the fields in that order. */}
      <ValueEntryOverlay
        open={compSeqIndex != null && !pickingSupplier && splitProductId == null}
        title={seqLabel}
        dotColor={seqDot}
        focusKey={seqFocus}
        fields={[
          ...(trip ? [{
            key: "bol", label: "BOL #", value: seqBol, text: true,
            onChange: (v: string) => { setSeqBol(v); setSeqError(null); },
            // Next on the BOL opens the supplier list when none is picked yet.
            onEnter: () => { if (seqSupplier.trim()) return false; setPickingSupplier(true); return true; },
            after: (
              <button type="button" onClick={() => setPickingSupplier(true)}
                style={{
                  width: "100%", marginTop: 8, padding: "9px 10px", borderRadius: 4, cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)",
                  color: seqSupplier ? "#fff" : "rgba(255,255,255,0.45)", fontSize: 15, fontWeight: 700,
                }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{seqSupplier || "Pick supplier"}</span>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
              </button>
            ),
          }] : []),
          { key: "api", label: "API", value: seqApi, onChange: (v: string) => { setSeqApi(v); setSeqError(null); }, decimal: true },
          { key: "temp", label: "Temp", value: seqTemp, onChange: (v: string) => { setSeqTemp(v); setSeqError(null); }, suffix: "°F", decimal: true },
          { key: "gallons", label: "Gross", value: seqGallons, onChange: (v: string) => { setSeqGallons(v); setSeqError(null); }, suffix: "gal" },
          ...(trip ? [{ key: "net", label: "Net", value: seqNetShown, onChange: (v: string) => { setSeqNet(v); setSeqNetTouched(true); setSeqError(null); }, suffix: "gal", decimal: true }] : []),
        ]}
        footer={seqProductCompCount > 1 ? (
          <button type="button" onClick={openSplit}
            style={{
              width: "100%", padding: "9px 10px", borderRadius: 4, cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
              color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 700,
            }}>
            {seqGroup && seqGroup.bolCount > 1 ? "Change Split" : "Split Load"}
          </button>
        ) : undefined}
        hint={(
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" as const }}>
            {seqGroup && <span>{seqGroup.comps.map((c) => `C${c}`).join(" + ")}{seqGroups.length > 1 && compSeqIndex != null ? ` · ${compSeqIndex + 1} of ${seqGroups.length}` : ""}</span>}
            {trip && seqNetTouched && seqCalc != null && String(seqCalc) !== seqNet && (
              <button type="button" onClick={() => { setSeqNet(String(seqCalc)); setSeqNetTouched(false); }}
                style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>
                Calculated net {seqCalc} · use it
              </button>
            )}
            <span>If the BOL shows more than one, use the lowest API and the coldest temperature.</span>
          </div>
        )}
        onCancel={compSeqIndex != null && compSeqIndex > 0 ? goToPreviousCompStep : cancelLogSequence}
        cancelLabel={compSeqIndex != null && compSeqIndex > 0 ? "‹ Back" : "Cancel"}
        onSubmit={() => { void commitCompStep(); }}
        submitLabel={seqSubmitLabel}
        error={seqError}
        busyLabel={seqBusy ? "Checking…" : null}
      />

      {/* Split Load: which BOL each of this product's compartments came on. */}
      {splitProductId != null && (() => {
        const comps = orderedCompLines.filter((l) => l.productId === splitProductId);
        const used = Math.max(1, ...comps.map((l) => splitDraft[l.comp] ?? 1));
        const choices = Math.min(comps.length, used + 1);
        return (
          <StepCard
            title={`Split · ${productNameById.get(splitProductId) ?? splitProductId}`}
            onBack={() => setSplitProductId(null)}
            backLabel="Cancel"
            onNext={finishSplit}
            nextLabel="Done"
          >
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center" as const }}>
              Group the compartments by BOL. Each BOL gets its own window.
            </div>
            {comps.map((l) => (
              <div key={l.comp} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, width: 32 }}>C{l.comp}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: "1 1 auto" }}>{Math.round(l.gallons).toLocaleString()} gal</span>
                {Array.from({ length: choices }, (_, i) => i + 1).map((n) => {
                  const on = (splitDraft[l.comp] ?? 1) === n;
                  return (
                    <button key={n} type="button" onClick={() => setSplitDraft((d) => ({ ...d, [l.comp]: n }))}
                      style={{
                        padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 700,
                        border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                        background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.7)",
                      }}>
                      BOL {n}
                    </button>
                  );
                })}
              </div>
            ))}
          </StepCard>
        );
      })()}

      {trip && (
        <SupplierPicker
          open={pickingSupplier}
          suppliers={trip.suppliers}
          current={seqSupplier || null}
          onAdd={trip.onAddSupplier}
          onPick={(p) => { setSeqSupplier(p.name); setSeqSupplierId(p.supplier_id); setSeqError(null); setSeqFocus("api"); setPickingSupplier(false); }}
          onClose={() => setPickingSupplier(false)}
        />
      )}

      {trip && tripStep === "times" && tripTimes && (
        <StepCard
          title={trip.pickupName ? `Times · ${trip.pickupName}` : "Loading times"}
          onBack={() => { setTripStep(null); setTripStepError(null); setCompSeqIndex(Math.max(0, seqGroups.length - 1)); }}
          backLabel="‹ Back"
          onNext={finishTimesStep}
          nextLabel="Next"
          error={tripStepError}
        >
          <TimesEditor times={tripTimes} onChange={(t) => { setTripTimes(t); setTripStepError(null); }} beginLabel="Begin loading" />
          <DelayReasonField times={tripTimes} threshold={trip.settings.loading_delay_threshold_minutes} reasons={trip.reasons} kind="loading"
            reasonId={tripReasonId} note={tripNote} onChange={(id, n) => { setTripReasonId(id); setTripNote(n); setTripStepError(null); }} />
          {trip.needsOdometer && (
            <div>
              <div style={fieldLabel}>Odometer</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>This pickup is in a different city from the last one.</div>
              <input value={tripOdometer} onChange={(e) => { setTripOdometer(e.target.value); setTripStepError(null); }} inputMode="numeric" style={fieldInput} />
            </div>
          )}
        </StepCard>
      )}

      {trip && tripStep === "sign" && (
        <StepCard
          title="Loading driver"
          onBack={() => { setTripStep("times"); setTripStepError(null); }}
          backLabel="‹ Back"
          onNext={finishSignStep}
          nextLabel="Finish Loading"
          error={tripStepError}
        >
          <SignatureAccept savedPath={trip.signature} onSave={trip.onSaveSignature} accepted={tripSigned}
            onAccept={(v) => { setTripSigned(v); setTripStepError(null); }} who="the loading driver" />
        </StepCard>
      )}

      {/* First-open walkthrough -- see the tourStep effect above. Both
          Spotlight calls are unconditional; each one's own rect is already
          null whenever its step isn't active (useSpotlightRect), so it
          renders nothing on its own. */}
      <Spotlight
        rect={plannedBlockRect}
        title="Load This"
        body="This is what you're about to load — tap a compartment's gallons to adjust it if you need to."
        actionLabel="Next →"
        onAction={() => setTourStep(1)}
      />
      <Spotlight
        rect={logLoadButtonRect}
        title="Finish Loading"
        body="When you're done loading, tap here."
        actionLabel="Got it"
        onAction={() => setTourStep(null)}
      />
    </FullscreenModal>
  );
}
