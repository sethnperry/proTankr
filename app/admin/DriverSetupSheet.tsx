"use client";
// app/admin/DriverSetupSheet.tsx — one driver's setup progress: the counter and every step with its status.

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { counterText } from "@/lib/setup/driverSetup";
import { adminDetail, type FleetRow } from "@/lib/setup/fleetSetup";

const MARK: Record<string, string> = { needs: "#f87171", confirm: "#fbbf24", open: "rgba(255,255,255,0.3)", done: "#4ade80" };
const TEXT: Record<string, string> = { needs: "#f87171", confirm: "#fbbf24", open: "rgba(255,255,255,0.55)", done: "rgba(255,255,255,0.55)" };

export function DriverSetupSheet({ row, onClose }: { row: FleetRow | null; onClose: () => void }) {
  const s = row?.summary;
  return (
    <FullscreenModal open={!!row} title={row ? `${row.name} · Setup` : ""} onClose={onClose} footer={null}>
      {s && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 800 }}>{counterText(s)}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>complete</span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.12)", marginBottom: 14 }}>
            <div style={{ height: "100%", width: `${s.total ? (s.done / s.total) * 100 : 0}%`, background: s.requiredLeft ? "#fbbf24" : "#4ade80" }} />
          </div>
          {s.requiredLeft > 0 && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 12 }}>{s.requiredLeft} required {s.requiredLeft === 1 ? "step" : "steps"} not done.</div>}
          {s.steps.filter((x) => x.status !== "na").map((x) => (
            <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 6, background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)" }}>
              <span aria-hidden style={{ width: 10, height: 10, background: MARK[x.status], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{x.label}{x.required && x.status !== "done" ? <span style={{ fontSize: 10, color: "#f87171", marginLeft: 8, letterSpacing: "0.1em" }}>REQUIRED</span> : null}</div>
                <div style={{ fontSize: 12, color: TEXT[x.status], marginTop: 2 }}>{adminDetail(x.status, x.detail)}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </FullscreenModal>
  );
}
