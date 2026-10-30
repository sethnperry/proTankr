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
import { LockIcon } from "./PatternLock";
import { VaultDetails } from "./VaultDetails";
import { createVault, getKeyRow, openRows, passphraseProblem, recoverVault, unlockVault, eraseVault, vaultKeyFromPassphrase } from "@/lib/vault/client";
import { bioDeclined, bioEnrolled, bioSupported, declineBio, enrollBio, removeBio, unlockWithBio } from "@/lib/vault/biometric";
import { getVaultKey, onVaultKeyChange, setVaultKey } from "@/lib/vault/session";
import { sealEntry } from "@/lib/vault/entries";
import { CARD_BRANDS, COMPANY_CARD, PERSONAL_CARD, cardExpIso, groupCard, isCardCategory, maskCard, maskCardGroups } from "@/lib/vault/cards";
import { shadeFor } from "@/lib/vault/grays";
import { CLIPBOARD_CLEAR_MS, fmtWait, recordFailure, waitLeft, type FailState } from "@/lib/vault/guard";
import { EXPIRY_COLOR, EXPIRY_PRINT_COLOR, expiryStateFor } from "@/lib/expiry";
import { WalletOverlay } from "../components/wallet/WalletOverlay";

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
  const sh = shadeFor(category);
  const isWork = sh.fg !== "#ffffff"; // a light shade: dark text and controls
  return {
    isWork,
    cardBg: sh.bg,
    cardBorder: sh.border,
    text: sh.fg,
    subtext: sh.sub,
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

type Phase = "loading" | "setup" | "show-code" | "offer-bio" | "locked" | "recover" | "erase" | "unlocked";

export default function VaultPage() {
  const shell = useCalculatorShell();
  const userId = shell.effectiveUserId;

  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [codeSaved, setCodeSaved] = useState(false);
  const [eraseText, setEraseText] = useState("");
  // Fingerprint/face unlock (see lib/vault/biometric.ts)
  const [bioOk, setBioOk] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [bioPass, setBioPass] = useState("");
  const bioTried = useRef(false);
  useEffect(() => { void bioSupported().then(setBioOk); }, []);
  useEffect(() => { if (userId) setBioOn(bioEnrolled(userId)); }, [userId, phase]);

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

  // Which screen: no key set up yet, locked, or open (the key is in memory only; see lib/vault/session.ts).
  async function resolveLockState() {
    if (!userId) return;
    try {
      const row = await getKeyRow(userId);
      if (!row) { setPhase("setup"); return; }
      setPhase(getVaultKey() ? "unlocked" : "locked");
    } catch (e: any) {
      setLockError(e?.message ?? "Couldn't reach your Vault.");
      setPhase("locked");
    }
  }
  useEffect(() => { void resolveLockState(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the key is cleared (idle, background, Lock), clear what's on screen and go back to the lock screen.
  useEffect(() => onVaultKeyChange(() => {
    if (getVaultKey()) return;
    setEntries([]); setRevealed({}); setExpandedId(null); setFormOpen(false); setPass1(""); setPass2("");
    setPhase((p) => (p === "unlocked" ? "locked" : p));
  }), []);

  async function fetchEntries() {
    setEntriesLoading(true);
    const { data } = await supabase.from("vault_entries").select("*").eq("user_id", userId).order("label");
    const opened = await openRows(getVaultKey(), (data ?? []) as any[]);
    setEntries(opened as unknown as VaultEntryRow[]);
    setEntriesLoading(false);
  }
  useEffect(() => {
    if (phase !== "unlocked" || !userId) return;
    void fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, userId]);

  // Wrong passphrases in a row (kept on this phone): a growing wait after five.
  const FAIL_KEY = "protankr_vault_fail_v1";
  const [fails, setFails] = useState<FailState>({ count: 0, until: 0 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    try { const raw = localStorage.getItem(FAIL_KEY); if (raw) setFails(JSON.parse(raw) as FailState); } catch { /* none */ }
  }, []);
  function saveFails(f: FailState) { setFails(f); try { localStorage.setItem(FAIL_KEY, JSON.stringify(f)); } catch { /* ignore */ } }
  const waitMs = waitLeft(fails, now);
  useEffect(() => {
    if (waitMs <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [waitMs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // On the lock screen, offer the fingerprint right away when it's set up on this phone.
  useEffect(() => {
    if (phase !== "locked" || !bioOn || bioTried.current || waitMs > 0) return;
    bioTried.current = true;
    void unlockBio();
  }, [phase, bioOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Set up / unlock / recover / erase ─────────────────────────────────────
  async function doSetup() {
    setLockError(null);
    if (pass1 !== pass2) { setLockError("The two passphrases don't match."); return; }
    const bad = passphraseProblem(pass1);
    if (bad) { setLockError(bad); return; }
    setBusy(true);
    try {
      const { recoveryCode: code } = await createVault(userId!, pass1);
      setRecoveryCode(code); setCodeSaved(false); setBioPass(pass1); setPass1(""); setPass2("");
      setPhase("show-code");
    } catch (e: any) { setLockError(e?.message ?? "Couldn't create the Vault."); }
    finally { setBusy(false); }
  }

  // After a passphrase unlock or set-up: offer fingerprint/face once, if this phone can and it isn't on yet.
  function afterUnlock(passUsed: string) {
    if (userId && bioOk && !bioEnrolled(userId) && !bioDeclined(userId)) { setBioPass(passUsed); setPhase("offer-bio"); }
    else setPhase("unlocked");
  }

  async function unlockBio() {
    if (!userId) return;
    setLockError(null); setBusy(true);
    try { await unlockWithBio(userId); setPhase("unlocked"); }
    catch (e: any) { setLockError(e?.message ?? "Fingerprint unlock didn't work."); setBioOn(bioEnrolled(userId)); }
    finally { setBusy(false); }
  }

  async function turnOnBio(pw: string) {
    if (!userId) return;
    setLockError(null); setBusy(true);
    try {
      const raw = await vaultKeyFromPassphrase(userId, pw);
      if (!raw) throw new Error("That passphrase didn't open the vault.");
      await enrollBio(userId, raw);
      setBioOn(true); setBioPass(""); setPhase("unlocked");
    } catch (e: any) { setLockError(e?.name === "NotAllowedError" ? "Fingerprint setup was cancelled." : (e?.message ?? "Couldn't turn on fingerprint unlock.")); }
    finally { setBusy(false); }
  }

  async function doUnlock() {
    setLockError(null);
    if (waitLeft(fails, Date.now()) > 0 || !pass1) return;
    setBusy(true);
    try {
      await unlockVault(userId!, pass1);
      saveFails({ count: 0, until: 0 });
      const used = pass1;
      setPass1("");
      afterUnlock(used);
    } catch (e: any) {
      const next = recordFailure(fails, Date.now());
      saveFails(next);
      setLockError(e?.message ?? "Couldn't unlock.");
    } finally { setBusy(false); }
  }

  async function doRecover() {
    setLockError(null);
    if (pass1 !== pass2) { setLockError("The two passphrases don't match."); return; }
    setBusy(true);
    try {
      const { recoveryCode: code } = await recoverVault(userId!, recoveryInput, pass1);
      setRecoveryCode(code); setCodeSaved(false); setBioPass(pass1); setPass1(""); setPass2(""); setRecoveryInput("");
      setPhase("show-code");
    } catch (e: any) { setLockError(e?.message ?? "Couldn't recover the Vault."); }
    finally { setBusy(false); }
  }

  async function doErase() {
    setLockError(null);
    if (eraseText.trim().toUpperCase() !== "ERASE") return;
    setBusy(true);
    try {
      await eraseVault(userId!);
      setEntries([]); setEraseText(""); setPass1(""); setPass2("");
      setPhase("setup");
    } catch (e: any) { setLockError(e?.message ?? "Couldn't erase the Vault."); }
    finally { setBusy(false); }
  }

  // Copy a secret, then clear the clipboard shortly after.
  const [copied, setCopied] = useState<string | null>(null);
  async function copySecret(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${what} copied. Clears in ${CLIPBOARD_CLEAR_MS / 1000}s.`);
      window.setTimeout(() => { void navigator.clipboard.writeText("").catch(() => {}); setCopied(null); }, CLIPBOARD_CLEAR_MS);
    } catch { setCopied("Couldn't copy."); window.setTimeout(() => setCopied(null), 3000); }
  }

  function lockNow() {
    setVaultKey(null);
    setPhase("locked");
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
      const vk = getVaultKey();
      if (!vk) throw new Error("The Vault is locked. Unlock it and try again.");
      const id = editingId ?? crypto.randomUUID();
      const sealed = await sealEntry(vk, id, {
        label: fLabel.trim(), category: fCategory.trim() || null,
        card_brand: isCard ? fCardBrand || null : null,
        card_exp: isCard ? fCardExp.trim() || null : null,
        notes: fNotes.trim() || null,
        website: isCard ? null : fWebsite.trim() || null,
        username: isCard ? null : fUsername.trim() || null,
        secret: isCard ? null : fSecret || null,
        card_name: isCard ? fCardName.trim() || null : null,
        card_number: isCard ? fCardNumber.replace(/\D/g, "") || null : null,
        card_pin: isCard ? fCardPin.trim() || null : null,
      });
      if (editingId) {
        const { error } = await supabase.from("vault_entries").update(sealed).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vault_entries").insert({ id, user_id: userId, ...sealed });
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

  const openEntry = entries.find((x) => x.id === expandedId) ?? null;

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

  const wrap: React.CSSProperties = { maxWidth: 360, margin: "40px auto 0", padding: "0 4px" };
  const title = (t: string) => <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", marginBottom: 10, textAlign: "center" }}>{t}</div>;
  const body = (t: React.ReactNode) => <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.55, marginBottom: 16 }}>{t}</div>;
  const btn = (label: string, onClick: () => void, o: { disabled?: boolean; danger?: boolean; busy?: boolean } = {}) => (
    <button type="button" aria-busy={!!o.busy} onClick={onClick} disabled={o.disabled || o.busy}
      style={{ width: "100%", padding: "13px 0", borderRadius: 2, border: "none", background: o.danger ? "#b91c1c" : "#fff", color: o.danger ? "#fff" : "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", opacity: o.disabled ? 0.5 : 1, marginBottom: 10 }}>{o.busy ? "Working…" : label}</button>
  );
  const link = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ display: "block", margin: "6px auto 0", background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>{label}</button>
  );
  const pwInput = (value: string, set: (v: string) => void, placeholder: string, onEnter?: () => void) => (
    <input type="password" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} autoComplete="off"
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }} style={{ ...inputStyle, marginBottom: 10 }} />
  );
  const lockIcon = <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><LockIcon size={32} /></div>;
  const errLine = lockError ? <div style={errorStyle}>{lockError}</div> : null;

  if (phase === "setup") {
    return (
      <div style={wrap}>
        {lockIcon}
        {title("Create your Vault")}
        {body(<>Only you can open this Vault. Your passphrase stays on this phone and is never sent to ProTankr, so <b style={{ color: "#fff" }}>nobody else can read what's inside, including us, your company and your admin.</b> The other side of that: <b style={{ color: "#fff" }}>if you lose both your passphrase and your recovery code, your entries are gone for good.</b></>)}
        {pwInput(pass1, setPass1, "Passphrase (a few words, 10+ characters)")}
        {pwInput(pass2, setPass2, "Type it again", doSetup)}
        {errLine}
        {btn("Create Vault", () => void doSetup(), { busy, disabled: !pass1 || !pass2 })}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Anything already saved here is encrypted when you create it.</div>
        <VaultDetails />
      </div>
    );
  }

  if (phase === "show-code") {
    return (
      <div style={wrap}>
        {lockIcon}
        {title("Your recovery code")}
        {body("This code is the only other way into your Vault. We can't show it again and can't look it up. Write it down or print it and keep it somewhere safe, away from this phone.")}
        <div style={{ fontFamily: "monospace", fontSize: 19, fontWeight: 800, letterSpacing: 1.5, color: "#fff", textAlign: "center", lineHeight: 1.7, padding: "14px 8px", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 4, marginBottom: 12, wordBreak: "break-word" }}>{recoveryCode}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button type="button" onClick={() => recoveryCode && void copySecret(recoveryCode, "Recovery code")} style={{ flex: 1, padding: "10px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Copy</button>
          <button type="button" onClick={() => window.print()} style={{ flex: 1, padding: "10px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Print</button>
        </div>
        {copied && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10, textAlign: "center" }}>{copied}</div>}
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#fff", marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={codeSaved} onChange={(e) => setCodeSaved(e.target.checked)} style={{ marginTop: 3 }} />
          I've saved my recovery code. I understand that without it and my passphrase, my entries can't be recovered by anyone.
        </label>
        {btn("Open my Vault", () => { setRecoveryCode(null); afterUnlock(bioPass || ""); }, { disabled: !codeSaved })}
      </div>
    );
  }

  if (phase === "offer-bio") {
    return (
      <div style={wrap}>
        {lockIcon}
        {title("Unlock with your fingerprint or face?")}
        {body("Next time, open the Vault with a touch instead of typing your passphrase. It only works on this phone, and your passphrase and recovery code still work.")}
        {!bioPass && pwInput(pass1, setPass1, "Vault passphrase")}
        {errLine}
        {btn("Turn on", () => void turnOnBio(bioPass || pass1), { busy, disabled: !bioPass && !pass1 })}
        {link("Not now", () => { if (userId) declineBio(userId); setBioPass(""); setPhase("unlocked"); })}
      </div>
    );
  }

  if (phase === "recover") {
    return (
      <div style={wrap}>
        {lockIcon}
        {title("Use your recovery code")}
        {body("Enter the code you saved, then choose a new passphrase. You'll get a new recovery code, and the old one stops working.")}
        <input value={recoveryInput} onChange={(e) => setRecoveryInput(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" style={{ ...inputStyle, marginBottom: 10, fontFamily: "monospace", letterSpacing: 1 }} />
        {pwInput(pass1, setPass1, "New passphrase")}
        {pwInput(pass2, setPass2, "Type it again", doRecover)}
        {errLine}
        {btn("Recover my Vault", () => void doRecover(), { busy, disabled: !recoveryInput || !pass1 || !pass2 })}
        {link("Back", () => { setLockError(null); setPhase("locked"); })}
      </div>
    );
  }

  if (phase === "erase") {
    return (
      <div style={wrap}>
        {lockIcon}
        {title("Erase your Vault?")}
        {body(<>This permanently deletes <b style={{ color: "#fff" }}>every entry</b> and your keys. It can't be undone and nobody, including us, can bring them back. You'll be able to start a new, empty Vault.</>)}
        <input value={eraseText} onChange={(e) => setEraseText(e.target.value)} placeholder='Type ERASE to confirm' autoComplete="off" style={{ ...inputStyle, marginBottom: 10 }} />
        {errLine}
        {btn("Erase everything", () => void doErase(), { danger: true, busy, disabled: eraseText.trim().toUpperCase() !== "ERASE" })}
        {link("Back", () => { setLockError(null); setEraseText(""); setPhase("locked"); })}
      </div>
    );
  }

  if (phase === "locked") {
    return (
      <div style={wrap}>
        {lockIcon}
        {title("Vault Locked")}
        {waitMs > 0 && <div style={errorStyle}>Too many wrong tries. Try again in {fmtWait(waitMs)}.</div>}
        {bioOn && btn("Unlock with fingerprint / face", () => void unlockBio(), { busy })}
        {pwInput(pass1, setPass1, "Passphrase", () => void doUnlock())}
        {errLine}
        {btn("Unlock", () => void doUnlock(), { busy, disabled: !pass1 || waitMs > 0 })}
        {link("Use my recovery code", () => { setLockError(null); setPass1(""); setPhase("recover"); })}
        {link("Forgot both? Erase the Vault", () => { setLockError(null); setPass1(""); setPhase("erase"); })}
        <VaultDetails />
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
        {bioOk && (
          <button onClick={() => { if (!userId) return; if (bioOn) { removeBio(userId); setBioOn(false); } else { setBioPass(""); setPass1(""); setLockError(null); setPhase("offer-bio"); } }}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 700, cursor: "pointer", marginLeft: "auto", marginRight: 12 }}>
            {bioOn ? "Fingerprint on · turn off" : "Turn on fingerprint"}
          </button>
        )}
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridAutoFlow: "dense", gap: 10 }}>
        {groups.flatMap((g) => g.entries).map((e) => {
          const t = themeFor(e.category);
          if (isCardCategory(e.category)) {
            const st = expiryStateFor(cardExpIso(e.card_exp));
            const expColor = (t.isWork ? EXPIRY_PRINT_COLOR : EXPIRY_COLOR)[st];
            return (
              <button key={e.id} type="button" className="dash-press" onClick={() => setExpandedId(e.id)}
                style={{ gridColumn: "1 / -1", aspectRatio: "1.586 / 1", maxHeight: 230, display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "left", padding: "14px 16px",
                  borderRadius: 10, border: t.cardBorder, background: t.cardBg, color: t.text, cursor: "pointer", boxSizing: "border-box" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: t.subtext, flexShrink: 0 }}>{e.card_brand ?? ""}</span>
                </span>
                <span style={{ fontSize: 20, fontFamily: "monospace", letterSpacing: 1.5, fontWeight: 700 }}>{maskCardGroups(e.card_number, e.card_brand) || "•••• •••• •••• ••••"}</span>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-end" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: t.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.card_name ?? ""}</span>
                  <span style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ display: "block", fontSize: 8, fontWeight: 800, letterSpacing: 0.6, color: t.subtext }}>EXP</span>
                    <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: e.card_exp ? expColor : t.subtext }}>{e.card_exp || "––/––"}</span>
                  </span>
                </span>
              </button>
            );
          }
          return (
            <button key={e.id} type="button" className="dash-press" onClick={() => setExpandedId(e.id)}
              style={{ aspectRatio: "1.25 / 1", display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "left", padding: "12px 12px",
                borderRadius: 8, border: t.cardBorder, background: t.cardBg, color: t.text, cursor: "pointer", boxSizing: "border-box", minWidth: 0, overflow: "hidden" }}>
              <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.label}</span>
              <span style={{ fontSize: 12, color: t.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.username ?? e.website ?? ""}</span>
            </button>
          );
        })}
      </div>

      <WalletOverlay open={!!openEntry} onClose={() => { setExpandedId(null); setConfirmDeleteId(null); }}>
        {openEntry && (() => {
          const e = openEntry;
          const t = themeFor(e.category);
          const isRevealed = !!revealed[e.id];
          return (
            <div style={{ borderRadius: 10, border: t.cardBorder, background: t.cardBg, padding: 16, color: t.text }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>{e.label}</div>
              {!isCardCategory(e.category) && e.username && <div style={{ fontSize: 13, color: t.subtext, marginBottom: 10 }}>{e.username}</div>}
              <div style={{ marginTop: 10 }}>
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
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        {e.card_number && <button onClick={() => void copySecret(e.card_number!.replace(/\D/g, ""), "Card number")} style={{ fontSize: 11, fontWeight: 700, color: t.showHideText, background: t.showHideBg, border: t.showHideBorder, borderRadius: 2, padding: "5px 10px", cursor: "pointer" }}>Copy number</button>}
                        {e.card_pin && <button onClick={() => void copySecret(e.card_pin!, "PIN")} style={{ fontSize: 11, fontWeight: 700, color: t.showHideText, background: t.showHideBg, border: t.showHideBorder, borderRadius: 2, padding: "5px 10px", cursor: "pointer" }}>Copy PIN</button>}
                      </div>
                    </>
                  );
                })()}
                {e.website && (
                  <div style={{ fontSize: 13, color: t.subtext, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{e.website}</div>
                )}
                {e.secret && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.secretText, fontFamily: "monospace", letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {isRevealed ? e.secret : "•".repeat(Math.min(14, Math.max(6, e.secret.length)))}
                    </div>
                    <button onClick={() => setRevealed((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
                      style={{ fontSize: 11, fontWeight: 700, color: t.showHideText, background: t.showHideBg, border: t.showHideBorder, borderRadius: 2, padding: "5px 10px", cursor: "pointer", flexShrink: 0 }}>
                      {isRevealed ? "Hide" : "Show"}
                    </button>
                    <button onClick={() => void copySecret(e.secret!, "Password")}
                      style={{ fontSize: 11, fontWeight: 700, color: t.showHideText, background: t.showHideBg, border: t.showHideBorder, borderRadius: 2, padding: "5px 10px", cursor: "pointer", flexShrink: 0 }}>
                      Copy
                    </button>
                  </div>
                )}
                {copied && <div style={{ fontSize: 12, fontWeight: 700, color: t.subtext, marginBottom: 8 }}>{copied}</div>}
                {e.notes && (
                  <div style={{ fontSize: 13, color: t.notesText, lineHeight: 1.5, whiteSpace: "pre-wrap" as const, marginBottom: 12 }}>{e.notes}</div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setExpandedId(null); openEditForm(e); }} style={{ flex: 1, padding: "9px 0", borderRadius: 2, border: t.btnBorder, background: t.btnBg, color: t.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                  {confirmDeleteId === e.id ? (
                    <button aria-busy={!!(busy)} onClick={() => deleteEntry(e.id)} disabled={busy} style={{ flex: 1, padding: "9px 0", borderRadius: 2, border: t.dangerConfirmBorder, background: t.dangerConfirmBg, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      {busy ? "Deleting…" : "Confirm delete"}
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(e.id)} style={{ flex: 1, padding: "9px 0", borderRadius: 2, border: t.dangerBorder, background: t.dangerBg, color: t.dangerText, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </WalletOverlay>

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
              <button aria-busy={!!(busy)} onClick={saveEntry} disabled={busy || !fLabel.trim()} style={{ flex: 1, padding: "13px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: fLabel.trim() ? 1 : 0.5 }}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      <VaultDetails />
    </div>
  );
}
