"use client";
// app/planner/cards/page.tsx — Terminals sub-tab (Cards tab rework, Phase 1)
//
// This is now the real source of truth for terminal card data (card number/
// PIN/private note, last-visit date) -- MyTerminalsModal.tsx (the Planner's
// terminal picker) reads the same shared state via CalculatorShellContext
// but no longer edits it; editing happens here, on the back of each card.
//
// All starred terminals (shell.terminals.terminals) are shown, every status,
// grouped by city with a divider header per city -- filter chips only
// narrow what's visible, they never change what's fetched (the underlying
// my_terminals_with_status view already returns every status for every
// starred terminal).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useTerminals } from "../hooks/useTerminals";
import { formatMDY, formatMDYWithCountdown_ } from "../utils/dates";
import WalletBack from "./WalletBack";
import FlippableCard from "./FlippableCard";
import SourcingModal from "../modals/SourcingModal";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import {
  accessStateFor, matchesFilter, FILTERS, DARK_EXP_COLOR,
  fieldLabel, fieldInput, btnPrimary, btnSecondary, btnDanger,
  CARD_BG, CARD_BORDER, CARD_BORDER_SELECTED, CARD_SHADOW,
  type CardState, type FilterKey,
} from "./cardTheme";

import { TerminalCard, AddCardSheet } from "./TerminalCardParts";
// ── Driver-scoped card data (card #/PIN/note), mirroring
// CalculatorShellContext.tsx's own cardDataByTerminalId/setCardDataForTerminal_
// but parametrized by an arbitrary target user id instead of effectiveUserId.
// A second independent copy is correct here (not the desync risk that hook
// hoisting exists to avoid) since this is deliberately a DIFFERENT user's
// data, not a duplicate view of the same one -- the whole point is that
// dispatch/admin and the viewed driver never share this state.

function useDriverCardData(userId: string) {
  const [data, setData] = useState<Record<string, { cardNumber: string; pin: string; privateNote: string }>>({});

  useEffect(() => {
    if (!userId) { setData({}); return; }
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from("user_terminal_cards")
        .select("terminal_id, card_number, private_note, pin")
        .eq("user_id", userId);
      if (cancelled) return;
      const map: Record<string, { cardNumber: string; pin: string; privateNote: string }> = {};
      for (const row of (rows ?? []) as any[]) {
        map[String(row.terminal_id)] = { cardNumber: row.card_number ?? "", pin: row.pin ?? "", privateNote: row.private_note ?? "" };
      }
      setData(map);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const setForTerminal = useCallback(async (terminalId: string, patch: { cardNumber: string; pin: string; privateNote: string }) => {
    setData((prev) => ({ ...prev, [terminalId]: patch }));
    if (!userId) return;
    await supabase.from("user_terminal_cards").upsert(
      {
        user_id: userId,
        terminal_id: terminalId,
        card_number: patch.cardNumber,
        private_note: patch.privateNote,
        pin: patch.pin || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,terminal_id" }
    );
  }, [userId]);

  return { data, setForTerminal };
}

const noop = () => {};

// ── Cards tab: Terminals sub-tab ─────────────────────────────────────────────

export default function CardsPage() {
  const shell = useCalculatorShell();
  const { terminals, location, cardDataByTerminalId, setCardDataForTerminal_, authUserId, myTerminalIdSet } = shell;
  const router = useRouter();

  // Contextual for dispatch/admin viewing a selected driver -- per explicit
  // user direction, cards should "look identical for every role", the only
  // difference being whose data is shown, so this renders the exact same
  // TerminalCard flip-card UI as the driver's own view, just pointed at the
  // selected driver's data (full edit parity, backed by the
  // 20260815000000 migration's admin/dispatch write policies).
  // Checked below the JSX return (not an early return here) so every hook
  // in this component still runs on every render, same count either way.
  const isDispatchContext = (shell.role === "dispatch" || shell.role === "admin" || shell.isSuperAdmin) && Boolean(shell.selectedDriverId);
  const driverId = isDispatchContext ? shell.selectedDriverId : "";

  // Second useTerminals instance, scoped to the selected driver instead of
  // effectiveUserId -- safe to always call (rules of hooks); it's a no-op
  // whenever driverId is empty. No "current terminal" concept applies to a
  // driver you're viewing, so selectedTerminalId/setSelectedTerminalId are
  // stubbed out.
  const driverTerminals = useTerminals(driverId, "", noop, null);
  const driverCardData = useDriverCardData(driverId);
  const [driverName, setDriverName] = useState("");

  useEffect(() => {
    if (!driverId) { setDriverName(""); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: [driverId] });
      if (!cancelled) setDriverName((data ?? [])[0]?.display_name ?? "this driver");
    })();
    return () => { cancelled = true; };
  }, [driverId]);

  // Unified active data source -- own vs. driver-scoped -- so the render
  // path below is truly one code path, not two divergent ones.
  const activeTerminals = isDispatchContext ? driverTerminals : terminals;
  const activeCardDataByTerminalId = isDispatchContext ? driverCardData.data : cardDataByTerminalId;
  const activeSetCardDataForTerminal = isDispatchContext ? driverCardData.setForTerminal : setCardDataForTerminal_;
  const activeMyTerminalIdSet = useMemo(
    () => isDispatchContext ? new Set((driverTerminals.terminals ?? []).map((t: any) => String(t.terminal_id))) : myTerminalIdSet,
    [isDispatchContext, driverTerminals.terminals, myTerminalIdSet]
  );
  const walletLabel = isDispatchContext ? `${driverName || "this driver"}'s wallet` : "your wallet";

  const [filter, setFilter] = useState<FilterKey>("all");
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ cardNumber: string; pin: string; privateNote: string }>({ cardNumber: "", pin: "", privateNote: "" });
  const [confirmAction, setConfirmAction] = useState<null | "deactivate" | "remove">(null);
  const [sourcingTerminal, setSourcingTerminal] = useState<{ id: string; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [cityJump, setCityJump] = useState("");

  const cityRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const enriched = useMemo(() => {
    return (activeTerminals.terminals ?? []).map((t: any) => {
      const tid = String(t.terminal_id);
      const expiresISO = activeTerminals.terminalDisplayInfo(t, tid);
      return { t, tid, expiresISO, state: accessStateFor(expiresISO) };
    });
  }, [activeTerminals.terminals, activeTerminals.terminalDisplayInfo]);

  const cityGroups = useMemo(() => {
    const filtered = enriched.filter((i) => matchesFilter(i.state, filter));
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const city = String(item.t.city ?? "Unknown");
      if (!map.has(city)) map.set(city, []);
      map.get(city)!.push(item);
    }
    return Array.from(map.keys())
      .sort()
      .map((city) => ({
        city,
        items: map.get(city)!.sort((a, b) => String(a.t.terminal_name ?? "").localeCompare(String(b.t.terminal_name ?? ""))),
      }));
  }, [enriched, filter]);

  const handleFlipOpen = (tid: string) => {
    const saved = activeCardDataByTerminalId[tid];
    setDraft({ cardNumber: saved?.cardNumber ?? "", pin: saved?.pin ?? "", privateNote: saved?.privateNote ?? "" });
    setConfirmAction(null);
    setFlippedId(tid);
  };
  const handleFlipClose = () => {
    if (flippedId) activeSetCardDataForTerminal(flippedId, draft);
    setConfirmAction(null);
    setFlippedId(null);
  };
  const handleSelect = (tid: string) => {
    if (!terminals.accessDateByTerminalId[tid]) terminals.setAccessDateForTerminal(tid, new Date().toISOString().slice(0, 10));
    // Routes through the shared chooseTerminal (not location.setSelectedTerminalId
    // directly) so this entry point also gets the rack-selection prompt for a
    // multi-rack terminal -- see CalculatorShellContext.tsx's "rack-aware loading".
    shell.chooseTerminal(tid);
    handleFlipClose();
    router.push("/planner?plan=1");
  };
  const handleDeactivate = async (tid: string) => {
    // Was activeTerminals.setAccessDateForTerminal(tid, "") -- a real,
    // silent no-op: that function's own first check
    // (`if (!isoDate || ...) return;`) treats an empty string exactly like
    // "nothing passed" and bails before writing anything, so this button
    // never actually did what its own confirm copy ("Remove last visit
    // date and mark as not carded?") promised. deleteAccessDateForTerminal
    // is the real "not carded" reset -- deletes the terminal_access row
    // outright, same call the Expirations modal's own terminal-card
    // deactivate and the Loading modal's "Back to Planner" exit both use.
    await activeTerminals.deleteAccessDateForTerminal(tid);
    setConfirmAction(null);
    setFlippedId(null);
  };
  const handleRemove = (tid: string) => {
    activeTerminals.toggleTerminalStar(tid, true);
    setConfirmAction(null);
    setFlippedId(null);
  };
  const handleAddCard = async (terminalId: string, fields: { lastVisit: string; cardNumber: string; pin: string; privateNote: string }) => {
    await activeTerminals.toggleTerminalStar(terminalId, false);
    if (fields.lastVisit) await activeTerminals.setAccessDateForTerminal(terminalId, fields.lastVisit);
    if (fields.cardNumber || fields.pin || fields.privateNote) {
      await activeSetCardDataForTerminal(terminalId, { cardNumber: fields.cardNumber, pin: fields.pin, privateNote: fields.privateNote });
    }
  };

  const cities = cityGroups.map((g) => g.city);

  return (
    <div>
      <WalletBack />

      {isDispatchContext && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          Viewing <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>{driverName || "…"}</span>'s terminal cards.
        </div>
      )}

      {activeTerminals.termError && <div className="text-sm text-red-400 mb-3">{activeTerminals.termError}</div>}

      {(activeTerminals.terminals ?? []).length === 0 ? (
        <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "60px 20px", lineHeight: 1.5 }}>
          {isDispatchContext
            ? <>No terminal cards yet for {driverName || "this driver"}.</>
            : <>No terminal cards yet.<br />Add the cards you already have below. A terminal also shows up here once you load at it or pick it on the dashboard.</>}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <CustomSelect
                value={filter}
                onChange={(v) => setFilter(v as FilterKey)}
                options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
                buttonStyle={{ padding: "6px 10px", fontSize: 13, color: "rgba(255,255,255,0.55)" }}
              />
            </div>
            {cities.length > 1 && (
              <div style={{ flex: 1 }}>
                <CustomSelect
                  value={cityJump}
                  onChange={(v) => {
                    setCityJump(v);
                    if (v) {
                      cityRefs.current[v]?.scrollIntoView({ behavior: "smooth", block: "start" });
                      setTimeout(() => setCityJump(""), 300);
                    }
                  }}
                  options={[{ value: "", label: "Jump to city…" }, ...cities.map((c) => ({ value: c, label: c }))]}
                  buttonStyle={{ padding: "6px 10px", fontSize: 13, color: "rgba(255,255,255,0.55)" }}
                />
              </div>
            )}
          </div>

          {cityGroups.length === 0 ? (
            <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "40px 20px" }}>
              No cards match this filter.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {cityGroups.map(({ city, items }) => (
                <div key={city} ref={(el) => { cityRefs.current[city] = el; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, textTransform: "uppercase" as const, whiteSpace: "nowrap" }}>
                      {city}
                    </div>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {items.map(({ t, tid, expiresISO, state }) => (
                      <TerminalCard
                        key={tid}
                        t={t} tid={tid} expiresISO={expiresISO} state={state}
                        isFlipped={flippedId === tid}
                        isSelected={!isDispatchContext && tid === String(location.selectedTerminalId)}
                        onFlipOpen={() => handleFlipOpen(tid)}
                        onFlipClose={handleFlipClose}
                        draft={flippedId === tid ? draft : { cardNumber: activeCardDataByTerminalId[tid]?.cardNumber ?? "", pin: activeCardDataByTerminalId[tid]?.pin ?? "", privateNote: activeCardDataByTerminalId[tid]?.privateNote ?? "" }}
                        updateDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                        lastVisitISO={activeTerminals.accessDateByTerminalId[tid] ?? ""}
                        onSetAccessDate={(iso) => activeTerminals.setAccessDateForTerminal(tid, iso)}
                        confirmAction={flippedId === tid ? confirmAction : null}
                        setConfirmAction={setConfirmAction}
                        onOpenSourcing={() => setSourcingTerminal({ id: tid, name: String(t.terminal_name ?? tid) })}
                        onSelect={isDispatchContext ? undefined : () => handleSelect(tid)}
                        onDeactivate={() => handleDeactivate(tid)}
                        onRemove={() => handleRemove(tid)}
                        walletLabel={walletLabel}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        style={{
          width: "100%", marginTop: 18, padding: "13px 0", borderRadius: 2,
          border: "1px dashed rgba(255,255,255,0.20)", background: "transparent",
          color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}
      >
        + Add Terminal Card
      </button>

      <AddCardSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        terminalCatalog={terminals.terminalCatalog}
        myTerminalIdSet={activeMyTerminalIdSet}
        homeState={shell.location.selectedState}
        homeCity={shell.location.selectedCity}
        onAdd={handleAddCard}
      />

      {sourcingTerminal && (
        <SourcingModal
          open={!!sourcingTerminal}
          onClose={() => setSourcingTerminal(null)}
          terminalId={sourcingTerminal.id}
          terminalName={sourcingTerminal.name}
          authUserId={authUserId}
        />
      )}
    </div>
  );
}
