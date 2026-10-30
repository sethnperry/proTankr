"use client";
// app/planner/components/wallet/WalletTerminalCards.tsx
//
// Wallet > Terminal Cards. The driver's terminal cards as landscape card thumbnails, three across. Tap one
// to open it full size; tap the card to flip it. The back has the card number, PIN, last visit, and the
// terminal's training (links, company letter, Training completed with its expiration date).

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { formatMDY } from "../../utils/dates";
import SourcingModal from "../../modals/SourcingModal";
import { AddCardSheet, TerminalCard } from "../../cards/TerminalCardParts";
import { accessStateFor, DARK_EXP_COLOR, CARD_BG, CARD_BORDER, CARD_SHADOW } from "../../cards/cardTheme";
import { TerminalTrainingBack } from "./TerminalTrainingBack";

export function WalletTerminalCards({ open, onClose }: { open: boolean; onClose: () => void }) {
  const shell = useCalculatorShell();
  const { terminals, cardDataByTerminalId, setCardDataForTerminal_, authUserId, myTerminalIdSet } = shell;
  const [openId, setOpenId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [draft, setDraft] = useState({ cardNumber: "", pin: "", privateNote: "" });
  const [confirmAction, setConfirmAction] = useState<null | "deactivate" | "remove">(null);
  const [sourcing, setSourcing] = useState<{ id: string; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const items = useMemo(() => (terminals.terminals ?? []).map((t: any) => {
    const tid = String(t.terminal_id);
    const expiresISO = terminals.terminalDisplayInfo(t, tid);
    return { t, tid, expiresISO, state: accessStateFor(expiresISO) };
  }).sort((a: any, b: any) => String(a.t.city ?? "").localeCompare(String(b.t.city ?? "")) || String(a.t.terminal_name ?? "").localeCompare(String(b.t.terminal_name ?? ""))),
  [terminals.terminals, terminals.terminalDisplayInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = items.find((i: any) => i.tid === openId) ?? null;
  const openCard = (tid: string) => {
    const saved = cardDataByTerminalId[tid];
    setDraft({ cardNumber: saved?.cardNumber ?? "", pin: saved?.pin ?? "", privateNote: saved?.privateNote ?? "" });
    setConfirmAction(null); setFlipped(false); setOpenId(tid);
  };
  const closeCard = () => {
    if (openId && flipped) setCardDataForTerminal_(openId, draft);
    setConfirmAction(null); setFlipped(false); setOpenId(null);
  };
  const flipClose = () => { if (openId) setCardDataForTerminal_(openId, draft); setConfirmAction(null); setFlipped(false); };

  return (
    <>
      <FullscreenModal open={open && !openId} title="Terminal Cards" onClose={onClose} footer={null}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 14, padding: "40px 16px", lineHeight: 1.5 }}>
            No terminal cards yet. Add the cards you already have below.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {items.map(({ t, tid, expiresISO, state }: any) => {
              const inactive = state === "inactive";
              return (
                <button key={tid} type="button" className="dash-press" onClick={() => openCard(tid)}
                  style={{ aspectRatio: "1.586 / 1", display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "left", padding: "7px 8px",
                    borderRadius: 3, border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW, color: "#fff", cursor: "pointer", overflow: "hidden",
                    opacity: inactive ? 0.55 : 1, minWidth: 0 }}>
                  <span>
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 11, fontWeight: 800, lineHeight: 1.15 }}>{String(t.terminal_name ?? "Terminal")}</span>
                    <span style={{ display: "block", fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.city}{t.state ? `, ${t.state}` : ""}</span>
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: DARK_EXP_COLOR[state as keyof typeof DARK_EXP_COLOR] }}>{expiresISO ? formatMDY(expiresISO) : "Not carded"}</span>
                </button>
              );
            })}
          </div>
        )}
        <button type="button" onClick={() => setAddOpen(true)}
          style={{ width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 2, border: "1px dashed rgba(255,255,255,0.2)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          + Add Terminal Card
        </button>
      </FullscreenModal>

      <FullscreenModal open={open && !!current} title={String(current?.t.terminal_name ?? "Card")} onClose={closeCard} footer={null}>
        {current && (
          <TerminalCard
            t={current.t} tid={current.tid} expiresISO={current.expiresISO} state={current.state}
            isFlipped={flipped} isSelected={false}
            onFlipOpen={() => setFlipped(true)} onFlipClose={flipClose}
            draft={draft} updateDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            lastVisitISO={terminals.accessDateByTerminalId[current.tid] ?? ""}
            onSetAccessDate={(iso) => terminals.setAccessDateForTerminal(current.tid, iso)}
            confirmAction={confirmAction} setConfirmAction={setConfirmAction}
            onOpenSourcing={() => setSourcing({ id: current.tid, name: String(current.t.terminal_name ?? current.tid) })}
            onDeactivate={async () => { await terminals.deleteAccessDateForTerminal(current.tid); setConfirmAction(null); setFlipped(false); }}
            onRemove={() => { terminals.toggleTerminalStar(current.tid, true); setConfirmAction(null); setFlipped(false); setOpenId(null); }}
            backExtra={<TerminalTrainingBack terminalId={current.tid} userId={authUserId ?? null} companyId={shell.companyId ?? null} />}
          />
        )}
      </FullscreenModal>

      <AddCardSheet
        open={addOpen} onClose={() => setAddOpen(false)}
        terminalCatalog={terminals.terminalCatalog} myTerminalIdSet={myTerminalIdSet}
        homeState={shell.location.selectedState} homeCity={shell.location.selectedCity}
        onAdd={async (terminalId, f) => {
          await terminals.toggleTerminalStar(terminalId, false);
          if (f.lastVisit) await terminals.setAccessDateForTerminal(terminalId, f.lastVisit);
          if (f.cardNumber || f.pin || f.privateNote) await setCardDataForTerminal_(terminalId, { cardNumber: f.cardNumber, pin: f.pin, privateNote: f.privateNote });
        }}
      />
      {sourcing && <SourcingModal open onClose={() => setSourcing(null)} terminalId={sourcing.id} terminalName={sourcing.name} authUserId={authUserId} />}
    </>
  );
}
