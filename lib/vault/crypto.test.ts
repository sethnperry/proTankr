import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptJson, encryptJson, formatRecovery, importVaultKey, newKdf, newRecoveryBytes, newVaultKeyBytes, parseRecovery, passphraseKey, recoveryKey, unwrap, wrap } from "./crypto.ts";

const fastKdf = () => ({ ...newKdf(), iterations: 1000 }); // the real count is 600,000; low here so tests stay quick

test("wrap and unwrap with the passphrase; a wrong passphrase gets nothing", async () => {
  const kdf = fastKdf(), raw = newVaultKeyBytes();
  const blob = await wrap(raw, await passphraseKey("correct horse battery", kdf));
  assert.deepEqual(await unwrap(blob, await passphraseKey("correct horse battery", kdf)), raw);
  assert.equal(await unwrap(blob, await passphraseKey("wrong horse battery", kdf)), null);
});

test("recovery code round trip and format", async () => {
  const bytes = newRecoveryBytes(), code = formatRecovery(bytes);
  assert.match(code, /^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
  assert.deepEqual(parseRecovery(code.toLowerCase().replace(/-/g, " ")), bytes);
  assert.equal(parseRecovery("TOO-SHORT"), null);
  const raw = newVaultKeyBytes();
  const blob = await wrap(raw, await recoveryKey(bytes));
  assert.deepEqual(await unwrap(blob, await recoveryKey(parseRecovery(code)!)), raw);
});

test("entries are bound to their id and unreadable with another key", async () => {
  const vk = await importVaultKey(newVaultKeyBytes()), other = await importVaultKey(newVaultKeyBytes());
  const blob = await encryptJson(vk, "entry-1", { secret: "hunter2" });
  assert.deepEqual(await decryptJson(vk, "entry-1", blob), { secret: "hunter2" });
  assert.equal(await decryptJson(vk, "entry-2", blob), null); // moved to another row
  assert.equal(await decryptJson(other, "entry-1", blob), null);
  assert.equal(blob.includes("hunter2"), false);
});
