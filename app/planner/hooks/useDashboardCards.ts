"use client";
// app/planner/hooks/useDashboardCards.ts
//
// Data for the Driver Dashboard's two permanent cards:
//   - Terminal status: the pickup terminal's products at one rack, with the
//     last API/temp reading and whether it's marked out.
//   - Recent deliveries: the selected store's last completed drops, every
//     carrier.
// Both read straight from the server and fail open (an error leaves the card
// empty, never breaks the dashboard).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type TerminalProductStatus = {
  productId: string;
  name: string;
  code: string | null;
  hex: string | null;
  isOut: boolean;
  lastApi: number | null;
  lastTempF: number | null;
  updatedAt: string | null;
};

const STATUS_POLL_MS = 5 * 60_000;

export function useTerminalStatus(terminalId: string | null, preferredRackId: string | null) {
  const [rackId, setRackId] = useState<string | null>(null);
  const [rackName, setRackName] = useState<string | null>(null);
  const [rackCount, setRackCount] = useState(0);
  const [products, setProducts] = useState<TerminalProductStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!terminalId) { setProducts([]); setRackId(null); setRackName(null); setRackCount(0); return; }
    setLoading(true);
    try {
      const racks = await supabase.from("terminal_racks").select("rack_id, rack_name").eq("terminal_id", terminalId).order("rack_name");
      const list = (racks.data ?? []) as { rack_id: string; rack_name: string }[];
      setRackCount(list.length);
      const rack = list.find((r) => r.rack_id === preferredRackId) ?? list[0] ?? null;
      setRackName(rack?.rack_name ?? null);
      setRackId(rack?.rack_id ?? null);
      if (!rack) { setProducts([]); return; }
      const res = await supabase
        .from("rack_product_status")
        .select("active, is_out, last_api, last_temp_f, updated_at, products (product_id, product_name, display_name, button_code, hex_code)")
        .eq("rack_id", rack.rack_id);
      const rows = ((res.data ?? []) as any[])
        .filter((r) => r.active !== false && r.products)
        .map((r): TerminalProductStatus => ({
          productId: r.products.product_id,
          name: String(r.products.display_name || r.products.product_name || "Product"),
          code: r.products.button_code ?? null,
          hex: r.products.hex_code ?? null,
          isOut: !!r.is_out,
          lastApi: r.last_api != null ? Number(r.last_api) : null,
          lastTempF: r.last_temp_f != null ? Number(r.last_temp_f) : null,
          updatedAt: r.last_api != null ? r.updated_at ?? null : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setProducts(rows);
    } catch (e) {
      console.warn("[dashboard] terminal status failed:", e);
    } finally {
      setLoading(false);
    }
  }, [terminalId, preferredRackId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), STATUS_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return { rackId, rackName, rackCount, products, loading, reload: load };
}

export type StoreDelivery = {
  deliveryId: string;
  // Only on the viewer's own deliveries (no PTD for anyone else).
  tripId: string | null;
  isMine: boolean;
  ownCompany: boolean;
  // Our driver's name, or another carrier's short company name.
  who: string;
  leftAt: string | null;
  products: { productId: string | null; gallons: number }[];
  tanks: { tankNumber: string; productId: string | null; after: number; unit: "gallons" | "inches" }[];
};

// Recent deliveries at one store, every carrier. The server matches the same
// store saved by other companies (recent_deliveries_at_location).
// refreshKey: bump to refetch (e.g. after finishing a delivery).
export function useStoreDeliveries(locationId: string | null, refreshKey: unknown, limit = 10) {
  const [items, setItems] = useState<StoreDelivery[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("recent_deliveries_at_location", { p_location_id: locationId, p_limit: limit });
        if (error) throw error;
        const rows = (Array.isArray(data) ? data : []) as any[];
        const out = rows.map((r): StoreDelivery => ({
          deliveryId: String(r.delivery_id),
          tripId: r.trip_id ? String(r.trip_id) : null,
          isMine: !!r.is_mine,
          ownCompany: !!r.own_company,
          who: String(r.who ?? "Driver"),
          leftAt: r.left_at ?? null,
          products: ((r.products ?? []) as any[]).map((p) => ({ productId: p.product_id ?? null, gallons: Number(p.gallons ?? 0) })),
          tanks: ((r.tanks ?? []) as any[]).map((t) => ({
            tankNumber: String(t.tank_number ?? ""),
            productId: t.product_id ?? null,
            after: Number(t.after ?? 0),
            unit: t.unit === "inches" ? "inches" : "gallons",
          })),
        }));
        if (!cancelled) setItems(out);
      } catch (e) {
        console.warn("[dashboard] store deliveries failed:", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [locationId, refreshKey, limit]);

  return { items, loading };
}

// What the trailer last carried, per compartment: the newest completed load
// on any combo with this trailer. Shown as residue when the trailer is empty.
export function useTrailerResidue(trailerId: string | null, refreshKey?: unknown) {
  const [residue, setResidue] = useState<Record<number, string>>({});
  useEffect(() => {
    setResidue({});
    if (!trailerId) return;
    let alive = true;
    void (async () => {
      try {
        const combos = await supabase.from("equipment_combos").select("combo_id").eq("trailer_id", trailerId);
        const ids = ((combos.data ?? []) as { combo_id: string }[]).map((c) => c.combo_id);
        if (!ids.length) return;
        const last = await supabase.from("load_log").select("load_id")
          .in("combo_id", ids).eq("status", "loaded")
          .order("completed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        const loadId = (last.data as { load_id?: string } | null)?.load_id;
        if (!loadId) return;
        const lines = await supabase.from("load_lines").select("comp_number, product_id").eq("load_id", loadId);
        const m: Record<number, string> = {};
        for (const r of (lines.data ?? []) as { comp_number: number; product_id: string | null }[]) {
          const n = Number(r.comp_number);
          if (Number.isFinite(n) && r.product_id) m[n] = String(r.product_id);
        }
        if (alive) setResidue(m);
      } catch { /* fail open: no residue */ }
    })();
    return () => { alive = false; };
  }, [trailerId, refreshKey]);
  return residue;
}
