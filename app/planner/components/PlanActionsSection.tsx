"use client";
// app/planner/components/PlanActionsSection.tsx
//
// Under the trailer on the Plan page: the live plan summary (gallons and gross
// weight) and the buttons: the plan picker, New Plan / Save Plan, and Close.

import PlanSummaryCard from "./PlanSummaryCard";

const LEGAL_GROSS_LBS = 80000;

const buttonBase = {
  borderRadius: 2,
  padding: "12px 14px",
  width: "100%",
} as const;

const quietBtn = {
  ...buttonBase,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.04)",
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: 0.3,
} as const;

type Props = {
  isLandscape: boolean;
  maxWidth: number;
  /** Planned gallons for the live plan, or null when there is no plan yet. */
  plannedGallons: number | null;
  grossLbs: number | null;
  targetWeight: number;
  showRefApiWarning: boolean;
  planLetter: string;
  planPickerDisabled: boolean;
  onOpenPlans: () => void;
  isDirty: boolean;
  onNewOrSave: () => void;
  closing: boolean;
  onClose: () => void;
};

export default function PlanActionsSection(p: Props) {
  const gallonsText = p.plannedGallons == null ? "—" : `${Math.round(p.plannedGallons).toLocaleString()} gal`;
  const grossText = p.grossLbs == null ? "—" : `${Math.round(p.grossLbs).toLocaleString()} lbs`;
  // Gross is colored against this trailer's target and the 80,000 lb legal limit.
  const grossColor =
    p.grossLbs == null || !(p.targetWeight > 0)
      ? "#fff"
      : p.grossLbs >= LEGAL_GROSS_LBS
        ? "#ef4444"
        : p.grossLbs >= p.targetWeight
          ? "#4ade80"
          : "#fff";

  return (
    <div
      style={
        p.isLandscape
          ? { maxWidth: p.maxWidth, margin: "0 auto", marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }
          : { marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }
      }
    >
      <PlanSummaryCard gallonsText={gallonsText} grossText={grossText} grossColor={grossColor} showRefApiWarning={p.showRefApiWarning} />
      <button
        type="button"
        disabled={p.planPickerDisabled}
        onClick={p.onOpenPlans}
        style={{
          ...quietBtn,
          color: "#fff",
          cursor: p.planPickerDisabled ? "not-allowed" : "pointer",
          opacity: p.planPickerDisabled ? 0.4 : 1,
        }}
      >
        Plan {p.planLetter} ▾
      </button>
      <button
        type="button"
        onClick={p.onNewOrSave}
        style={{
          ...buttonBase,
          border: "none",
          background: "#ffffff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: "#000000", letterSpacing: 0.3 }}>
          {p.isDirty ? "Save Plan" : "New Plan"}
        </span>
      </button>
      <button
        type="button"
        aria-busy={p.closing}
        onClick={p.onClose}
        style={{ ...quietBtn, cursor: "pointer", color: "rgba(255,255,255,0.85)" }}
      >
        Close
      </button>
    </div>
  );
}
