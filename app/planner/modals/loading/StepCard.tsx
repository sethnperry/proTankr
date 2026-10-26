"use client";
// app/planner/modals/loading/StepCard.tsx
//
// One full-card step window, same look as ValueEntryOverlay.

import React from "react";

// One full-card step window, same look as ValueEntryOverlay.
export function StepCard({
  title,
  children,
  onBack,
  backLabel,
  onNext,
  nextLabel,
  error,
  secondary,
}: {
  title: string;
  children: React.ReactNode;
  onBack: () => void;
  backLabel: string;
  onNext: () => void;
  nextLabel: string;
  error?: string | null;
  // A quiet extra action under the buttons (Finish Later).
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 16,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          maxHeight: "calc(100dvh - 48px)",
          overflowY: "auto" as const,
          boxSizing: "border-box" as const,
          background: "#161616",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 2,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "rgba(255,255,255,0.45)",
            letterSpacing: 0.4,
            textTransform: "uppercase" as const,
            textAlign: "center" as const,
          }}
        >
          {title}
        </div>
        {children}
        {error && <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", textAlign: "center" as const }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              color: "rgba(255,255,255,0.65)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {backLabel}
          </button>
          <button
            type="button"
            onClick={onNext}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 2,
              border: "none",
              background: "#fff",
              color: "#000",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {nextLabel}
          </button>
        </div>
        {secondary && (
          <button
            type="button"
            onClick={secondary.onClick}
            style={{
              background: "none",
              border: "none",
              color: "#93c5fd",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              padding: "4px 0",
            }}
          >
            {secondary.label}
          </button>
        )}
      </div>
    </div>
  );
}
