import test from "node:test";
import assert from "node:assert/strict";
import { connectionOn, setTelematicsOn, telematicsOn, tfetch } from "./switch.ts";

test("a connection counts only when active and not switched off", () => {
  assert.equal(connectionOn({ status: "active", enabled: true }), true);
  assert.equal(connectionOn({ status: "active" }), true); // older row, no column yet
  assert.equal(connectionOn({ status: "active", enabled: false }), false);
  assert.equal(connectionOn({ status: "error", enabled: true }), false);
  assert.equal(connectionOn(null), false);
});

test("switched off: tfetch makes no network call and answers like a company with no connection", async () => {
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
  try {
    setTelematicsOn(false);
    assert.equal(telematicsOn(), false);
    const r = await tfetch("/api/telematics/hos?companyId=x");
    assert.equal(r.ok, true);
    assert.deepEqual(await r.json(), { connected: false, off: true });
    assert.equal(calls, 0);
    setTelematicsOn(true);
    await tfetch("/api/telematics/hos?companyId=x");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = real; setTelematicsOn(true); }
});
