"use client";
// app/planner/hooks/useDashboardCards.ts
//
// Data for the Driver Dashboard's two permanent cards:
//   - Terminal status: the pickup terminal's products at one rack, with the
//     last API/temp reading and whether it's marked out.
//   - Recent deliveries: this driver's last completed drops.
// Both read straight from the server and fail open (an error leaves the card
// empty, never breaks the dashboard).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { locationPlace, locationTitle } from "@/lib/trips/deliveryLocations";

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
  const [rackName, setRackName] = useState<string | null>(null);
  const [rackCount, setRackCount] = useState(0);
  const [products, setProducts] = useState<TerminalProductStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!terminalId) { setProducts([]); setRackName(null); setRackCount(0); return; }
    setLoading(true);
    try {
      const racks = await supabase.from("terminal_racks").select("rack_id, rack_name").eq("terminal_id", terminalId).order("rack_name");
      const list = (racks.data ?? []) as { rack_id: string; rack_name: string }[];
      setRackCount(list.length);
      const rack = list.find((r) => r.rack_id === preferredRackId) ?? list[0] ?? null;
      setRackName(rack?.rack_name ?? null);
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

  return { rackName, rackCount, products, loading, reload: load };
}

export type RecentDelivery = {
  deliveryId: string;
  tripId: string;
  place: string;
  leftAt: string | null;
  orderNumber: string | null;
  dropped: { productId: string | null; gallons: number }[];
};

// refreshKey: bump to refetch (e.g. after finishing a delivery).
export function useRecentDeliveries(userId: string | null, refreshKey: unknown, limit = 8) {
  const [items, setItems] = useState<RecentDelivery[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dr = await supabase
          .from("trip_deliveries")
          .select("delivery_id, trip_id, location_id, one_off_name, left_at")
          .eq("delivering_driver_id", userId)
          .eq("status", "complete")
          .order("left_at", { ascending: false, nullsFirst: false })
          .limit(limit);
        const dels = (dr.data ?? []) as { delivery_id: string; trip_id: string; location_id: string | null; one_off_name: string | null; left_at: string | null }[];
        if (dels.length === 0) { if (!cancelled) setItems([]); return; }
        const tripIds = [...new Set(dels.map((d) => d.trip_id))];
        const locIds = [...new Set(dels.map((d) => d.location_id).filter((x): x is string => !!x))];
        const none = Promise.resolve({ data: [] as any[] });
        const [cl, od, lr] = await Promise.all([
          supabase.from("trip_compartment_loads").select("delivery_id, order_id, product_id, gross_gallons, disposition").in("delivery_id", dels.map((d) => d.delivery_id)),
          supabase.from("trip_orders").select("order_id, trip_id, order_number, is_primary").in("trip_id", tripIds),
          locIds.length ? supabase.from("delivery_locations").select("location_id, name, location_number, city, state").in("location_id", locIds) : none,
        ]);
        const loads = (cl.data ?? []) as any[];
        const orders = (od.data ?? []) as any[];
        const locs = new Map(((lr.data ?? []) as any[]).map((l) => [l.location_id, l]));
        const out = dels.map((d): RecentDelivery => {
          const mine = loads.filter((c) => c.delivery_id === d.delivery_id && c.disposition === "delivered");
          const byProduct = new Map<string | null, number>();
          for (const c of mine) byProduct.set(c.product_id, (byProduct.get(c.product_id) ?? 0) + Number(c.gross_gallons ?? 0));
          const orderId = mine.find((c) => c.order_id)?.order_id;
          const order = orders.find((o) => o.order_id === orderId)
            ?? orders.find((o) => o.trip_id === d.trip_id && o.is_primary);
          const loc = d.location_id ? locs.get(d.location_id) : null;
          const place = loc
            ? [locationTitle(loc), locationPlace(loc)].filter(Boolean).join(" · ")
            : d.one_off_name ?? "Delivery";
          return {
            deliveryId: d.delivery_id,
            tripId: d.trip_id,
            place,
            leftAt: d.left_at,
            orderNumber: order?.order_number ?? null,
            dropped: [...byProduct].map(([productId, gallons]) => ({ productId, gallons })),
          };
        });
        if (!cancelled) setItems(out);
      } catch (e) {
        console.warn("[dashboard] recent deliveries failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, refreshKey, limit]);

  return { items, loading };
}
