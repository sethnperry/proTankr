"use client";
// app/planner/components/dash/DashColumns.tsx
//
// The shape every dashboard shares (the Driver Dashboard set it): two rows of four chips on top, the first over the left
// column, the second over the right. Left holds the actions and tools, right holds the details and data. On a phone held
// upright it is one column in the order: first chips, second chips, left, right. Wrap the page in className="dash-wrap d2".
// A row with fewer than four cells is padded with empty chips so the shape never changes.

import React from "react";
import { GaugePanel, type GaugeCell } from "@/app/planner/home/DashboardChrome";

const EMPTY: GaugeCell = { label: "—", value: "—", color: "rgba(255,255,255,0.18)" };
const four = (cells: GaugeCell[]): GaugeCell[] => [...cells, ...Array.from({ length: Math.max(0, 4 - cells.length) }, () => EMPTY)].slice(0, 4);

export function DashColumns({ a, b, left, right }: { a: GaugeCell[]; b: GaugeCell[]; left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="d2-cols">
      <div className="d2-left">
        <div className="d2-o0"><div style={{ marginBottom: 14 }}><GaugePanel square top={0} cells={four(a)} /></div></div>
        <div className="d2-o2">{left}</div>
      </div>
      <div className="d2-right">
        <div className="d2-o1"><div style={{ marginBottom: 14 }}><GaugePanel square top={0} labelBelow cells={four(b)} /></div></div>
        <div className="d2-o3">{right}</div>
      </div>
    </div>
  );
}
