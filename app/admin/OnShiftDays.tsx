"use client";
// app/admin/OnShiftDays.tsx
//
// The On shift sheet on the Company Dashboard: one collapsed row per driver actually on shift (initials and truck,
// what they are doing, ETA). Open one to see their day as a wave and a brief report of each trip. The wave and the
// rows are built by lib/company/driverDayWave.ts.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useFleetPositions } from "@/lib/telematics/useFleetPositions";
import { driveMinutesByDistance } from "@/lib/dispatch/forecast";
import { buildWave, clock, dayRows, driverStatus, type DayLabels, type DayTrip, type Wave } from "@/lib/company/driverDayWave";
import { terminalCode } from "@/lib/equipment/boardStatus";
import { PlanLine, type PlanLineComp } from "@/app/planner/components/PlanLine";
import { productColorFor } from "@/app/planner/utils/productColor";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripPickupRow, TripRow } from "@/lib/trips/types";

export type OnShiftDriver = { userId: string; name: string; startedAt: string };
const muted = "rgba(255,255,255,0.55)";
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || "—";

type LocRow = { location_id: string; name: string; location_number: string | null; city: string | null; lat: number | null; lon: number | null };

function useDays(companyId: string | null, drivers: OnShiftDriver[]) {
  const [days, setDays] = useState<Map<string, DayTrip[]>>(new Map());
  const [locs, setLocs] = useState<Map<string, LocRow>>(new Map());
  const key = drivers.map((d) => `${d.userId}@${d.startedAt}`).join("|");
  useEffect(() => {
    if (!companyId || drivers.length === 0) { setDays(new Map()); return; }
    let off = false;
    const load = async () => {
      const since = new Date(Math.min(...drivers.map((d) => Date.parse(d.startedAt))) - 6 * 3600_000).toISOString();
      const { data } = await supabase.from("trips").select("*, trip_pickups(*), trip_deliveries(*), trip_compartment_loads(*)").eq("company_id", companyId).in("driver_id", drivers.map((d) => d.userId)).gte("started_at", since).neq("status", "cancelled");
      const rows = (data ?? []) as any[];
      const ids = rows.map((r) => r.trip_id as string);
      const ev = ids.length ? (await supabase.from("trip_events").select("trip_id, payload").in("trip_id", ids).eq("event_type", "delay_logged")).data ?? [] : [];
      const delays = new Map<string, DayTrip["delays"]>();
      for (const e of ev as { trip_id: string; payload: any }[]) {
        const p = e.payload ?? {};
        if (!/^(to_rack|to_drop)$/.test(String(p.leg ?? "")) || !p.started_at) continue;
        delays.set(e.trip_id, [...(delays.get(e.trip_id) ?? []), { leg: p.leg, startedAt: p.started_at, endedAt: p.ended_at ?? null }]);
      }
      const byDriver = new Map<string, DayTrip[]>();
      for (const r of rows) {
        const { trip_pickups, trip_deliveries, trip_compartment_loads, ...trip } = r;
        const dt: DayTrip = { trip: trip as TripRow, pickups: (trip_pickups ?? []) as TripPickupRow[], deliveries: (trip_deliveries ?? []) as TripDeliveryRow[], compLoads: (trip_compartment_loads ?? []) as TripCompartmentLoadRow[], delays: delays.get(r.trip_id) ?? [] };
        byDriver.set(r.driver_id, [...(byDriver.get(r.driver_id) ?? []), dt]);
      }
      const locIds = [...new Set(rows.flatMap((r) => (r.trip_deliveries ?? []).map((d: any) => d.location_id)).filter(Boolean))] as string[];
      if (locIds.length) {
        const lr = await supabase.from("delivery_locations").select("location_id, name, location_number, city, lat, lon").in("location_id", locIds);
        if (!off) setLocs(new Map(((lr.data ?? []) as LocRow[]).map((l) => [l.location_id, l])));
      }
      if (!off) setDays(byDriver);
    };
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => { off = true; window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, key]);
  return { days, locs };
}

export function OnShiftDays({ companyId, drivers, truckNames }: { companyId: string | null; drivers: OnShiftDriver[]; truckNames: Map<string, string> }) {
  const { days, locs } = useDays(companyId, drivers);
  const terminals = useTerminalsCatalog().data;
  const products = useProductsCatalog().data;
  const positions = useFleetPositions(companyId, drivers.length > 0);
  const [open, setOpen] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNowMs(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  const termOf = useMemo(() => new Map(terminals.map((t) => [String(t.terminal_id), t])), [terminals]);
  const labels = (startLabel: string | null): DayLabels => ({
    startLabel,
    terminal: (p) => { const t = p.terminal_id ? termOf.get(String(p.terminal_id)) : null; return { code: terminalCode(p.name ?? t?.terminal_name ?? "Rack"), city: p.city ?? t?.city ?? null }; },
    delivery: (d, trip) => {
      const l = d.location_id ? locs.get(d.location_id) : null;
      const label = [trip.customer?.trim() || l?.name || d.one_off_name || "Delivery", l?.location_number].filter(Boolean).join(" ");
      return { label, city: l?.city ?? null };
    },
  });
  const productCode = (id: string | null | undefined) => { const p = id ? products.find((x) => x.product_id === id) : null; return p ? String(p.button_code ?? (p.display_name ?? p.product_name).split(" ")[0]).trim().toUpperCase() : null; };
  const productColor = (id: string | null | undefined) => { const p = id ? products.find((x) => x.product_id === id) : null; return p ? (p.hex_code?.trim() || productColorFor(p.display_name ?? p.product_name)) : null; };

  if (drivers.length === 0) return <div style={{ color: muted, fontSize: 14 }}>Nobody is on shift.</div>;
  return (
    <div>
      {drivers.map((d) => {
        const trips = days.get(d.userId) ?? [];
        const st = driverStatus(trips);
        const lastTrip = [...trips].sort((a, b) => Date.parse(b.trip.started_at ?? "") - Date.parse(a.trip.started_at ?? ""))[0]?.trip;
        const truckId = st.trip?.trip.truck_id ?? lastTrip?.truck_id ?? null;
        const truck = truckId ? truckNames.get(truckId) ?? null : null;
        const pos = truckId ? positions.get(truckId) : undefined;
        // ETA: from where the truck is to the next stop, when it is driving there.
        let eta: string | null = null;
        if (st.trip && pos && /en route/i.test(st.text)) {
          const t = st.trip;
          const nextP = [...t.pickups].sort((a, b) => a.seq - b.seq).find((p) => !p.left_at && p.outcome !== "no_load");
          const nextD = [...t.deliveries].filter((x) => x.status !== "cancelled" && x.status !== "complete").sort((a, b) => a.seq - b.seq)[0];
          const ll = nextP && !t.compLoads.some((c) => c.disposition === "loaded")
            ? (() => { const x = nextP.terminal_id ? termOf.get(String(nextP.terminal_id)) : null; return x?.lat != null && x?.lon != null ? { lat: Number(x.lat), lon: Number(x.lon) } : null; })()
            : (() => { const x = nextD?.location_id ? locs.get(nextD.location_id) : null; return x?.lat != null && x?.lon != null ? { lat: Number(x.lat), lon: Number(x.lon) } : null; })();
          if (ll) eta = new Date(nowMs + driveMinutesByDistance({ lat: pos.lat, lon: pos.lon }, ll) * 60_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        }
        if (!eta && st.trip?.trip.planned_end_at) eta = new Date(st.trip.trip.planned_end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const isOpen = open === d.userId;
        const startLabel = trips[0]?.trip.start_city ? [trips[0].trip.start_city].filter(Boolean).join("") : null;
        const wave = isOpen ? buildWave({ shiftStartMs: Date.parse(d.startedAt), nowMs, trips, labels: labels(startLabel) }) : null;
        const rows = isOpen ? dayRows({ trips, nowMs, labels: labels(startLabel), productCode, startLabel }) : [];
        return (
          <div key={d.userId} style={{ border: "1px solid rgba(255,255,255,0.14)", background: "#0f0f10", marginBottom: 8 }}>
            <button type="button" onClick={() => setOpen(isOpen ? null : d.userId)} aria-expanded={isOpen}
              style={{ display: "flex", alignItems: "baseline", gap: 10, width: "100%", textAlign: "left", padding: "12px 14px", background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}>
              <span style={{ fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{initials(d.name)}{truck ? ` ${truck}` : ""}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.text}</span>
              {eta && <span className="dash-num" style={{ fontSize: 12, color: muted, whiteSpace: "nowrap" }}>ETA {eta}</span>}
              <span style={{ color: muted, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && wave && (
              <div style={{ padding: "0 14px 14px" }}>
                <WaveSvg wave={wave} truckLive={!!pos} />
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 10 }}>{d.name}</div>
                {rows.length === 0 && <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>No loads yet this shift. On duty since {clock(Date.parse(d.startedAt))}.</div>}
                {rows.map((r) => {
                  const comps: PlanLineComp[] = r.codes.map((c, i) => ({ num: r.codes.length - i, code: c, name: c, color: c ? productColor(products.find((p) => String(p.button_code ?? "").toUpperCase() === c)?.product_id) : null }));
                  return (
                    <div key={r.tripId} style={{ marginTop: 8, fontSize: 13 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 6px", alignItems: "baseline" }}>
                        <span style={{ fontWeight: 800 }}>{r.n}:</span><span>{r.from} → {r.to}</span><span style={{ color: muted }}>·</span>
                        <PlanLine letter="" detail={false} comps={comps} /><span style={{ color: muted }}>·</span><span>{r.customer}</span>
                      </div>
                      <div className="dash-num" style={{ marginLeft: 16, color: muted }}>
                        {clock(r.startMs)} to {r.endMs ? clock(r.endMs) : "now"} · {r.hours} hrs · {r.gallons.toLocaleString()}g
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The wave: time above each dot, place below; flat clips for time spent; dashed for what is still ahead. */
export function WaveSvg({ wave, truckLive }: { wave: Wave; truckLive: boolean }) {
  const H = 118, CY = 59, AMP = 30;
  const W = Math.max(320, wave.nodes.length * 96);
  const X = (f: number) => 24 + f * (W - 48);
  const Y = (lv: number) => CY - lv * AMP;
  const path = (segs: Wave["segs"]) => segs.map((s) => {
    if (s.kind === "hold" || s.y0 === s.y1) return `M${X(s.x0)},${Y(s.y0)} L${X(s.x1)},${Y(s.y1)}`;
    const n = Math.max(6, Math.round((X(s.x1) - X(s.x0)) / 6));
    let d = "";
    for (let i = 0; i <= n; i++) { const f = i / n; const e = (1 - Math.cos(Math.PI * f)) / 2; d += `${i === 0 ? "M" : "L"}${X(s.x0 + (s.x1 - s.x0) * f)},${Y(s.y0 + (s.y1 - s.y0) * e)} `; }
    return d;
  }).join(" ");
  const real = wave.segs.filter((s) => !s.projected), proj = wave.segs.filter((s) => s.projected);
  const halo = { paintOrder: "stroke" as const, stroke: "#0f0f10", strokeWidth: 3 };
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} role="img" aria-label="Driver's day">
        <line x1={24} x2={W - 24} y1={CY} y2={CY} stroke="rgba(255,255,255,0.08)" />
        <path d={path(real)} fill="none" stroke="#fff" strokeWidth={2} />
        {proj.length > 0 && <path d={path(proj)} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeDasharray="4 4" />}
        {wave.nodes.map((n) => {
          const cx = X(n.x), cy = Y(n.level);
          const fill = n.state === "skipped" ? "#f87171" : n.state === "next" ? "#0f0f10" : "#fff";
          const stroke = n.state === "skipped" ? "#f87171" : "#fff";
          return (
            <g key={n.key}>
              {n.timeMs != null && <text x={cx} y={cy - 9} textAnchor="middle" fontSize={11} fill="#fff" {...halo}>{clock(n.timeMs)}</text>}
              <circle cx={cx} cy={cy} r={5} fill={fill} stroke={stroke} strokeWidth={2} />
              <text x={cx} y={cy + 20} textAnchor="middle" fontSize={11} fontWeight={n.kind === "delivery" ? 700 : 500} fill={n.kind === "delivery" ? "#fff" : "rgba(255,255,255,0.7)"} {...halo}>{n.label}</text>
            </g>
          );
        })}
        {wave.truck && <circle cx={X(wave.truck.x)} cy={Y(wave.truck.y)} r={7} fill="#4ade80" stroke="#0f0f10" strokeWidth={2}><title>{truckLive ? "Live" : "Last known"}</title></circle>}
      </svg>
    </div>
  );
}
