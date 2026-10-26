"use client";
// app/planner/modals/loading/ReviewHeader.tsx
//
// Equipment and terminal confirmation shown above Plan Review and the load report.

import type { LoadingModel } from "./useLoadingModel";

export function ReviewHeader({ m }: { m: LoadingModel }) {
  const { equipmentLabel, locationLabel, onTapTerminal, rackName, report, terminalLabel } = m;
  return (
    (equipmentLabel || terminalLabel) && (
      <div
        style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 2px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        {equipmentLabel && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "rgba(255,255,255,0.65)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
            }}
          >
            {equipmentLabel}
          </div>
        )}
        {terminalLabel && (
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, overflow: "hidden" }}>
              {onTapTerminal && !report ? (
                <button
                  type="button"
                  onClick={onTapTerminal}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 6,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#fff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {terminalLabel}
                  </span>
                  {locationLabel && (
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#fff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      · {locationLabel}
                    </span>
                  )}
                  <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 700, flexShrink: 0 }}>›</span>
                </button>
              ) : (
                <>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#fff",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {terminalLabel}
                  </span>
                  {locationLabel && (
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#fff",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      · {locationLabel}
                    </span>
                  )}
                </>
              )}
            </div>
            {rackName && (
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.55)",
                  flexShrink: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                }}
              >
                {rackName}
              </span>
            )}
          </div>
        )}
      </div>
    )
  );
}
