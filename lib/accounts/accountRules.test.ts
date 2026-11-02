import test from "node:test";
import assert from "node:assert/strict";
import { dueRules, matches, namesProblem, parseEmails, ruleProblem, summaryDoc, type Rule } from "./accountRules.ts";

const R = (o: Partial<Rule> = {}): Rule => ({ rule_id: "r1", name: "FA", match_field: "customer", match_text: "First American", match_mode: "equals", emails: ["a@x.com"], documents: ["ptd"], delay_minutes: 0, is_active: true, ...o });

test("names match ignoring case, punctuation and spacing", () => {
  assert.equal(matches(R(), { shipper: null, customer: "FIRST  american" }), true);
  assert.equal(matches(R({ match_text: "Acme Inc." }), { shipper: null, customer: "acme inc" }), true);
  assert.equal(matches(R(), { shipper: "First American", customer: "Other" }), false);
  assert.equal(matches(R({ match_field: "either" }), { shipper: "First American", customer: "Other" }), true);
  assert.equal(matches(R({ match_mode: "contains", match_text: "american" }), { shipper: null, customer: "First American Fuels" }), true);
  assert.equal(matches(R({ match_text: "" }), { shipper: "x", customer: "x" }), false);
});

test("an order's own customer counts too", () => {
  assert.equal(matches(R(), { shipper: null, customer: null, orderCustomers: ["First American"] }), true);
});

test("a rule is due once the load is complete and its delay has passed, and never twice", () => {
  const done = "2026-11-02T10:00:00Z", t = (iso: string) => Date.parse(iso);
  const names = { shipper: null, customer: "First American" };
  assert.equal(dueRules([R()], names, done, new Set(), t("2026-11-02T10:00:01Z")).length, 1);
  assert.equal(dueRules([R({ delay_minutes: 60 })], names, done, new Set(), t("2026-11-02T10:30:00Z")).length, 0);
  assert.equal(dueRules([R({ delay_minutes: 60 })], names, done, new Set(), t("2026-11-02T11:00:00Z")).length, 1);
  assert.equal(dueRules([R()], names, done, new Set(["r1"]), t("2026-11-03T00:00:00Z")).length, 0);
  assert.equal(dueRules([R({ is_active: false })], names, done, new Set(), t("2026-11-03T00:00:00Z")).length, 0);
  assert.equal(dueRules([R()], names, null, new Set(), t("2026-11-03T00:00:00Z")).length, 0);
});

test("rule forms and addresses are checked", () => {
  const ok = { name: "FA", matchText: "First American", emails: "a@x.com, b@y.com", documents: ["ptd" as const], delayMinutes: "30" };
  assert.equal(ruleProblem(ok), null);
  assert.match(ruleProblem({ ...ok, emails: "nope" }) ?? "", /isn't an email/);
  assert.match(ruleProblem({ ...ok, documents: [] }) ?? "", /document/);
  assert.match(ruleProblem({ ...ok, delayMinutes: "5000" }) ?? "", /minutes/);
  assert.match(ruleProblem({ ...ok, matchText: " " }) ?? "", /account name/);
  assert.deepEqual(parseEmails("a@x.com; a@x.com b@y.com"), ["a@x.com", "b@y.com"]);
});

test("shipper and customer are both required", () => {
  assert.deepEqual(namesProblem("", " "), ["shipper", "customer"]);
  assert.deepEqual(namesProblem("A", "B"), []);
});

test("the summary names the order and customer", () => {
  const d = summaryDoc({ orderNumbers: ["4816492"], shipper: "S", customer: "First American", driver: "Sam", truck: "T1", trailer: "R2", startedAt: null, completedAt: "2026-11-02T15:00:00Z", beginMiles: 100, endMiles: 250,
    pickups: [{ terminal: "Marathon", arrivedAt: null, leftAt: null, noLoad: false }], deliveries: [{ place: "Store 12", arrivedAt: null, leftAt: null }],
    loads: [{ comp: 1, product: "ULSD", bol: "B1", supplier: null, gross: 8000.4, net: 7990, tempF: 60, api: 36, tank: "1" }] });
  assert.match(d.subject, /order 4816492 for First American/);
  assert.equal(d.sections[0].table?.rows[0][4], "8,000");
  assert.equal(d.sections.some((s) => /150 mi/.test(s.text ?? "")), true);
});
