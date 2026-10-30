"use client";
// app/planner/cards/TerminalCardParts.tsx
//
// The terminal card (front and back) and the Add Terminal Card sheet, shared by the Cards page and the
// dashboard's Wallet. `backExtra` lets the Wallet put the training section on the back of the card.

import React, { useMemo, useState } from "react";
import FlippableCard from "./FlippableCard";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { formatMDY, formatMDYWithCountdown_ } from "../utils/dates";
import {
  DARK_EXP_COLOR, fieldLabel, fieldInput, btnPrimary, btnSecondary, btnDanger,
  CARD_BG, CARD_BORDER, CARD_BORDER_SELECTED, CARD_SHADOW,
  type CardState,
} from "./cardTheme";

// ── Terminal card (front + back) ────────────────────────────────────────────

export function TerminalCard({
  t, tid, expiresISO, state, isFlipped, isSelected,
  onFlipOpen, onFlipClose,
  draft, updateDraft,
  lastVisitISO, onSetAccessDate,
  confirmAction, setConfirmAction,
  onOpenSourcing, onSelect, onDeactivate, onRemove,
  walletLabel = "your wallet",
  backExtra,
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
  /** Rendered on the back, above the buttons (the Wallet puts training here). */
  backExtra?: React.ReactNode;
}) {
  const name = String(t.terminal_name ?? "Terminal");
  const inactive = state === "inactive";

  const front = (
    <div style={{
      height: "100%", borderRadius: 2, padding: "12px 14px", boxSizing: "border-box",
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
          <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)", borderRadius: 2, padding: "2px 6px", letterSpacing: 0.4, textTransform: "uppercase", flexShrink: 0 }}>
            No access
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
      height: "100%", borderRadius: 2, overflow: "hidden", boxSizing: "border-box",
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

        {backExtra}

        {confirmAction === null && (
          <div style={{ display: "flex", gap: 8 }}>
            {onSelect && <button type="button" onClick={onSelect} style={btnPrimary}>Select</button>}
            {lastVisitISO && <button type="button" onClick={() => setConfirmAction("deactivate")} style={btnDanger}>Deactivate</button>}
            <button type="button" onClick={() => setConfirmAction("remove")} style={btnDanger}>Remove</button>
          </div>
        )}
        {confirmAction === "deactivate" && (
          <div style={{ padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
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
          <div style={{ padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)" }}>
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

export function AddCardSheet({
  open, onClose, terminalCatalog, myTerminalIdSet, onAdd, homeState, homeCity,
}: {
  open: boolean; onClose: () => void; terminalCatalog: any[]; myTerminalIdSet: Set<string>;
  /** Where the driver works, so those terminals are listed first. */
  homeState?: string | null; homeCity?: string | null;
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
      // Their own city, then their own state, then everything else.
      .sort((a: any, b: any) => {
        const rank = (c: any) => (homeState && c.state === homeState ? (homeCity && c.city === homeCity ? 0 : 1) : 2);
        return rank(a) - rank(b);
      })
      .slice(0, 60);
  }, [terminalCatalog, myTerminalIdSet, query, homeState, homeCity]);

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
            className="w-full rounded-[2px] border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
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
                  className="rounded-[2px] border border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer px-3 py-2"
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
            <div className="text-xs text-white/40 mb-1 font-medium">Last load here (optional) · your access runs from this date</div>
            <div className="flex gap-2">
              <input type="date" value={lastVisit} onChange={(e) => setLastVisit(e.target.value)} className="flex-1 min-w-0 rounded-[2px] border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white" />
              <button type="button" onClick={() => setLastVisit(new Date().toISOString().slice(0, 10))} className="rounded-[2px] border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10 whitespace-nowrap">Today</button>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/40 mb-1 font-medium">Card Number (optional)</div>
              <input type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="w-full rounded-[2px] border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/40 mb-1 font-medium">PIN (optional)</div>
              <input type="text" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full rounded-[2px] border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20" />
            </div>
          </div>
          <div>
            <div className="text-xs text-white/40 mb-1 font-medium">Private Note (optional)</div>
            <textarea value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} rows={2} className="w-full rounded-[2px] border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/20 resize-none" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setStep("search")} className="flex-1 rounded-[2px] border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/70">Back</button>
            <button
              type="button"
              onClick={() => { onAdd(String(picked.terminal_id), { lastVisit, cardNumber, pin, privateNote }); onClose(); reset(); }}
              className="flex-1 rounded-[2px] border border-white/15 bg-white/90 py-2.5 text-sm font-bold text-black"
            >
              Add Card
            </button>
          </div>
        </div>
      )}
    </FullscreenModal>
  );
}

