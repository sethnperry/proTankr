import test from "node:test";
import assert from "node:assert/strict";
import { availableChannels, channelKey, cityKey, topUnread, totalUnread } from "./squawk.ts";

const ctx = { companyId: "co", city: "Tampa", state: "fl", region: "Southeast", localArea: "Tampa", truckId: "t1", trailerId: null };
test("keys match the server's, and a missing piece leaves a channel closed", () => {
  assert.equal(cityKey("Tampa", "fl"), "tampa|FL");
  assert.equal(channelKey("city_network", ctx), "tampa|FL");
  assert.equal(channelKey("city_internal", ctx), "co|tampa|FL");
  assert.equal(channelKey("region", ctx), "co|Southeast");
  assert.equal(channelKey("local_area", ctx), "co|Southeast|Tampa");
  assert.equal(channelKey("truck", ctx), "t1");
  assert.equal(channelKey("trailer", ctx), null);
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
