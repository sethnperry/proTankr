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
import CardsSubTabs from "./CardsSubTabs";
import FlippableCard from "./FlippableCard";
import SourcingModal from "../modals/SourcingModal";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import {
  cardStateFor, matchesFilter, FILTERS, DARK_EXP_COLOR,
  fieldLabel, fieldInput, btnPrimary, btnSecondary, btnDanger,
  CARD_BG, CARD_BORDER, CARD_BORDER_SELECTED, CARD_SHADOW,
  type CardState, type FilterKey,
} from "./cardTheme";

// ── Terminal card (front + back) ────────────────────────────────────────────

function TerminalCard({
  t, tid, expiresISO, state, isFlipped, isSelected,
  onFlipOpen, onFlipClose,
  draft, updateDraft,
  lastVisitISO, onSetAccessDate,
  confirmAction, setConfirmAction,
  onOpenSourcing, onSelect, onDeactivate, onRemove,
  walletLabel = "your wallet",
}: {
  t: any; tid: string; expiresISO: string | null; state: CardState;
  isFlipped: boolean; isSelected: boolean;
  onFlipOpen: () => void; onFlipClose: () => void;
  draft: { cardNumber: string; pin: string; privateNote: string };
  updateDraft: (patch: Partial<{ cardNumber: string; pin: string; privateNote: string }>) => void;
  lastVisitISO: string; onSetAccessDate: (iso: string) => void;
  confirmAction: null | "deactivate" | "remove"; setConfirmAction: (a: null | "deactivate" | "remove") => void;
  onOpenSourcing: () => void; onSelect?: () => void; onDeactivate: () => void; onRemove: () => void;
  // Defaults to "your wallet" for the driver's own view; dispatch/admin
  // viewing a selected driver's cards passes "{driverName}'s wallet" so the
  // remove-confirm copy stays accurate about whose cards these are.
  walletLabel?: string;
}) {
  const name = String(t.terminal_name ?? "Terminal");
  const inactive = state === "inactive";

  const front = (
    <div style={{
      height: "100%", borderRadius: 8, padding: "12px 14px", boxSizing: "border-box",
      background: CARD_BG,
      border: isSelected ? CARD_BORDER_SELECTED : CARD_BORDER,
      boxShadow: CARD_SHADOW,
      opacity: inactive ? 0.55 : 1,
      filter: inactive ? "grayscale(0.5)" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.92)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        {inactive && (
          <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)", borderRadius: 4, padding: "2px 6px", letterSpacing: 0.4, textTransform: "uppercase", flexShrink: 0 }}>
            Inactive
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
        {t.city}{t.state ? `, ${t.state}` : ""}
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {draft.cardNumber ? draft.cardNumber : "No card on file"}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.4 }}>Exp</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: DARK_EXP_COLOR[state] }}>
            {expiresISO ? formatMDY(expiresISO) : "Not carded"}
          </div>
        </div>
      </div>
    </div>
  );

  const back = (
    <div style={{
      height: "100%", borderRadius: 8, overflow: "hidden", boxSizing: "border-box",
      background: CARD_BG,
      border: CARD_BORDER,
      boxShadow: CARD_SHADOW,
    }}>
      <div style={{ background: "rgba(0,0,0,0.35)", padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <button type="button" onClick={onFlipClose} style={{ border: "none", background: "none", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 6px" }}>
          Done
        </button>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div>
          <div style={fieldLabel}>Last Visit</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="date" value={lastVisitISO} onChange={(e) => onSetAccessDate(e.target.value)} style={{ ...fieldInput, flex: 1 }} />
            <button type="button" onClick={() => onSetAccessDate(new Date().toISOString().slice(0, 10))} style={btnSecondary}>Today</button>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: DARK_EXP_COLOR[state] }}>
            {expiresISO ? `Expires ${formatMDYWithCountdown_(expiresISO)}` : "Not yet carded"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={fieldLabel}>Card Number</div>
            <input type="text" value={draft.cardNumber} onChange={(e) => updateDraft({ cardNumber: e.target.value })} placeholder="Enter card #" style={fieldInput} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={fieldLabel}>PIN</div>
            <input type="text" value={draft.pin} onChange={(e) => updateDraft({ pin: e.target.value })} placeholder="Enter PIN" style={fieldInput} />
          </div>
        </div>

        <button type="button" onClick={onOpenSourcing} style={{ ...btnSecondary, width: "100%" }}>
          Sourcing
        </button>

        <div>
          <div style={fieldLabel}>Private Note</div>
          <textarea value={draft.privateNote} onChange={(e) => updateDraft({ privateNote: e.target.value })} placeholder="Gate codes, contacts, reminders…" rows={2} style={{ ...fieldInput, resize: "none" as const }} />
        </div>

        {confirmAction === null && (
          <div style={{ display: "flex", gap: 8 }}>
            {onSelect && <button type="button" onClick={onSelect} style={btnPrimary}>Select</button>}
            {lastVisitISO && <button type="button" onClick={() => setConfirmAction("deactivate")} style={btnDanger}>Deactivate</button>}
            <button type="button" onClick={() => setConfirmAction("remove")} style={btnDanger}>Remove</button>
          </div>
        )}
        {confirmAction === "deactivate" && (
          <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>
              Remove last visit date and mark as not carded?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onDeactivate} style={{ ...btnDanger, flex: 1 }}>Yes, deactivate</button>
              <button type="button" onClick={() => setConfirmAction(null)} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
            </div>
          </div>
        )}
        {confirmAction === "remove" && (
          <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>
              Remove this card from {walletLabel}? Card number, PIN, and notes stay saved if you add it back later.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={onRemove} style={{ ...btnDanger, flex: 1 }}>Yes, remove card</button>
              <button type="button" onClick={() => setConfirmAction(null)} style={{ ...btnSecondary, flex: 1 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return <FlippableCard flipped={isFlipped} onFlipToBack={onFlipOpen} front={front} back={back} />;
}

// ── Add Terminal Card sheet ──────────────────────────────────────────────────

function AddCardSheet({
  open, onClose, terminalCatalog, myTerminalIdSet, onAdd,
}: {
  open: boolean; onClose: () => void; terminalCatalog: any[]; myTerminalIdSet: Set<string>;
  onAdd: (terminalId: string, fields: { lastVisit: string; cardNumber: string; pin: string; privateNote: string }) => void;
}) {
  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<any | null>(null);
  const [lastVisit, setLastVisit] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [pin, setPin] = useState("");
  const [privateNote, setPrivateNote] = useState("");

  const reset = () => { setStep("search"); setQuery(""); setPicked(null); setLastVisit(""); setCardNumber(""); setPin(""); setPrivateNote(""); };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (terminalCatalog ?? [])
      .filter((c: any) => !myTerminalIdSet.has(String(c.terminal_id)))
      .filter((c: any) => {
        if (!q) return true;
        const hay = `${c.terminal_name ?? ""} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 60);
  }, [terminalCatalog, myTerminalIdSet, query]);

  return (
    <FullscreenModal
      open={open}
      title={step === "search" ? "Add Terminal Card" : String(picked?.terminal_name ?? "Add Card")}
      onClose={() => { onClose(); reset(); }}
      footer={null}
    >
      {step === "search" ? (
        <div className="space-y-3">
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by terminal, city, or state…"
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
            autoFocus
          />
          <div className="grid grid-cols-1 gap-2">
            {results.map((c: any) => {
              const id = String(c.terminal_id);
              return (
                <div
                  key={id}
                  role="button" tabIndex={0}
                  onClick={() => { setPicked(c); setStep("details"); }}
                  className="rounded-md border border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer px-3 py-2"
                >
                  <div className="text-sm font-semibold text-white truncate">{c.terminal_name ?? "(unnamed terminal)"}</div>
                  <div className="text-xs text-white/45 mt-0.5">{c.city}{c.state ? `, ${c.state}` : ""}</div>
                </div>
              );
            })}
            {results.length === 0 && (
              <div className="text-sm text-white/40 text-center py-8">No matching terminals.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-white/60">
            {picked?.city}{picked?.state ? `, ${picked.state}` : ""}
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1 font-medium">Last Visit (optional)</div>
            <div className="flex gap-2">
              <input type="date" value={lastVisit} onChange={(e) => setLastVisit(e.target.value)} className="flex-1 min-w-0 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
              <button type="button" onClick={() => setLastVisit(new Date().toISOString().slice(0, 10))} className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10 whitespace-nowrap">Today</button>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/40 mb-1 font-medium">Card Number (optional)</div>
              <input type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/40 mb-1 font-medium">PIN (optional)</div>
              <input type="text" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20" />
            </div>
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1 font-medium">Private Note (optional)</div>
            <textarea value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} rows={2} className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20 resize-none" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setStep("search")} className="flex-1 rounded-md border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/70">Back</button>
            <button
              type="button"
              onClick={() => { onAdd(String(picked.terminal_id), { lastVisit, cardNumber, pin, privateNote }); onClose(); reset(); }}
              className="flex-1 rounded-md border border-white/15 bg-white/90 py-2.5 text-sm font-bold text-black"
            >
              Add Card
            </button>
          </div>
        </div>
      )}
    </FullscreenModal>
  );
}

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
      return { t, tid, expiresISO, state: cardStateFor(expiresISO) };
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
    router.push("/planner");
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
      <CardsSubTabs />

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
            : <>No starred terminals yet.<br />Star a terminal from the Planner to see its card here.</>}
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
          width: "100%", marginTop: 18, padding: "13px 0", borderRadius: 8,
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
