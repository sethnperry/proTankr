"use client";
// app/planner/components/TerminalOutageBanner.tsx
//
// One thin, tappable row for active outage reports at whichever terminal
// is currently selected. Presentational -- CalculatorLayoutClient.tsx's
// Header fetches the data (useActiveOutageBanner) itself and passes it in
// as props, so Header can also collapse the tab bar's own spacing when
// this banner actually has something to show (see TabBar's `compact`
// prop there).
//
// 2026-08-31: Out of Product and Out of Allocation used to be two
// side-by-side halves, each its own MessageTicker with its own trailing
// chevron. Per explicit direction ("these are two distinct issues
// separated in the middle. Can we make this read like one continuous
// line. Only one arrow") they're now pre-joined into a single string by
// the hook (`tickerMessage`, e.g. "Out of Premium 93   ---   OOA Regular
// 87") and rendered as one continuous scrolling line with one chevron.
// Also now filtered to the driver's own currently-planned products
// (`useActiveOutageBanner`'s own `plannedProductIds` argument) -- an
// irrelevant report for a product they're not loading never reaches here
// at all, so this component itself needed no filtering logic of its own.
//
// The actual scroll behavior (constant speed, pause at the message's
// arrival) lives in MessageTicker.tsx -- see that file's own header
// comment for why it's a requestAnimationFrame loop rather than a CSS
// @keyframes animation.

import React, { useState } from "react";
import TerminalOutageDetailModal from "../modals/TerminalOutageDetailModal";
import MessageTicker from "./MessageTicker";
import type { ComposedOutageReport } from "../hooks/useTerminalOutageReports";

const TICKER_COLOR = "#ffffff";

export default function TerminalOutageBanner({
  tickerMessage, reports, timeZone, refresh,
}: {
  tickerMessage: string | null;
  reports: ComposedOutageReport[];
  timeZone: string;
  refresh: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  if (!tickerMessage) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", height: 26, padding: "0 14px",
          background: "transparent", border: "none", cursor: "pointer",
        }}
      >
        <MessageTicker messages={[tickerMessage]} color={TICKER_COLOR} />
        <span style={{ fontSize: 16, color: TICKER_COLOR, flexShrink: 0, lineHeight: 1 }}>›</span>
      </button>

      <TerminalOutageDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        reports={reports}
        timeZone={timeZone}
        onCleared={refresh}
      />
    </>
  );
}
