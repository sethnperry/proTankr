"use client";
// lib/equipment/syncPermits.ts
//
// After the old Equipment Details screen saves a unit, copy its permit dates into the Binder's records
// (equipment_permits) so the Binder, dispatch, the alerts and the bell see the same date. Only dates that were
// filled in are copied: a blank never wipes a date someone set in the Binder.

import { supabase } from "@/lib/supabase/client";
import { permitTypeForSlug, type PermitTypeLite, type UnitKind } from "./permitLink";

export type LegacyPermit = { slug: string; expiration: string | null; enforcement?: string | null; notes?: string | null };

export async function syncLegacyPermits(companyId: string, kind: UnitKind, unitId: string, entries: LegacyPermit[]): Promise<void> {
  const filled = entries.filter((e) => e.expiration);
  if (!filled.length) return;
  try {
    const { data } = await supabase.from("permit_types").select("permit_type_id, name, applies_to, terminal_id").eq("company_id", companyId).eq("is_active", true);
    const types = (data ?? []) as PermitTypeLite[];
    const col = kind === "truck" ? "truck_id" : "trailer_id";
    for (const e of filled) {
      const t = permitTypeForSlug(types, kind, e.slug);
      if (!t) continue;
      const { data: rec } = await supabase.from("equipment_permits").select("equipment_permit_id, expiration_date").eq(col, unitId).eq("permit_type_id", t.permit_type_id).maybeSingle();
      const fields = { expiration_date: e.expiration, enforcement_date: e.enforcement || null, ...(e.notes ? { notes: e.notes } : {}) };
      if (rec) {
        if ((rec as { expiration_date: string | null }).expiration_date !== e.expiration || e.enforcement || e.notes) {
          await supabase.from("equipment_permits").update(fields).eq("equipment_permit_id", (rec as { equipment_permit_id: string }).equipment_permit_id);
        }
      } else {
        await supabase.from("equipment_permits").insert({ company_id: companyId, permit_type_id: t.permit_type_id, truck_id: kind === "truck" ? unitId : null, trailer_id: kind === "trailer" ? unitId : null, ...fields });
      }
    }
  } catch { /* the unit saved; the Binder copy is best effort and shows up on the next save */ }
}
