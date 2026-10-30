// lib/vault/entries.ts
//
// What is encrypted in a Vault entry and what stays readable. Readable: label, category, card brand, card
// expiry and the last digits (so the grid, the fuel card list and the Expirations chip work without the
// key). Everything else sits inside `enc`. Pure apart from the crypto calls.

import { decryptJson, encryptJson } from "./crypto";
import { shownDigits } from "./cards";

export type Sensitive = {
  website: string | null; username: string | null; secret: string | null; notes: string | null;
  card_name: string | null; card_number: string | null; card_pin: string | null;
};
export const SENSITIVE_KEYS: (keyof Sensitive)[] = ["website", "username", "secret", "notes", "card_name", "card_number", "card_pin"];

export type EntryRow = {
  id: string; label: string; category: string | null; updated_at: string;
  card_brand: string | null; card_exp: string | null; card_last4: string | null; enc: string | null;
} & Partial<Sensitive>;

export const NULL_SENSITIVE: Sensitive = { website: null, username: null, secret: null, notes: null, card_name: null, card_number: null, card_pin: null };

export const last4Of = (number: string | null | undefined, brand: string | null | undefined): string | null => {
  const d = (number ?? "").replace(/\D/g, "");
  return d ? d.slice(-shownDigits(brand)) : null;
};

/** The columns to write: the readable ones, the ciphertext, and nulls where the plain text used to be. */
export async function sealEntry(vk: CryptoKey, id: string, v: { label: string; category: string | null; card_brand: string | null; card_exp: string | null } & Sensitive) {
  const sens: Sensitive = {} as Sensitive;
  for (const k of SENSITIVE_KEYS) sens[k] = v[k] ?? null;
  return {
    label: v.label, category: v.category, card_brand: v.card_brand, card_exp: v.card_exp,
    card_last4: last4Of(v.card_number, v.card_brand),
    enc: await encryptJson(vk, id, sens),
    ...NULL_SENSITIVE,
    updated_at: new Date().toISOString(),
  };
}

/** A row with its sensitive fields filled in. Rows not yet encrypted (older ones) pass through as they are. */
export async function openEntry<T extends EntryRow>(vk: CryptoKey | null, row: T): Promise<T & Sensitive & { locked?: boolean }> {
  if (!row.enc) return { ...NULL_SENSITIVE, ...row } as T & Sensitive;
  if (!vk) return { ...row, ...NULL_SENSITIVE, locked: true };
  const s = await decryptJson<Sensitive>(vk, row.id, row.enc);
  return s ? { ...row, ...NULL_SENSITIVE, ...s } : { ...row, ...NULL_SENSITIVE, locked: true };
}
