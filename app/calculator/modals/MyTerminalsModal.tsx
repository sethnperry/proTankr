"use client";

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type TerminalRow = any; // keep typing loose for now to avoid behavior/shape refactors

export default function MyTerminalsModal(props: {
  open: boolean;
  onClose: () => void;

  selectedState: string;
  selectedCity: string;

  termError: string | null;

  terminalsFiltered: TerminalRow[];
  selectedTerminalId: string;

  expandedTerminalId: string | null;
  setExpandedTerminalId: (id: string | null) => void;

  cardingBusyId: string | null;

  // helper fns from page.tsx
  addDaysISO_: (iso: string, days: number) => string;
  isPastISO_: (iso: string) => boolean;
  formatMDYWithCountdown_: (iso: string) => string;
  starBtnClass: (starred: boolean) => string;

  // membership / selection actions from page.tsx
  myTerminalIds: Set<string>;
  setMyTerminalIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTerminals: React.Dispatch<React.SetStateAction<any[]>>;

  toggleTerminalStar: (terminalId: string, currentlyStarred: boolean) => void;
  doGetCardedForTerminal: (terminalId: string) => void;

  setSelectedTerminalId: (id: string) => void;
  setTermOpen: (open: boolean) => void;

  // open catalog flow
  setCatalogExpandedId: (id: string | null) => void;
  setCatalogOpen: (open: boolean) => void;
}) {
  const {
    open,
    onClose,
    selectedState,
    selectedCity,
    termError,
    terminalsFiltered,
    selectedTerminalId,
    expandedTerminalId,
    setExpandedTerminalId,
    cardingBusyId,
    addDaysISO_,
    isPastISO_,
    formatMDYWithCountdown_,
    starBtnClass,
    myTerminalIds,
    setMyTerminalIds,
    setTerminals,
    toggleTerminalStar,
    doGetCardedForTerminal,
    setSelectedTerminalId,
    setTermOpen,
    setCatalogExpandedId,
    setCatalogOpen,
  } = props;

  return (
    <FullscreenModal open={open} title="My Terminals" onClose={onClose}>
      {!selectedState || !selectedCity ? (
        <div className="text-sm text-white/60">Select a city first.</div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-white/70">
            Showing terminals in{" "}
            <span className="text-white">
              {selectedCity}, {selectedState}
            </span>
          </div>

          {termError ? <div className="text-sm text-red-400">{termError}</div> : null}

          {terminalsFiltered.filter((t) => t.status !== "not_carded").length === 0 ? (
            <div className="text-sm text-white/60">No terminals saved for this city.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {terminalsFiltered
                .filter((t) => t.status !== "not_carded")
                .map((t, idx) => {
                  const active = String(t.terminal_id) === String(selectedTerminalId);

                  const expiresISO = (t as any).expires_on || (t as any).expires || (t as any).expires_at || ""; // fallback
                  const activationISO = (t as any).carded_on || (t as any).added_on || "";

                  const renewalDays =
                    Number((t as any).renewal_days ?? (t as any).renewalDays ?? (t as any).renewal ?? 90) || 90;

                  const computedExpiresISO =
                    activationISO && /^\d{4}-\d{2}-\d{2}$/.test(activationISO)
                      ? addDaysISO_(activationISO, renewalDays)
                      : "";

                  const displayISO = expiresISO || computedExpiresISO;
                  const expired = displayISO ? isPastISO_(displayISO) : false;

                  const isExpanded = expandedTerminalId === String(t.terminal_id);
                  const busy = String(cardingBusyId) === String(t.terminal_id);

                  const selectTerminal = () => {
                    setSelectedTerminalId(String(t.terminal_id));
                    setTermOpen(false);
                  };

                  return (
                    <div
                      key={t.terminal_id ? String(t.terminal_id) : `my-${idx}`}
                      role="button"
                      tabIndex={0}
                      onClick={selectTerminal}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectTerminal();
                        }
                      }}
                      className={[
                        "rounded-xl border transition cursor-pointer select-none overflow-hidden",
                        active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-0">
                        {/* image flush to card edge */}
                        <div
                          className={[
                            "shrink-0 h-16 w-14 flex items-center justify-center text-xs font-semibold rounded-r-none",
                            active ? "bg-black text-amber-400" : "bg-[#1e1e1e] text-white/40",
                          ].join(" ")}
                          aria-hidden="true"
                          style={{ borderRight: "1px solid rgba(255,255,255,0.08)" }}
                        >
                          Img
                        </div>

                        <div className="min-w-0 flex-1 px-3 py-2">
                          <div className="text-sm font-semibold text-white truncate">
                            {t.terminal_name ?? "(unnamed terminal)"}
                          </div>

                          {displayISO ? (
                            <div className={["mt-1 text-xs tabular-nums", expired ? "text-red-400" : "text-white/50"].join(" ")}>
                              {formatMDYWithCountdown_(displayISO)}
                            </div>
                          ) : null}
                        </div>

                        {/* bare star top-right + view chevron below */}
                        <div className="flex flex-col items-end gap-1 pr-2 pt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const tid = String(t.terminal_id);
                              toggleTerminalStar(tid, true);
                              setMyTerminalIds((prev) => {
                                const s = new Set(prev);
                                s.delete(tid);
                                return s;
                              });
                              setTerminals((prev: any) => prev.filter((x: any) => String(x.terminal_id) !== tid));
                            }}
                            style={{ background: "none", border: "none", padding: "2px 2px", cursor: "pointer",
                              color: myTerminalIds.has(String(t.terminal_id)) ? "rgba(234,179,8,0.95)" : "rgba(255,255,255,0.25)",
                              fontSize: 17, lineHeight: 1 }}
                            aria-label="Remove from My Terminals"
                          >
                            {myTerminalIds.has(String(t.terminal_id)) ? "★" : "☆"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTerminalId(isExpanded ? null : String(t.terminal_id));
                            }}
                            className="text-white/40 hover:text-white/70 text-xs"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
                            aria-label="View terminal details"
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </div>
                      </div>

                      {expired ? (
                        <div className="mt-0 px-3 pb-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              doGetCardedForTerminal(String(t.terminal_id));
                            }}
                            className={[
                              "w-full rounded-lg border px-3 py-2 text-xs font-semibold",
                              busy
                                ? "border-red-400/10 bg-red-400/10 text-red-200/60"
                                : "border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/15",
                            ].join(" ")}
                          >
                            {busy ? "Getting carded…" : "Get carded"}
                          </button>
                        </div>
                      ) : null}

                      {isExpanded ? (
                        <div className="mt-0 mx-3 mb-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-white/70">
                          <div className="text-white/80 font-semibold">Terminal details</div>
                          <div className="mt-1">Business-card placeholder.</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setTermOpen(false);
              setCatalogExpandedId(null);
              setCatalogOpen(true);
            }}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-white/80 hover:bg-white/10"
          >
            + Get carded
          </button>
        </div>
      )}
    </FullscreenModal>
  );
}
