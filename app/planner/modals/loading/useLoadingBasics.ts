"use client";
// app/planner/modals/loading/useLoadingBasics.ts
//
// Props plus the small review state: planned lines, tour, edit mode, gallons overlay, fuel-burn, delete confirm.

import { useMemo, useEffect, useState, useRef } from "react";
import { useSpotlightRect } from "../../components/TourSpotlight";
import { isPlanReviewTourSeen, markPlanReviewTourSeen } from "../../utils/tourProgress";
import type { LoadingModalProps } from "./types";

export function useLoadingBasics(props: LoadingModalProps) {
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
    returnLabel,
    errorMessage,
    equipmentLabel,
    terminalLabel,
    supplierSection,
    locationLabel,
    rackName,
    onTapTerminal,
    onAdjustPlan,
    allPlannedUnavailable,
    tuneRows,
    onTuneProduct,
    tuneTempColor,
    ambientTempF,
    fuelTankGallons,
    liveFuelPct,
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
  useEffect(() => {
    setBurnGallons(null);
    setBurnOpen(false);
    setBurnSaveError(null);
  }, [report]);

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
  const sequenceSourceLines =
    editingReport && report ? report.lines.map((l) => ({ comp: l.comp, productId: l.productId, gallons: l.gallons })) : plannedLines;
  const orderedCompLines = useMemo(() => [...sequenceSourceLines].sort((a, b) => a.comp - b.comp), [sequenceSourceLines]);
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
  const gallonsCap = gallonsTarget ? (persistedCapForComp?.(gallonsTarget.comp) ?? null) : null;

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

  // ── Delete Load: inline confirm, no separate sheet ──────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);

  return {
    open,
    onClose,
    styles,
    capOverrides,
    productNameById,
    productHexCodeById,
    productInputs,
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
    returnLabel,
    errorMessage,
    equipmentLabel,
    terminalLabel,
    supplierSection,
    locationLabel,
    rackName,
    onTapTerminal,
    onAdjustPlan,
    allPlannedUnavailable,
    tuneRows,
    onTuneProduct,
    tuneTempColor,
    ambientTempF,
    fuelTankGallons,
    liveFuelPct,
    onSaveFuelTankGallons,
    trip,
    burnGallons,
    setBurnGallons,
    burnOpen,
    setBurnOpen,
    burnSaveError,
    setBurnSaveError,
    plannedLines,
    plannedBlockRef,
    logLoadButtonRef,
    tourStep,
    setTourStep,
    plannedBlockRect,
    logLoadButtonRect,
    editingReport,
    setEditingReport,
    orderedCompLines,
    reportEntryByComp,
    gallonsTarget,
    setGallonsTarget,
    gallonsInput,
    setGallonsInput,
    gallonsCap,
    openGallonsOverlay,
    commitGallonsOverlay,
    confirmDelete,
    setConfirmDelete,
    editMenuOpen,
    setEditMenuOpen,
  };
}
