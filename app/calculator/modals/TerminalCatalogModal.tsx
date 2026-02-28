"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type TerminalCatalogRow = any; // keep loose typing for now

export default function TerminalCatalogModal(props: {
  open: boolean;
  onClose: () => void;

  selectedState: string;
  selectedCity: string;

  termError: string | null;
  catalogError: string | null;

  catalogTerminalsInCity: TerminalCatalogRow[];

  myTerminalIds: Set<string>;
  setMyTerminalIds: React.Dispatch<React.SetStateAction<Set<string>>>;

  catalogExpandedId: string | null;
  setCatalogExpandedId: (id: string | null) => void;

  catalogEditingDateId: string | null;
  setCatalogEditingDateId: (id: string | null) => void;

  accessDateByTerminalId: Record<string, string | undefined>;
  setAccessDateForTerminal_: (terminalId: string, isoDate: string) => void;

  // ✅ CHANGED: allow timezone
  isoToday_: (timezone?: string | null) => string;

  toggleTerminalStar: (terminalId: string, currentlyStarred: boolean) => void;
  starBtnClass: (starred: boolean) => string;

  addDaysISO_: (iso: string, days: number) => string;
  isPastISO_: (iso: string) => boolean;
  formatMDYWithCountdown_: (iso: string) => string;

  // preserve existing modal flow behavior
  setCatalogOpen: (open: boolean) => void;
  setTermOpen: (open: boolean) => void;
}) {
  const {
    open,
    onClose,

    selectedState,
    selectedCity,

    termError,
    catalogError,

    catalogTerminalsInCity,

    myTerminalIds,
    setMyTerminalIds,

    catalogExpandedId,
    setCatalogExpandedId,

    catalogEditingDateId,
    setCatalogEditingDateId,

    accessDateByTerminalId,
    setAccessDateForTerminal_,

    isoToday_,

    toggleTerminalStar,
    starBtnClass,

    addDaysISO_,
    isPastISO_,
    formatMDYWithCountdown_,

    setCatalogOpen,
    setTermOpen,
  } = props;

  // ✅ Normalize DB timezone values like "America_NewYork" → "America/New_York"
  const normalizeTz = (tzRaw: unknown): string | null => {
    const s = String(tzRaw ?? "").trim();
    if (!s) return null;

    // handle your stored format: Region_City or Region_City_Subcity...
    if (s.includes("_") && !s.includes("/")) {
      const parts = s.split("_").filter(Boolean);
      if (parts.length >= 2) {
        const region = parts[0];
        const city = parts.slice(1).join("_"); // keep underscores inside city (e.g., Indiana/Indianapolis)
        return `${region}/${city}`;
      }
    }

    // already IANA-ish
    return s;
  };

  return (
    <FullscreenModal
      open={open}
      title="Get Carded"
      onClose={() => {
        // preserve existing behavior
        setCatalogOpen(false);
        setTermOpen(true);
      }}
    >
      {!selectedState || !selectedCity ? (
        <div className="text-sm text-white/60">Select a city first.</div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-white/70">
            Terminal catalog for{" "}
            <span className="text-white">
              {selectedCity}, {selectedState}
            </span>
          </div>

          {termError ? <div className="text-sm text-red-400">{termError}</div> : null}
          {catalogError ? <div className="text-sm text-red-400">{catalogError}</div> : null}

          {catalogTerminalsInCity.length === 0 ? (
            <div className="text-sm text-white/60">No terminals found for this city.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {catalogTerminalsInCity.map((t, idx) => {
                const id = String(t.terminal_id);
                const isInMy = myTerminalIds.has(id);

                const isExpanded = catalogExpandedId === id;

                // ✅ terminal timezone (normalized)
                const tz = normalizeTz((t as any).timezone);

                return (
                  <div
                    key={t.terminal_id ? id : `cat-${idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setCatalogExpandedId(isExpanded ? null : id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setCatalogExpandedId(isExpanded ? null : id);
                      }
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer select-none overflow-hidden"
                  >
                    <div className="flex items-center gap-0">
                      <div
                        className="shrink-0 h-16 w-14 flex items-center justify-center text-xs font-semibold bg-[#1e1e1e] text-white/40"
                        style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}
                        aria-hidden="true"
                      >
                        Img
                      </div>

                      <div className="min-w-0 flex-1 px-3 py-2">
                        <div className="text-sm font-semibold text-white truncate">
                          {t.terminal_name ?? "(unnamed terminal)"}
                        </div>

                        {(() => {
                          const tid = String(t.terminal_id);
                          const activationISO = accessDateByTerminalId[tid] ?? "";
                          const renewalDays = Number((t as any).renewal_days ?? 90);
                          const expiresISO = activationISO ? addDaysISO_(activationISO, renewalDays) : "";
                          const expiresExpired = expiresISO ? isPastISO_(expiresISO) : false;
                          const expiresLabel = expiresISO ? formatMDYWithCountdown_(expiresISO) : "Set Activation Date";

                          const isEditing = catalogEditingDateId === tid;

                          return (
                            <div className="mt-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCatalogEditingDateId(isEditing ? null : tid);
                                }}
                                className={[
                                  "text-xs tabular-nums underline-offset-2 hover:underline",
                                  expiresISO ? (expiresExpired ? "text-red-400" : "text-white/50") : "text-white/60",
                                ].join(" ")}
                                title="Set activation date"
                              >
                                {expiresLabel}
                              </button>

                              {isEditing ? (
                                <div
                                  className="mt-1 rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-white/70"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-white/80 font-semibold">Set Activation Date</div>
                                  <div className="mt-2 flex items-center gap-2">
                                    <input
                                      type="date"
                                      value={activationISO}
                                      onChange={(e) => setAccessDateForTerminal_(tid, e.target.value)}
                                      className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                                    />
                                    <button
                                      type="button"
                                      // ✅ FIX: use terminal timezone
                                      onClick={() => setAccessDateForTerminal_(tid, isoToday_(tz))}
                                      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                                    >
                                      Today
                                    </button>
                                  </div>

                                  <div className="mt-2 text-white/60">
                                    Expires: {expiresISO ? formatMDYWithCountdown_(expiresISO) : "—"}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>

                      {/* bare star pinned top-right */}
                      <div className="flex items-start pt-2 pr-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTerminalStar(id, isInMy);
                            const next = !isInMy;
                            setMyTerminalIds((prev) => {
                              const s = new Set(prev);
                              if (next) s.add(id);
                              else s.delete(id);
                              return s;
                            });
                            if (!isInMy && !accessDateByTerminalId[id]) {
                              setAccessDateForTerminal_(id, isoToday_(tz));
                            }
                          }}
                          style={{ background: "none", border: "none", padding: "2px", cursor: "pointer",
                            color: isInMy ? "rgba(234,179,8,0.95)" : "rgba(255,255,255,0.25)",
                            fontSize: 17, lineHeight: 1 }}
                          aria-label={isInMy ? "Remove from My Terminals" : "Add to My Terminals"}
                        >
                          {isInMy ? "★" : "☆"}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-0 mx-3 mb-2 rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-white/70">
                        <div className="text-white/80 font-semibold">Terminal details</div>
                        <div className="mt-1">Business-card placeholder.</div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </FullscreenModal>
  );
}
