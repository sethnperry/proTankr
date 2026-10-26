"use client";
// app/planner/components/PartialEquipmentPanel.tsx
//
// Shown instead of the plan when the driver holds only a truck (bobtail) or only
// a trailer. Neither can load: there is no tare without both, so the plan,
// compartments and LOAD button are hidden until the missing unit is picked.

type Props = {
  isBobtail: boolean;
  truckName: string | null;
  trailerName: string | null;
  onSelect: () => void;
};

export function PartialEquipmentPanel({ isBobtail, truckName, trailerName, onSelect }: Props) {
  const held = isBobtail ? (truckName ? `Truck ${truckName}` : "Truck") : trailerName ? `Trailer ${trailerName}` : "Trailer";
  const missing = isBobtail ? "trailer" : "truck";
  return (
    <div style={{ marginTop: 24, textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        Currently holding
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 4 }}>{held}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 8, lineHeight: 1.5, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
        No {missing} coupled — add one to plan a load.
      </div>
      <button
        type="button"
        onClick={onSelect}
        style={{ marginTop: 18, background: "#ffffff", color: "#000000", border: "none", borderRadius: 2, padding: "12px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
      >
        Select a {missing}
      </button>
    </div>
  );
}
