// lib/vault/client.ts
//
// Vault set-up, unlock, recovery and erase against Supabase. The server only ever stores the wrapped keys
// and ciphertext (see crypto.ts). All errors come back as thrown Errors with plain wording.

import { supabase } from "@/lib/supabase/client";
import {
  KDF_ITERATIONS, MIN_PASSPHRASE, formatRecovery, importVaultKey, newKdf, newRecoveryBytes, newVaultKeyBytes,
  parseRecovery, passphraseKey, recoveryKey, unwrap, wrap, type Kdf,
} from "./crypto";
import { openEntry, sealEntry, SENSITIVE_KEYS, type EntryRow } from "./entries";
import { setVaultKey } from "./session";

type KeyRow = { user_id: string; kdf: Kdf; wrapped_passphrase: string; wrapped_recovery: string };

export async function getKeyRow(userId: string): Promise<KeyRow | null> {
  const { data, error } = await supabase.from("vault_keys").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as KeyRow | null;
}

export const passphraseProblem = (p: string): string | null =>
  p.trim().length < MIN_PASSPHRASE ? `Use at least ${MIN_PASSPHRASE} characters. A few words in a row works well.` : null;

/** Turns older, unencrypted entries into encrypted ones. Safe to run again. */
export async function encryptLegacy(userId: string, vk: CryptoKey): Promise<number> {
  const { data, error } = await supabase.from("vault_entries").select("*").eq("user_id", userId).is("enc", null);
  if (error) throw new Error(error.message);
  let n = 0;
  for (const r of (data ?? []) as any[]) {
    if (!SENSITIVE_KEYS.some((k) => r[k])) continue;
    const sealed = await sealEntry(vk, r.id, { label: r.label, category: r.category, card_brand: r.card_brand, card_exp: r.card_exp, website: r.website, username: r.username, secret: r.secret, notes: r.notes, card_name: r.card_name, card_number: r.card_number, card_pin: r.card_pin });
    const { error: ue } = await supabase.from("vault_entries").update(sealed).eq("id", r.id).eq("user_id", userId);
    if (ue) throw new Error(ue.message);
    n++;
  }
  return n;
}

/** Makes the vault key, stores it wrapped, unlocks, and encrypts what was already there. Returns the recovery code (shown once). */
export async function createVault(userId: string, passphrase: string): Promise<{ recoveryCode: string }> {
  const bad = passphraseProblem(passphrase);
  if (bad) throw new Error(bad);
  const raw = newVaultKeyBytes(), kdf = newKdf(), rec = newRecoveryBytes();
  const wrappedPass = await wrap(raw, await passphraseKey(passphrase, kdf));
  const wrappedRec = await wrap(raw, await recoveryKey(rec));
  const { error } = await supabase.from("vault_keys").insert({ user_id: userId, kdf, wrapped_passphrase: wrappedPass, wrapped_recovery: wrappedRec });
  if (error) throw new Error(error.message);
  const vk = await importVaultKey(raw);
  setVaultKey(vk);
  await encryptLegacy(userId, vk);
  return { recoveryCode: formatRecovery(rec) };
}

export async function unlockVault(userId: string, passphrase: string): Promise<void> {
  const row = await getKeyRow(userId);
  if (!row) throw new Error("No vault set up.");
  const raw = await unwrap(row.wrapped_passphrase, await passphraseKey(passphrase, row.kdf));
  if (!raw) throw new Error("That passphrase didn't open the vault.");
  const vk = await importVaultKey(raw);
  setVaultKey(vk);
  await encryptLegacy(userId, vk).catch(() => 0);
}

/** Opens the vault with the recovery code and sets a new passphrase. Returns a fresh recovery code (the old one stops working). */
export async function recoverVault(userId: string, code: string, newPassphrase: string): Promise<{ recoveryCode: string }> {
  const bad = passphraseProblem(newPassphrase);
  if (bad) throw new Error(bad);
  const row = await getKeyRow(userId);
  if (!row) throw new Error("No vault set up.");
  const bytes = parseRecovery(code);
  if (!bytes) throw new Error("That recovery code isn't the right length.");
  const raw = await unwrap(row.wrapped_recovery, await recoveryKey(bytes));
  if (!raw) throw new Error("That recovery code didn't open the vault.");
  const kdf = newKdf(), rec = newRecoveryBytes();
  const { error } = await supabase.from("vault_keys").update({
    kdf, wrapped_passphrase: await wrap(raw, await passphraseKey(newPassphrase, kdf)), wrapped_recovery: await wrap(raw, await recoveryKey(rec)),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (error) throw new Error(error.message);
  setVaultKey(await importVaultKey(raw));
  return { recoveryCode: formatRecovery(rec) };
}

/** Deletes every entry and the keys. There is no way back. */
export async function eraseVault(userId: string): Promise<void> {
  setVaultKey(null);
  const a = await supabase.from("vault_entries").delete().eq("user_id", userId);
  if (a.error) throw new Error(a.error.message);
  const b = await supabase.from("vault_keys").delete().eq("user_id", userId);
  if (b.error) throw new Error(b.error.message);
}

export async function openRows<T extends EntryRow>(vk: CryptoKey | null, rows: T[]) {
  return Promise.all(rows.map((r) => openEntry(vk, r)));
}

export { KDF_ITERATIONS };
