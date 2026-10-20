// lib/telematics/crypto.ts
//
// Provider passwords are stored encrypted (AES-256-GCM) with a server-side
// key, TELEMATICS_ENC_KEY. Any string works as the key; it is hashed to 32 bytes.

import crypto from "crypto";

function key(): Buffer {
  const k = process.env.TELEMATICS_ENC_KEY;
  if (!k) throw new Error("TELEMATICS_ENC_KEY is not set.");
  return crypto.createHash("sha256").update(k).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
