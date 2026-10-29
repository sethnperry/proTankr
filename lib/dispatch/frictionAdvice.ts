// lib/dispatch/frictionAdvice.ts
//
// Plain-language help for a Friction card: what each report means for the trucks headed to that rack,
// what to do about it now, and how to keep it from happening again. Pure.

import type { Conflict, ReportType } from "./conflicts.ts";

export type Advice = { meaning: string; now: string[]; prevent: string[] };

const MEANING: Record<ReportType, (code: string) => string> = {
  long_line: () => "A driver reported a long line at this rack. Every truck headed there waits longer, and the wait runs into drivers' hours.",
  out_of_product: (c) => `The rack ran out of ${c}. A truck that is going for it can't load it here until it's resupplied.`,
  out_of_allocation: (c) => `The supplier has no allocation left for your company at this terminal${c ? ` (${c})` : ""}. Loads for that supplier can't be filled here today.`,
  terminal_issue: () => "A driver reported a problem at this terminal but didn't say what. It could be equipment down, a closed rack or a system outage.",
};

export function adviceFor(c: Conflict, code: (id: string | null) => string): Advice {
  const types = [...new Set(c.reports.map((r) => r.type))];
  const enRoute = c.trucks.filter((t) => !t.arrived).length;
  const there = c.trucks.length - enRoute;
  const meaning = types.map((t) => MEANING[t](code(c.reports.find((r) => r.type === t)?.productId ?? null))).join(" ");
  const now: string[] = [];
  const prevent: string[] = [];
  if (enRoute) now.push(`${enRoute} truck${enRoute === 1 ? " is" : "s are"} still on the way: call ${enRoute === 1 ? "the driver" : "the drivers"} before they arrive and move ${enRoute === 1 ? "it" : "them"} to another rack.`);
  if (there) now.push(`${there} truck${there === 1 ? " is" : "s are"} already there: ask ${there === 1 ? "the driver" : "the drivers"} whether to wait or hop to another rack.`);
  if (types.includes("long_line")) { now.push("Ask the driver for the current wait. Past about an hour, a nearby rack is usually faster."); prevent.push("Spread arrivals at this rack, and avoid the busy hours when planning loads."); }
  if (types.includes("out_of_product")) { now.push("Check the Terminal status for another rack here, or the nearest terminal, that has the product."); prevent.push("Look at Terminal status before sending a load, and plan a second terminal for products that run out often."); }
  if (types.includes("out_of_allocation")) { now.push("Switch the load to another supplier that has allocation here, or load the same supplier at another terminal."); prevent.push("Watch the supplier's contract limits (Suppliers screen) and hold loads before the day's limit is reached."); }
  if (types.includes("terminal_issue")) { now.push("Call the driver or the terminal to find out what's wrong before more trucks go there."); prevent.push("Ask drivers to name the problem when they report it, so it can be sorted out faster."); }
  return { meaning, now, prevent };
}
