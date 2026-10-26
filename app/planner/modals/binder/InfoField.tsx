"use client";
// app/planner/modals/binder/InfoField.tsx
//
// Part of the Binder (equipment file) dialog.

export function InfoField({ label, value, full, truncate }: { label: string; value: string; full?: boolean; truncate?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined, minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "rgba(255,255,255,0.35)",
          marginBottom: 2,
          textTransform: "uppercase" as const,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.85)",
          ...(truncate ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const } : {}),
        }}
      >
        {value}
      </div>
    </div>
  );
}
