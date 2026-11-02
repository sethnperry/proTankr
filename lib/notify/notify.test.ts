import test from "node:test";
import assert from "node:assert/strict";
import { isDue, nextRunAfter, resolveRecipients, type DueSchedule, type Person } from "./schedule.ts";
import { render } from "./templates.ts";
import { runDueSchedules, type RunDeps } from "./runDue.ts";

const t = (iso: string) => Date.parse(iso);
const NY = "America/New_York";

test("daily: later today if the time hasn't passed, else tomorrow", () => {
  // 2026-11-02 12:00 UTC is 07:00 in New York (EST, after the 11-01 change).
  const c = { freq: "daily" as const, at: "08:00", tz: NY };
  assert.equal(nextRunAfter(c, t("2026-11-02T12:00:00Z")), t("2026-11-02T13:00:00Z"));
  assert.equal(nextRunAfter(c, t("2026-11-02T13:00:00Z")), t("2026-11-03T13:00:00Z"));
});

test("weekly lands on the weekday, monthly clamps to a short month", () => {
  const w = { freq: "weekly" as const, at: "09:00", dow: 3, tz: NY }; // Wednesday
  assert.equal(new Date(nextRunAfter(w, t("2026-11-02T00:00:00Z"))!).toISOString(), "2026-11-04T14:00:00.000Z");
  const m = { freq: "monthly" as const, at: "09:00", dom: 31, tz: NY };
  assert.equal(new Date(nextRunAfter(m, t("2026-02-01T00:00:00Z"))!).toISOString(), "2026-02-28T14:00:00.000Z");
});

test("once runs on its date, then never", () => {
  const o = { freq: "once" as const, at: "08:00", on: "2026-11-05", tz: NY };
  assert.equal(nextRunAfter(o, t("2026-11-02T00:00:00Z")), t("2026-11-05T13:00:00Z"));
  assert.equal(nextRunAfter(o, t("2026-11-06T00:00:00Z")), null);
});

const people: Person[] = [
  { user_id: "a", email: "a@x.com", role: "admin", region: "Southeast" },
  { user_id: "b", email: "B@x.com", role: "dispatch", region: "Southeast" },
  { user_id: "c", email: "c@x.com", role: "dispatch", region: "Northeast" },
  { user_id: "d", email: null, role: "driver", region: null },
];

test("recipients: by email, user and role, narrowed by region, without repeats", () => {
  const r = resolveRecipients([
    { type: "role", value: "dispatch", region: "southeast" },
    { type: "email", value: "b@x.com" },
    { type: "user", value: "d" },
    { type: "email", value: "not an email" },
    { type: "user", value: "a" },
  ], people);
  assert.deepEqual(r.emails.sort(), ["B@x.com", "a@x.com"].sort());
  assert.deepEqual(r.userIds.sort(), ["a", "b", "d"]);
});

test("templates render, and an unknown key is null", () => {
  assert.equal(render("reminder", { subject: "Safety meeting", body: "Sign in" })?.subject, "Safety meeting");
  assert.match(render("recap", { title: "Week", lines: ["3 late", "1 down"] })!.push, /\+1/);
  assert.equal(render("nope", {}), null);
});

function deps(over: Partial<RunDeps> = {}) {
  const log = { emails: [] as string[][], pushes: [] as string[][], runs: [] as [string, string | null][], errors: [] as string[] };
  const due: DueSchedule = { schedule_id: "s1", company_id: "c", kind: "reminder", template_key: "reminder", recipients: [{ type: "role", value: "dispatch" }, { type: "user", value: "a" }],
    channels: ["email", "push"], cadence: { freq: "daily", at: "08:00", tz: NY }, payload: { subject: "Hi", body: "x" }, next_run_at: "2026-11-02T13:00:00Z" };
  const d: RunDeps = {
    now: t("2026-11-02T13:00:05Z"),
    loadDue: async () => [due],
    directory: async () => people,
    sendEmail: async (to) => { log.emails.push(to); },
    sendPush: async (ids) => { log.pushes.push(ids); return ids.length; },
    saveRun: async (id, _l, next) => { log.runs.push([id, next]); },
    logError: async (_c, _k, m) => { log.errors.push(m); },
    ...over,
  };
  return { d, log };
}

test("a due schedule sends by each channel and sets its next run", async () => {
  assert.equal(isDue({ next_run_at: "2026-11-02T13:00:00Z" }, t("2026-11-02T13:00:05Z")), true);
  const { d, log } = deps();
  const r = await runDueSchedules(d);
  assert.equal(r.ran, 1);
  assert.equal(log.emails[0].length, 3);
  assert.equal(log.pushes[0].length, 3);
  assert.deepEqual(log.runs, [["s1", "2026-11-03T13:00:00.000Z"]]);
});

test("a failed email goes to the error log and the run still finishes", async () => {
  const { d, log } = deps({ sendEmail: async () => { throw new Error("Resend down"); } });
  const r = await runDueSchedules(d);
  assert.equal(r.failed, 1);
  assert.equal(r.pushes, 3);
  assert.match(log.errors[0], /Resend down/);
});

test("an 'unsigned' recipient is worked out when the schedule runs", async () => {
  const { d, log } = deps({
    loadDue: async () => [{ schedule_id: "s2", company_id: "c", kind: "reminder", template_key: "reminder", recipients: [{ type: "unsigned", value: "m1" }], channels: ["push"], cadence: { freq: "once", at: "08:00", on: "2026-11-02", tz: NY }, payload: { subject: "Sign", body: "x" }, next_run_at: "2026-11-02T13:00:00Z" }],
    unsignedFor: async (_c, m) => (m === "m1" ? ["a", "d"] : []),
  });
  await runDueSchedules(d);
  assert.deepEqual(log.pushes[0].sort(), ["a", "d"]);
});

test("a recap can fill its lines when it runs", async () => {
  let body = "";
  const { d } = deps({
    loadDue: async () => [{ schedule_id: "s3", company_id: "c", kind: "recap", template_key: "freight_recap", recipients: [{ type: "email", value: "boss@x.com" }], channels: ["email"], cadence: { freq: "daily", at: "08:00", tz: NY }, payload: { days: 7 }, next_run_at: "2026-11-02T13:00:00Z" }],
    payloadFor: async (s) => ({ ...s.payload, lines: ["2 on the road"] }),
    sendEmail: async (_to, _subject, text) => { body = text; },
  });
  await runDueSchedules(d);
  assert.match(body, /2 on the road/);
});
