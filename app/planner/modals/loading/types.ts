"use client";
// app/planner/modals/loading/types.ts
//
// Types for Plan Review / the load report. Re-exported from ../LoadingModal.

import React from "react";
import type { ReportLine } from "../../hooks/useLoadWorkflow";
import { type StepTimes } from "@/lib/trips/tripFlow";
import type { SupplierRow } from "@/lib/trips/types";
import type { DelayReason, TripSettings } from "@/lib/trips/useTripData";

// ── Trip mode (2026-10-11) ─────────────────────────────────────────────────
// When the load is attached to an open trip, "Loaded" also collects what the
// dashboard's Loaded screen used to: BOL and supplier per compartment (carried
// into the next compartment, editable), net gallons (calculated, editable to
// match the BOL), then one window for the times and one for the loading
// driver's signature. The report's main button becomes "Arrive at Delivery".
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
  departedAt?: string | null; // when the truck's position showed it leave (telematics)
  existingTimes: StepTimes | null;
  // When Start Loading was tapped (the pickup's begin time), if recorded.
  beganAt: string | null;
  existingDelayReasonId: string | null;
  existingDelayNote: string | null;
  needsOdometer: boolean;
  existingOdometer: number | null;
  suppliers: SupplierRow[];
  onAddSupplier: (name: string) => SupplierRow | null;
  // Shipment numbers the telematics app logged for this stop (oldest first); prefill the BOL.
  geotabBols?: string[];
  // BOL numbers among `values` already on another load.
  checkBols: (values: string[]) => Promise<string[]>;
  signature: string | null;
  onSaveSignature: (path: string) => Promise<void>;
  // What's already recorded per compartment (edit, and the report).
  compDefaults: Record<
    number,
    { bol: string | null; supplier: string | null; supplierId: string | null; net: number | null; netTouched: boolean }
  >;
  onArrivedAtDelivery: () => void;
  onBackToDashboard?: () => void;
};

export type PlanRowLike = {
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

export type LoadingModalProps = {
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
  // Finish Loading was tapped: the page asks the telematics app for the shipment number once.
  onFinishLoadingStart?: () => void;
  // Update Card, No Load: cancels the load, keeps today's terminal access.
  onUpdateCardOnly: () => void;
  // Report Terminal Issue: hands off to CancelLoadSheet's report flow.
  onReportTerminalIssue: () => void;
  // Back to Planner: genuinely undoes the load + re-card (page.tsx).
  onBackToPlanner: () => void;

  // Disables the action buttons + relabels Log the Load while completing.
  loadedDisabled?: boolean;
  loadedLabel?: string;
  /** Label for the report's exit button off a trip (default "Return to Planner"). */
  returnLabel?: string;

  // Optional: styled warning block (if you wire it from page.tsx)
  errorMessage?: string | null;

  // Safety-confirmation block -- equipment/location identification shown
  // before a driver commits to a load.
  equipmentLabel?: string | null;
  terminalLabel?: string | null;
  // The supplier and its loading steps, shown once loading has begun.
  supplierSection?: React.ReactNode;
  // "City, State" -- rendered next to terminalLabel ("Terminal · City,
  // State"), same pairing the main Planner page's own location line uses.
  locationLabel?: string | null;
  // Rendered across from the terminal/city-state pair (far right, same
  // row) -- same layout as the main Planner's own location line.
  rackName?: string | null;
  // Tapping the terminal name opens the shared location/terminal picker
  // without leaving this modal (mid-load switch flow, see page.tsx).
  onTapTerminal?: () => void;
  /** Plan Review: undo the load start and go back to the Planner to change the plan. */
  onAdjustPlan?: () => void;
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
  liveFuelPct?: number | null; // truck's fuel level from telematics (recent only)
  onSaveFuelTankGallons?: (gallons: number) => Promise<void>;

  // Drives the first-open "look here" walkthrough (see the spotlight block
  // near the bottom of this component) -- a plain id to key its one-time
  // "seen" localStorage flag by, same per-user convention tourProgress.ts
  // already uses elsewhere.
  userId?: string | null;
};
