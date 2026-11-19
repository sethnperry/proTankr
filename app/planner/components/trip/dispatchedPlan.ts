// app/planner/components/trip/dispatchedPlan.ts
//
// What to show where the trips list would say "Bobtail" for a load that was dispatched but not begun yet: its trailer isn't
// picked, so the truck isn't a bobtail, it just has no trailer yet. Show the plan if one is known (dispatch's compartment
// plan, else the plan this driver picked on Begin Trip), otherwise say the trailer isn't set. Pure.

import { readPlannedComps } from "../../../../lib/trips/addPickupCheck.ts";
import type { PlanLineComp } from "../PlanLine";

type Product = { product_id: string; product_name: string; display_name: string | null; button_code: string | null; hex_code: string | null };

export type DispatchedPlan = { comps: PlanLineComp[]; letter: string | null; word: string | null };

export function dispatchedPlanFor(
  pickups: { planned_comps?: unknown }[],
  /** The plan this driver picked for the trip (saved on their phone): slot, and product per compartment, highest first. */
  local: { slot: number; snapshot: { comps: (string | null)[] } | null } | null,
  catalog: Product[],
  colorOf: (name: string) => string,
  /** What the load was planned on: a truck with no trailer is a real bobtail; nothing picked is just "not set". */
  on: { truck: boolean; trailer: boolean } = { truck: false, trailer: false },
): DispatchedPlan {
  const info = (pid: string | null | undefined): PlanLineComp extends infer T ? Omit<PlanLineComp, "num"> : never => {
    const p = pid ? catalog.find((x) => x.product_id === pid) : null;
    const name = p ? p.display_name ?? p.product_name : null;
    return { code: p ? String(p.button_code ?? (name ?? "PRD").split(" ")[0]).trim().toUpperCase() : null, name, color: p ? p.hex_code?.trim() || colorOf(name ?? "") : null };
  };
  const planned = new Map<number, string>();
  for (const pk of pickups) for (const c of readPlannedComps(pk.planned_comps) ?? []) planned.set(c.comp_number, c.product_id);
  if (planned.size > 0) {
    const nums = [...planned.keys()].sort((a, b) => b - a);
    return { comps: nums.map((n) => ({ num: n, ...info(planned.get(n)) })), letter: null, word: null };
  }
  const letter = local ? String.fromCharCode(64 + local.slot) : null;
  const snap = local?.snapshot?.comps ?? [];
  if (snap.some(Boolean)) return { comps: snap.map((pid, i) => ({ num: snap.length - i, ...info(pid) })), letter, word: null };
  if (letter) return { comps: [], letter, word: `Plan ${letter}` };
  if (on.truck && !on.trailer) return { comps: [], letter: null, word: "Bobtail" };
  return { comps: [], letter: null, word: on.trailer ? "Trailer planned" : "Trailer not set" };
}
