"use client";
// app/planner/vault/VaultUi.tsx
//
// The inside of the Vault: a status strip, search and a category legend, your cards as a wallet stack, your
// logins as a list with one-tap copy, and a detail sheet with a copy/show button on every field. Matches the
// dashboard look (flat dark surfaces, hairlines, small caps labels).

import React, { useEffect, useMemo, useState } from "react";
import { useDashLook } from "../home/dashLook";
import { cardExpIso, groupCard, isCardCategory, maskCard, maskCardGroups } from "@/lib/vault/cards";
import { shadeFor } from "@/lib/vault/grays";
import { EXPIRY_COLOR, expiryStateFor } from "@/lib/expiry";

export type VEntry = {
  id: string; label: string; category: string | null; website: string | null; username: string | null; secret: string | null; notes: string | null;
  card_name?: string | null; card_brand?: string | null; card_number?: string | null; card_exp?: string | null; card_pin?: string | null;
};

const caps: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" };

export function Monogram({ e, size = 38 }: { e: VEntry; size?: number }) {
  const sh = shadeFor(e.category);
  return (
    <span aria-hidden style={{ width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: sh.bg, color: sh.fg, border: sh.border, fontSize: size * 0.42, fontWeight: 900 }}>
      {(e.label.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

// ── Status strip ────────────────────────────────────────────────────────────
export function useCountdown(getAt: () => number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const at = getAt();
  return at == null ? null : Math.max(0, at - now);
}
export const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function cardsExpiring(entries: VEntry[]): number {
  return entries.filter((e) => isCardCategory(e.category) && ["soon", "expiring", "expired"].includes(expiryStateFor(cardExpIso(e.card_exp)))).length;
}

// ── Category legend / filter ────────────────────────────────────────────────
export function CategoryLegend({ cats, value, onChange }: { cats: string[]; value: string | null; onChange: (c: string | null) => void }) {
  const L = useDashLook();
  const chip = (on: boolean): React.CSSProperties => ({ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", border: `1px solid ${on ? "#fff" : L.hairline}`, background: on ? "#fff" : "#0f0f10", color: on ? "#000" : "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 700, cursor: "pointer" });
  return (
    <div className="pt-tabscroll" style={{ display: "flex", gap: 6, overflowX: "auto", margin: "10px 0 4px" }}>
      <button type="button" onClick={() => onChange(null)} style={chip(value == null)}>All</button>
      {cats.map((c) => (
        <button key={c} type="button" onClick={() => onChange(value === c ? null : c)} style={chip(value === c)}>
          <span aria-hidden style={{ width: 10, height: 10, background: shadeFor(c === "Uncategorized" ? null : c).bg, border: "1px solid rgba(128,128,128,0.6)" }} />{c}
        </button>
      ))}
    </div>
  );
}

// ── Cards as a wallet stack ─────────────────────────────────────────────────
export function CardFace({ e, onClick }: { e: VEntry; onClick?: () => void }) {
  const sh = shadeFor(e.category);
  const st = expiryStateFor(cardExpIso(e.card_exp));
  const light = sh.fg !== "#ffffff";
  const expColor = e.card_exp ? (light ? { not_set: sh.sub, valid: sh.fg, soon: "#a16207", expiring: "#c2410c", expired: "#b91c1c", inactive: sh.sub }[st] : EXPIRY_COLOR[st]) : sh.sub;
  return (
    <button type="button" onClick={onClick} className="dash-press"
      style={{ width: "100%", aspectRatio: "1.586 / 1", display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "left", padding: "13px 15px", boxSizing: "border-box",
        borderRadius: 12, border: sh.border, background: `linear-gradient(135deg, ${sh.bg}, ${sh.bg})`, color: sh.fg, cursor: onClick ? "pointer" : "default", boxShadow: "0 -6px 14px rgba(0,0,0,0.45)" }}>
      <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
        <span style={{ ...caps, color: sh.sub, flexShrink: 0 }}>{e.card_brand ?? ""}</span>
      </span>
      <span className="dash-num" style={{ fontSize: 19, letterSpacing: 1.5, fontWeight: 700 }}>{maskCardGroups(e.card_number, e.card_brand) || "•••• •••• •••• ••••"}</span>
      <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-end" }}>
        <span style={{ ...caps, color: sh.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.card_name ?? ""}</span>
        <span className="dash-num" style={{ fontSize: 14, fontWeight: 800, color: expColor, flexShrink: 0 }}>{e.card_exp || "––/––"}</span>
      </span>
    </button>
  );
}

export function CardStack({ cards, onOpen }: { cards: VEntry[]; onOpen: (id: string) => void }) {
  if (!cards.length) return null;
  // Each card after the first slides up over the one before, leaving a strip of it showing (percent margins
  // follow the card's width, so the overlap scales with the card's height).
  return (
    <div style={{ paddingTop: 6 }}>
      {cards.map((c, i) => (
        <div key={c.id} style={{ marginTop: i === 0 ? 0 : "-41.5%", position: "relative", zIndex: i + 1 }}>
          <CardFace e={c} onClick={() => onOpen(c.id)} />
        </div>
      ))}
    </div>
  );
}

// ── Logins ──────────────────────────────────────────────────────────────────
export function LoginList({ rows, onOpen, onCopy }: { rows: VEntry[]; onOpen: (id: string) => void; onCopy: (text: string, what: string) => void }) {
  const L = useDashLook();
  if (!rows.length) return null;
  return (
    <div style={{ ...L.secondary, overflow: "hidden" }}>
      {rows.map((e, i) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderTop: i === 0 ? "none" : `1px solid ${L.hairline}` }}>
          <button type="button" onClick={() => onOpen(e.id)} className="dash-press" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", color: "#fff", cursor: "pointer", textAlign: "left", padding: 0 }}>
            <Monogram e={e} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
              <span style={{ display: "block", fontSize: 12, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.username || e.website || "No username"}</span>
            </span>
          </button>
          {e.secret && (
            <button type="button" aria-label={`Copy password for ${e.label}`} onClick={() => onCopy(e.secret!, "Password")}
              style={{ ...caps, flexShrink: 0, padding: "8px 10px", border: `1px solid ${L.hairline}`, background: "#0f0f10", color: "rgba(255,255,255,0.85)", cursor: "pointer" }}>Copy</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Detail sheet ────────────────────────────────────────────────────────────
function FieldRow({ label, value, secret, mono, onCopy }: { label: string; value: string; secret?: boolean; mono?: boolean; onCopy: (t: string, w: string) => void }) {
  const L = useDashLook();
  const [shown, setShown] = useState(false);
  return (
    <div style={{ padding: "10px 12px", borderTop: `1px solid ${L.hairline}` }}>
      <div style={{ ...caps, color: L.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={mono ? "dash-num" : undefined} style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, fontFamily: mono ? "monospace" : undefined, letterSpacing: mono ? 0.5 : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {secret && !shown ? "•".repeat(Math.min(14, Math.max(6, value.length))) : value}
        </span>
        {secret && <button type="button" onClick={() => setShown((v) => !v)} style={smallBtn(L.hairline)}>{shown ? "Hide" : "Show"}</button>}
        <button type="button" onClick={() => onCopy(value, label)} style={smallBtn(L.hairline)}>Copy</button>
      </div>
    </div>
  );
}
const smallBtn = (hair: string): React.CSSProperties => ({ ...caps, flexShrink: 0, padding: "7px 9px", border: `1px solid ${hair}`, background: "#0f0f10", color: "rgba(255,255,255,0.85)", cursor: "pointer" });

export function EntryDetail({ e, copied, confirmDelete, busy, onCopy, onEdit, onDelete, onConfirmDelete, onClose }: {
  e: VEntry; copied: string | null; confirmDelete: boolean; busy: boolean;
  onCopy: (t: string, w: string) => void; onEdit: () => void; onDelete: () => void; onConfirmDelete: () => void; onClose: () => void;
}) {
  const L = useDashLook();
  const isCard = isCardCategory(e.category);
  return (
    <div style={{ background: "#121213", border: `1px solid ${L.hairline}`, color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px" }}>
        <Monogram e={e} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
          <div style={{ ...caps, color: L.muted, marginTop: 2 }}>{isCard ? (e.card_brand ?? "Card") : (e.category ?? "Login")}</div>
        </div>
        <button type="button" onClick={onClose} style={smallBtn(L.hairline)}>Close</button>
      </div>
      {isCard ? (
        <>
          {e.card_name && <FieldRow label="Name on card" value={e.card_name} onCopy={onCopy} />}
          {e.card_number && <FieldRow label="Number" value={groupCard(e.card_number, e.card_brand)} secret mono onCopy={(t, w) => onCopy(t.replace(/\s/g, ""), w)} />}
          {e.card_exp && <FieldRow label="Expires" value={e.card_exp} mono onCopy={onCopy} />}
          {e.card_pin && <FieldRow label="PIN" value={e.card_pin} secret mono onCopy={onCopy} />}
        </>
      ) : (
        <>
          {e.website && <FieldRow label="Website" value={e.website} onCopy={onCopy} />}
          {e.username && <FieldRow label="Username" value={e.username} onCopy={onCopy} />}
          {e.secret && <FieldRow label="Password" value={e.secret} secret mono onCopy={onCopy} />}
        </>
      )}
      {e.notes && (
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${L.hairline}` }}>
          <div style={{ ...caps, color: L.muted, marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.8)" }}>{e.notes}</div>
        </div>
      )}
      {copied && <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "#4ade80", borderTop: `1px solid ${L.hairline}` }}>{copied}</div>}
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${L.hairline}` }}>
        <button type="button" onClick={onEdit} style={{ flex: 1, padding: "11px 0", border: `1px solid ${L.hairline}`, background: "#0f0f10", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Edit</button>
        {confirmDelete ? (
          <button type="button" aria-busy={busy} disabled={busy} onClick={onDelete} style={{ flex: 1, padding: "11px 0", border: "none", background: "#b91c1c", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{busy ? "Deleting…" : "Confirm delete"}</button>
        ) : (
          <button type="button" onClick={onConfirmDelete} style={{ flex: 1, padding: "11px 0", border: "1px solid rgba(220,60,60,0.45)", background: "rgba(180,40,40,0.1)", color: "#fca5a5", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Delete</button>
        )}
      </div>
    </div>
  );
}

export function filterEntries(entries: VEntry[], q: string, cat: string | null): VEntry[] {
  const s = q.trim().toLowerCase();
  return entries.filter((e) => {
    if (cat && (e.category ?? "Uncategorized") !== cat) return false;
    if (!s) return true;
    return [e.label, e.category, e.username, e.website, e.card_brand].some((v) => v?.toLowerCase().includes(s));
  });
}

export function categoriesOf(entries: VEntry[]): string[] {
  return [...new Set(entries.map((e) => e.category ?? "Uncategorized"))].sort((a, b) => a.localeCompare(b));
}

export { maskCard, useMemo };
