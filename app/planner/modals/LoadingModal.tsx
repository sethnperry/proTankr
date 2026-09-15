"use client";

import React, { useMemo, useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ValueEntryOverlay from "../components/ValueEntryOverlay";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

// ── Plan Review (redesign 2026-09-05) ──────────────────────────────────────
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

function fmtSignedLbs(v: number): string {
  const rounded = Math.round(v);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

// The Tune panel: shows the density basis (code · temp · API · lbs/gal · date)
// per product and lets the driver correct it with a fresh gauge/BOL reading.
// Tapping a row opens the same numeric overlay used to update temp/api
// elsewhere; a correction recomputes the planned gallons live (page.tsx's
// onTuneProduct feeds the density). Temp keeps its confidence color.
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
    livePreviewDiffLbs,
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

  // Compartments in physical order -- the Log-the-Load sequence walks these
  // one at a time (not one per product), so two compartments of the same
  // product each get their own genuine Gallons/API/Temp entry instead of
  // sharing one.
  const orderedCompLines = useMemo(
    () => [...plannedLines].sort((a, b) => a.comp - b.comp),
    [plannedLines]
  );

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

  // ── Log the Load: per-compartment Gallons/API/Temp entry sequence ───────
  // Walked in physical compartment order (not per product). Each step is
  // fully local, synchronous state -- no async round-trip to wait on -- and
  // once the last compartment is confirmed, onLoaded fires immediately with
  // the whole map, built locally so the just-typed final entry is never
  // missing from what's submitted.
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
    }
  }, [open]);

  // Prefill the current step: Gallons always comes from that compartment's
  // own planned amount (never chained from another compartment). API/Temp
  // forward-chain from the nearest EARLIER compartment of the SAME product
  // already confirmed this sequence -- never reversed, never backfilled onto
  // an earlier step. With no earlier match, fall back to the last-observed/
  // predicted values already seeded into productInputs, same as before.
  useEffect(() => {
    if (compSeqIndex == null) return;
    const line = orderedCompLines[compSeqIndex];
    if (!line) return;
    setSeqGallons(String(Math.round(line.gallons)));

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
  function cancelLogSequence() {
    setCompSeqIndex(null);
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
    const clampedGallons = cap != null ? Math.max(0, Math.min(cap, gallonsN)) : Math.max(0, gallonsN);

    const updated = { ...compEntries, [line.comp]: { gallons: clampedGallons, api: apiN, tempF: tempN } };
    setCompEntries(updated);

    const isLast = compSeqIndex >= orderedCompLines.length - 1;
    if (isLast) {
      setCompSeqIndex(null);
      onLoaded(updated);
    } else {
      setCompSeqIndex(compSeqIndex + 1);
    }
  }

  const showLivePreview = livePreviewGrossLbs != null;
  const overTarget = livePreviewDiffLbs != null && livePreviewDiffLbs > 0;

  const totalPlannedGallons = useMemo(
    () => plannedLines.reduce((sum, x) => sum + x.gallons, 0),
    [plannedLines]
  );

  const seqLine = compSeqIndex != null ? orderedCompLines[compSeqIndex] : null;
  const seqDot = seqLine ? ((productHexCodeById?.[seqLine.productId] && String(productHexCodeById[seqLine.productId]).trim()) || "rgba(255,255,255,0.5)") : undefined;
  const seqLabel = seqLine ? `C${seqLine.comp} · ${productNameById.get(seqLine.productId) ?? seqLine.productId}` : "";
  const seqSubmitLabel = compSeqIndex != null && compSeqIndex < orderedCompLines.length - 1 ? "Next" : "Log Load";

  const busy = Boolean(loadedDisabled);

  return (
    <FullscreenModal open={open} title="Plan Review" onClose={onClose} footer={null} hideCloseButton>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        {/* Safety-confirmation block -- Terminal left (white/bold, tappable),
            Equipment right. */}
        {(equipmentLabel || terminalLabel) && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 2px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {terminalLabel && (
              onTapTerminal ? (
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

        {/* Compartments -- clean: dot + full product label + gallons.
            Gallons stay tap-to-adjust (react to a stale reading by loading
            one compartment light without redistributing to siblings). */}
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

        {/* Load basis / Tune panel -- the density (temp/API) the planned
            gallons stand on, per product, editable to recompute live. This is
            what makes "you can load this much" trustworthy instead of a black
            box, and it's where temp is confirmed now (no separate step). */}
        {tuneRows && onTuneProduct && tuneRows.length > 0 && (
          <TunePanel rows={tuneRows} tempColor={tuneTempColor || "#ffffff"} onTune={onTuneProduct} />
        )}

        {/* Live weight / diff-vs-target preview -- plan density reflects any
            tune above. Same math the final submission uses, so it can never
            disagree with the recap. */}
        {showLivePreview && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 12px", borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>Live Weight</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{Math.round(livePreviewGrossLbs!).toLocaleString()} lbs</div>
            </div>
            {livePreviewDiffLbs != null && (
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>vs. Target</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: overTarget ? "#f87171" : "#4ade80" }}>
                  {fmtSignedLbs(livePreviewDiffLbs)} lbs
                </div>
              </div>
            )}
          </div>
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

        {/* Action buttons -- the "next steps" that used to live in a separate
            sheet, now directly in the modal. */}
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
      </div>

      {/* Compartment cap tap-to-adjust -- sets the max gallons for this comp
          (weight-bounded solver, can't overload); recovers from a mistype. */}
      <ValueEntryOverlay
        open={gallonsTarget != null}
        title={gallonsTarget ? `Cap · C${gallonsTarget.comp}` : "Cap"}
        fields={[{ key: "gallons", label: "Max gallons", value: gallonsInput, onChange: setGallonsInput, suffix: "gal" }]}
        hint={gallonsCap != null ? `Up to ${Math.round(gallonsCap)} gal` : undefined}
        onCancel={() => setGallonsTarget(null)}
        onSubmit={commitGallonsOverlay}
      />

      {/* Log the Load: one compartment at a time, in physical order, dot +
          "C{n} · Product" at the top. Gallons/API/Temp all confirmed together. */}
      <ValueEntryOverlay
        open={compSeqIndex != null}
        title={seqLabel}
        dotColor={seqDot}
        fields={[
          { key: "gallons", label: "Gallons", value: seqGallons, onChange: setSeqGallons, suffix: "gal" },
          { key: "api", label: "API", value: seqApi, onChange: setSeqApi, decimal: true },
          { key: "temp", label: "Temp", value: seqTemp, onChange: setSeqTemp, suffix: "°F", decimal: true },
        ]}
        hint={orderedCompLines.length > 1 && compSeqIndex != null ? `Compartment ${compSeqIndex + 1} of ${orderedCompLines.length}` : undefined}
        onCancel={cancelLogSequence}
        onSubmit={commitCompStep}
        submitLabel={seqSubmitLabel}
      />
    </FullscreenModal>
  );
}
