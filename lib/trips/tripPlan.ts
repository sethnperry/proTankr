"use client";
// lib/trips/tripPlan.ts
//
// The plan picked on Begin Trip. The driver chooses a preset (A-E) ahead of
// time; the Planner loads it the first time it opens for that trip. Stored
// on the phone only (presets themselves live in localStorage + user_plan_slots,
// keyed the same way usePlanSlots keys them).

export type PresetSummary = {
  slot: number;
  name: string | null;
  // Product id per compartment, highest comp number first (the Planner's
  // right-to-left order). null = empty.
  comps: (string | null)[];
};

const PLAN_SLOTS = [1, 2, 3, 4, 5];

function read(key: string): any {
  try {
    return typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem(key) ?? "null") : null;
  } catch {
    return null;
  }
}

function hasContent(snap: any): boolean {
  if (!snap || snap.v !== 1 || !snap.compPlan || typeof snap.compPlan !== "object") return false;
  return Object.values(snap.compPlan).some((v: any) => v && !v.empty && v.productId);
}

const UNIVERSAL = "__universal__";

// Saved presets for this driver + truck/trailer pairing: this phone's copy
// first (same keys as usePlanSlots), then the server's, then the older
// user-only presets. The server read covers a phone that hasn't opened the
// Planner for this equipment yet.
export async function fetchPresets(userId: string | null, comboId: string | null, compNumbers: number[]): Promise<PresetSummary[]> {
  if (!userId) return [];
  const server: Record<number, any> = {};
  const serverLegacy: Record<number, any> = {};
  try {
    const { supabase } = await import("@/lib/supabase/client");
    const { data } = await supabase.from("user_plan_slots").select("slot, payload, combo_id")
      .eq("user_id", userId).eq("terminal_id", UNIVERSAL)
      .in("combo_id", comboId ? [comboId, UNIVERSAL] : [UNIVERSAL]).in("slot", PLAN_SLOTS);
    for (const r of (data ?? []) as any[]) {
      if (r.combo_id === UNIVERSAL) serverLegacy[Number(r.slot)] = r.payload;
      else server[Number(r.slot)] = r.payload;
    }
  } catch {}
  return readPresets(userId, comboId, compNumbers, server, serverLegacy);
}

export function readPresets(
  userId: string | null, comboId: string | null, compNumbers: number[],
  server: Record<number, any> = {}, serverLegacy: Record<number, any> = {},
): PresetSummary[] {
  if (!userId) return [];
  const combo = comboId ? `c:${comboId}` : "c:none";
  const out: PresetSummary[] = [];
  for (const slot of PLAN_SLOTS) {
    const local = read(`proTankr:u:${userId}:${combo}:preset:slot:${slot}`);
    const snap = local ?? server[slot] ?? read(`proTankr:u:${userId}:preset:slot:${slot}`) ?? serverLegacy[slot];
    if (!hasContent(snap)) continue;
    const plan = snap.compPlan as Record<string, any>;
    const nums = compNumbers.length ? [...compNumbers] : Object.keys(plan).map(Number).filter(Number.isFinite);
    const comps = nums
      .sort((a, b) => b - a)
      .map((n) => {
        const v = plan[n];
        return v && !v.empty && v.productId ? String(v.productId) : null;
      });
    out.push({ slot, name: typeof snap.name === "string" && snap.name.trim() ? snap.name.trim() : null, comps });
  }
  return out;
}

export const slotLetter = (slot: number) => String.fromCharCode(64 + slot);

const planKey = (userId: string, tripId: string) => `proTankr:u:${userId}:tripPlan:${tripId}`;

export function setTripPlan(userId: string, tripId: string, slot: number | null) {
  try {
    if (slot == null) window.localStorage.removeItem(planKey(userId, tripId));
    else window.localStorage.setItem(planKey(userId, tripId), JSON.stringify({ slot, applied: false }));
  } catch {}
}

export function getTripPlan(userId: string | null, tripId: string | null): { slot: number; applied: boolean } | null {
  if (!userId || !tripId) return null;
  const v = read(planKey(userId, tripId));
  return v && typeof v.slot === "number" ? { slot: v.slot, applied: !!v.applied } : null;
}

export function markTripPlanApplied(userId: string, tripId: string) {
  const v = getTripPlan(userId, tripId);
  if (!v) return;
  try {
    window.localStorage.setItem(planKey(userId, tripId), JSON.stringify({ slot: v.slot, applied: true }));
  } catch {}
}

/** Where a plan from dispatch would be saved: the first empty slot, else it replaces the last one. */
export function nextSaveSlot(presets: PresetSummary[]): { slot: number; replacing: boolean } {
  const free = PLAN_SLOTS.find((s) => !presets.some((p) => p.slot === s));
  return free ? { slot: free, replacing: false } : { slot: PLAN_SLOTS[PLAN_SLOTS.length - 1], replacing: true };
}

/**
 * Saves a plan (product per compartment) into a plan slot for this driver and
 * trailer pairing: this phone first, then the server. Same keys and shape the
 * Planner's own plan slots use, so it shows up there on the next open.
 */
export async function savePresetPlan(
  userId: string, comboId: string, slot: number,
  products: Record<number, string>, name?: string,
): Promise<void> {
  const compPlan: Record<number, { empty: boolean; productId: string }> = {};
  for (const [n, pid] of Object.entries(products)) compPlan[Number(n)] = { empty: !pid, productId: pid || "" };
  const snap = { v: 1, savedAt: Date.now(), terminalId: UNIVERSAL, tempF: 60, cgSlider: 0.5, compPlan, ...(name ? { name } : {}) };
  try { window.localStorage.setItem(`proTankr:u:${userId}:c:${comboId}:preset:slot:${slot}`, JSON.stringify(snap)); } catch {}
  try {
    const { supabase } = await import("@/lib/supabase/client");
    await supabase.from("user_plan_slots").upsert(
      { user_id: userId, terminal_id: UNIVERSAL, combo_id: comboId, slot, payload: snap },
      { onConflict: "user_id,terminal_id,combo_id,slot" },
    );
  } catch {}
}

const quickKey = (userId: string, tripId: string) => `proTankr:u:${userId}:tripQuick:${tripId}`;

/**
 * Marks a trip as a Quick load: the Planner runs its layout with no caps and
 * CG centered, once, and saves nothing. Once the Planner has done that the
 * marker stays "done", so editing the trip later can't wipe the driver's caps.
 */
export function setTripQuick(userId: string, tripId: string, on: boolean) {
  try {
    const k = quickKey(userId, tripId);
    if (window.localStorage.getItem(k) === "done") return;
    if (on) window.localStorage.setItem(k, "1");
    else window.localStorage.removeItem(k);
  } catch {}
}

/** True the first time it is asked for a Quick load trip, then false. */
export function takeTripQuick(userId: string | null, tripId: string | null): boolean {
  if (!userId || !tripId) return false;
  try {
    const k = quickKey(userId, tripId);
    if (window.localStorage.getItem(k) !== "1") return false;
    window.localStorage.setItem(k, "done");
    return true;
  } catch { return false; }
}
