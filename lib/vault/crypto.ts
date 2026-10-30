// lib/vault/crypto.ts
//
// The Vault's cryptography, all on the phone (WebCrypto). A random 256-bit vault key encrypts every entry
// (AES-256-GCM, the entry id as authenticated data). That key is stored only "wrapped": once under a key
// derived from the driver's passphrase (PBKDF2-SHA256, 600,000 rounds, per OWASP), once under a key made from
// a recovery code. Nobody without the passphrase or the code can open it, including us.

const te = new TextEncoder();
const td = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const KDF_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 10;

export const b64 = (u: Uint8Array): string => {
  let s = ""; for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};
export const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export type Kdf = { alg: "PBKDF2-SHA256"; iterations: number; salt: string };

export function newKdf(): Kdf { return { alg: "PBKDF2-SHA256", iterations: KDF_ITERATIONS, salt: b64(rand(16)) }; }

export async function passphraseKey(passphrase: string, kdf: Kdf): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", te.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(kdf.salt) as BufferSource, iterations: kdf.iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ── Recovery code: 160 random bits as 8 groups of 4 base32 characters ───────
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newRecoveryBytes(): Uint8Array { return rand(20); }

export function formatRecovery(bytes: Uint8Array): string {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  return out.match(/.{1,4}/g)!.join("-");
}

export function parseRecovery(code: string): Uint8Array | null {
  const clean = code.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (clean.length !== 32) return null;
  const out: number[] = []; let bits = 0, val = 0;
  for (const ch of clean) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Uint8Array.from(out);
}

export async function recoveryKey(bytes: Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", bytes as BufferSource, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode("protankr-vault-recovery-v1") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// ── Wrapping the vault key ──────────────────────────────────────────────────
export const newVaultKeyBytes = () => rand(32);

export async function wrap(raw: Uint8Array, kek: CryptoKey): Promise<string> {
  const iv = rand(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, kek, raw as BufferSource));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

/** The vault key's raw bytes, or null when the key is wrong (the authentication tag fails). */
export async function unwrap(blob: string, kek: CryptoKey): Promise<Uint8Array | null> {
  try {
    const [v, iv, ct] = blob.split(".");
    if (v !== "v1") return null;
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource }, kek, unb64(ct) as BufferSource));
  } catch { return null; }
}

/** The key entries are encrypted with. Not extractable, so page code can use it but never read it. */
export const importVaultKey = (raw: Uint8Array) => subtle().importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

// ── Entries ─────────────────────────────────────────────────────────────────
export async function encryptJson(vk: CryptoKey, aad: string, value: unknown): Promise<string> {
  const iv = rand(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: te.encode(aad) as BufferSource }, vk, te.encode(JSON.stringify(value)) as BufferSource));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decryptJson<T>(vk: CryptoKey, aad: string, blob: string): Promise<T | null> {
  try {
    const [v, iv, ct] = blob.split(".");
    if (v !== "v1") return null;
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource, additionalData: te.encode(aad) as BufferSource }, vk, unb64(ct) as BufferSource);
    return JSON.parse(td.decode(pt)) as T;
  } catch { return null; }
}
