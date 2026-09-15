"use client";
// app/planner/components/TerminalSwitchDuringLoadSheet.tsx
//
// New 2026-09-05, part of the Plan Review redesign: tapping the terminal
// name in LoadingModal's safety-confirmation row opens the shared
// location/terminal picker (MyTerminalsModal/LocationModal, unchanged --
// see page.tsx's handleTapTerminalInLoadingModal) without leaving Plan
// Review. If that picker actually changes the terminal, this sheet opens
// once it settles (picker closed, any rack pick resolved) and asks what
// to do about it -- reusing the exact same GRAPHITE-gradient sheet +
// CARD_BG/CARD_BORDER/CARD_SHADOW row treatment CancelLoadSheet already
// established, per explicit direction that every window in this flow
// needs the app's own themed look, not a generic grey.
//
// Three choices, matching the literal spec:
// - "Switch to {new} (No Card Update)" -- the new terminal sticks (it's
//   already live-applied by the picker itself), the active load's own
//   terminal_id/rack_id get retagged to match, but the new terminal's
//   access card is deliberately left untouched (page.tsx's
//   onSwitchWithoutUpdating).
// - "Stay at {previous} (Update Card)" -- the opposite: the terminal pick
//   is discarded, the load stays at the terminal it was already at, and
//   THAT terminal's access card gets refreshed (page.tsx's
//   onUpdateCardAtPrevious reverts location back to the snapshot taken
//   before the picker opened, then re-cards there). Relabeled 2026-09-15
//   from "Update Card at {previous}" -- a real driver read that as "yes,
//   confirm my card update" (i.e. an affirmative answer to a card-renewal
//   question) without registering that it also silently reverts the
//   terminal pick, and reported "it wouldn't let me switch" after tapping
//   it while actually intending to switch. Leading with the effect that
//   actually differs between the two buttons -- Switch vs. Stay -- makes
//   them read as the mutually exclusive pair they are.
// - "Report Terminal Issue" -- reuses the exact same Out of Product/Out of
//   Allocation product-picker submission CancelLoadSheet's own report flow
//   already built (onSubmitOutageReport, unchanged), but does NOT end the
//   load or ask a cardRenewal follow-up the way that flow does -- per
//   explicit direction ("after reporting, return to the same window to
//   pick update card or no update or another issue"), a successful submit
//   here just returns to this sheet's own main menu.
//
// Deliberately no backdrop-dismiss (same precedent as RackSelectSheet,
// also mounted as part of this same flow) -- there's no neutral "do
// nothing" outcome once the terminal has already been changed live by the
// picker; the driver has to pick one of the three real options.

import React, { useEffect, useMemo, useState } from "react";
import { GRAPHITE, GRAPHITE_DARKER, themeFill, themeTextOnFill } from "../theme";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";
import type { OutageReportType } from "../hooks/useTerminalOutageReports";

type PlanRowLike = {
  comp_number: number;
  planned_gallons?: number | null;
  productId?: string | null;
};

type Props = {
  open: boolean;
  prevTerminalName: string;
  newTerminalName: string;
  onUpdateCardAtPrevious: () => void;
  onSwitchWithoutUpdating: () => void;
  darkMode: boolean;
  accentColor: string | null;

  // For the "Report Terminal Issue" product picker -- same shape as
  // CancelLoadSheet's own, reused verbatim rather than re-derived.
  planRows: PlanRowLike[];
  productNameById: Map<string, string>;
  onSubmitOutageReport: (reportType: OutageReportType, productIds: string[]) => Promise<{ error: string | null }>;
};

const secondaryRowStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 10,
  border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
  color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700,
  cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
};
const cancelStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 10, border: "none",
  background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

export default function TerminalSwitchDuringLoadSheet({
  open, prevTerminalName, newTerminalName, onUpdateCardAtPrevious, onSwitchWithoutUpdating,
  darkMode, accentColor, planRows, productNameById, onSubmitOutageReport,
}: Props) {
  const [mode, setMode] = useState<"menu" | "reportType" | "reportProducts">("menu");
  const [reportType, setReportType] = useState<OutageReportType | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fresh state every time this sheet opens for a new terminal-switch
  // attempt -- same reasoning as CancelLoadSheet's identical effect.
  useEffect(() => {
    if (open) {
      setMode("menu");
      setReportType(null);
      setSelectedProductIds(new Set());
      setSubmitBusy(false);
      setSubmitError(null);
    }
  }, [open]);

  const productChoices = useMemo(() => {
    const seen = new Set<string>();
    const out: { productId: string; name: string }[] = [];
    for (const r of planRows) {
      const pid = r?.productId ? String(r.productId) : "";
      if (!pid || Number(r?.planned_gallons ?? 0) <= 0 || seen.has(pid)) continue;
      seen.add(pid);
      out.push({ productId: pid, name: productNameById.get(pid) ?? pid });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [planRows, productNameById]);

  if (!open) return null;

  function toggleProduct(pid: string) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  // Same "call with explicit args, not state" reasoning as CancelLoadSheet's
  // identical helper -- selectReportType needs to submit in the same tick
  // it sets reportType/selectedProductIds.
  async function submitReportFor(type: OutageReportType, productIds: string[]) {
    if (productIds.length === 0) return;
    setSubmitBusy(true);
    setSubmitError(null);
    const { error } = await onSubmitOutageReport(type, productIds);
    setSubmitBusy(false);
    if (error) {
      setReportType(type);
      setSelectedProductIds(new Set(productIds));
      setMode("reportProducts");
      setSubmitError(error);
      return;
    }
    // The whole point of this being a different flow from CancelLoadSheet's
    // own report path: nothing here cancels the load or asks a follow-up
    // question -- just go back to the real decision (stay at the previous
    // terminal / switch to the new one / report another issue).
    setMode("menu");
  }

  function submitReport() {
    if (!reportType || selectedProductIds.size === 0) return;
    submitReportFor(reportType, Array.from(selectedProductIds));
  }

  function selectReportType(type: OutageReportType) {
    if (productChoices.length === 1) {
      setReportType(type);
      const onlyId = productChoices[0].productId;
      setSelectedProductIds(new Set([onlyId]));
      submitReportFor(type, [onlyId]);
      return;
    }
    setReportType(type);
    setSelectedProductIds(new Set());
    setMode("reportProducts");
  }

  const primaryRowStyle: React.CSSProperties = {
    width: "100%", padding: "14px 16px", borderRadius: 10,
    border: CARD_BORDER, boxShadow: CARD_SHADOW,
    background: themeFill(darkMode, accentColor, "#fff"),
    color: themeTextOnFill(darkMode),
    fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10400, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        style={{
          width: "100%", maxWidth: 480,
          background: `linear-gradient(180deg, ${GRAPHITE} 0%, ${GRAPHITE_DARKER} 100%)`,
          borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,0.1)",
          padding: "18px 16px calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        {mode === "menu" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              Switch terminals?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              You were loading at {prevTerminalName} and just picked {newTerminalName}.
            </div>
            <button type="button" style={primaryRowStyle} onClick={onSwitchWithoutUpdating}>
              Switch to {newTerminalName} (No Card Update)
            </button>
            <button type="button" style={secondaryRowStyle} onClick={onUpdateCardAtPrevious}>
              Stay at {prevTerminalName} (Update Card)
            </button>
            <button type="button" style={secondaryRowStyle} onClick={() => setMode("reportType")}>
              Report Terminal Issue
            </button>
          </>
        )}

        {mode === "reportType" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              What's the issue?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              This posts a heads-up banner for other drivers heading to {prevTerminalName}.
            </div>
            <button
              type="button" style={{ ...secondaryRowStyle, opacity: submitBusy ? 0.55 : 1 }}
              disabled={submitBusy}
              onClick={() => selectReportType("out_of_product")}
            >
              {submitBusy && reportType === "out_of_product" ? "Submitting…" : "Out of Product"}
            </button>
            <button
              type="button" style={{ ...secondaryRowStyle, opacity: submitBusy ? 0.55 : 1 }}
              disabled={submitBusy}
              onClick={() => selectReportType("out_of_allocation")}
            >
              {submitBusy && reportType === "out_of_allocation" ? "Submitting…" : "Out of Allocation"}
            </button>
            <button type="button" style={cancelStyle} onClick={() => setMode("menu")} disabled={submitBusy}>Back</button>
          </>
        )}

        {mode === "reportProducts" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              Which product{productChoices.length > 1 ? "s" : ""}?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              Select only what was actually {reportType === "out_of_product" ? "unavailable" : "allocation-capped"} -- not the whole load.
            </div>

            {submitError && (
              <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>{submitError}</div>
            )}

            {productChoices.length === 0 ? (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
                No planned products found on this load.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                {productChoices.map((p) => {
                  const checked = selectedProductIds.has(p.productId);
                  return (
                    <button
                      type="button"
                      key={p.productId}
                      onClick={() => toggleProduct(p.productId)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        width: "100%", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                        border: checked ? "1px solid rgba(255,255,255,0.35)" : CARD_BORDER,
                        background: CARD_BG, boxShadow: CARD_SHADOW,
                        color: "rgba(255,255,255,0.90)", fontSize: 14, fontWeight: 600, textAlign: "left" as const,
                      }}
                    >
                      <span>{p.name}</span>
                      <span style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "1px solid rgba(255,255,255,0.35)",
                        background: checked ? themeFill(darkMode, accentColor, "#fff") : "transparent",
                      }}>
                        {checked && <span style={{ color: "#00c2ff", fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={submitReport}
              disabled={selectedProductIds.size === 0 || submitBusy}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 10, marginBottom: 8,
                border: CARD_BORDER, boxShadow: CARD_SHADOW,
                background: themeFill(darkMode, accentColor, "#fff"),
                color: themeTextOnFill(darkMode),
                fontSize: 15, fontWeight: 700, cursor: "pointer",
                opacity: selectedProductIds.size === 0 || submitBusy ? 0.55 : 1,
              }}
            >
              {submitBusy ? "Submitting…" : "Submit Report"}
            </button>
            <button type="button" style={cancelStyle} onClick={() => setMode("reportType")}>Back</button>
          </>
        )}
      </div>
    </div>
  );
}
