"use client";

import { openAccessSteps } from "../components/access/useAccessSteps";
import React, { useMemo, useState } from "react";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import type { Role } from "@/lib/ui/driver/role";
import RackProductStatusModal from "./RackProductStatusModal";
import EditTerminalModal from "./EditTerminalModal";
import { useExpandedRacks } from "./myTerminals/useExpandedRacks";
import { RackProductList } from "./myTerminals/RackProductList";
// ── Terminal avatar helpers ───────────────────────────────────────────────────
// No fill, thin white stroke -- placeholder until real per-operator logos
// (tracked as a someday idea, not this pass). Was a per-terminal color-hash
// fill; that didn't fit the monochrome theme.

const avatarInitials = terminalCode;
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { terminalCode } from "@/lib/equipment/boardStatus";

type TerminalRow = any;
type CardData = { cardNumber: string; privateNote: string; pin: string; };

// This modal is the Planner's terminal picker -- tap a row to select it for
// the current plan. Card editing (number/PIN/private note/last visit/
// sourcing/deactivate/remove) now lives on the back of each card in the
// Cards tab (app/planner/cards/page.tsx), which is the source of truth
// for that data; this expanded panel is read-only for card data.
//
// STUD + Edit Terminal + a rack quick-pick relocated here from the
// now-deleted /planner/terminal page, per explicit direction ("take the
// whole section out of the terminal page for product status... put that in
// the location modal in the expanded view of the terminal card"). Deliberately
// LOCAL state, not wired into shell.chooseTerminal/rackPickerOpen/
// RackSelectSheet -- checking/updating a terminal's rack status here must
// never change the driver's actively selected planning terminal/rack as a
// side effect (the terminal being expanded may not even be the one currently
// selected for loading -- e.g. checking status somewhere you're not loading
// today).

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
  addDaysISO_: (iso: string, days: number) => string;
  isPastISO_: (iso: string) => boolean;
  formatMDYWithCountdown_: (iso: string) => string;
  accessDateByTerminalId: Record<string, string | undefined>;
  setAccessDateForTerminal_: (terminalId: string, isoDate: string) => void;
  cardDataByTerminalId: Record<string, CardData | undefined>;
  myTerminalIds: Set<string>;
  setMyTerminalIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTerminalId: (id: string) => void;
  setTermOpen: (open: boolean) => void;
  onChangeLocation?: () => void;
  authUserId: string;
  myRole: Role | null;
  // Threaded through to RackProductStatusModal's STUD-to-outage-banner
  // link (see that file's own 2026-09-06 comment) -- terminal_outage_reports
  // requires a company_id on every row, same as page.tsx's own
  // handleSubmitOutageReport already does for the Complete-screen flow.
  companyId: string | null;
  // useTerminals.ts's own live-terminals refetch (my_terminals_with_status)
  // -- distinct from terminalsFiltered's own source, the shared
  // React-Query-cached useTerminalsCatalog(). EditTerminalModal's save
  // already invalidates that cache (2026-09-16 fix), but useExpirations.ts
  // prefers this live `terminals` state over the cached catalog whenever a
  // terminal is already in the driver's carded list -- so a renewal_days
  // edit needs BOTH refreshed, or the bell/report can go stale even after
  // the card itself shows the right number. Optional so callers that don't
  // have this wired (none currently) degrade to the pre-existing behavior.
  onLoadMyTerminals?: () => void | Promise<void>;
  // Called after a terminal is picked (the list has closed).
  onPicked?: () => void;
}) {
  const {
    open, onClose,
    selectedState, selectedCity, termError,
    terminalsFiltered, selectedTerminalId,
    expandedTerminalId, setExpandedTerminalId,
    addDaysISO_, isPastISO_, formatMDYWithCountdown_,
    accessDateByTerminalId, setAccessDateForTerminal_,
    cardDataByTerminalId,
    myTerminalIds, setMyTerminalIds,
    setSelectedTerminalId, setTermOpen,
    onChangeLocation,
    authUserId, myRole, companyId,
    onLoadMyTerminals,
  } = props;

  const isoToday = () => new Date().toISOString().slice(0, 10);

  // Rack status/edit state, scoped to whichever card is expanded.
  const {
    expandedRacks, expandedRackId, setExpandedRackId, expandedRackProducts,
    racksLoading, racksError, loadExpandedRacks, loadExpandedRackProducts,
  } = useExpandedRacks(expandedTerminalId);
  const [studOpen, setStudOpen] = useState(false);
  const [editTerminalOpen, setEditTerminalOpen] = useState(false);

  const { data: productsCatalog = [] } = useProductsCatalog();
  const productsById = useMemo(
    () => Object.fromEntries(productsCatalog.map((p) => [p.product_id, p])),
    [productsCatalog]
  );

  const canEditTerminal = myRole === "lead" || myRole === "dispatch" || myRole === "admin";
  const canSeeCardsFooter = myRole === "driver" || myRole === "lead" || myRole == null;

  const activeRack = expandedRacks.find((r) => r.rack_id === expandedRackId) ?? null;
  const expandedTerminalRow = terminalsFiltered.find((t: any) => String(t.terminal_id) === expandedTerminalId);

  const handleSelect = (tid: string) => {
    if (!myTerminalIds.has(tid)) setMyTerminalIds(prev => new Set([...prev, tid]));
    // Picking a terminal doesn't mean the driver has access there: access dates come from a real
    // load, a typed card, or finishing the access steps.
    setSelectedTerminalId(tid);
    setTermOpen(false);
    props.onPicked?.();
  };

  const sorted = [...terminalsFiltered].sort((a, b) => {
    const aD = accessDateByTerminalId[String(a.terminal_id)] ?? "";
    const bD = accessDateByTerminalId[String(b.terminal_id)] ?? "";
    if (aD && bD) return bD.localeCompare(aD);
    if (aD) return -1;
    if (bD) return 1;
    return (a.terminal_name ?? "").localeCompare(b.terminal_name ?? "");
  });

  return (
    <FullscreenModal open={open} title="Terminals" onClose={onClose}>
      {!selectedState || !selectedCity ? (
        <div className="text-sm text-white/60">Select a city first.</div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-white/70 flex items-center justify-between gap-2">
            <span>
              Showing terminals in{" "}
              <span className="text-white">{selectedCity}, {selectedState}</span>
            </span>
            {onChangeLocation && (
              <button
                type="button"
                onClick={onChangeLocation}
                className="shrink-0 text-xs font-semibold text-white/45 hover:text-white/70"
              >
                Change
              </button>
            )}
          </div>

          {termError && <div className="text-sm text-red-400">{termError}</div>}

          {sorted.length === 0 ? (
            <div className="text-sm text-white/60">No terminals found for this city.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {sorted.map((t, idx) => {
                const tid = String(t.terminal_id);
                const active = tid === String(selectedTerminalId);
                const isExpanded = expandedTerminalId === tid;
                const lastVisitISO = accessDateByTerminalId[tid] ?? "";
                const renewalDays = Number(t.renewal_days ?? t.renewalDays ?? t.renewal ?? 90) || 90;
                const expiresISO = lastVisitISO ? addDaysISO_(lastVisitISO, renewalDays) : "";
                const expired = expiresISO ? isPastISO_(expiresISO) : false;
                const card = cardDataByTerminalId[tid];

                return (
                  <div
                    key={tid ?? `term-${idx}`}
                    className={[
                      "rounded-[2px] border transition-all overflow-hidden",
                      active ? "border-white/30 bg-white/5" : "border-white/10",
                    ].join(" ")}
                  >
                    {/* Header -- main body selects this terminal directly;
                        only the chevron zone on the right expands/collapses
                        the read-only details panel below. */}
                    <div className="flex items-center hover:bg-white/5">
                      <div
                        role="button" tabIndex={0}
                        onClick={() => handleSelect(tid)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(tid); } }}
                        className="flex items-center flex-1 min-w-0 cursor-pointer select-none"
                      >
                        <div style={{
                          flexShrink: 0, width: 26, height: 26, marginLeft: 12,
                          borderRadius: "50%", border: "1px solid rgba(255,255,255,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 800,
                          color: t.terminal_name ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.20)",
                        }}>
                          {t.terminal_name ? avatarInitials(String(t.terminal_name)) : "—"}
                        </div>
                        <div className="min-w-0 flex-1 px-3 py-2">
                          <div className="text-sm font-semibold text-white truncate">
                            {t.terminal_name ?? "(unnamed terminal)"}
                          </div>
                          {expiresISO ? (
                            <div className={["mt-1 text-xs tabular-nums", expired ? "text-red-400" : "text-white/50"].join(" ")}>
                              {expired ? "Expired · " : ""}{formatMDYWithCountdown_(expiresISO)}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-white/25">No visit recorded</div>
                          )}
                        </div>
                      </div>
                    </div>

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
