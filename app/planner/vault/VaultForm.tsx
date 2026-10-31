"use client";
// app/planner/vault/VaultForm.tsx
//
// Add or edit a Vault entry. Pick the kind first (each kind wears its color), watch a live preview as you
// type, then fill in only the fields that kind needs. Card numbers and expiry format themselves as you type;
// passwords can be shown and generated. Saves from a bar that stays at the bottom.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { CARD_BRANDS, COMPANY_CARD, PERSONAL_CARD, groupCard, isCardCategory } from "@/lib/vault/cards";
import { shadeFor } from "@/lib/vault/grays";
import { CardFace, Monogram } from "./VaultUi";

export type VForm = {
  label: string; category: string; website: string; username: string; secret: string; notes: string;
  cardName: string; cardBrand: string; cardNumber: string; cardExp: string; cardPin: string;
};

const KINDS = [
  { id: "Work", label: "Work login", sub: "ELD, email, portals" },
  { id: "Personal", label: "Personal login", sub: "Your own accounts" },
  { id: COMPANY_CARD, label: "Company card", sub: "Fuel and company cards" },
  { id: PERSONAL_CARD, label: "Personal card", sub: "Your own cards" },
] as const;

/** "0828" or "08/28" typed -> "08/28". */
export function fmtExp(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function generatePassword(len = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

const caps: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" };

export function VaultForm({ open, editing, form, set, error, busy, onSave, onCancel }: {
  open: boolean; editing: boolean; form: VForm; set: (p: Partial<VForm>) => void; error: string | null; busy: boolean; onSave: () => void; onCancel: () => void;
}) {
  const L = useDashLook();
  const [showPw, setShowPw] = useState(false);
  const isCard = isCardCategory(form.category);
  const knownKind = KINDS.some((k) => k.id === form.category);
  const [customOpen, setCustomOpen] = useState(!!form.category && !knownKind);
  const sh = shadeFor(form.category || null);

  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 16, padding: "12px 12px", borderRadius: 2, outline: "none" };
  const field = (label: string, node: React.ReactNode) => (
    <div style={{ marginBottom: 14 }}><div style={{ ...caps, color: L.muted, marginBottom: 6 }}>{label}</div>{node}</div>
  );
  const tile = (on: boolean, color: string): React.CSSProperties => ({ textAlign: "left", padding: "11px 12px", cursor: "pointer", border: `1px solid ${on ? "#fff" : L.hairline}`, background: on ? "#161617" : "#0f0f10", color: "#fff", display: "flex", gap: 10, alignItems: "center", boxShadow: on ? "inset 0 0 0 1px #fff" : "none", borderLeft: `6px solid ${color}` });

  const preview = useMemo(() => ({
    id: "preview", label: form.label || (isCard ? "Card name" : "New entry"), category: form.category || null,
    website: form.website, username: form.username, secret: form.secret, notes: form.notes,
    card_name: form.cardName, card_brand: form.cardBrand || null, card_number: form.cardNumber, card_exp: form.cardExp, card_pin: form.cardPin,
  }), [form, isCard]);

  const canSave = !!form.label.trim() && !!form.category.trim();

  return (
    <FullscreenModal open={open} title={editing ? "Edit entry" : "New entry"} onClose={onCancel}
      footer={
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ flex: 1, padding: "14px 0", border: `1px solid ${L.hairline}`, background: "#0f0f10", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Cancel</button>
          <button type="button" aria-busy={busy} onClick={onSave} disabled={busy || !canSave} style={{ flex: 2, padding: "14px 0", border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: canSave ? 1 : 0.5 }}>{busy ? "Saving…" : "Save to Vault"}</button>
        </div>
      }>
      <div style={{ ...caps, color: L.muted, marginBottom: 8 }}>Kind</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: customOpen ? 8 : 14 }}>
        {KINDS.map((k) => (
          <button key={k.id} type="button" onClick={() => { set({ category: k.id }); setCustomOpen(false); }} style={tile(form.category === k.id, shadeFor(k.id).bg)}>
            <span><span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{k.label}</span><span style={{ display: "block", fontSize: 11, color: L.muted }}>{k.sub}</span></span>
          </button>
        ))}
        <button type="button" onClick={() => { setCustomOpen(true); if (knownKind) set({ category: "" }); }} style={{ ...tile(customOpen, shadeFor(customOpen && form.category ? form.category : "Custom").bg), gridColumn: "1 / -1" }}>
          <span><span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>Your own category</span><span style={{ display: "block", fontSize: 11, color: L.muted }}>Rail yard, bank, anything</span></span>
        </button>
      </div>
      {customOpen && <div style={{ marginBottom: 14 }}><input value={form.category} onChange={(e) => set({ category: e.target.value })} placeholder="Category name" style={input} /></div>}

      {form.category && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...caps, color: L.muted, marginBottom: 8 }}>Preview</div>
          {isCard ? (
            <CardFace e={{ ...preview, card_number: form.cardNumber }} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: sh.bg, border: sh.border, color: sh.fg }}>
              <Monogram e={preview} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.label}</span>
                <span style={{ display: "block", fontSize: 12, color: sh.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.username || form.website || "Username or website"}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {field("Name for this entry", <input value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder={isCard ? "e.g. Comdata, Chase Visa" : "e.g. ELD login, Company Slack"} style={input} autoComplete="off" />)}

      {isCard ? (
        <>
          {field("Card type", (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CARD_BRANDS.map((b) => (
                <button key={b} type="button" onClick={() => set({ cardBrand: b })} style={{ padding: "9px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${form.cardBrand === b ? "#fff" : L.hairline}`, background: form.cardBrand === b ? "#fff" : "#0f0f10", color: form.cardBrand === b ? "#000" : "rgba(255,255,255,0.8)" }}>{b}</button>
              ))}
            </div>
          ))}
          {field("Card number", <input value={groupCard(form.cardNumber, form.cardBrand)} inputMode="numeric" autoComplete="off" onChange={(e) => set({ cardNumber: e.target.value.replace(/\D/g, "").slice(0, 19) })} placeholder="•••• •••• •••• ••••" style={{ ...input, fontFamily: "monospace", letterSpacing: 1 }} />)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {field("Expires (MM/YY)", <input value={form.cardExp} inputMode="numeric" autoComplete="off" maxLength={5} onChange={(e) => set({ cardExp: fmtExp(e.target.value) })} placeholder="08/28" style={{ ...input, fontFamily: "monospace" }} />)}
            {field("PIN", <input value={form.cardPin} inputMode="numeric" autoComplete="off" type={showPw ? "text" : "password"} onChange={(e) => set({ cardPin: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="Optional" style={{ ...input, fontFamily: "monospace" }} />)}
          </div>
          {field("Name on card", <input value={form.cardName} onChange={(e) => set({ cardName: e.target.value })} autoCapitalize="characters" autoComplete="off" style={input} />)}
        </>
      ) : (
        <>
          {field("Website", <input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="e.g. transflo.com" autoCapitalize="none" autoComplete="off" style={input} />)}
          {field("Username or ID", <input value={form.username} onChange={(e) => set({ username: e.target.value })} autoCapitalize="none" autoComplete="off" style={input} />)}
          {field("Password", (
            <div>
              <input value={form.secret} onChange={(e) => set({ secret: e.target.value })} type={showPw ? "text" : "password"} autoComplete="off" placeholder="Password, PIN or account #" style={{ ...input, fontFamily: "monospace" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setShowPw((v) => !v)} style={{ ...caps, padding: "8px 10px", border: `1px solid ${L.hairline}`, background: "#0f0f10", color: "rgba(255,255,255,0.85)", cursor: "pointer" }}>{showPw ? "Hide" : "Show"}</button>
                <button type="button" onClick={() => { set({ secret: generatePassword() }); setShowPw(true); }} style={{ ...caps, padding: "8px 10px", border: `1px solid ${L.hairline}`, background: "#0f0f10", color: "rgba(255,255,255,0.85)", cursor: "pointer" }}>Make a strong one</button>
              </div>
            </div>
          ))}
        </>
      )}

      {field("Notes", <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={3} style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />)}
      <div style={{ fontSize: 11, color: L.muted, marginBottom: 6 }}>Everything on this screen is scrambled on this phone before it is saved.</div>
      {error && <div style={{ color: "#fca5a5", fontSize: 13, marginTop: 8 }}>{error}</div>}
    </FullscreenModal>
  );
}
