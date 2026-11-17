import test from "node:test";
import assert from "node:assert/strict";
import { availableChannels, channelKey, cityKey, senderLabel, topUnread, totalUnread } from "./squawk.ts";

const ctx = { companyId: "co", city: "Tampa", state: "fl", region: "Southeast", localArea: "Tampa", truckId: "t1", trailerId: null };
test("keys match the server's, and a missing piece leaves a channel closed", () => {
  assert.equal(cityKey("Tampa", "fl"), "tampa|FL");
  assert.equal(channelKey("city_network", ctx), "tampa|FL");
  assert.equal(channelKey("city_internal", ctx), "co|tampa|FL");
  assert.equal(channelKey("region", ctx), "co|Southeast");
  assert.equal(channelKey("local_area", ctx), "co|Southeast|Tampa");
  assert.equal(channelKey("truck", ctx), "t1");
  assert.equal(channelKey("to_rack", ctx), null);
  assert.equal(channelKey("to_rack", { ...ctx, toRackTerminalId: "tm" }), "tm");
  assert.equal(channelKey("to_drop", { ...ctx, toDropSiteKey: "FL~loves~495" }), "FL~loves~495");
  assert.equal(channelKey("trailer", ctx), null);
  assert.equal(channelKey("support", { ...ctx, userId: "u1" }), "u1");
  assert.equal(channelKey("support", { ...ctx, userId: "u1", isSuperAdmin: true }), null);
  const noCity = availableChannels({ ...ctx, city: null, state: null });
  assert.equal(noCity.find((c) => c.type === "city_network")?.why, "Pick a city");
  assert.equal(noCity.find((c) => c.type === "company")?.why, null);
});
test("unread: biggest channel first, totals", () => {
  const rows = [{ channel_type: "company", channel_key: "co", n: 1 }, { channel_type: "truck", channel_key: "t1", n: "3" }];
  assert.deepEqual(topUnread(rows), { type: "truck", key: "t1", n: 3 });
  assert.equal(totalUnread(rows), 4);
  assert.equal(topUnread([]), null);
});

test("sender label: own company sees the truck, others see the company", () => {
  const m = { company_id: "co", sender_initials: "SP", sender_truck: "25184", sender_company: "Gemini", sender_label: "x" };
  assert.equal(senderLabel(m, "co"), "SP - 25184");
  assert.equal(senderLabel(m, "other"), "SP - Gemini");
  assert.equal(senderLabel({ sender_label: "old" }, "co"), "old");
});
