"use client";
// app/planner/modals/serviceTypes/UnitServiceFields.tsx
//
// Part of ServiceTypeManager.tsx.


import type { ServiceType } from "./types";
import { fieldLabel, inputStyle } from "./helpers";
import { ServiceTypeSelect } from "./ServiceTypeSelect";

export function UnitServiceFields({
  unitLabel, types, typeId, onTypeIdChange, reading, onReadingChange, showReading, onEditType, onNewType,
}: {
  unitLabel: string;
  types: ServiceType[];
  typeId: string;
  onTypeIdChange: (v: string) => void;
  reading: string;
  onReadingChange: (v: string) => void;
  showReading: boolean;
  onEditType: (t: ServiceType) => void;
  onNewType: () => void;
}) {
  const selectedType = types.find((t) => t.service_type_id === typeId);
  const effectiveKind = selectedType?.interval_kind;
  const needsReading = showReading && (effectiveKind === "miles" || effectiveKind === "hours");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {unitLabel}
      </div>
      <div>
        <label style={fieldLabel}>Type</label>
        <ServiceTypeSelect
          value={typeId}
          onChange={onTypeIdChange}
          types={types}
          onEditType={onEditType}
          onNewType={onNewType}
        />
      </div>
      {selectedType && selectedType.interval_kind !== "none" && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          Interval: every {selectedType.interval_value} {selectedType.interval_kind}
        </div>
      )}
      {needsReading && (
        <div>
          <label style={fieldLabel}>{effectiveKind === "miles" ? "Odometer (miles) *" : "Engine hours *"}</label>
          <input type="number" value={reading} onChange={(e) => onReadingChange(e.target.value)} style={inputStyle} />
        </div>
      )}
    </div>
  );
}
