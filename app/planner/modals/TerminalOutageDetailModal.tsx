"use client";
// app/planner/modals/TerminalOutageDetailModal.tsx
//
// Opened by tapping either of TerminalOutageBanner.tsx's two rows -- one
// row per active Out of Product / Out of Allocation report at the current
// terminal (already deduped to the most recent per product, see
// useTerminalOutageReports.ts), each with its own expiry time and (only
// for the report the current effectiveUserId actually posted) a "Clear
// Now" button to remove it early instead of waiting for the next
// 6am/12pm/6pm/12am checkpoint. Split into two labeled sections, matching
// the banner's own two-row split. See CLAUDE.md "Terminal outage banners"
// for the full design.
//
// 2026-08-28: cards restyled from a red-tinted treatment to the app's own
// graphite theme (cardTheme.ts's CARD_BG/CARD_BORDER/CARD_SHADOW, same as
// every other card in the app) per explicit follow-up ("the cards should
// match our app theme instead of that red hue"). Each card is now 3 rows:
// "{company or driver} Truck {unit}", then "Terminal Out of {product}" /
// "OOA {product}" colored per productColorFor() (diesel=yellow,
// premium=red, else white), then "Marked out at {hhmm} hrs, clears at
// {hhmm} hrs" with Clear Now on the same row where it fits.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { clearOutageReport, type ComposedOutageReport } from "../hooks/useTerminalOutageReports";
import { hhmmInTimeZone, outageAge } from "../utils/dates";
import { productColorFor } from "../utils/productColor";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

function ReportRow({ report, timeZone, onClear, clearing }: {
  report: ComposedOutageReport;
  timeZone: string;
  onClear: (reportId: string) => void;
  clearing: boolean;
}) {
  // Out of Product is visible cross-company (any driver at any company
  // heading to this terminal), so the truck number -- otherwise public --
  // is dropped here per explicit direction; company name alone. Out of
  // Allocation stays same-company-only (RLS-scoped), where the truck
  // number is useful context, not exposure.
  const topLine = report.reportType !== "out_of_allocation"
    ? report.personLabel
    : `${report.personLabel} Truck ${report.truckLabel}`;
  const productLine = report.reportType === "out_of_product"
    ? `Terminal Out of ${report.productName}`
    : report.reportType === "out_of_allocation"
      ? (report.supplierName ? `No Allocation - ${report.supplierName} (${report.productName})` : `OOA ${report.productName}`)
      : report.productName;
  const productColor = productColorFor(report.productName);
  const markedHhmm = hhmmInTimeZone(report.createdAtMs, timeZone);

  return (
    <div
      style={{
        padding: "12px 14px", borderRadius: 2,
        background: CARD_BG, border: CARD_BORDER, boxShadow: CARD_SHADOW,
        display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.90)" }}>{topLine}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: productColor }}>{productLine}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
          <span style={{ color: "#fff", fontWeight: 800 }}>{outageAge(report.createdAtMs, Date.now())}</span> since {markedHhmm} hrs
          {report.reportType === "out_of_allocation" ? ` · resets at midnight`
            : report.reportType === "long_line" ? ` · clears an hour after the last load or rack hop`
            : " · stays until cleared"}
          {report.reportType === "long_line" && report.avgWaitMin != null && <> · <span style={{ color: "#fff", fontWeight: 800 }}>avg wait {report.avgWaitMin} min</span></>}
        </div>
        {report.canClear && (
          <button aria-busy={!!(clearing)}
            type="button"
            onClick={() => onClear(report.reportId)}
            disabled={clearing}
            style={{
              flexShrink: 0,
              padding: "6px 12px", borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 700, cursor: "pointer",
              opacity: clearing ? 0.6 : 1,
            }}
          >
            {clearing ? "Clearing…" : "Clear Now"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TerminalOutageDetailModal({
  open, onClose, reports, timeZone, onCleared,
}: {
  open: boolean;
  onClose: () => void;
  reports: ComposedOutageReport[];
  timeZone: string;
  onCleared: () => void;
}) {
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClear(reportId: string) {
    setClearingId(reportId);
    setError(null);
    const { error: err } = await clearOutageReport(reportId);
    setClearingId(null);
    if (err) { setError(err); return; }
    onCleared();
  }

  const terminalReports = reports.filter((r) => r.reportType === "long_line" || r.reportType === "terminal_issue");
  const productReports = reports.filter((r) => r.reportType === "out_of_product");
  const allocationReports = reports.filter((r) => r.reportType === "out_of_allocation");

  return (
    <FullscreenModal open={open} title="Terminal Issues" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}

        {reports.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14 }}>No active issues at this terminal.</div>
        ) : (
          <>
            {terminalReports.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                  Terminal
                </div>
                {terminalReports.map((r) => (
                  <ReportRow key={r.reportId} report={r} timeZone={timeZone} onClear={handleClear} clearing={clearingId === r.reportId} />
                ))}
              </div>
            )}
            {productReports.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                  Out of Product
                </div>
                {productReports.map((r) => (
                  <ReportRow key={r.reportId} report={r} timeZone={timeZone} onClear={handleClear} clearing={clearingId === r.reportId} />
                ))}
              </div>
            )}
            {allocationReports.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                  Out of Allocation
                </div>
                {allocationReports.map((r) => (
                  <ReportRow key={r.reportId} report={r} timeZone={timeZone} onClear={handleClear} clearing={clearingId === r.reportId} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </FullscreenModal>
  );
}
