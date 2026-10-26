"use client";
// app/planner/modals/decouple/ScenarioCard.tsx
//
// Part of DecoupleModal.tsx.




export function ScenarioCard({ emoji, title, sub, onClick }: {
  emoji: string; title: string; sub: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "12px 14px", borderRadius: 2, cursor: "pointer",
      textAlign: "left" as const, border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.05)", transition: "all 120ms ease", width: "100%",
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}><span>{emoji}</span><span>{title}</span></div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>{sub}</div>
    </button>
  );
}
