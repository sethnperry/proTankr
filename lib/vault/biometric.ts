// lib/vault/biometric.ts
//
// Unlock the Vault with the phone's fingerprint or face. The browser's passkey feature (WebAuthn with the
// PRF extension) hands back a secret that only that phone's biometric check can produce. That secret wraps a
// copy of the vault key kept on this phone only; the server never sees any of it. Without the phone and
// the biometric, the copy is useless, and the passphrase and recovery code still work everywhere.
// Not every phone or browser supports PRF; `bioSupported` says, and the passphrase is always there.

import { b64, importVaultKey, unb64, unwrap, wrap } from "./crypto";
import { setVaultKey } from "./session";

const KEY = (userId: string) => `protankr_vault_bio_v1:${userId}`;
const DECLINED = (userId: string) => `protankr_vault_bio_declined_v1:${userId}`;

type Stored = { credId: string; salt: string; wrapped: string };

const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export async function bioSupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

export function bioEnrolled(userId: string): boolean {
  try { return !!localStorage.getItem(KEY(userId)); } catch { return false; }
}
export function bioDeclined(userId: string): boolean {
  try { return localStorage.getItem(DECLINED(userId)) === "1"; } catch { return false; }
}
export function declineBio(userId: string) { try { localStorage.setItem(DECLINED(userId), "1"); } catch { /* ignore */ } }
export function removeBio(userId: string) { try { localStorage.removeItem(KEY(userId)); } catch { /* ignore */ } }

async function prfSecret(credId: Uint8Array | null, salt: Uint8Array): Promise<{ secret: Uint8Array; credId: Uint8Array } | null> {
  const opts: any = {
    publicKey: {
      challenge: rand(32), rpId: location.hostname, userVerification: "required", timeout: 60_000,
      allowCredentials: credId ? [{ type: "public-key", id: credId, transports: ["internal"] }] : [],
      extensions: { prf: { eval: { first: salt } } },
    },
  };
  const cred = (await navigator.credentials.get(opts)) as PublicKeyCredential | null;
  if (!cred) return null;
  const first = (cred.getClientExtensionResults() as any)?.prf?.results?.first as ArrayBuffer | undefined;
  return first ? { secret: new Uint8Array(first), credId: new Uint8Array(cred.rawId) } : null;
}

const aesFrom = (secret: Uint8Array) => globalThis.crypto.subtle.importKey("raw", secret as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

/** Set up fingerprint/face unlock on this phone. Needs the vault key's raw bytes (from a passphrase unlock). */
export async function enrollBio(userId: string, rawVaultKey: Uint8Array): Promise<void> {
  const salt = rand(32);
  const create: any = {
    publicKey: {
      challenge: rand(32), rp: { name: "ProTankr", id: location.hostname },
      user: { id: rand(16), name: "ProTankr Vault", displayName: "ProTankr Vault" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60_000, extensions: { prf: { eval: { first: salt } } },
    },
  };
  const made = (await navigator.credentials.create(create)) as PublicKeyCredential | null;
  if (!made) throw new Error("Fingerprint setup was cancelled.");
  if (!(made.getClientExtensionResults() as any)?.prf?.enabled && !(made.getClientExtensionResults() as any)?.prf?.results) {
    throw new Error("This phone or browser can't use fingerprint unlock for the Vault. Your passphrase still works.");
  }
  // Ask once more to get the secret (some phones only return it on a sign-in, not at creation).
  const got = await prfSecret(new Uint8Array(made.rawId), salt);
  if (!got) throw new Error("This phone or browser can't use fingerprint unlock for the Vault. Your passphrase still works.");
  const stored: Stored = { credId: b64(got.credId), salt: b64(salt), wrapped: await wrap(rawVaultKey, await aesFrom(got.secret)) };
  localStorage.setItem(KEY(userId), JSON.stringify(stored));
}

/** Unlock with the fingerprint/face. Throws a plain message on failure. */
export async function unlockWithBio(userId: string): Promise<void> {
  const raw = localStorage.getItem(KEY(userId));
  if (!raw) throw new Error("Fingerprint unlock isn't set up on this phone.");
  const st = JSON.parse(raw) as Stored;
  const got = await prfSecret(unb64(st.credId), unb64(st.salt)).catch(() => null);
  if (!got) throw new Error("Fingerprint unlock didn't work. Use your passphrase.");
  const vkRaw = await unwrap(st.wrapped, await aesFrom(got.secret));
  if (!vkRaw) { removeBio(userId); throw new Error("Fingerprint unlock is out of date. Use your passphrase, then set it up again."); }
  setVaultKey(await importVaultKey(vkRaw));
}
