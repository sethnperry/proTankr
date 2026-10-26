"use client";
// app/planner/modals/loading/SplitLoadOverlay.tsx
//
// Split Load: which BOL each of a product's compartments came on.

import { StepCard } from "./StepCard";
import type { LoadingModel } from "./useLoadingModel";

export function SplitLoadOverlay({ m }: { m: LoadingModel }) {
  const { finishSplit, orderedCompLines, productNameById, setSplitDraft, setSplitProductId, splitDraft, splitProductId } = m;
  return (
    <>
      {/* Split Load: which BOL each of this product's compartments came on. */}
      {splitProductId != null &&
        (() => {
          const comps = orderedCompLines.filter((l) => l.productId === splitProductId);
          const used = Math.max(1, ...comps.map((l) => splitDraft[l.comp] ?? 1));
          const choices = Math.min(comps.length, used + 1);
          return (
            <StepCard
              title={`Split · ${productNameById.get(splitProductId) ?? splitProductId}`}
              onBack={() => setSplitProductId(null)}
              backLabel="Cancel"
              onNext={finishSplit}
              nextLabel="Done"
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center" as const }}>
                Group the compartments by BOL. Each BOL gets its own window.
              </div>
              {comps.map((l) => (
                <div key={l.comp} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, width: 32 }}>C{l.comp}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: "1 1 auto" }}>
                    {Math.round(l.gallons).toLocaleString()} gal
                  </span>
                  {Array.from({ length: choices }, (_, i) => i + 1).map((n) => {
                    const on = (splitDraft[l.comp] ?? 1) === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSplitDraft((d) => ({ ...d, [l.comp]: n }))}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 2,
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 700,
                          border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                          background: on ? "#fff" : "transparent",
                          color: on ? "#000" : "rgba(255,255,255,0.7)",
                        }}
                      >
                        BOL {n}
                      </button>
                    );
                  })}
                </div>
              ))}
            </StepCard>
          );
        })()}
    </>
  );
}
