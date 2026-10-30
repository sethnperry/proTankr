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
import { WalletOverlay } from "./WalletOverlay";

export function WalletTerminalCards({ open, onClose }: { open: boolean; onClose: () => void }) {
  const shell = useCalculatorShell();
  const { terminals, cardDataByTerminalId, setCardDataForTerminal_, authUserId, myTerminalIdSet } = shell;
  const [openId, setOpenId] = useState<string | null>(null);
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

  const cityGroups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items as any[]) { const c = String(it.t.city ?? "Other") + (it.t.state ? `, ${it.t.state}` : ""); (m.get(c) ?? m.set(c, []).get(c)!).push(it); }
    return [...m.entries()];
  }, [items]);

  const current = items.find((i: any) => i.tid === openId) ?? null;
  const openCard = (tid: string) => {
    const saved = cardDataByTerminalId[tid];
    setDraft({ cardNumber: saved?.cardNumber ?? "", pin: saved?.pin ?? "", privateNote: saved?.privateNote ?? "" });
    setConfirmAction(null); setOpenId(tid);
  };
  const closeCard = () => {
    if (openId) setCardDataForTerminal_(openId, draft);
    setConfirmAction(null); setOpenId(null);
  };

  return (
    <>
      <FullscreenModal open={open && !openId} title="Terminal Cards" onClose={onClose} footer={null}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 14, padding: "40px 16px", lineHeight: 1.5 }}>
            No terminal cards yet. Add the cards you already have below.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {cityGroups.map(([city, list]) => (
              <div key={city}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{city}</span>
                  <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  {list.map(({ t, tid, expiresISO, state }: any) => {
                    const inactive = state === "inactive";
                    const num = cardDataByTerminalId[tid]?.cardNumber;
                    return (
                      <button key={tid} type="button" className="dash-press" onClick={() => openCard(tid)}
                        style={{ aspectRatio: "1.586 / 1", display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "left", padding: "10px 11px",
                          borderRadius: 3, border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW, color: "#fff", cursor: "pointer", overflow: "hidden",
                          opacity: inactive ? 0.55 : 1, minWidth: 0 }}>
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 15, fontWeight: 800, lineHeight: 1.15 }}>{String(t.terminal_name ?? "Terminal")}</span>
                        <span>
                          <span style={{ display: "block", fontSize: 12, fontFamily: "monospace", letterSpacing: 0.5, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>{num || "No card #"}</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: DARK_EXP_COLOR[state as keyof typeof DARK_EXP_COLOR] }}>{expiresISO ? formatMDY(expiresISO) : "Not carded"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setAddOpen(true)}
          style={{ width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 2, border: "1px dashed rgba(255,255,255,0.2)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          + Add Terminal Card
        </button>
      </FullscreenModal>

      <WalletOverlay open={open && !!current} onClose={closeCard}>
        {current && (
          <TerminalCard
            t={current.t} tid={current.tid} expiresISO={current.expiresISO} state={current.state}
            isFlipped isSelected={false}
            onFlipOpen={() => {}} onFlipClose={closeCard}
            draft={draft} updateDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            lastVisitISO={terminals.accessDateByTerminalId[current.tid] ?? ""}
            onSetAccessDate={(iso) => terminals.setAccessDateForTerminal(current.tid, iso)}
            confirmAction={confirmAction} setConfirmAction={setConfirmAction}
            onOpenSourcing={() => setSourcing({ id: current.tid, name: String(current.t.terminal_name ?? current.tid) })}
            onDeactivate={async () => { await terminals.deleteAccessDateForTerminal(current.tid); setConfirmAction(null); setOpenId(null); }}
            onRemove={() => { terminals.toggleTerminalStar(current.tid, true); setConfirmAction(null); setOpenId(null); }}
            backExtra={<TerminalTrainingBack terminalId={current.tid} userId={authUserId ?? null} companyId={shell.companyId ?? null} />}
          />
        )}
      </WalletOverlay>

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
