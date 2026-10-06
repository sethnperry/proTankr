"use client";
// app/planner/components/SetupChecklist.tsx
//
// Stripe-style setup checklist for the Planner -- purely presentational,
// same split as FleetUtilizationView.tsx: all the real logic (what counts
// as "done") lives in utils/setupChecklist.ts as plain derivation, this
// just renders whatever step list it's handed. No save button of its own
// -- every step is completed through the Planner's own existing controls
// (tap a compartment, Edit Comp Product, Save plan {letter}); this is a
// progress overlay on top of those, not a second way to do the same thing.

import { useState } from "react";
import type { ChecklistStep } from "../utils/setupChecklist";

const CHECK_COLOR = "#4ade80";

function CheckCircle({ done, size }: { done: boolean; size: number }) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        border: done ? "none" : "1px solid rgba(255,255,255,0.3)",
        background: done ? CHECK_COLOR : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {done && <span style={{ fontSize: size === 18 ? 11 : 9, fontWeight: 900, color: "#000", lineHeight: 1 }}>✓</span>}
    </div>
  );
}

export default function SetupChecklist({ steps }: { steps: ChecklistStep[] }) {
  const [collapsed, setCollapsed] = useState(false);
  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <div
      style={{
        marginBottom: 14,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
          {allDone ? "✓ Setup guide complete" : "Setup guide"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
            {doneCount} of {steps.length}
          </div>
          <span
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.45)",
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              display: "inline-block",
              transition: "transform 150ms ease",
            }}
          >
            ▾
          </span>
        </div>
      </button>

      {!collapsed && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((step) => (
            <div key={step.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ marginTop: 1 }}>
                <CheckCircle done={step.done} size={18} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: step.done ? "rgba(255,255,255,0.55)" : "#fff",
                    textDecoration: step.done ? "line-through" : "none",
                  }}
                >
                  {step.title}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, lineHeight: 1.45 }}>
                  {step.caption}
                </div>
                {step.subItems && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {step.subItems.map((sub) => (
                      <div key={sub.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <CheckCircle done={sub.done} size={14} />
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: sub.done ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.8)",
                            textDecoration: sub.done ? "line-through" : "none",
                          }}
                        >
                          {sub.title}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
