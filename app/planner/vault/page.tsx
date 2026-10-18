"use client";
// app/planner/vault/page.tsx
//
// A private, pattern-gated notebook for whatever a driver needs to keep
// track of that doesn't fit anywhere else in the app -- dispatch software,
// Transflo, truck tablet login, employee number, company purchase account
// IDs, credit cards, 401k, other company website logins, fuel cards, ELD,
// Slack, email, etc. Strictly private per driver (vault_entries/
// user_vault_pin/vault_reset_tokens are all user_id-scoped, never company-
// scoped) -- unlike almost everything else in this app, nothing here is
// shared with teammates or admins.
//
// 2026-09-02 redesign, per explicit direction:
// - The numeric PIN was replaced with a Samsung-style dot-pattern
//   (PatternLock.tsx) -- same security model as before (a hash compared
//   client-side, not real encryption; real auth is the actual boundary),
//   just a different thing to draw instead of type. user_vault_pin.pin_hash
//   is reused as-is, now hashing a joined dot-path string instead of a
//   typed PIN -- no column rename, this is cosmetic only.
// - The old "Forgot PIN -> instantly pick a new one, no verification at
//   all" bypass is replaced with a real email-confirmation flow
//   (app/api/vault/request-reset + confirm-reset) that never touches
//   vault_entries or writes user_vault_pin itself -- it only issues/
//   validates a one-time token; the client performs the actual pattern
//   upsert afterward through the same authenticated path pattern-setup
//   always used. Landing on this page with a reset link never auto-
//   consumes the token on page load (a bare GET, which an email client's
//   own link-scanner could trigger) -- only an explicit tap does that,
//   the same lesson this codebase has already learned three times for
//   magic links (see CLAUDE.md's login-reliability history).
// - Two first-class categories, Work (light card, black text) and
//   Personal (dark card, white text -- the app's existing look, made
//   explicit), plus free-typed custom categories (same dark styling as
//   Personal -- deliberately not a third color scheme). Entries are now
//   grouped by category instead of one flat list.
// - Fields reordered to read like a real password manager: Label,
//   Website (new), Username, Password, Category, Notes.
// - 2026-10-15: two card categories, Company Card and Personal Card, with card
//   fields (name on card, type, number, exp, PIN) instead of website/username/
//   password. The fuel screen offers only these as payment options.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { supabase } from "@/lib/supabase/client";
import PatternLock, { LockIcon } from "./PatternLock";
import { CARD_BRANDS, COMPANY_CARD, PERSONAL_CARD, groupCard, isCardCategory, maskCard } from "@/lib/vault/cards";

type VaultEntryRow = {
  id: string;
  label: string;
  category: string | null;
  website: string | null;
  username: string | null;
  secret: string | null;
  notes: string | null;
  updated_at: string;
  card_name?: string | null;
  card_brand?: string | null;
  card_number?: string | null;
  card_exp?: string | null;
  card_pin?: string | null;
};

const UNLOCK_KEY = "protankr_vault_unlocked_v1";

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, padding: "12px 14px",
  border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)",
  color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 6, display: "block",
};
const errorStyle: React.CSSProperties = { color: "#fca5a5", fontSize: 13, marginBottom: 12, textAlign: "center" as const };
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)",
  textTransform: "uppercase" as const, letterSpacing: 0.6, marginBottom: 8, marginTop: 4,
};

// Card theme, keyed off category -- the one place Work's light-card
// exception (and Personal/custom's shared dark styling) is defined, so
// every other bit of this file just reads from one object instead of
// scattering `category === "Work" ? ... : ...` everywhere.
function themeFor(category: string | null | undefined) {
  const isWork = category === "Work";
  return {
    isWork,
    cardBg: isWork ? "#f7f6f2" : "rgba(255,255,255,0.03)",
    cardBorder: isWork ? "1px solid rgba(0,0,0,0.10)" : "1px solid rgba(255,255,255,0.10)",
    text: isWork ? "#111111" : "#ffffff",
    subtext: isWork ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.45)",
    pillBg: isWork ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)",
    pillText: isWork ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.55)",
    secretText: isWork ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.85)",
    notesText: isWork ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)",
    btnBg: isWork ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
    btnBorder: isWork ? "1px solid rgba(0,0,0,0.14)" : "1px solid rgba(255,255,255,0.14)",
    showHideBg: isWork ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
    showHideBorder: isWork ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.12)",
    showHideText: isWork ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)",
    dangerBg: isWork ? "rgba(190,30,30,0.08)" : "rgba(180,40,40,0.10)",
    dangerBorder: isWork ? "1px solid rgba(190,30,30,0.35)" : "1px solid rgba(220,60,60,0.4)",
    dangerText: isWork ? "#b91c1c" : "#fca5a5",
    dangerConfirmBg: isWork ? "rgba(185,28,28,0.9)" : "rgba(180,40,40,0.25)",
    dangerConfirmBorder: isWork ? "1px solid rgba(150,20,20,0.6)" : "1px solid rgba(220,60,60,0.5)",
  };
}

function CategoryChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        flex: 1, fontSize: 12, fontWeight: 700, cursor: "pointer", borderRadius: 2, padding: "9px 0",
        color: active ? "#000" : "rgba(255,255,255,0.6)",
        background: active ? "#fff" : "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {label}
    </button>
  );
}

type EntryGroup = { key: string; label: string; entries: VaultEntryRow[] };

type Phase = "loading" | "create" | "locked" | "unlocked" | "reset-sent" | "reset-confirm";

export default function VaultPage() {
  const shell = useCalculatorShell();
  const userId = shell.effectiveUserId;

  const [phase, setPhase] = useState<Phase>("loading");
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [busy, setBusy] = useState(false);

  // Email-recovery flow state
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetConfirmError, setResetConfirmError] = useState<string | null>(null);
  const [resetConfirmBusy, setResetConfirmBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  const [entries, setEntries] = useState<VaultEntryRow[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fLabel, setFLabel] = useState("");
  const [fWebsite, setFWebsite] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fCategoryCustomOpen, setFCategoryCustomOpen] = useState(false);
  const [fUsername, setFUsername] = useState("");
  const [fSecret, setFSecret] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fCardName, setFCardName] = useState("");
  const [fCardBrand, setFCardBrand] = useState("");
  const [fCardNumber, setFCardNumber] = useState("");
  const [fCardExp, setFCardExp] = useState("");
  const [fCardPin, setFCardPin] = useState("");

  // resetTokenRef mirrors resetToken state but is read (not reacted to) by
  // the lock-resolution effect below -- see that effect's own comment for
  // why a ref instead of the state itself is what determines whether the
  // reset-confirm screen shows.
  const resetTokenRef = useRef<string | null>(null);

  // ── Detect a one-time reset link on mount ─────────────────────────────────
  // Deliberately does NOT call confirm-reset here -- only capture the raw
  // token and strip it from the visible URL. The actual verification only
  // fires from an explicit tap on the reset-confirm screen below.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("resetToken");
      if (t) {
        resetTokenRef.current = t;
        setResetToken(t);
        params.delete("resetToken");
        const rest = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
      }
    } catch {}
  }, []);

  // Shared DB-driven resolution -- also called directly from cancelReset()
  // below, not just this effect.
  async function resolveLockState() {
    if (!userId) return;
    const { data } = await supabase.from("user_vault_pin").select("pin_hash").eq("user_id", userId).maybeSingle();
    if (!data) { setPhase("create"); return; }
    setPinHash(data.pin_hash);
    let unlocked = false;
    try { unlocked = sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch {}
    setPhase(unlocked ? "unlocked" : "locked");
  }

  // ── Resolve lock state ────────────────────────────────────────────────────
  // Deliberately keyed on `[userId]` only, NOT `resetToken` -- a real bug,
  // found live: confirmResetTap() (below) clears resetToken as part of
  // moving to phase "create" so a fresh pattern can be drawn. With
  // `resetToken` in this effect's dependency array, that clear re-ran this
  // effect, which (since a pin_hash row from BEFORE the reset still exists
  // in the DB) immediately queried it and overwrote the just-set "create"
  // phase back to "locked" -- the user saw the reset-confirm screen, tapped
  // Continue, and landed straight back on a lock screen instead of ever
  // getting to draw a new pattern. Reading resetTokenRef (set synchronously
  // by the effect above, on the very first commit, before this effect's own
  // first run) instead of the resetToken *state* means later clearing that
  // state can no longer re-trigger this branch -- the reset-confirm ->
  // create -> unlocked sequence is now driven entirely by explicit phase
  // transitions in confirmResetTap()/handlePatternSet(), never re-derived
  // from the DB mid-flow.
  useEffect(() => {
    if (!userId) return;
    if (resetTokenRef.current) { setPhase("reset-confirm"); return; }
    void resolveLockState();
  }, [userId]);

  async function fetchEntries() {
    setEntriesLoading(true);
    const { data } = await supabase.from("vault_entries").select("*").eq("user_id", userId).order("label");
    setEntries((data ?? []) as VaultEntryRow[]);
    setEntriesLoading(false);
  }

  useEffect(() => {
    if (phase !== "unlocked" || !userId) return;
    void fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, userId]);

  // ── Pattern set / verify ──────────────────────────────────────────────────

  async function handlePatternSet(path: number[]) {
    setPinError(null);
    setBusy(true);
    try {
      const hash = await sha256Hex(path.join("-"));
      const { error } = await supabase
        .from("user_vault_pin")
        .upsert({ user_id: userId, pin_hash: hash, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch {}
      setPinHash(hash);
      setForgotMode(false);
      setPhase("unlocked");
    } catch (e: any) {
      setPinError(e?.message ?? "Failed to save pattern.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyAttempt(path: number[]) {
    setPinError(null);
    setBusy(true);
    try {
      const hash = await sha256Hex(path.join("-"));
      if (hash !== pinHash) { setPinError("Incorrect pattern."); return; }
      try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch {}
      setPhase("unlocked");
    } finally {
      setBusy(false);
    }
  }

  function lockNow() {
    try { sessionStorage.removeItem(UNLOCK_KEY); } catch {}
    setRevealed({});
    setExpandedId(null);
    setPhase("locked");
  }

  // ── Email-confirmed recovery ──────────────────────────────────────────────

  async function requestReset() {
    setRequestBusy(true);
    setRequestError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Not signed in.");
      const res = await fetch("/api/vault/request-reset", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to send reset email.");
      setMaskedEmail(json.maskedEmail ?? null);
      setPhase("reset-sent");
    } catch (e: any) {
      setRequestError(e?.message ?? "Failed to send reset email.");
    } finally {
      setRequestBusy(false);
    }
  }

  async function confirmResetTap() {
    setResetConfirmBusy(true);
    setResetConfirmError(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Not signed in.");
      const res = await fetch("/api/vault/confirm-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ resetToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to confirm reset.");
      resetTokenRef.current = null;
      setResetToken(null);
      setForgotMode(true);
      setPinHash(null);
      setPhase("create");
    } catch (e: any) {
      setResetConfirmError(e?.message ?? "Failed to confirm reset.");
    } finally {
      setResetConfirmBusy(false);
    }
  }

  function cancelReset() {
    resetTokenRef.current = null;
    setResetToken(null);
    setResetConfirmError(null);
    void resolveLockState();
  }

  // ── Entry CRUD ─────────────────────────────────────────────────────────────

  function openAddForm() {
    setEditingId(null);
    setFLabel(""); setFWebsite(""); setFCategory(""); setFCategoryCustomOpen(false);
    setFUsername(""); setFSecret(""); setFNotes("");
    setFCardName(""); setFCardBrand(""); setFCardNumber(""); setFCardExp(""); setFCardPin("");
    setFormError(null);
    setFormOpen(true);
  }
  function openEditForm(e: VaultEntryRow) {
    setEditingId(e.id);
    setFLabel(e.label); setFWebsite(e.website ?? "");
    const cat = e.category ?? "";
    setFCategory(cat);
    setFCategoryCustomOpen(!!cat && cat !== "Work" && cat !== "Personal" && !isCardCategory(cat));
    setFCardName(e.card_name ?? ""); setFCardBrand(e.card_brand ?? ""); setFCardNumber(e.card_number ?? "");
    setFCardExp(e.card_exp ?? ""); setFCardPin(e.card_pin ?? "");
    setFUsername(e.username ?? "");
    setFSecret(e.secret ?? ""); setFNotes(e.notes ?? "");
    setFormError(null);
    setFormOpen(true);
  }

  async function saveEntry() {
    if (!fLabel.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      const isCard = isCardCategory(fCategory);
      const payload = {
        label: fLabel.trim(), category: fCategory.trim() || null, notes: fNotes.trim() || null,
        website: isCard ? null : fWebsite.trim() || null,
        username: isCard ? null : fUsername.trim() || null,
        secret: isCard ? null : fSecret || null,
        card_name: isCard ? fCardName.trim() || null : null,
        card_brand: isCard ? fCardBrand || null : null,
        card_number: isCard ? fCardNumber.replace(/\D/g, "") || null : null,
        card_exp: isCard ? fCardExp.trim() || null : null,
        card_pin: isCard ? fCardPin.trim() || null : null,
      };
      if (editingId) {
        const { error } = await supabase.from("vault_entries").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vault_entries").insert({ user_id: userId, ...payload });
        if (error) throw error;
      }
      setFormOpen(false);
      await fetchEntries();
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to save entry.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: string) {
    setBusy(true);
    setListError(null);
    try {
      const { error } = await supabase.from("vault_entries").delete().eq("id", id);
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setConfirmDeleteId(null);
      setExpandedId(null);
    } catch (e: any) {
      setListError(e?.message ?? "Failed to delete entry.");
    } finally {
      setBusy(false);
    }
  }

  // ── Grouping ───────────────────────────────────────────────────────────────

  const groups = useMemo<EntryGroup[]>(() => {
    const work: VaultEntryRow[] = [];
    const personal: VaultEntryRow[] = [];
    const companyCards: VaultEntryRow[] = [];
    const personalCards: VaultEntryRow[] = [];
    const customMap = new Map<string, VaultEntryRow[]>();
    const uncategorized: VaultEntryRow[] = [];
    for (const e of entries) {
      if (e.category === "Work") work.push(e);
      else if (e.category === "Personal") personal.push(e);
      else if (e.category === COMPANY_CARD) companyCards.push(e);
      else if (e.category === PERSONAL_CARD) personalCards.push(e);
      else if (e.category) {
        const list = customMap.get(e.category) ?? [];
        list.push(e);
        customMap.set(e.category, list);
      } else uncategorized.push(e);
    }
    const out: EntryGroup[] = [];
    if (work.length) out.push({ key: "Work", label: "Work", entries: work });
    if (personal.length) out.push({ key: "Personal", label: "Personal", entries: personal });
    if (companyCards.length) out.push({ key: COMPANY_CARD, label: "Company Cards", entries: companyCards });
    if (personalCards.length) out.push({ key: PERSONAL_CARD, label: "Personal Cards", entries: personalCards });
    for (const key of Array.from(customMap.keys()).sort((a, b) => a.localeCompare(b))) {
      out.push({ key, label: key, entries: customMap.get(key)! });
    }
    if (uncategorized.length) out.push({ key: "Uncategorized", label: "Uncategorized", entries: uncategorized });
    return out;
  }, [entries]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === "loading") return null;

  if (phase === "reset-confirm") {
    return (
      <div style={{ maxWidth: 340, margin: "60px auto 0", padding: "0 4px", textAlign: "center" as const }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><LockIcon size={32} /></div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 10 }}>Reset your Vault pattern?</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 1.5 }}>
          Continuing will let you draw a new unlock pattern. Your saved logins and passwords are never affected either way.
        </div>
        {resetConfirmError && <div style={errorStyle}>{resetConfirmError}</div>}
        <button onClick={confirmResetTap} disabled={resetConfirmBusy} style={{ width: "100%", padding: "13px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
          {resetConfirmBusy ? "Confirming…" : "Continue"}
        </button>
        {resetConfirmError && (
          <button onClick={requestReset} disabled={requestBusy} style={{ width: "100%", padding: "13px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
            {requestBusy ? "Sending…" : "Send another email"}
          </button>
        )}
        <button onClick={cancelReset} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
          Cancel
        </button>
      </div>
    );
  }

  if (phase === "reset-sent") {
    return (
      <div style={{ maxWidth: 320, margin: "60px auto 0", padding: "0 4px", textAlign: "center" as const }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><LockIcon size={32} /></div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 10 }}>Check your email</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24, lineHeight: 1.5 }}>
          We sent a reset link to {maskedEmail ?? "your email"}. Open it on this device to set a new pattern.
        </div>
        <button onClick={() => setPhase("locked")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 2, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "12px 0", width: "100%" }}>
          Back
        </button>
      </div>
    );
  }

  if (phase === "create") {
    return (
      <div style={{ maxWidth: 340, margin: "40px auto 0", padding: "0 4px", textAlign: "center" as const }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><LockIcon size={28} /></div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
          {forgotMode ? "Set a new Vault pattern" : "Create a Vault pattern"}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 1.5 }}>
          Connect at least 4 dots to set your pattern. This is a simple lock, not encryption — anyone already past your device login can already reach everything else in the app.
        </div>
        {pinError && <div style={errorStyle}>{pinError}</div>}
        <PatternLock mode="confirm" onComplete={handlePatternSet} disabled={busy} />
      </div>
    );
  }

  if (phase === "locked") {
    return (
      <div style={{ maxWidth: 320, margin: "50px auto 0", padding: "0 4px", textAlign: "center" as const }}>
        <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}><LockIcon size={32} /></div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 20 }}>Vault Locked</div>
        {pinError && <div style={errorStyle}>{pinError}</div>}
        <PatternLock mode="verify" onComplete={handleVerifyAttempt} disabled={busy} />
        <button onClick={requestReset} disabled={requestBusy} style={{ marginTop: 20, background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
          {requestBusy ? "Sending…" : "Forgot Pattern?"}
        </button>
        {requestError && <div style={{ ...errorStyle, marginTop: 10 }}>{requestError}</div>}
      </div>
    );
  }

  // unlocked
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </div>
        <button onClick={lockNow} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <LockIcon size={13} color="rgba(255,255,255,0.45)" /> Lock
        </button>
      </div>

      <button
        onClick={openAddForm}
        style={{ width: "100%", padding: "12px 0", borderRadius: 2, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}
      >
        + Add entry
      </button>

      {listError && <div style={errorStyle}>{listError}</div>}

      {entriesLoading && <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20 }}>Loading…</div>}

      {!entriesLoading && entries.length === 0 && (
        <div style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "40px 20px", lineHeight: 1.5 }}>
          Nothing saved yet.<br />Add logins, account numbers, anything you need to keep track of.
        </div>
      )}

      {groups.map((group) => (
        <div key={group.key} style={{ marginBottom: 18 }}>
          <div style={sectionHeaderStyle}>{group.label}</div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
            {group.entries.map((e) => {
              const isExpanded = expandedId === e.id;
              const isRevealed = !!revealed[e.id];
              const t = themeFor(e.category);
              return (
                <div key={e.id} style={{ borderRadius: 2, border: t.cardBorder, background: t.cardBg, overflow: "hidden" }}>
                  <div onClick={() => setExpandedId(isExpanded ? null : e.id)} style={{ padding: 14, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {e.label}
                        </div>
                        {isCardCategory(e.category) ? (
                          <div style={{ fontSize: 12, color: t.subtext, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                            {[e.card_brand, maskCard(e.card_number, e.card_brand)].filter(Boolean).join(" ")}
                          </div>
                        ) : e.username && (
                          <div style={{ fontSize: 12, color: t.subtext, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                            {e.username}
                          </div>
                        )}
                      </div>
                      {e.category && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: t.pillText, background: t.pillBg, borderRadius: 2, padding: "3px 9px", flexShrink: 0, whiteSpace: "nowrap" as const }}>
                          {e.category}
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: 12 }} onClick={(ev) => ev.stopPropagation()}>
                        {isCardCategory(e.category) && (() => {
                          const row = (k: string, shown: string, hidden: string | null) => (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                              <div style={{ fontSize: 13, color: t.secretText, minWidth: 0 }}>
                                <span style={{ color: t.subtext }}>{k} </span>
                                <span style={{ fontFamily: "monospace", letterSpacing: 0.5 }}>{isRevealed || hidden == null ? shown : hidden}</span>
                              </div>
                            </div>
                          );
                          return (
                            <>
                              {e.card_name && row("Name", e.card_name, null)}
                              {e.card_number && row("Number", groupCard(e.card_number, e.card_brand), maskCard(e.card_number, e.card_brand))}
                              {e.card_exp && row("Exp", e.card_exp, null)}
                              {e.card_pin && row("PIN", e.card_pin, "•".repeat(e.card_pin.length))}
                              {(e.card_number || e.card_pin) && (
                                <button onClick={() => setRevealed((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
                                  style={{ fontSize: 11, fontWeight: 700, color: t.showHideText, background: t.showHideBg, border: t.showHideBorder, borderRadius: 2, padding: "5px 10px", cursor: "pointer", marginBottom: 10 }}>
                                  {isRevealed ? "Hide" : "Show number & PIN"}
                                </button>
                              )}
                            </>
                          );
                        })()}
                        {e.website && (
                          <div style={{ fontSize: 13, color: t.subtext, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                            {e.website}
                          </div>
                        )}
                        {e.secret && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: t.secretText, fontFamily: "monospace", letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                              {isRevealed ? e.secret : "•".repeat(Math.min(14, Math.max(6, e.secret.length)))}
                            </div>
                            <button
                              onClick={() => setRevealed((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
                              style={{ fontSize: 11, fontWeight: 700, color: t.showHideText, background: t.showHideBg, border: t.showHideBorder, borderRadius: 2, padding: "5px 10px", cursor: "pointer", flexShrink: 0 }}
                            >
                              {isRevealed ? "Hide" : "Show"}
                            </button>
                          </div>
                        )}
                        {e.notes && (
                          <div style={{ fontSize: 13, color: t.notesText, lineHeight: 1.5, whiteSpace: "pre-wrap" as const, marginBottom: 12 }}>
                            {e.notes}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => openEditForm(e)} style={{ flex: 1, padding: "9px 0", borderRadius: 2, border: t.btnBorder, background: t.btnBg, color: t.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            Edit
                          </button>
                          {confirmDeleteId === e.id ? (
                            <button onClick={() => deleteEntry(e.id)} disabled={busy} style={{ flex: 1, padding: "9px 0", borderRadius: 2, border: t.dangerConfirmBorder, background: t.dangerConfirmBg, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                              {busy ? "Deleting…" : "Confirm delete"}
                            </button>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(e.id)} style={{ flex: 1, padding: "9px 0", borderRadius: 2, border: t.dangerBorder, background: t.dangerBg, color: t.dangerText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {formOpen && (
        <div onClick={() => setFormOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.10)", borderBottom: "none", padding: "20px 18px 28px", maxHeight: "85dvh", overflowY: "auto" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 16 }}>
              {editingId ? "Edit Entry" : "New Entry"}
            </div>

            <label style={labelStyle}>Label</label>
            <input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder={isCardCategory(fCategory) ? "e.g. Comdata, Chase Visa" : "e.g. ELD Login, Company Slack"} style={{ ...inputStyle, marginBottom: 14 }} />

            <label style={labelStyle}>Category (optional)</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: fCategoryCustomOpen ? 8 : 14 }}>
              <CategoryChip active={fCategory === "Work"} label="Work" onClick={() => { setFCategory("Work"); setFCategoryCustomOpen(false); }} />
              <CategoryChip active={fCategory === "Personal"} label="Personal" onClick={() => { setFCategory("Personal"); setFCategoryCustomOpen(false); }} />
              <CategoryChip
                active={fCategoryCustomOpen}
                label="+ Custom"
                onClick={() => { setFCategoryCustomOpen(true); if (fCategory === "Work" || fCategory === "Personal" || isCardCategory(fCategory)) setFCategory(""); }}
              />
              <CategoryChip active={fCategory === COMPANY_CARD} label="Company Card" onClick={() => { setFCategory(COMPANY_CARD); setFCategoryCustomOpen(false); }} />
              <CategoryChip active={fCategory === PERSONAL_CARD} label="Personal Card" onClick={() => { setFCategory(PERSONAL_CARD); setFCategoryCustomOpen(false); }} />
            </div>
            {fCategoryCustomOpen && (
              <input value={fCategory} onChange={(e) => setFCategory(e.target.value)} placeholder="Custom category name" style={{ ...inputStyle, marginBottom: 14 }} />
            )}

            {isCardCategory(fCategory) ? (
              <>
                <label style={labelStyle}>Name on card</label>
                <input value={fCardName} onChange={(e) => setFCardName(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
                <label style={labelStyle}>Card type</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {CARD_BRANDS.map((b) => <CategoryChip key={b} active={fCardBrand === b} label={b} onClick={() => setFCardBrand(b)} />)}
                </div>
                <label style={labelStyle}>Card number</label>
                <input value={fCardNumber} inputMode="numeric" autoComplete="off" onChange={(e) => setFCardNumber(e.target.value)} style={{ ...inputStyle, marginBottom: 14, fontFamily: "monospace" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Exp (MM/YY)</label>
                    <input value={fCardExp} inputMode="numeric" placeholder="08/28" maxLength={5} onChange={(e) => setFCardExp(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
                  </div>
                  <div>
                    <label style={labelStyle}>PIN</label>
                    <input value={fCardPin} inputMode="numeric" autoComplete="off" onChange={(e) => setFCardPin(e.target.value)} style={{ ...inputStyle, marginBottom: 14, fontFamily: "monospace" }} />
                  </div>
                </div>
              </>
            ) : (
              <>
            <label style={labelStyle}>Website (optional)</label>
            <input value={fWebsite} onChange={(e) => setFWebsite(e.target.value)} placeholder="e.g. transflo.com" style={{ ...inputStyle, marginBottom: 14 }} />

            <label style={labelStyle}>Username / ID (optional)</label>
            <input value={fUsername} onChange={(e) => setFUsername(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />

            <label style={labelStyle}>Password (optional)</label>
            <input value={fSecret} onChange={(e) => setFSecret(e.target.value)} placeholder="Password, PIN, or account #" style={{ ...inputStyle, marginBottom: 14, fontFamily: "monospace" }} />

              </>
            )}

            <label style={labelStyle}>Notes (optional)</label>
            <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} style={{ ...inputStyle, minHeight: 80, fontFamily: "inherit", resize: "vertical" as const, marginBottom: 20 }} />

            {formError && <div style={{ ...errorStyle, marginBottom: 14 }}>{formError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setFormOpen(false)} disabled={busy} style={{ flex: 1, padding: "13px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={saveEntry} disabled={busy || !fLabel.trim()} style={{ flex: 1, padding: "13px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: fLabel.trim() ? 1 : 0.5 }}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
