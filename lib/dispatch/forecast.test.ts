import test from "node:test";
import assert from "node:assert/strict";
import { forecastLoad, pickMinutes, typicalStartMinutes, DEFAULT_TIMELINE_SETTINGS, type HistTrip } from "./forecast.ts";

const TZ = "America/New_York";
// 2026-10-20 is a Tuesday. EDT = UTC-4.
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 9, day, h + 4, m);
const iso = (ms: number) => new Date(ms).toISOString();

function trip(day: number, startH: number, over: Partial<{ toTerm: number; load: number; toDel: number; drop: number; driver: string }> = {}): HistTrip {
  const s = at(day, startH), a = s + (over.toTerm ?? 40) * 60000, l = a + (over.load ?? 50) * 60000;
  const da = l + (over.toDel ?? 90) * 60000, dl = da + (over.drop ?? 30) * 60000;
  return {
    driver_id: over.driver ?? "d1", started_at: iso(s),
    pickups: [{ terminal_id: "T", arrived_at: iso(a), left_at: iso(l), outcome: "loaded", seq: 1 }],
    deliveries: [{ location_id: "L", arrived_at: iso(da), left_at: iso(dl), seq: 1 }],
  };
}
const base = { terminal: { id: "T", name: "Marathon", tz: TZ, ll: null }, location: { id: "L", name: "Store 12", ll: null } };

test("legs come from history and add up", () => {
  const hist = [trip(5, 6), trip(6, 6), trip(7, 6), trip(8, 6)];
  const f = forecastLoad({ ...base, startFrom: null, startMs: at(20, 6), history: hist });
  assert.deepEqual(f.segments.map((s) => s.minutes), [40, 50, 90, 30]);
  assert.equal(f.endMs, at(20, 6) + 210 * 60000);
  assert.equal(f.flags.length, 0);
});

test("the same hour of day is preferred over other hours", () => {
  const morning = [trip(5, 6, { toDel: 60 }), trip(6, 6, { toDel: 60 }), trip(7, 6, { toDel: 60 })];
  const rush = [trip(8, 15, { toDel: 140 }), trip(9, 15, { toDel: 140 }), trip(12, 15, { toDel: 140 })];
  const am = forecastLoad({ ...base, startFrom: null, startMs: at(20, 6), history: [...morning, ...rush] });
  const pm = forecastLoad({ ...base, startFrom: null, startMs: at(20, 15), history: [...morning, ...rush] });
  assert.equal(am.segments[2].minutes, 60);
  assert.equal(pm.segments[2].minutes, 140);
});

test("no history: standard allowances and an estimate note", () => {
  const f = forecastLoad({ ...base, startFrom: null, startMs: at(20, 6), history: [] });
  assert.deepEqual(f.segments.map((s) => s.minutes), [30, 60, 60, 45]);
  assert.ok(f.flags.some((x) => x.kind === "estimate"));
});

test("distance estimate when coordinates exist but no pair history", () => {
  const f = forecastLoad({ ...base, terminal: { ...base.terminal, ll: { lat: 27.9, lon: -82.4 } }, location: { ...base.location, ll: { lat: 28.5, lon: -81.4 } },
    startFrom: null, startMs: at(20, 6), history: [] });
  assert.ok(f.segments[2].basis!.kind === "distance" && f.segments[2].minutes > 60);
});

test("arriving around 11 PM is held until after midnight gauging", () => {
  const f = forecastLoad({ ...base, startFrom: null, startMs: at(20, 22, 30), history: [trip(5, 22, { toTerm: 40 })].concat([trip(6, 22), trip(7, 22)]) });
  // start 22:30 + 40 = arrives 23:10, load ~50 would run past midnight -> gauging until 00:00 (gauges 23:30, back up at midnight)
  const g = f.segments.find((s) => s.key === "gauging")!;
  assert.ok(g, "gauging segment");
  assert.equal(g.startMs, at(20, 23, 10));
  assert.equal(f.segments.find((s) => s.key === "loading")!.startMs, at(21, 0, 0));
  assert.ok(f.flags.some((x) => x.kind === "gauging"));
});

test("arriving well before gauging is not held", () => {
  const f = forecastLoad({ ...base, startFrom: null, startMs: at(20, 18), history: [] });
  assert.equal(f.segments.some((s) => s.key === "gauging"), false);
});

test("long days are flagged: company limit, then the 14-hour window", () => {
  const long = forecastLoad({ ...base, startFrom: null, startMs: at(20, 12), dutyStartMs: at(20, 2), history: [] });
  assert.ok(long.flags.some((x) => x.kind === "shift"));
  const longer = forecastLoad({ ...base, startFrom: null, startMs: at(20, 12), dutyStartMs: at(19, 23), history: [] });
  assert.ok(longer.flags.some((x) => x.kind === "dot14"));
  const driving = forecastLoad({ ...base, startFrom: null, startMs: at(20, 12), drivingMinSoFar: 600, history: [] });
  assert.ok(driving.flags.some((x) => x.kind === "driving"));
  assert.equal(forecastLoad({ ...base, startFrom: null, startMs: at(20, 12), history: [], settings: { ...DEFAULT_TIMELINE_SETTINGS, maxShiftHours: 24 } }).flags.some((x) => x.kind === "shift"), false);
});

test("typical start: median first start per day, needs 3 days", () => {
  assert.equal(typicalStartMinutes([trip(5, 6), trip(6, 6)], "d1", TZ), null);
  assert.equal(typicalStartMinutes([trip(5, 6), trip(6, 7), trip(7, 6)], "d1", TZ), 360);
});

test("pickMinutes falls back as samples thin out", () => {
  const s = [{ atMs: at(5, 6), minutes: 10 }, { atMs: at(6, 6), minutes: 20 }];
  assert.equal(pickMinutes(s, at(20, 6), TZ)!.stage, "few");
  assert.equal(pickMinutes([], at(20, 6), TZ), null);
});

test("real hours of service replace the estimate when the start is soon", () => {
  const nowMs = at(20, 8);
  const hos = { driveLeftMin: 60, dutyLeftMin: 600, asOfMs: nowMs };
  const f = forecastLoad({ ...base, startFrom: null, startMs: at(20, 8, 30), history: [], hos, nowMs });
  const d = f.flags.find((x) => x.kind === "driving");
  assert.ok(d && d.severity === "bad" && /has 1\.0 h left/.test(d.text), "short on drive time");
  // plenty of time: no HOS flags
  const ok = forecastLoad({ ...base, startFrom: null, startMs: at(20, 8, 30), history: [], hos: { driveLeftMin: 700, dutyLeftMin: 800, asOfMs: nowMs }, nowMs });
  assert.equal(ok.flags.some((x) => x.kind === "driving" || x.kind === "dot14"), false);
  // a start days away ignores today's clocks and falls back to the estimate
  const far = forecastLoad({ ...base, startFrom: null, startMs: at(22, 8), history: [], hos, nowMs });
  assert.equal(far.flags.some((x) => /left on the clock/.test(x.text)), false);
});
