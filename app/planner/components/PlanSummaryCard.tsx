"use client";
// app/planner/components/PlanSummaryCard.tsx
//
// The live summary of whatever is in the compartments right now: the target weight and planned gross weight (colored against target and the legal
// limit). Plain status text, nothing to tap.

export default function PlanSummaryCard({ grossText, grossColor, showRefApiWarning }: {
  grossText: string;
  grossColor: string;
  showRefApiWarning: boolean;
}) {
  return (
    <div style={{ borderRadius: 2, background: "transparent", padding: "10px 14px", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.4 }}>Target</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: grossColor, textAlign: "right" as const }}>{grossText}</div>
      </div>
      {showRefApiWarning && (
        <div style={{ fontSize: 10, fontWeight: 700, color: "#fb923c", marginTop: 4 }}>⚠ using ref API</div>
      )}
    </div>
  );
}
