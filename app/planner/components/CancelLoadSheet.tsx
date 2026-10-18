"use client";
// app/planner/components/CancelLoadSheet.tsx
//
// Rework (2026-08-13), per explicit user direction: the Loading modal used
// to have two separate exit paths -- a small "Close" text button in the
// header that silently canceled with no confirmation at all, and a big
// LOADED button that submitted directly. Collapsed into one deliberate
// exit point instead: the header Close button is gone (see
// FullscreenModal's hideCloseButton), the bottom button is now labeled
// "Complete" (or whatever loadedLabel page.tsx passes), and EVERY way of
// leaving the modal -- that button, backdrop click, or Escape, all routed
// through the same onClose prop -- opens this sheet instead of doing
// anything directly.
//
// Three choices, not two: tapping LOAD already re-cards the terminal as a
// side effect of begin_load (see useLoadWorkflow.ts's cancelActiveLoad
// comment) before this modal ever opens, and canceling only removes the
// load_log row, never reverts that. "Update Card, No Load" leaves that
// re-card in place deliberately; "Back to Planner" (per explicit follow-up)
// genuinely undoes it -- deletes the load AND restores the terminal's
// access date to whatever it was before this LOAD tap (see
// handleBackToPlannerNoUpdate in page.tsx).
//
// Because "Back to Planner" now does real, consequential writes (not just
// closing this sheet), backdrop-tap is wired to onDismiss -- a genuine
// no-op that just returns to the Loading modal -- instead of reusing
// onBackToPlanner. A stray tap outside the sheet shouldn't carry the same
// weight as the labeled button.
//
// Restyled 2026-08-27 -- per explicit feedback ("the theme of this window
// is generic and not exactly matching our app theme"): the flat
// translucent-white row buttons (a plain "system dialog" look, shared
// verbatim with PresetActionSheet.tsx before this pass) are replaced with
// the graphite-gradient card treatment already established everywhere
// else in the app (Cards tab, Reports tiles, Admin header tiles -- see
// cardTheme.ts's CARD_BG/CARD_BORDER/CARD_SHADOW). "Log the Load" -- the
// primary, most-common action here -- also picks up the same accent-
// color/dark-mode theme fill the Load and STUD buttons already use
// (themeFill/themeTextOnFill).
//
// Extended same day with "Report Terminal Issue" -- Out of Product /
// Out of Allocation, see CLAUDE.md "Terminal outage banners." Turned this
// component stateful (mode), same multi-step pattern PresetActionSheet.tsx
// already established ("menu" | "confirmEdit" | "confirmClear"). Stays
// presentational -- no direct Supabase calls -- the actual write happens
// via the new onSubmitOutageReport prop, owned by page.tsx /
// useTerminalOutageReports.ts.
//
// Follow-up same day: Out of Product no longer closes straight back to
// Back to Planner after the product picker -- per explicit direction
// ("it is safe to assume I didn't get loaded"), the load is always
// canceled from here, but whether today's terminal card ALSO reverts is
// genuinely unknown without asking: some terminals renew access the
// instant a driver checks in, others only renew it once a BOL is
// presented (which a driver who never loaded doesn't have). New
// "cardRenewal" mode asks that directly and routes to the two EXISTING
// props that already encode each outcome -- "Yes, It Renewed" reuses
// onUpdateCardOnly (cancels the load, leaves today's re-card alone,
// same as tapping that row from the main menu), "No, Requires a BOL"
// reuses onBackToPlanner (cancels the load AND reverts the card) -- no
// new page.tsx wiring needed for this, both behaviors already existed.
// ~~Out of Allocation is untouched (still returns to the normal 3-choice
// menu)...~~ -- reversed, see the next follow-up below.
//
// Follow-up same day: the product picker is skipped entirely when a load
// only has one product -- nothing to actually choose between, so making
// the driver tap it anyway is just friction (see selectReportType). A
// multi-product load still always goes through the picker, which is the
// whole reason it exists -- never assume every product was affected.
//
// Follow-up same day: Out of Allocation now matches Out of Product exactly
// instead of returning to the normal 3-choice menu -- per explicit
// direction ("it still goes back to the previous windows to log a load or
// update card without loading... just report it and go back to the
// planner"). The original "the driver might still want to log a partial
// load" reasoning was real, but in practice that extra stop back at the
// menu was just unwanted friction, not something actually used -- both
// report types now go straight to the cardRenewal question and end there.

import React, { useEffect, useMemo, useState } from "react";
import { GRAPHITE, GRAPHITE_DARKER, themeFill, themeTextOnFill , SURFACE } from "../theme";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";
import { isTerminalWide, type OutageReportType } from "../hooks/useTerminalOutageReports";
import { TERMINAL_ISSUES } from "@/lib/trips/terminalIssues";

type PlanRowLike = {
  comp_number: number;
  planned_gallons?: number | null;
  productId?: string | null;
};

type Props = {
  open: boolean;
  onDismiss: () => void;
  onBackToPlanner: () => void;
  onLogTheLoad: () => void;
  onUpdateCardOnly: () => void;
  darkMode: boolean;
  accentColor: string | null;

  // For the "Report Terminal Issue" product picker -- this load's own
  // planned products, deduped by product (same grouping LoadingModal.tsx's
  // own productGroups already does).
  planRows: PlanRowLike[];
  productNameById: Map<string, string>;
  onSubmitOutageReport: (reportType: OutageReportType, productIds: string[]) => Promise<{ error: string | null }>;

  // Which step to open on. The Loading modal now shows Log the Load / Update
  // Card / Back to Planner as its own buttons, so it opens this sheet
  // directly on "reportType" for the outage-report flow only; the legacy
  // "menu" mode (all four choices in the sheet) is still supported for any
  // other caller. Defaults to "menu".
  initialMode?: "menu" | "reportType";
};

const secondaryRowStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 2,
  border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
  color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700,
  cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
};
const cancelStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 2, border: "none",
  background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

export default function CancelLoadSheet({
  open, onDismiss, onBackToPlanner, onLogTheLoad, onUpdateCardOnly, darkMode, accentColor,
  planRows, productNameById, onSubmitOutageReport, initialMode = "menu",
}: Props) {
  const [mode, setMode] = useState<"menu" | "reportType" | "reportProducts" | "cardRenewal">(initialMode);
  const [reportType, setReportType] = useState<OutageReportType | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fresh state every time this sheet opens for a new load -- it isn't
  // unmounted between opens, so leftover mode/selections from a previous
  // pass through this flow must never silently carry over.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
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

  const dismissAll = () => { setMode("menu"); onDismiss(); };

  function toggleProduct(pid: string) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  // Takes type/productIds explicitly rather than reading reportType/
  // selectedProductIds off state -- selectReportType below needs to call
  // this in the SAME tick it sets those, and React state updates aren't
  // synchronously readable that way (the closure would still see the
  // pre-update values).
  async function submitReportFor(type: OutageReportType, productIds: string[]) {
    const wide = isTerminalWide(type);
    if (!wide && productIds.length === 0) return;
    setSubmitBusy(true);
    setSubmitError(null);
    const { error } = await onSubmitOutageReport(type, productIds);
    setSubmitBusy(false);
    if (error) {
      // Land on the picker (pre-selected, error visible) so there's a
      // normal retry path -- matters most for the single-product auto-
      // submit skip below, which never shows the picker on the happy path.
      // Terminal-wide reports have no product picker; stay on the type list.
      setReportType(type);
      setSelectedProductIds(new Set(productIds));
      setMode(wide ? "reportType" : "reportProducts");
      setSubmitError(error);
      return;
    }
    // Either report type cancels the load from here on -- per explicit
    // follow-up, Out of Allocation now matches Out of Product exactly
    // instead of returning to the normal 3-choice menu (the original call
    // was that a partial load might still be worth logging, but in
    // practice that just meant an extra, unwanted stop back at the
    // previous screen). What's still genuinely unknown either way is
    // whether the terminal card renewed anyway (some terminals renew on
    // check-in; others only renew once a BOL is presented) -- ask before
    // deciding what happens to today's access date, instead of guessing.
    setMode("cardRenewal");
  }

  function submitReport() {
    if (!reportType || selectedProductIds.size === 0) return;
    submitReportFor(reportType, Array.from(selectedProductIds));
  }

  // Skips the product picker entirely when there's only one candidate --
  // per explicit follow-up, nothing to actually choose between, so asking
  // is just an extra tap. Multi-product loads still go through the picker
  // as before (the whole reason it exists -- never assume every product
  // was affected).
  function selectReportType(type: OutageReportType) {
    // Long Line / Terminal Issue are terminal-wide: no product to pick.
    if (isTerminalWide(type)) {
      setReportType(type);
      setSelectedProductIds(new Set());
      submitReportFor(type, []);
      return;
    }
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
    width: "100%", padding: "14px 16px", borderRadius: 2,
    border: CARD_BORDER, boxShadow: CARD_SHADOW,
    background: themeFill(darkMode, accentColor, "#fff"),
    color: themeTextOnFill(darkMode),
    fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
  };

  return (
    <div
      onClick={dismissAll}
      style={{ position: "fixed", inset: 0, zIndex: 10400, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: SURFACE,
          borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.1)",
          padding: "18px 16px calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        {mode === "menu" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              What do you want to do?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              Logging or updating your card keeps today's terminal access. Going back to the planner undoes it.
            </div>
            <button type="button" style={primaryRowStyle} onClick={onLogTheLoad}>Finish Loading</button>
            <button type="button" style={secondaryRowStyle} onClick={onUpdateCardOnly}>Update Card, No Load</button>
            <button type="button" style={secondaryRowStyle} onClick={() => setMode("reportType")}>Report Terminal Issue</button>
            <button type="button" style={cancelStyle} onClick={onBackToPlanner}>Didn&apos;t Load / Cancel</button>
          </>
        )}

        {mode === "reportType" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              What's the issue?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              This posts a heads-up banner for other drivers heading to this terminal.
            </div>
            {TERMINAL_ISSUES.map((t) => (
              <button
                key={t.code}
                type="button" style={{ ...secondaryRowStyle, opacity: submitBusy ? 0.55 : 1 }}
                disabled={submitBusy}
                onClick={() => selectReportType(t.code)}
              >
                {submitBusy && reportType === t.code ? "Submitting…" : t.label}
              </button>
            ))}
            {submitError && reportType && isTerminalWide(reportType) && (
              <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{submitError}</div>
            )}
            <button type="button" style={cancelStyle} onClick={() => (initialMode === "reportType" ? dismissAll() : setMode("menu"))} disabled={submitBusy}>Back</button>
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
                        width: "100%", padding: "12px 14px", borderRadius: 2, cursor: "pointer",
                        border: checked ? "1px solid rgba(255,255,255,0.35)" : CARD_BORDER,
                        background: CARD_BG, boxShadow: CARD_SHADOW,
                        color: "rgba(255,255,255,0.90)", fontSize: 14, fontWeight: 600, textAlign: "left" as const,
                      }}
                    >
                      <span>{p.name}</span>
                      <span style={{
                        width: 18, height: 18, borderRadius: 2, flexShrink: 0,
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
                width: "100%", padding: "14px 16px", borderRadius: 2, marginBottom: 8,
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

        {mode === "cardRenewal" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              Did your card renew?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              Some terminals renew your access the moment you card in. Others only renew it once you print a BOL -- which you won't have.
            </div>
            <button type="button" style={secondaryRowStyle} onClick={onUpdateCardOnly}>Yes, It Renewed</button>
            <button type="button" style={secondaryRowStyle} onClick={onBackToPlanner}>No, This Terminal Requires a BOL</button>
          </>
        )}
      </div>
    </div>
  );
}
