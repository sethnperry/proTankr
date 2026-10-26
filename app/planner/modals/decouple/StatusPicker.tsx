"use client";
// app/planner/modals/decouple/StatusPicker.tsx
//
// Part of DecoupleModal.tsx.




export function StatusPicker<T extends string>({ options, value, onChange }: {
  options: { code: T; label: string; sub: string; warn?: boolean }[];
  value: T; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 7 }}>
      {options.map((o) => {
        const sel = value === o.code;
        return (
          <button key={o.code} type="button" onClick={() => onChange(o.code)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
            borderRadius: 2, cursor: "pointer", textAlign: "left" as const,
            border: sel ? (o.warn ? "1px solid rgba(220,80,40,0.55)" : "1px solid rgba(64,180,255,0.45)") : "1px solid rgba(255,255,255,0.10)",
            background: sel ? (o.warn ? "rgba(180,50,20,0.20)" : "rgba(32,100,200,0.18)") : "rgba(255,255,255,0.04)",
            transition: "all 120ms ease",
          }}>
            <div style={{
              flexShrink: 0, width: 60, textAlign: "center" as const,
              fontSize: 10, fontWeight: 900, letterSpacing: 1, padding: "3px 0", borderRadius: 2,
              background: sel ? (o.warn ? "rgba(220,80,40,0.25)" : "rgba(64,180,255,0.18)") : "rgba(255,255,255,0.08)",
              color: sel ? (o.warn ? "#fb923c" : "#67e8f9") : "rgba(255,255,255,0.50)",
            }}>{o.code}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: o.warn && sel ? "#fb923c" : "rgba(255,255,255,0.88)" }}>{o.label}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>{o.sub}</div>
            </div>
            {sel && <div style={{ flexShrink: 0, fontSize: 14, color: o.warn ? "#fb923c" : "#67e8f9" }}>✓</div>}
          </button>
        );
      })}
    </div>
  );
}
