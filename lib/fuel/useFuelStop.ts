"use client";
// lib/fuel/useFuelStop.ts
//
// The driver's fuel stop in progress. Every step writes the row to the phone
// first (so a lost signal at the island never loses the start time) and then
// upserts it. A write that fails stays marked unsent and is retried on the
// next step, on reconnect and on the next open.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { newFuelStop } from "./fuelFlow";
import type { FuelPayment, FuelPurchase } from "./types";

type Local = { row: FuelPurchase; unsent: boolean; payment?: Partial<FuelPayment> | null };

const keyFor = (userId: string) => `proTankr:u:${userId}:fuelStop`;

function readLocal(userId: string): Local | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return raw ? (JSON.parse(raw) as Local) : null;
  } catch {
    return null;
  }
}
function writeLocal(userId: string, v: Local | null) {
  try {
    if (v) localStorage.setItem(keyFor(userId), JSON.stringify(v));
    else localStorage.removeItem(keyFor(userId));
  } catch { /* storage off: the server copy still works */ }
}

export function useFuelStop(userId: string | null | undefined, companyId: string | null | undefined) {
  const [active, setActive] = useState<FuelPurchase | null>(null);
  const [unsent, setUnsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const busyRef = useRef(false);

  const push = useCallback(async (row: FuelPurchase): Promise<boolean> => {
    const { error } = await supabase.from("fuel_purchases").upsert({ ...row, updated_at: new Date().toISOString() });
    if (error) { setError(error.message); return false; }
    setError(null);
    return true;
  }, []);

  // Load: the phone copy if there is one (it's never older than the server's),
  // else the driver's latest unfinished stop from the server.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const local = readLocal(userId);
      if (local) {
        setActive(local.row);
        setUnsent(local.unsent);
        if (local.unsent && (await push(local.row)) && alive) {
          setUnsent(false);
          writeLocal(userId, { ...local, unsent: false });
        }
      } else {
        const { data } = await supabase.from("fuel_purchases").select("*").eq("driver_id", userId)
          .neq("status", "complete").order("started_at", { ascending: false }).limit(1);
        const row = ((data ?? []) as FuelPurchase[])[0] ?? null;
        if (alive && row) { setActive({ ...row, attempts: row.attempts ?? [] }); writeLocal(userId, { row, unsent: false }); }
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [userId, push]);

  const save = useCallback(async (row: FuelPurchase) => {
    if (!userId) return false;
    setActive(row);
    writeLocal(userId, { row, unsent: true });
    setUnsent(true);
    const ok = await push(row);
    if (ok) { writeLocal(userId, { row, unsent: false }); setUnsent(false); }
    return ok;
  }, [userId, push]);

  // Retry an unsent row when the signal comes back.
  useEffect(() => {
    if (!userId) return;
    const retry = () => {
      const local = readLocal(userId);
      if (local?.unsent && !busyRef.current) void save(local.row);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [userId, save]);

  const start = useCallback(async (args: { truckId: string | null; trailerId: string | null; tripId: string | null; lastPump?: string | null }) => {
    if (!userId || !companyId) return null;
    const row = newFuelStop({ id: crypto.randomUUID(), companyId, driverId: userId, now: new Date().toISOString(), ...args });
    await save(row);
    return row;
  }, [userId, companyId, save]);

  // Cancel a stop started by mistake.
  const discard = useCallback(async () => {
    if (!userId || !active) return;
    writeLocal(userId, null);
    const id = active.id;
    setActive(null);
    setUnsent(false);
    await supabase.from("fuel_purchases").delete().eq("id", id);
  }, [userId, active]);

  // Save the finished stop and its payment row, then clear the phone copy.
  const complete = useCallback(async (row: FuelPurchase, payment: Omit<FuelPayment, "purchase_id" | "company_id" | "driver_id">) => {
    if (!userId) return false;
    busyRef.current = true;
    const ok = await save(row);
    if (!ok) { busyRef.current = false; return false; }
    const { error } = await supabase.from("fuel_purchase_payments").upsert({
      purchase_id: row.id, company_id: row.company_id, driver_id: userId, ...payment, updated_at: new Date().toISOString(),
    });
    busyRef.current = false;
    if (error) { setError(error.message); return false; }
    writeLocal(userId, null);
    setActive(null);
    return true;
  }, [userId, save]);

  return { active, ready, unsent, error, start, save, discard, complete };
}

// The driver's last few stores, to fill in the store with one tap.
export type RecentStore = { store_name: string; store_number: string | null; city: string | null; state: string | null; pump_number: string | null };
export async function recentStores(userId: string): Promise<RecentStore[]> {
  const { data } = await supabase.from("fuel_purchases").select("store_name,store_number,city,state,pump_number")
    .eq("driver_id", userId).eq("status", "complete").not("store_name", "is", null)
    .order("started_at", { ascending: false }).limit(30);
  const seen = new Set<string>();
  const out: RecentStore[] = [];
  for (const r of (data ?? []) as RecentStore[]) {
    const k = `${r.store_name}|${r.store_number ?? ""}|${r.city ?? ""}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= 6) break;
  }
  return out;
}
