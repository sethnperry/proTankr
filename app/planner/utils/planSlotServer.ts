"use client";
// app/planner/utils/planSlotServer.ts
//
// Saved plans on the server (user_plan_slots). Every slot, 0 through 5, uses
// terminal_id = UNIVERSAL_SCOPE with a real combo_id, so a plan loads from any terminal but
// different equipment keeps independent slots. Functions take the signed-in user and combo.

import { supabase } from "@/lib/supabase/client";
import { UNIVERSAL_SCOPE } from "./planSlotStorage";

export type ServerCtx = { authUserId: string | null | undefined; comboId: string | null | undefined };

// ── Supabase server sync ──────────────────────────────────────────────────
// Every slot (0 through 5) uses terminal_id = UNIVERSAL_SCOPE with a real
// combo_id -- loadable/saveable from any terminal, but different equipment
// (different compartment layouts) gets independent slots. Requires a
// resolved combo to write to at all. See planScopeKey's own comment above
// for why slot 0 joined slots 1-5 in dropping the terminal dimension
// entirely (2026-08-27).

export function scopeFor(ctx: ServerCtx): { terminalId: string; comboId: string } | null {
  if (!ctx.comboId) return null;
  return { terminalId: UNIVERSAL_SCOPE, comboId: String(ctx.comboId) };
}

// Returns both the combo-scoped rows (preferred, post-rework -- covers
// slot 0 and presets 1-5 in one query, since both now share the exact
// same terminal_id=UNIVERSAL_SCOPE/combo_id shape) and the pre-equipment-
// scoping legacy preset rows (terminal_id AND combo_id both
// UNIVERSAL_SCOPE -- every preset lived here before the original
// 2026-08-06 rework; slot 0 never had an equivalent legacy shape, since it
// was always terminal+combo scoped until this same 2026-08-27 change, so
// there's nothing to fall back to for it). The pull effect below writes
// each into its own local cache; readSlot prefers the combo-scoped one and
// only falls back to legacy (slots 1-5 only) for a combo that's never had
// that slot saved under the new scheme.
export async function serverFetchSlots(ctx: ServerCtx): Promise<{ scoped: Record<number, any>; legacy: Record<number, any> }> {
  if (!ctx.authUserId) return { scoped: {}, legacy: {} };
  const scoped: Record<number, any> = {};
  const legacy: Record<number, any> = {};

  if (ctx.comboId) {
    const { data, error } = await supabase
      .from("user_plan_slots")
      .select("slot,payload,updated_at")
      .eq("user_id", ctx.authUserId)
      .eq("terminal_id", UNIVERSAL_SCOPE)
      .eq("combo_id", String(ctx.comboId))
      .in("slot", [0, 1, 2, 3, 4, 5]);
    if (error) console.warn("serverFetchSlots (combo-scoped) error:", error.message);
    else
      (data || []).forEach((r: any) => {
        scoped[Number(r.slot)] = r.payload ?? null;
      });
  }

  const { data: legacyRows, error: legacyErr } = await supabase
    .from("user_plan_slots")
    .select("slot,payload,updated_at")
    .eq("user_id", ctx.authUserId)
    .eq("terminal_id", UNIVERSAL_SCOPE)
    .eq("combo_id", UNIVERSAL_SCOPE)
    .in("slot", [1, 2, 3, 4, 5]);
  if (legacyErr) console.warn("serverFetchSlots (presets, legacy) error:", legacyErr.message);
  else
    (legacyRows || []).forEach((r: any) => {
      legacy[Number(r.slot)] = r.payload ?? null;
    });

  return { scoped, legacy };
}

export async function serverUpsertSlot(ctx: ServerCtx, slot: number, payload: any) {
  if (!ctx.authUserId) return;
  const scope = scopeFor(ctx);
  if (!scope) return;
  const { error } = await supabase.from("user_plan_slots").upsert(
    {
      user_id: ctx.authUserId,
      terminal_id: scope.terminalId,
      combo_id: scope.comboId,
      slot,
      payload,
    },
    { onConflict: "user_id,terminal_id,combo_id,slot" },
  );
  if (error) console.warn("serverUpsertSlot error:", error.message);
}
