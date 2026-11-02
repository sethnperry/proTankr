"use client";
// app/admin/TankReadingsModal.tsx
//
// Company Dashboard → Tank readings. Every store tank reading the company's drivers took in the last 90 days:
// the after reading of each drop and the standalone Tank checks, per store and tank, newest first, with a
// "latest per tank" view. Exportable. The rules are in lib/tankchecks/tankChecks.ts.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { latestPerTank, readingColumns, readingFilters, readingRows, readingSummary, type CheckIn, type CheckReadingIn, type DropIn, type DropTankIn } from "@/lib/tankchecks/tankChecks";

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export default function TankReadingsModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const { members } = useCompanyRoster(open ? companyId : null);
  const products = useProductsCatalog().data;
  const nameOf = useCallback((id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Driver", [members]);
  const productName = useCallback((id: string | null) => { const p = products.find((x) => x.product_id === id); return p ? (p.display_name || p.product_name) : ""; }, [products]);
  const [latest, setLatest] = useState(true);
  const [all, setAll] = useState<ReturnType<typeof readingRows>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data: cs, error: ce } = await supabase.from("tank_checks").select("*").eq("company_id", companyId).gte("read_at", since).limit(2000);
      if (ce) throw ce;
      const checks = (cs ?? []) as CheckIn[];
      const checkReadings: CheckReadingIn[] = [];
      for (const part of chunk(checks.map((c) => c.check_id), 100)) {
        const { data, error: e } = await supabase.from("tank_check_readings").select("*").in("check_id", part);
        if (e) throw e;
        checkReadings.push(...((data ?? []) as CheckReadingIn[]));
      }
      const { data: trips, error: te } = await supabase.from("trips").select("trip_id, driver_id").eq("company_id", companyId).gte("started_at", since).limit(1000);
      if (te) throw te;
      const driverOf = new Map(((trips ?? []) as { trip_id: string; driver_id: string }[]).map((t) => [t.trip_id, t.driver_id]));
      const drops: DropIn[] = [];
      const dropTanks: DropTankIn[] = [];
      const locIds = new Set<string>();
      const dels: any[] = [];
      for (const part of chunk([...driverOf.keys()], 100)) {
        const { data, error: e } = await supabase.from("trip_deliveries").select("delivery_id, trip_id, location_id, one_off_name, left_at, arrived_at").in("trip_id", part).eq("status", "complete");
        if (e) throw e;
        dels.push(...(data ?? []));
      }
      for (const d of dels) if (d.location_id) locIds.add(d.location_id);
      const locName = new Map<string, string>();
      for (const part of chunk([...locIds], 100)) {
        const { data } = await supabase.from("delivery_locations").select("location_id, name").in("location_id", part);
        for (const l of (data ?? []) as { location_id: string; name: string }[]) locName.set(l.location_id, l.name);
      }
      for (const d of dels) drops.push({ delivery_id: d.delivery_id, location_id: d.location_id, store: (d.location_id && locName.get(d.location_id)) || d.one_off_name || "Store", at: d.left_at ?? d.arrived_at ?? since, driverId: driverOf.get(d.trip_id) ?? "" });
      for (const part of chunk(drops.map((d) => d.delivery_id), 100)) {
        const { data, error: e } = await supabase.from("trip_delivery_tanks").select("delivery_id, tank_number, product_id, after_reading, water_reading, reading_unit").in("delivery_id", part);
        if (e) throw e;
        dropTanks.push(...((data ?? []) as DropTankIn[]));
      }
      setAll(readingRows({ checks, checkReadings, drops, dropTanks, productName, storeName: (id) => (id ? locName.get(id) ?? null : null) }));
    } catch (e: any) { setError(e?.message ?? "Couldn't load."); }
    setBusy(false);
  }, [companyId, productName]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const rows = useMemo(() => (latest ? latestPerTank(all) : all), [latest, all]);
  const columns = useMemo(() => readingColumns(nameOf), [nameOf]);
  const filters = useMemo(() => readingFilters(nameOf), [nameOf]);

  return (
    <ReportShell open={open} title="Tank readings · 90 days" onClose={onClose} rows={rows} columns={columns} filters={filters} getKey={(r) => r.key}
      fileName="tank_readings" summary={readingSummary} empty={busy ? "Loading…" : error ?? "No tank readings yet."}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[true, false].map((v) => (
          <button key={String(v)} type="button" onClick={() => setLatest(v)}
            style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${latest === v ? "#fff" : "rgba(255,255,255,0.2)"}`, background: latest === v ? "#fff" : "transparent", color: latest === v ? "#000" : "#fff" }}>
            {v ? "Latest per tank" : "All readings"}
          </button>
        ))}
      </div>
    </ReportShell>
  );
}
