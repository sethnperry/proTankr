"use client";
// app/planner/modals/recordHistory/HistoryHeader.tsx
//
// Title row, search, range chips and the report menu.


import { DATE_RANGES } from "./helpers";
import type { RecordHistoryModel } from "./useRecordHistory";

export function HistoryHeader({ m }: { m: RecordHistoryModel }) {
  const { onClose, kind, title, search, setSearch, activeDays, setActiveDays, copied, reportMenuOpen, setReportMenuOpen, loading, searchRef, reportRef, totalCount, hasAny, handleCopy, handleSMS, handleEmail } = m;
  return (
    <>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 10px", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.92)", letterSpacing: 0.2 }}>{title}</div>
            {!loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>{totalCount}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: "0 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, padding: "9px 14px" }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={kind === "service" ? "Search type, shop, or location…" : "Search unit or location…"}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: 500 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 17, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 18px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, overflowX: "auto" }}>
            {DATE_RANGES.map(({ label, days }) => {
              const active = activeDays === days;
              return (
                <button
                  key={label}
                  onClick={() => setActiveDays(days)}
                  title={days === null ? "All dates, all equipment" : undefined}
                  style={{
                    padding: "5px 10px", borderRadius: 2, border: "1px solid", fontSize: 11, fontWeight: 800,
                    cursor: "pointer", letterSpacing: 0.3, transition: "all 120ms ease", flexShrink: 0,
                    background: active ? "rgba(255,255,255,0.10)" : "transparent",
                    borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                    color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div ref={reportRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              disabled={!hasAny}
              onClick={() => setReportMenuOpen((o) => !o)}
              style={{
                padding: "7px 12px", borderRadius: 2, fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
                cursor: hasAny ? "pointer" : "default",
                border: hasAny ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.08)",
                background: hasAny ? "rgba(255,255,255,0.07)" : "transparent",
                color: hasAny ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.18)",
              }}
            >
              {copied ? "✓ Copied" : "Report ▾"}
            </button>
            {reportMenuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 60, minWidth: 140,
                background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 2,
                boxShadow: "0 8px 24px rgba(0,0,0,0.55)", padding: 4,
              }}>
                {[{ label: "Copy", fn: handleCopy }, { label: "Text", fn: handleSMS }, { label: "Email", fn: handleEmail }].map((o) => (
                  <div
                    key={o.label}
                    onClick={o.fn}
                    style={{ padding: "10px 14px", fontSize: 14, color: "#fff", cursor: "pointer", borderRadius: 2 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {o.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

    </>
  );
}
