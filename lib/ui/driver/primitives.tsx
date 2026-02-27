// lib/ui/driver/primitives.tsx
"use client";

import { T, css } from "./tokens";

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}
      onClick={onClose}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius + 4, padding: "22px 20px", width: "100%", maxWidth: wide ? 680 : 480, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
          <button onClick={onClose} style={{ ...css.btn("ghost"), padding: "4px 10px", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div style={{ marginBottom: 12, width: half ? "calc(50% - 5px)" : "100%" }}>
      <label style={css.label}>{label}</label>
      {children}
    </div>
  );
}

export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const }}>{children}</div>;
}

export function Banner({ msg, type }: { msg: string; type: "error" | "success" }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: T.radiusSm, background: type === "error" ? `${T.danger}18` : `${T.success}18`, border: `1px solid ${type === "error" ? T.danger : T.success}44`, color: type === "error" ? T.danger : T.success, fontSize: 13, marginBottom: 14 }}>
      {msg}
    </div>
  );
}

export function SubSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const, color: T.muted, marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  );
}

export function ComplianceCard({ title, color, children, empty }: {
  title: string; color: string; children?: React.ReactNode; empty?: string;
}) {
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 14px", marginBottom: 8, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as const, color, marginBottom: 8 }}>{title}</div>
      {children ?? <div style={{ fontSize: 12, color: T.muted }}>{empty ?? "Not on file"}</div>}
    </div>
  );
}

export function DataRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5, fontSize: 13 }}>
      <span style={{ color: T.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ color: highlight ?? T.text, fontWeight: highlight ? 600 : 400, textAlign: "right" as const }}>{value ?? "—"}</span>
    </div>
  );
}
