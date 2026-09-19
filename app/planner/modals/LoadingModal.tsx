"use client";

import React, { useMemo, useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ValueEntryOverlay from "../components/ValueEntryOverlay";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";
import type { ReportLine } from "../hooks/useLoadWorkflow";

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
// three action buttons become New Load / Edit Load / Delete Load in that
// mode (see the props/JSX below for exactly what each does).

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
// elsewhere; a correction recomputes the planned gallons live (page.tsx's
// onTuneProduct feeds the density). Temp keeps its confidence color.
//
// Review-mode only -- the Load Report's own basis listing (further down)
// is a deliberately non-interactive sibling, not this component reused.
function TunePanel({ rows, tempColor, onTune }: {
  rows: TuneRow[];
  tempColor: string;
  onTune: (productId: string, api: number, tempF: number) => void;
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
        hint="From your gauge or BOL"
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
  // "New Load" -- just closes back to the Planner, no DB action (the load's
  // already committed).
  onNewLoad?: () => void;
  // "Edit Load" -- reopens the same per-compartment Gallons/API/Temp entry
  // sequence used at Log the Load, seeded from this report's own real
  // values, and updates the already-submitted load with whatever's
  // re-entered.
  onEditLoad?: (compEntries: Record<number, { gallons: number; api: number; tempF: number }>) => void;
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
  onLoaded: (compEntries: Record<number, { gallons: number; api: number; tempF: number }>) => void;
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
}) {
  const {
    open,
    onClose,
    styles,
    planRows,
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
    onTapTerminal,
    allPlannedUnavailable,
    tuneRows,
    onTuneProduct,
    tuneTempColor,
  } = props;

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

  // ── Log the Load / Edit Load: per-compartment Gallons/API/Temp entry
  // sequence ───────────────────────────────────────────────────────────────
  // Walked in physical compartment order (not per product). Each step is
  // fully local, synchronous state -- no async round-trip to wait on -- and
  // once the last compartment is confirmed, onLoaded (or onEditLoad, while
  // editingReport) fires immediately with the whole map, built locally so
  // the just-typed final entry is never missing from what's submitted.
  const [compSeqIndex, setCompSeqIndex] = useState<number | null>(null);
  const [seqGallons, setSeqGallons] = useState("");
  const [seqApi, setSeqApi] = useState("");
  const [seqTemp, setSeqTemp] = useState("");
  const [compEntries, setCompEntries] = useState<Record<number, { gallons: number; api: number; tempF: number }>>({});

  // Reset all sequence state whenever the modal closes, so a re-open never
  // resumes a half-finished sequence from a previous load.
  useEffect(() => {
    if (!open) {
      setCompSeqIndex(null);
      setCompEntries({});
      setGallonsTarget(null);
      setEditingReport(false);
      setConfirmDelete(false);
    }
  }, [open]);

  // Prefill the current step. If this compartment already has a committed
  // entry (the driver tapped Back to review/re-check it, or stepped forward
  // again after going back), show exactly what's already stored for it --
  // never recomputed -- so "Back" is a true review, not a re-guess.
  // Otherwise (first time reaching this step): Gallons always comes from
  // that compartment's own planned amount (never chained from another
  // compartment). API/Temp prefer, in order: this compartment's own real
  // entry from the report being edited; forward-chained from the nearest
  // EARLIER compartment of the SAME product already confirmed this
  // sequence (never reversed, never backfilled onto an earlier step); the
  // last-observed/predicted values already seeded into productInputs.
  useEffect(() => {
    if (compSeqIndex == null) return;
    const line = orderedCompLines[compSeqIndex];
    if (!line) return;

    const existing = compEntries[line.comp];
    if (existing) {
      setSeqGallons(String(Math.round(existing.gallons)));
      setSeqApi(String(existing.api));
      setSeqTemp(existing.tempF.toFixed(1));
      return;
    }

    setSeqGallons(String(Math.round(line.gallons)));

    const ownReportEntry = reportEntryByComp.get(line.comp);
    if (ownReportEntry && ownReportEntry.api != null && ownReportEntry.tempF != null) {
      setSeqApi(String(ownReportEntry.api));
      setSeqTemp(ownReportEntry.tempF.toFixed(1));
      return;
    }

    let inherited: { api: number; tempF: number } | null = null;
    for (let i = compSeqIndex - 1; i >= 0; i--) {
      const prior = orderedCompLines[i];
      if (prior.productId !== line.productId) continue;
      const entry = compEntries[prior.comp];
      if (entry) { inherited = { api: entry.api, tempF: entry.tempF }; break; }
    }
    if (inherited) {
      setSeqApi(String(inherited.api));
      setSeqTemp(inherited.tempF.toFixed(1));
    } else {
      const pi = productInputs[line.productId];
      setSeqApi(pi?.api ? String(pi.api) : "");
      setSeqTemp(pi?.tempF != null ? Number(pi.tempF).toFixed(1) : "");
    }
    // Intentionally keyed on the index only -- re-seeding on every
    // compEntries/productInputs change would clobber what the driver is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compSeqIndex]);

  function startLogSequence() {
    if (orderedCompLines.length === 0) { onLoaded({}); return; }
    setCompEntries({});
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
  function commitCompStep() {
    if (compSeqIndex == null) return;
    const line = orderedCompLines[compSeqIndex];
    if (!line) { setCompSeqIndex(null); return; }

    const gallonsN = parseFloat(seqGallons);
    const apiN = parseFloat(seqApi);
    const tempN = parseFloat(seqTemp);
    // Silently keep the step open on invalid input -- no alert(), matching
    // this modal's own established convention -- rather than advancing (or
    // completing) with garbage data.
    if (!Number.isFinite(gallonsN) || !Number.isFinite(apiN) || !Number.isFinite(tempN)) return;

    const cap = persistedCapForComp?.(line.comp) ?? null;
    const clampedGallons = editingReport
      ? Math.max(0, gallonsN) // editing a real load: no live plan cap to bound against
      : (cap != null ? Math.max(0, Math.min(cap, gallonsN)) : Math.max(0, gallonsN));

    const updated = { ...compEntries, [line.comp]: { gallons: clampedGallons, api: apiN, tempF: tempN } };
    setCompEntries(updated);

    const isLast = compSeqIndex >= orderedCompLines.length - 1;
    if (isLast) {
      setCompSeqIndex(null);
      if (editingReport) {
        onEditLoad?.(updated);
        setEditingReport(false);
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

  const seqLine = compSeqIndex != null ? orderedCompLines[compSeqIndex] : null;
  const seqDot = seqLine ? ((productHexCodeById?.[seqLine.productId] && String(productHexCodeById[seqLine.productId]).trim()) || "rgba(255,255,255,0.5)") : undefined;
  const seqLabel = seqLine ? `C${seqLine.comp} · ${productNameById.get(seqLine.productId) ?? seqLine.productId}` : "";
  const seqSubmitLabel = compSeqIndex != null && compSeqIndex < orderedCompLines.length - 1 ? "Next" : (editingReport ? "Save Load" : "Log Load");

  const busy = Boolean(loadedDisabled);

  return (
    <FullscreenModal open={open} title={report ? "Load Report" : "Plan Review"} onClose={onClose} footer={null} hideCloseButton>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        {/* Safety-confirmation block -- Terminal left (white/bold, tappable),
            Equipment right. */}
        {(equipmentLabel || terminalLabel) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 2px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {terminalLabel && (
              onTapTerminal && !report ? (
                <button
                  type="button"
                  onClick={onTapTerminal}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0,
                    cursor: "pointer", minWidth: 0, fontSize: 15, fontWeight: 800, color: "#fff",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{terminalLabel}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 700, flexShrink: 0 }}>›</span>
                </button>
              ) : (
                <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{terminalLabel}</span>
              )
            )}
            {equipmentLabel && (
              <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, textAlign: "right" as const, flexShrink: 0 }}>
                {equipmentLabel}
              </span>
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

            {/* Only meaningful with 2+ distinct products -- with just one,
                this line would just repeat the Total line below it. */}
            {reportByProduct.length > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {reportByProduct.map((p) => {
                  const dotColor = (productHexCodeById?.[p.productId] && String(productHexCodeById[p.productId]).trim()) || "rgba(255,255,255,0.5)";
                  const label = productNameById.get(p.productId) ?? p.productId;
                  return (
                    <div key={p.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 2px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {label} total
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>
                        {Math.round(p.gallons)} gal · {Math.round(p.lbs).toLocaleString()} lbs
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px", marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Total</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>
                {Math.round(reportTotalGallons)} gal · {Math.round(reportTotalLbs).toLocaleString()} lbs
              </span>
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
                  None of your planned products are sold at {terminalLabel || "this terminal"}. Tap “Back to Planner” below to swap them for products carried here.
                </div>
              ) : (
                <div style={styles.help}>No filled compartments in the plan.</div>
              )
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
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

                {/* Total -- plain summary line, not another compartment. */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px" }}>
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
              <TunePanel rows={tuneRows} tempColor={tuneTempColor || "#ffffff"} onTune={onTuneProduct} />
            ))}

        {/* Weight -- review mode: "Live Weight," label left / value right,
            colored by target-vs-legal threshold, no separate "vs Target"
            column anymore. Report mode: "Actual Weight," same coloring,
            bigger/bolder -- this is the real number now, not a preview. */}
        {report ? (
          report.actualGrossLbs != null && (
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
          )
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

            <button
              type="button"
              onClick={() => { onClose(); onNewLoad?.(); }}
              style={{ ...(styles as any).doneBtn, width: "100%" }}
            >
              New Load
            </button>

            <button
              type="button"
              onClick={startEditSequence}
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
                    border: CARD_BORDER, background: CARD_BG,
                    color: "rgba(255,255,255,0.75)", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={Boolean(deleteBusy)}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 10,
                  border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)",
                  color: "#f87171", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  opacity: deleteBusy ? 0.55 : 1,
                }}
              >
                Delete Load
              </button>
            )}
          </div>
        ) : (
          /* Action buttons -- the "next steps" that used to live in a separate
             sheet, now directly in the modal. */
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={startLogSequence}
              disabled={busy}
              style={{ ...(styles as any).doneBtn, opacity: busy ? 0.55 : 1, width: "100%" }}
            >
              {loadedDisabled ? (loadedLabel ?? "Saving…") : "Log the Load"}
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
              Back to Planner
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

      {/* Log the Load / Edit Load: one compartment at a time, in physical
          order, dot + "C{n} · Product" at the top. Gallons/API/Temp all
          confirmed together. */}
      <ValueEntryOverlay
        open={compSeqIndex != null}
        title={seqLabel}
        dotColor={seqDot}
        fields={[
          { key: "gallons", label: "Gallons", value: seqGallons, onChange: setSeqGallons, suffix: "gal" },
          { key: "temp", label: "Temp", value: seqTemp, onChange: setSeqTemp, suffix: "°F", decimal: true },
          { key: "api", label: "API", value: seqApi, onChange: setSeqApi, decimal: true },
        ]}
        hint={orderedCompLines.length > 1 && compSeqIndex != null ? `Compartment ${compSeqIndex + 1} of ${orderedCompLines.length}` : undefined}
        onCancel={compSeqIndex != null && compSeqIndex > 0 ? goToPreviousCompStep : cancelLogSequence}
        cancelLabel={compSeqIndex != null && compSeqIndex > 0 ? "‹ Back" : "Cancel"}
        onSubmit={commitCompStep}
        submitLabel={seqSubmitLabel}
      />
    </FullscreenModal>
  );
}
